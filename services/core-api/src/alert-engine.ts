import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { nextDelivery, type Frequency } from './alert-schedule.js';
import type { UserRole } from './auth.js';
import { runReminderCycle } from './reminders.js';
import type { RuntimeConfig } from './config.js';
import { withTenant } from './db.js';
import type { EmailMessage } from './email.js';
import { applyNicheScope, readUserNiches } from './niche-scope.js';
import { buildEditalSearchQuery, editalSearchSchema, type SearchContext } from './search.js';

/** Quantos editais cada regra processa por rodada; o resto fica para a próxima. */
const MAX_PER_RULE = 100;
const MAX_EMAIL_ATTEMPTS = 3;
const LOCK_NAME = 'licite-comigo:alert-engine';

export type EngineDeps = {
  pool: Pool;
  config: RuntimeConfig;
  now?: () => Date;
  /** Sem e-mail configurado, o canal fica indisponível e nada é enfileirado para ele. */
  emailEnabled: boolean;
  sendMail?: (message: EmailMessage) => Promise<void>;
};

export type CycleResult = {
  skipped: boolean;
  rules: number;
  created: number;
  released: number;
  emails: number;
  errors: number;
  /** Lembretes de prazo, tarefa e documento criados na rodada. */
  reminders: number;
  /** Primeiras mensagens de erro da rodada, para quem opera o sistema. */
  details: string[];
};

type Rule = {
  id: string;
  tenant_id: string;
  empresa_id: string | null;
  usuario_id: string;
  nome: string;
  regra: Record<string, unknown>;
  canais: unknown;
  frequencia: Frequency;
  horario_diario: number;
  dia_semana: number;
  tipos: string[];
  destinatarios: string[];
  created_at: Date;
  busca_id: string;
  busca_filtros: Record<string, unknown>;
  busca_nome: string;
};

type Recipient = { id: string; email: string; em_app: boolean; email_ativo: boolean };

type Candidate = {
  id: string;
  titulo: string;
  orgao: string | null;
  uf: string | null;
  valor_estimado: string | null;
  data_encerramento_proposta: Date | null;
  url_origem: string | null;
};

type Delivery = {
  edital: Candidate;
  tipo: 'novo' | 'alteracao' | 'prazo';
  key: string;
  extra: Record<string, unknown>;
  message: string;
};

export function unsubscribeToken(secret: string, tenantId: string, userId: string): string {
  const signature = createHmac('sha256', secret)
    .update(`alertas:cancelar:${tenantId}:${userId}`)
    .digest('base64url');
  return `${tenantId}.${userId}.${signature}`;
}

export function readUnsubscribeToken(
  secret: string,
  token: string,
): { tenantId: string; userId: string } | null {
  const [tenantId, userId, signature] = token.split('.');
  if (!tenantId || !userId || !signature) return null;
  const expected = unsubscribeToken(secret, tenantId, userId).split('.')[2]!;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? { tenantId, userId } : null;
}

function channelsOf(rule: Rule): string[] {
  const list = Array.isArray(rule.canais) ? rule.canais.map(String) : [];
  return list.length ? list : ['in_app'];
}

async function loadRule(
  client: PoolClient,
  tenantId: string,
  ruleId: string,
): Promise<Rule | null> {
  const found = await client.query<Rule>(
    `SELECT ar.id, ar.tenant_id, ar.empresa_id, ar.usuario_id, ar.nome, ar.regra, ar.canais,
            ar.frequencia, ar.horario_diario, ar.dia_semana, ar.tipos, ar.destinatarios,
            ar.created_at, ar.busca_id, bs.filtros AS busca_filtros, bs.nome AS busca_nome
       FROM alertas_regras ar
       JOIN buscas_salvas bs ON bs.id = ar.busca_id AND bs.tenant_id = ar.tenant_id
      WHERE ar.id = $1 AND ar.tenant_id = $2 AND ar.ativa AND bs.ativa`,
    [ruleId, tenantId],
  );
  return found.rows[0] ?? null;
}

async function loadRecipients(client: PoolClient, rule: Rule): Promise<Recipient[]> {
  const ids = rule.destinatarios.length ? rule.destinatarios : [rule.usuario_id];
  const found = await client.query<{
    id: string;
    email: string;
    pausar_tudo: boolean | null;
    email_ativo: boolean | null;
    em_app_ativo: boolean | null;
  }>(
    `SELECT u.id, u.email, p.pausar_tudo, p.email_ativo, p.em_app_ativo
       FROM usuarios u
       LEFT JOIN preferencias_alertas p ON p.usuario_id = u.id
      WHERE u.tenant_id = $1 AND u.id = ANY($2::uuid[]) AND u.ativo`,
    [rule.tenant_id, ids],
  );
  return found.rows
    .filter((row) => !row.pausar_tudo)
    .map((row) => ({
      id: row.id,
      email: row.email,
      em_app: row.em_app_ativo ?? true,
      email_ativo: row.email_ativo ?? true,
    }));
}

async function candidates(
  client: PoolClient,
  rule: Rule,
  owner: { id: string; role: UserRole },
  extraSql: string,
  extraParams: (string | number)[],
): Promise<Candidate[]> {
  const preferences = await readUserNiches(client, rule.tenant_id, owner.id);
  const scoped = applyNicheScope(
    { ...rule.busca_filtros, ...(rule.regra ?? {}) } as Record<string, unknown>,
    preferences,
    owner.role,
  );
  const parsed = editalSearchSchema.safeParse({
    ...scoped,
    page: 1,
    page_size: MAX_PER_RULE,
    facetas: false,
    incluir_descartadas: false,
  });
  if (!parsed.success) return [];
  const context: SearchContext = {
    userId: owner.id,
    extra: [{ sql: extraSql, params: extraParams }],
  };
  const query = buildEditalSearchQuery(parsed.data, context);
  const rows = await client.query<Candidate>(query.text, query.values);
  return rows.rows;
}

function listOf(values: unknown): Array<{ campo: string; antes: unknown; depois: unknown }> {
  return Array.isArray(values)
    ? (values as Array<{ campo: string; antes: unknown; depois: unknown }>)
    : [];
}

const FIELD_LABEL: Record<string, string> = {
  situacao: 'situação',
  valor_estimado: 'valor estimado',
  valor_homologado: 'valor homologado',
  data_abertura_proposta: 'abertura das propostas',
  data_encerramento_proposta: 'encerramento das propostas',
  modalidade: 'modalidade',
  titulo: 'objeto',
};

async function collectDeliveries(
  client: PoolClient,
  rule: Rule,
  owner: { id: string; role: UserRole },
  now: Date,
): Promise<Delivery[]> {
  const out: Delivery[] = [];
  const tipos = new Set(rule.tipos);

  if (tipos.has('novos')) {
    const rows = await candidates(
      client,
      rule,
      owner,
      `editais.created_at > {0}::timestamptz
       AND NOT EXISTS (SELECT 1 FROM alerta_entregas ae
                        WHERE ae.alerta_regra_id = {1}::uuid AND ae.edital_id = editais.id
                          AND ae.tipo = 'novo')`,
      [rule.created_at.toISOString(), rule.id],
    );
    for (const edital of rows) {
      out.push({
        edital,
        tipo: 'novo',
        key: `${rule.id}:${edital.id}:novo`,
        extra: {},
        message: `Novo edital na busca "${rule.busca_nome}".`,
      });
    }
  }

  if (tipos.has('alteracao')) {
    const rows = await candidates(
      client,
      rule,
      owner,
      `EXISTS (SELECT 1 FROM edital_eventos ev
                WHERE ev.edital_id = editais.id AND ev.tipo = 'alteracao'
                  AND ev.created_at > {0}::timestamptz
                  AND NOT EXISTS (SELECT 1 FROM alerta_entregas ae
                                   WHERE ae.alerta_regra_id = {1}::uuid AND ae.tipo = 'alteracao'
                                     AND ae.edital_id = editais.id
                                     AND ae.payload->>'evento_id' = ev.id::text))`,
      [rule.created_at.toISOString(), rule.id],
    );
    if (rows.length) {
      const events = await client.query<{
        id: string;
        edital_id: string;
        payload: { campos?: unknown };
      }>(
        `SELECT ev.id, ev.edital_id, ev.payload
           FROM edital_eventos ev
          WHERE ev.edital_id = ANY($1::uuid[]) AND ev.tipo = 'alteracao' AND ev.created_at > $2
            AND NOT EXISTS (SELECT 1 FROM alerta_entregas ae
                             WHERE ae.alerta_regra_id = $3 AND ae.tipo = 'alteracao'
                               AND ae.edital_id = ev.edital_id
                               AND ae.payload->>'evento_id' = ev.id::text)
          ORDER BY ev.created_at`,
        [rows.map((row) => row.id), rule.created_at, rule.id],
      );
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const event of events.rows) {
        const edital = byId.get(event.edital_id);
        if (!edital) continue;
        const campos = listOf(event.payload?.campos);
        const labels = campos.map((item) => FIELD_LABEL[item.campo] ?? item.campo).join(', ');
        out.push({
          edital,
          tipo: 'alteracao',
          key: `${rule.id}:${edital.id}:alt:${event.id}`,
          extra: { evento_id: event.id, campos },
          message: `O edital mudou${labels ? `: ${labels}` : ''}.`,
        });
      }
    }
  }

  if (tipos.has('prazo')) {
    // Só avisa prazo de edital que a pessoa já recebeu como novo nesta busca ou favoritou.
    const rows = await candidates(
      client,
      rule,
      owner,
      `editais.data_encerramento_proposta > {0}::timestamptz
       AND editais.data_encerramento_proposta <= {0}::timestamptz + interval '72 hours'
       AND (EXISTS (SELECT 1 FROM alerta_entregas an
                     WHERE an.alerta_regra_id = {1}::uuid AND an.edital_id = editais.id
                       AND an.tipo = 'novo')
            OR EXISTS (SELECT 1 FROM edital_interacoes fi
                        WHERE fi.edital_id = editais.id AND fi.usuario_id = {2}::uuid
                          AND fi.favorito))
       AND NOT EXISTS (SELECT 1 FROM alerta_entregas ap
                        WHERE ap.alerta_regra_id = {1}::uuid AND ap.edital_id = editais.id
                          AND ap.tipo = 'prazo'
                          AND ap.payload->>'marco' =
                              CASE WHEN editais.data_encerramento_proposta <= {0}::timestamptz + interval '24 hours'
                                   THEN 'prazo1' ELSE 'prazo3' END)`,
      [now.toISOString(), rule.id, owner.id],
    );
    for (const edital of rows) {
      const end = edital.data_encerramento_proposta;
      const hours = end ? (new Date(end).getTime() - now.getTime()) / 3_600_000 : 72;
      const marco = hours <= 24 ? 'prazo1' : 'prazo3';
      out.push({
        edital,
        tipo: 'prazo',
        key: `${rule.id}:${edital.id}:${marco}`,
        extra: { marco },
        message:
          marco === 'prazo1'
            ? 'As propostas encerram em menos de 24 horas.'
            : 'As propostas encerram em até 3 dias.',
      });
    }
  }
  return out;
}

/** Procura novidades de uma regra e grava as entregas (sem repetir o que já foi avisado). */
async function processRule(
  deps: EngineDeps,
  target: { tenant_id: string; usuario_id: string; empresa_id: string | null; regra_id: string },
  now: Date,
): Promise<number> {
  return withTenant(
    deps.pool,
    {
      tenantId: target.tenant_id,
      userId: target.usuario_id,
      role: 'admin',
      ...(target.empresa_id ? { empresaId: target.empresa_id } : {}),
    },
    async (client) => {
      const rule = await loadRule(client, target.tenant_id, target.regra_id);
      if (!rule) return 0;
      const ownerRow = await client.query<{ papel: UserRole; ativo: boolean }>(
        'SELECT papel::text AS papel, ativo FROM usuarios WHERE tenant_id = $1 AND id = $2',
        [rule.tenant_id, rule.usuario_id],
      );
      const owner = ownerRow.rows[0];
      if (!owner?.ativo) return 0;
      const recipients = await loadRecipients(client, rule);
      if (!recipients.length) return 0;
      const channels = channelsOf(rule);
      let deliveries: Delivery[];
      try {
        deliveries = await collectDeliveries(
          client,
          rule,
          { id: rule.usuario_id, role: owner.papel },
          now,
        );
      } catch (error) {
        // Dono sem nichos escolhidos: não há escopo para buscar, então nada é enviado.
        if (error instanceof Error && error.message === 'niche_preferences_required') return 0;
        throw error;
      }
      let created = 0;
      const visibleNow: Released[] = [];
      const when = nextDelivery(now, rule);
      for (const delivery of deliveries) {
        for (const recipient of recipients) {
          for (const channel of channels) {
            if (channel === 'in_app' && !recipient.em_app) continue;
            if (channel === 'email' && !(deps.emailEnabled && recipient.email_ativo)) continue;
            if (channel !== 'in_app' && channel !== 'email') continue;
            const immediateInApp = channel === 'in_app' && rule.frequencia === 'imediata';
            const payload = {
              busca_id: rule.busca_id,
              busca_nome: rule.busca_nome,
              titulo: delivery.edital.titulo.slice(0, 160),
              mensagem: delivery.message,
              orgao: delivery.edital.orgao,
              uf: delivery.edital.uf,
              valor_estimado: delivery.edital.valor_estimado,
              data_encerramento_proposta: delivery.edital.data_encerramento_proposta,
              url_origem: delivery.edital.url_origem,
              ...delivery.extra,
            };
            const inserted = await client.query<{ id: string }>(
              `INSERT INTO alerta_entregas
                 (tenant_id, alerta_regra_id, usuario_id, edital_id, canal, status, tipo,
                  agendada_para, idempotency_key, payload)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
               ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
               RETURNING id`,
              [
                rule.tenant_id,
                rule.id,
                recipient.id,
                delivery.edital.id,
                channel,
                immediateInApp ? 'pendente' : 'agendada',
                delivery.tipo,
                immediateInApp
                  ? now
                  : channel === 'email'
                    ? rule.frequencia === 'imediata'
                      ? now
                      : when
                    : when,
                `${delivery.key}:${recipient.id}:${channel}`,
                JSON.stringify(payload),
              ],
            );
            if (inserted.rowCount) {
              created += 1;
              if (immediateInApp) {
                visibleNow.push({
                  usuario_id: recipient.id,
                  alerta_regra_id: rule.id,
                  tipo: delivery.tipo,
                  titulo: String(payload.titulo),
                  busca_nome: rule.busca_nome,
                  empresa_id: rule.empresa_id,
                });
              }
            }
          }
        }
      }
      await notify(client, rule.tenant_id, visibleNow);
      return created;
    },
  );
}

type Released = {
  usuario_id: string;
  alerta_regra_id: string;
  tipo: string;
  titulo: string;
  busca_nome: string;
  empresa_id: string | null;
};

/** Torna visíveis os avisos cujo horário chegou e cria o aviso resumido no sino. */
async function releaseDue(
  deps: EngineDeps,
  tenantId: string,
  userId: string,
  now: Date,
): Promise<number> {
  return withTenant(deps.pool, { tenantId, userId, role: 'admin' }, async (client) => {
    // Quem pausou tudo (ou desligou o canal) depois do agendamento não recebe o que ficou na fila.
    await client.query(
      `UPDATE alerta_entregas ae SET status = 'ignorada'
        WHERE ae.tenant_id = $1 AND ae.status = 'agendada' AND ae.agendada_para <= $2
          AND EXISTS (SELECT 1 FROM preferencias_alertas p
                       WHERE p.usuario_id = ae.usuario_id
                         AND (p.pausar_tudo
                              OR (ae.canal = 'in_app' AND NOT p.em_app_ativo)
                              OR (ae.canal = 'email' AND NOT p.email_ativo)))`,
      [tenantId, now],
    );
    const released = await client.query<Released>(
      `WITH liberadas AS (
         UPDATE alerta_entregas SET status = 'pendente'
          WHERE tenant_id = $1 AND status = 'agendada' AND canal = 'in_app' AND agendada_para <= $2
          RETURNING id, usuario_id, alerta_regra_id, tipo, payload, edital_id
       )
       SELECT l.usuario_id, l.alerta_regra_id, l.tipo, l.payload->>'titulo' AS titulo,
              l.payload->>'busca_nome' AS busca_nome, ar.empresa_id
         FROM liberadas l JOIN alertas_regras ar ON ar.id = l.alerta_regra_id`,
      [tenantId, now],
    );
    await notify(client, tenantId, released.rows);
    return released.rowCount ?? 0;
  });
}

const TIPO_TEXT: Record<string, { singular: string; plural: string }> = {
  novo: { singular: 'novo edital', plural: 'novos editais' },
  alteracao: { singular: 'edital alterado', plural: 'editais alterados' },
  prazo: { singular: 'edital com prazo chegando', plural: 'editais com prazo chegando' },
};

async function notify(client: PoolClient, tenantId: string, rows: Released[]): Promise<void> {
  const groups = new Map<string, Released[]>();
  for (const row of rows) {
    const key = `${row.usuario_id}|${row.alerta_regra_id}|${row.tipo}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const group of groups.values()) {
    const first = group[0]!;
    const text = TIPO_TEXT[first.tipo] ?? TIPO_TEXT.novo!;
    const total = group.length;
    await client.query(
      `INSERT INTO notificacoes (tenant_id, empresa_id, usuario_id, tipo, titulo, mensagem, dados)
       VALUES ($1, $2, $3, 'alerta', $4, $5, $6::jsonb)`,
      [
        tenantId,
        first.empresa_id,
        first.usuario_id,
        `${total} ${total === 1 ? text.singular : text.plural} em "${first.busca_nome}"`,
        group
          .slice(0, 3)
          .map((item) => item.titulo)
          .join(' · ')
          .slice(0, 400),
        JSON.stringify({
          regra_id: first.alerta_regra_id,
          tipo: first.tipo,
          quantidade: total,
          link: '/alertas',
        }),
      ],
    );
  }
}

type EmailRow = {
  id: string;
  usuario_id: string;
  tipo: string;
  payload: Record<string, unknown>;
  tentativas: number;
};

/** Junta os avisos de e-mail vencidos de cada pessoa em uma única mensagem. */
async function sendDueEmails(
  deps: EngineDeps,
  tenantId: string,
  userId: string,
  now: Date,
): Promise<number> {
  if (!deps.emailEnabled || !deps.sendMail) return 0;
  const send = deps.sendMail;
  return withTenant(deps.pool, { tenantId, userId, role: 'admin' }, async (client) => {
    const due = await client.query<EmailRow>(
      `SELECT id, usuario_id, tipo, payload, tentativas
         FROM alerta_entregas
        WHERE tenant_id = $1 AND status = 'agendada' AND canal = 'email' AND agendada_para <= $2
        ORDER BY created_at LIMIT 500`,
      [tenantId, now],
    );
    const byUser = new Map<string, EmailRow[]>();
    for (const row of due.rows)
      byUser.set(row.usuario_id, [...(byUser.get(row.usuario_id) ?? []), row]);
    let sent = 0;
    for (const [recipientId, rows] of byUser) {
      const user = await client.query<{ email: string; nome: string }>(
        'SELECT email, nome FROM usuarios WHERE tenant_id = $1 AND id = $2 AND ativo',
        [tenantId, recipientId],
      );
      const person = user.rows[0];
      const ids = rows.map((row) => row.id);
      if (!person) {
        await client.query(
          `UPDATE alerta_entregas SET status = 'ignorada' WHERE id = ANY($1::uuid[])`,
          [ids],
        );
        continue;
      }
      try {
        await send(buildDigest(deps.config, tenantId, recipientId, person, rows));
        await client.query(
          `UPDATE alerta_entregas SET status = 'enviada', entregue_em = $2 WHERE id = ANY($1::uuid[])`,
          [ids, now],
        );
        sent += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message.slice(0, 300) : 'falha no envio';
        await client.query(
          `UPDATE alerta_entregas
              SET tentativas = tentativas + 1, erro = $2,
                  status = CASE WHEN tentativas + 1 >= $3 THEN 'falha' ELSE 'agendada' END,
                  agendada_para = $4::timestamptz + make_interval(mins => 15 * (tentativas + 1))
            WHERE id = ANY($1::uuid[])`,
          [ids, reason, MAX_EMAIL_ATTEMPTS, now],
        );
      }
    }
    return sent;
  });
}

function money(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) && value !== null && value !== undefined
    ? number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'valor não informado';
}

export function buildDigest(
  config: RuntimeConfig,
  tenantId: string,
  userId: string,
  person: { email: string; nome: string },
  rows: readonly { tipo: string; payload: Record<string, unknown> }[],
): EmailMessage {
  const app = (config.appUrl ?? '').replace(/\/$/, '');
  const unsubscribe = `${app}/cancelar-alertas?token=${encodeURIComponent(unsubscribeToken(config.jwtSecret, tenantId, userId))}`;
  const lines = rows.slice(0, 30).map((row) => {
    const p = row.payload;
    const parts = [String(p.titulo ?? 'Edital'), String(p.mensagem ?? '')];
    const detail = [p.orgao, p.uf, money(p.valor_estimado)].filter(Boolean).join(' · ');
    return `• ${parts.filter(Boolean).join(' — ')}\n  ${detail}${p.url_origem ? `\n  ${String(p.url_origem)}` : ''}`;
  });
  const more = rows.length > 30 ? `\n… e mais ${rows.length - 30} no Licite Comigo.\n` : '';
  const total = rows.length;
  const text = [
    `Olá, ${person.nome.split(' ')[0] ?? ''}.`,
    '',
    `${total} ${total === 1 ? 'aviso novo' : 'avisos novos'} nas suas buscas salvas:`,
    '',
    ...lines,
    more,
    `Ver todos: ${app}/alertas`,
    '',
    `Para parar de receber e-mails de alerta: ${unsubscribe}`,
  ].join('\n');
  return {
    to: person.email,
    subject: `Licite Comigo: ${total} ${total === 1 ? 'aviso novo' : 'avisos novos'} nas suas buscas`,
    text,
  };
}

function noteError(result: CycleResult, where: string, error: unknown): void {
  if (result.details.length < 5) {
    result.details.push(
      `${where}: ${error instanceof Error ? error.message.slice(0, 200) : 'erro'}`,
    );
  }
}

/** Uma rodada completa. Só uma instância roda por vez (trava no banco). */
export async function runAlertCycle(deps: EngineDeps): Promise<CycleResult> {
  const now = deps.now?.() ?? new Date();
  const result: CycleResult = {
    skipped: false,
    rules: 0,
    created: 0,
    released: 0,
    emails: 0,
    errors: 0,
    reminders: 0,
    details: [],
  };
  const lockClient = await deps.pool.connect();
  let runId: string | null = null;
  try {
    const lock = await lockClient.query<{ ok: boolean }>(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS ok',
      [LOCK_NAME],
    );
    if (!lock.rows[0]?.ok) return { ...result, skipped: true };
    const run = await lockClient.query<{ id: string }>(
      'INSERT INTO alertas_motor_execucoes DEFAULT VALUES RETURNING id',
    );
    runId = run.rows[0]?.id ?? null;
    const targets = await lockClient.query<{
      tenant_id: string;
      usuario_id: string;
      empresa_id: string | null;
      regra_id: string | null;
    }>('SELECT tenant_id, usuario_id, empresa_id, regra_id FROM alertas_motor_alvos()');
    const tenants = new Map<string, string>();
    for (const target of targets.rows)
      if (!tenants.has(target.tenant_id)) tenants.set(target.tenant_id, target.usuario_id);

    for (const target of targets.rows) {
      if (!target.regra_id) continue;
      result.rules += 1;
      try {
        result.created += await processRule(deps, { ...target, regra_id: target.regra_id }, now);
      } catch (error) {
        result.errors += 1;
        noteError(result, `regra ${target.regra_id}`, error);
      }
    }
    for (const [tenantId, userId] of tenants) {
      try {
        result.released += await releaseDue(deps, tenantId, userId, now);
        result.emails += await sendDueEmails(deps, tenantId, userId, now);
      } catch (error) {
        result.errors += 1;
        noteError(result, `conta ${tenantId}`, error);
      }
    }
    try {
      const reminders = await runReminderCycle(deps.pool, now);
      result.reminders = reminders.avisos;
      result.errors += reminders.erros;
    } catch (error) {
      result.errors += 1;
      noteError(result, 'lembretes', error);
    }
    return result;
  } finally {
    if (runId) {
      await lockClient
        .query(
          `UPDATE alertas_motor_execucoes
              SET finalizado_em = now(), regras = $2, criadas = $3, liberadas = $4, emails = $5, erros = $6, detalhe = $7
            WHERE id = $1`,
          [
            runId,
            result.rules,
            result.created,
            result.released,
            result.emails,
            result.errors,
            result.details.join(' | ') || null,
          ],
        )
        .catch(() => undefined);
    }
    await lockClient
      .query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [LOCK_NAME])
      .catch(() => undefined);
    lockClient.release();
  }
}

export function startAlertEngine(
  deps: EngineDeps,
  intervalSeconds: number,
  log: (message: string) => void,
): () => void {
  let running = false;
  const tick = (): void => {
    if (running) return;
    running = true;
    runAlertCycle(deps)
      .then((result) => {
        if (
          !result.skipped &&
          (result.created || result.released || result.emails || result.reminders || result.errors)
        ) {
          log(`alertas: ${JSON.stringify(result)}`);
        }
      })
      .catch((error: unknown) =>
        log(`alertas: falha na rodada (${error instanceof Error ? error.message : 'erro'})`),
      )
      .finally(() => {
        running = false;
      });
  };
  const first = setTimeout(tick, 30_000);
  const timer = setInterval(tick, Math.max(60, intervalSeconds) * 1000);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
