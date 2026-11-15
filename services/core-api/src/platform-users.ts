import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { areaOfRole } from '@licitecomigo/shared';
import { z } from 'zod';
import { createOpaqueToken, hashOpaqueToken } from './auth-public.js';
import { RECURSO_LABEL } from './atividade.js';
import { panelBaseUrl, type RuntimeConfig } from './config.js';
import type { withTenant } from './db.js';
import { sendEmail } from './email.js';
import { ESCOPOS, esquecerEscopo } from './escopo-equipe.js';
import { withPlatform } from './request-context.js';

/** O link de redefinição vale por 48 horas e só pode ser usado uma vez. */
export const RESET_LINK_TTL_HOURS = 48;

type DbClient = Parameters<Parameters<typeof withTenant>[2]>[0];
type Tipo = 'empresa' | 'aluno' | 'mentor' | 'colaborador' | 'equipe';

const userParams = z.object({ userId: z.string().uuid() });

const editBody = z
  .object({
    nome: z.string().trim().min(2).max(160).optional(),
    email: z.string().trim().toLowerCase().email().max(200).optional(),
    empresa_nome: z.string().trim().min(2).max(200).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nada para alterar.' });

const resetBody = z.object({ enviar_email: z.boolean().default(true) });

class UserError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

function tipoDoPapel(papel: string): Tipo {
  switch (papel) {
    case 'plataforma':
      return 'equipe';
    case 'admin':
    case 'operador':
      return 'empresa';
    case 'mentor':
    case 'aluno':
    case 'colaborador':
      return papel;
    default:
      return 'aluno';
  }
}

/** Texto do histórico em português claro. O que não está aqui aparece como veio. */
const ACAO_LABEL: Record<string, string> = {
  'auth.invitation.accepted': 'Criou a conta pelo convite',
  'auth.password_changed': 'Alterou a própria senha',
  'auth.password_recovery.requested': 'Pediu recuperação de senha',
  'auth.password_reset.completed': 'Definiu uma nova senha',
  'auth.signup.requested': 'Fez o cadastro',
  'auth.email_verified': 'Confirmou o e-mail',
  'account.profile_updated': 'Atualizou o perfil',
  'onboarding.completed': 'Concluiu a configuração inicial',
  'diagnostico.updated': 'Atualizou o diagnóstico',
  'saved_search.created': 'Criou uma busca salva',
  'saved_search.updated': 'Alterou uma busca salva',
  'saved_search.deleted': 'Apagou uma busca salva',
  'alert_rule.updated': 'Alterou as regras de alerta',
  'alert.read': 'Leu um alerta',
  'oportunidade.saved': 'Salvou uma oportunidade',
  'oportunidade.updated': 'Atualizou uma oportunidade',
  'oportunidade.removed': 'Removeu uma oportunidade',
  'radar.exported': 'Exportou resultados do Radar',
  'empresa.created': 'Cadastrou a empresa',
  'empresa.updated': 'Atualizou os dados da empresa',
  'empresa_documento.updated': 'Atualizou um documento da empresa',
  'empresa_documento.removed': 'Removeu um documento da empresa',
  'checklist.created': 'Criou um checklist',
  'task.created': 'Criou uma tarefa',
  'agenda.deadline_created': 'Criou um prazo na agenda',
  'billing.trial.started': 'Começou o teste grátis',
  'plan.generated': 'Gerou o plano de estudos',
  'plan.day_updated': 'Atualizou um dia do plano',
  'practice.submitted': 'Enviou uma prática',
  'certificate.issued': 'Recebeu um certificado',
  'platform.user.edited': 'Administração editou os dados',
  'platform.user.activated': 'Administração reativou o acesso',
  'platform.user.deactivated': 'Administração desativou o acesso',
  'platform.user.password_link_created': 'Administração gerou link de redefinição de senha',
  'platform.colaborador.niches_changed': 'Administração alterou os nichos',
};

export function registerPlatformUserRoutes(
  platform: FastifyInstance,
  { pool, config }: { pool: Pool | undefined; config: RuntimeConfig },
): void {
  // Equipe administrativa: quem acessa o painel da Administração.
  platform.get('/platform/team', async (request) => {
    const result = await withPlatform(pool!, request, 'platform.team.listed', (client) =>
      client.query(
        `SELECT u.id, u.nome, u.email, u.ativo, u.created_at,
                COALESCE(to_jsonb(u)->>'escopo_equipe', 'tudo') AS escopo_equipe,
                (SELECT max(a.ultimo_em) FROM atividade_usuario a
                  WHERE a.tenant_id = u.tenant_id AND a.usuario_id = u.id) AS ultimo_acesso
           FROM usuarios u
          WHERE u.tenant_id = $1 AND u.papel::text = 'plataforma'
          ORDER BY u.nome`,
        [request.user.tenantId],
      ),
    );
    return { data: result.rows };
  });

  // Muda o escopo de alguém da equipe (só quem tem acesso total; nunca o próprio).
  platform.patch('/platform/users/:userId/escopo', async (request, reply) => {
    const { userId } = userParams.parse(request.params);
    const body = z.object({ escopo_equipe: z.enum(ESCOPOS) }).parse(request.body);
    if (userId === request.user.sub) {
      return reply.code(400).send({ error: 'nao_altere_o_proprio_escopo' });
    }
    const alterado = await withPlatform(
      pool!,
      request,
      'platform.team.scope_changed',
      async (client) => {
        const target = await loadTarget(client, userId);
        if (!target || target.papel !== 'plataforma') return false;
        await enterTargetAccount(client, target.tenant_id);
        await client.query(
          'UPDATE usuarios SET escopo_equipe = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2',
          [target.tenant_id, userId, body.escopo_equipe],
        );
        return true;
      },
      { usuario_id: userId, escopo: body.escopo_equipe },
    );
    if (!alterado) return reply.code(404).send({ error: 'user_not_found' });
    esquecerEscopo(userId);
    return { id: userId, escopo_equipe: body.escopo_equipe };
  });

  platform.get('/platform/users/:userId/ficha', async (request, reply) => {
    const { userId } = userParams.parse(request.params);
    const ficha = await withPlatform(
      pool!,
      request,
      'platform.user.ficha_read',
      (client) => buildFicha(client, userId),
      { usuario_id: userId },
    );
    if (!ficha) return reply.code(404).send({ error: 'user_not_found' });
    return ficha;
  });

  platform.patch('/platform/users/:userId', async (request, reply) => {
    const { userId } = userParams.parse(request.params);
    const body = editBody.parse(request.body);
    try {
      const updated = await withPlatform(
        pool!,
        request,
        'platform.user.edited',
        async (client) => {
          const target = await loadTarget(client, userId);
          if (!target) throw new UserError(404, 'user_not_found');
          if (body.empresa_nome && tipoDoPapel(target.papel) !== 'empresa') {
            throw new UserError(400, 'company_name_only_for_company');
          }
          const emailChanged = body.email && body.email !== target.email.toLowerCase();
          if (emailChanged) {
            const taken = await client.query(
              'SELECT 1 FROM usuarios WHERE lower(email) = $1 AND id <> $2 LIMIT 1',
              [body.email, userId],
            );
            if (taken.rows[0]) throw new UserError(409, 'email_in_use');
          }
          // As gravações abaixo acontecem dentro da conta do usuário editado, como nos demais
          // fluxos de autenticação. A leitura e a auditoria acima já passaram pela plataforma.
          await enterTargetAccount(client, target.tenant_id);
          const result = await client.query(
            `UPDATE usuarios
                SET nome = COALESCE($3, nome), email = COALESCE($4, email), updated_at = now()
              WHERE tenant_id = $1 AND id = $2
              RETURNING id, nome, email, ativo, papel::text AS papel`,
            [target.tenant_id, userId, body.nome ?? null, emailChanged ? body.email : null],
          );
          if (emailChanged) {
            await client.query(
              `UPDATE auth_credentials SET email = $3, updated_at = now()
                WHERE tenant_id = $1 AND usuario_id = $2`,
              [target.tenant_id, userId, body.email],
            );
          }
          if (body.empresa_nome) {
            await client.query('UPDATE tenants SET nome = $2 WHERE id = $1', [
              target.tenant_id,
              body.empresa_nome,
            ]);
            await client.query(
              'UPDATE empresas SET razao_social = $2, updated_at = now() WHERE tenant_id = $1',
              [target.tenant_id, body.empresa_nome],
            );
          }
          await auditTarget(client, request, target.tenant_id, 'platform.user.edited', userId, {
            campos: Object.keys(body),
          });
          return result.rows[0];
        },
        { usuario_id: userId, campos: Object.keys(body) },
      );
      return updated;
    } catch (error) {
      return handleUserError(reply, error);
    }
  });

  platform.post('/platform/users/:userId/password-reset-link', async (request, reply) => {
    const { userId } = userParams.parse(request.params);
    const body = resetBody.parse(request.body ?? {});
    const token = createOpaqueToken();
    try {
      const target = await withPlatform(
        pool!,
        request,
        'platform.user.password_link_created',
        async (client) => {
          const found = await loadTarget(client, userId);
          if (!found) throw new UserError(404, 'user_not_found');
          if (!found.ativo) throw new UserError(409, 'user_inactive');
          await enterTargetAccount(client, found.tenant_id);
          const saved = await client.query(
            `UPDATE auth_credentials
                SET reset_token_hash = $3,
                    reset_token_expires_at = now() + make_interval(hours => $4),
                    updated_at = now()
              WHERE tenant_id = $1 AND usuario_id = $2
              RETURNING reset_token_expires_at AS expira_em`,
            [found.tenant_id, userId, hashOpaqueToken(token), RESET_LINK_TTL_HOURS],
          );
          if (!saved.rows[0]) throw new UserError(409, 'user_has_no_credentials');
          await auditTarget(
            client,
            request,
            found.tenant_id,
            'platform.user.password_link_created',
            userId,
            {},
          );
          return { ...found, expira_em: saved.rows[0].expira_em as Date };
        },
        { usuario_id: userId },
      );
      const link = `${panelBaseUrl(config, areaOfRole(target.papel))}/password-reset?token=${token}`;
      let emailEnviado = false;
      if (body.enviar_email && config.emailProvider === 'smtp') {
        try {
          await sendEmail(config, {
            to: target.email,
            subject: 'Defina sua senha — Licite Comigo',
            text: `Olá, ${target.nome}.\n\nA equipe do Licite Comigo gerou um link para você definir uma nova senha. Ele vale por ${RESET_LINK_TTL_HOURS} horas e só pode ser usado uma vez.\n\n${link}\n`,
          });
          emailEnviado = true;
        } catch {
          // O link continua valendo e já foi entregue a quem o gerou.
        }
      }
      // O link só aparece nesta resposta: quem o tem pode definir a senha dessa conta.
      return reply.code(201).send({
        link,
        expira_em: target.expira_em,
        email_enviado: emailEnviado,
        nome: target.nome,
        email: target.email,
      });
    } catch (error) {
      return handleUserError(reply, error);
    }
  });
}

function handleUserError(
  reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  error: unknown,
): unknown {
  if (error instanceof UserError) return reply.code(error.status).send({ error: error.code });
  throw error;
}

type Target = {
  id: string;
  tenant_id: string;
  nome: string;
  email: string;
  papel: string;
  ativo: boolean;
};

async function loadTarget(client: DbClient, userId: string): Promise<Target | null> {
  const result = await client.query<Target>(
    `SELECT id, tenant_id, nome, email, papel::text AS papel, ativo FROM usuarios WHERE id = $1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

async function enterTargetAccount(client: DbClient, tenantId: string): Promise<void> {
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
  await client.query("SELECT set_config('app.auth_flow', 'true', true)");
}

/** Registra na conta do usuário o que a Administração fez, para aparecer no histórico da ficha. */
async function auditTarget(
  client: DbClient,
  request: { id: string; user: { sub: string } },
  tenantId: string,
  action: string,
  targetUserId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO auditoria
       (tenant_id, usuario_id, acao, recurso, recurso_id, metadata, request_id, origem, versao_dados)
     VALUES ($1, $2, $3, 'usuario', $4, $5::jsonb, $6, 'app', 'mvp1')`,
    [tenantId, request.user.sub, action, targetUserId, JSON.stringify(metadata), request.id],
  );
}

async function buildFicha(client: DbClient, userId: string) {
  const found = await client.query<{
    id: string;
    tenant_id: string;
    tenant_nome: string;
    nome: string;
    email: string;
    papel: string;
    ativo: boolean;
    onboarding_concluido: boolean;
    nichos: string[] | null;
    email_verificado_em: Date | null;
    created_at: Date;
  }>(
    `SELECT u.id, u.tenant_id, t.nome AS tenant_nome, u.nome, u.email, u.papel::text AS papel,
            u.ativo, u.onboarding_concluido, u.nicho_preferencias AS nichos,
            u.email_verificado_em, u.created_at
       FROM usuarios u JOIN tenants t ON t.id = u.tenant_id
      WHERE u.id = $1`,
    [userId],
  );
  const user = found.rows[0];
  if (!user) return null;
  const tipo = tipoDoPapel(user.papel);
  const tenantId = user.tenant_id;
  // Empresa: o que a empresa fez (todos os usuários dela). Demais: só a própria pessoa.
  const wholeCompany = tipo === 'empresa';
  const who = (column = 'usuario_id', index = 2) =>
    wholeCompany ? '' : ` AND ${column} = $${index}`;
  const params = wholeCompany ? [tenantId] : [tenantId, userId];

  const rows = async <T extends Record<string, unknown>>(sql: string, values: unknown[] = params) =>
    (await client.query<T>(sql, values)).rows;

  const empresa = wholeCompany
    ? ((
        await rows(
          `SELECT razao_social, nome_fantasia, cnpj, porte, segmento, cidade, uf
             FROM empresas WHERE tenant_id = $1 ORDER BY created_at LIMIT 1`,
          [tenantId],
        )
      )[0] ?? null)
    : null;
  const assinatura = wholeCompany
    ? ((
        await rows(
          `SELECT p.nome AS plano, a.status, a.inicio_em, a.fim_em
             FROM assinaturas a JOIN planos p ON p.id = a.plano_id
            WHERE a.tenant_id = $1 ORDER BY a.created_at DESC LIMIT 1`,
          [tenantId],
        )
      )[0] ?? null)
    : null;
  const usuariosDaEmpresa = wholeCompany
    ? await rows(
        `SELECT id, nome, email, papel::text AS papel, ativo FROM usuarios
          WHERE tenant_id = $1 ORDER BY created_at LIMIT 30`,
        [tenantId],
      )
    : [];

  const [resumo] = await rows<{
    primeiro_acesso: Date | null;
    ultimo_acesso: Date | null;
    entradas: number | null;
    dias_ativos_30d: number | null;
    usos_30d: number | null;
  }>(
    `SELECT min(primeiro_em) AS primeiro_acesso, max(ultimo_em) AS ultimo_acesso,
            sum(total) FILTER (WHERE recurso = 'login')::int AS entradas,
            count(DISTINCT dia) FILTER (WHERE dia >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 29)::int AS dias_ativos_30d,
            sum(total) FILTER (WHERE recurso <> 'login'
              AND dia >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 29)::int AS usos_30d
       FROM atividade_usuario WHERE tenant_id = $1${who()}`,
  );
  const porRecurso = await rows<{ recurso: string; total: number; dias: number; ultimo_em: Date }>(
    `SELECT recurso, sum(total)::int AS total, count(DISTINCT dia)::int AS dias, max(ultimo_em) AS ultimo_em
       FROM atividade_usuario
      WHERE tenant_id = $1${who()} AND recurso <> 'login'
        AND dia >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 29
      GROUP BY recurso ORDER BY total DESC`,
  );
  const recentes = await rows<{ recurso: string; ultimo_em: Date; total: number }>(
    `SELECT recurso, ultimo_em, total FROM atividade_usuario
      WHERE tenant_id = $1${who()} ORDER BY ultimo_em DESC LIMIT 15`,
  );

  const buscasSalvas = await rows(
    `SELECT id, nome, filtros, ativa, created_at FROM buscas_salvas
      WHERE tenant_id = $1${who()} ORDER BY created_at DESC LIMIT 30`,
  );
  const buscasRecentes = await rows(
    `SELECT origem, termo, filtros, created_at FROM atividade_buscas
      WHERE tenant_id = $1${who()} ORDER BY created_at DESC LIMIT 30`,
  );
  const oportunidadesPorStatus = await rows<{ status: string; total: number }>(
    `SELECT status, count(*)::int AS total FROM oportunidades_salvas
      WHERE tenant_id = $1${who()} GROUP BY status ORDER BY total DESC`,
  );
  const oportunidadesRecentes = await rows(
    `SELECT o.id, o.status, o.created_at, o.updated_at, e.titulo, e.orgao, e.uf, e.modalidade,
            e.valor_estimado
       FROM oportunidades_salvas o LEFT JOIN editais e ON e.id = o.edital_id
      WHERE o.tenant_id = $1${who('o.usuario_id')} ORDER BY o.updated_at DESC LIMIT 15`,
  );
  const [alertas] = await rows<{ total: number; ultimos_30d: number; ultimo_em: Date | null }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS ultimos_30d,
            max(created_at) AS ultimo_em
       FROM alerta_entregas WHERE tenant_id = $1${who()}`,
  );
  const [ana] = await rows<{ conversas: number; ultimos_30d: number; ultima_em: Date | null }>(
    `SELECT count(*)::int AS conversas,
            count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS ultimos_30d,
            max(updated_at) AS ultima_em
       FROM ana_conversas WHERE tenant_id = $1${who()} AND apagada_em IS NULL`,
  );
  const historico = await rows<{ acao: string; created_at: Date }>(
    wholeCompany
      ? `SELECT acao, created_at FROM auditoria
          WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 40`
      : `SELECT acao, created_at FROM auditoria
          WHERE tenant_id = $1 AND (usuario_id = $2 OR (recurso = 'usuario' AND recurso_id = $2))
          ORDER BY created_at DESC LIMIT 40`,
  );

  let curso: Record<string, unknown> | null = null;
  if (tipo === 'aluno') {
    curso =
      (
        await rows(
          `SELECT t.nome AS turma_nome, m.status AS matricula_status,
                  (SELECT count(*) FILTER (WHERE p.concluida) FROM progresso_aula p
                    WHERE p.tenant_id = $1 AND p.usuario_id = $2)::int AS aulas_concluidas,
                  (SELECT max(p.updated_at) FROM progresso_aula p
                    WHERE p.tenant_id = $1 AND p.usuario_id = $2) AS ultimo_progresso,
                  (SELECT count(*) FROM plano_dias d
                    WHERE d.tenant_id = $1 AND d.aluno_id = $2 AND d.status <> 'pendente')::int AS plano_feitos,
                  (SELECT count(*) FROM plano_dias d
                    WHERE d.tenant_id = $1 AND d.aluno_id = $2)::int AS plano_total,
                  (SELECT count(*) FROM praticas_edital x
                    WHERE x.tenant_id = $1 AND x.aluno_id = $2 AND x.status <> 'rascunho')::int AS praticas_enviadas,
                  (SELECT count(*) FROM certificados_internos c
                    WHERE c.tenant_id = $1 AND c.aluno_id = $2)::int AS certificados
             FROM (SELECT 1) base
             LEFT JOIN LATERAL (
               SELECT * FROM matriculas x WHERE x.aluno_id = $2 ORDER BY x.created_at DESC LIMIT 1
             ) m ON true
             LEFT JOIN turmas t ON t.id = m.turma_id`,
        )
      )[0] ?? null;
  } else if (tipo === 'mentor') {
    curso =
      (
        await rows(
          `SELECT (SELECT count(*) FROM mentor_mentorado m
                    WHERE m.tenant_id = $1 AND m.mentor_id = $2 AND m.status = 'ativo')::int AS alunos_ativos,
                  (SELECT count(*) FROM concessoes_mentor c
                    WHERE c.tenant_id = $1 AND c.mentor_id = $2 AND c.revogada_em IS NULL
                      AND (c.fim_em IS NULL OR c.fim_em > now()))::int AS concessoes_ativas`,
        )
      )[0] ?? null;
  }

  return {
    usuario: {
      id: user.id,
      nome: user.nome,
      email: user.email,
      tipo,
      papel: user.papel,
      ativo: user.ativo,
      conta: user.tenant_nome,
      nichos: user.nichos ?? [],
      onboarding_concluido: user.onboarding_concluido,
      email_verificado: Boolean(user.email_verificado_em),
      created_at: user.created_at,
    },
    escopo: wholeCompany ? 'empresa' : 'usuario',
    empresa,
    assinatura,
    usuarios_da_empresa: usuariosDaEmpresa,
    acesso: {
      primeiro_acesso: resumo?.primeiro_acesso ?? null,
      ultimo_acesso: resumo?.ultimo_acesso ?? null,
      entradas: resumo?.entradas ?? 0,
      dias_ativos_30d: resumo?.dias_ativos_30d ?? 0,
      usos_30d: resumo?.usos_30d ?? 0,
      por_recurso: porRecurso.map((item) => ({ ...item, rotulo: rotulo(item.recurso) })),
      recentes: recentes.map((item) => ({ ...item, rotulo: rotulo(item.recurso) })),
    },
    buscas: { salvas: buscasSalvas, recentes: buscasRecentes },
    oportunidades: { por_status: oportunidadesPorStatus, recentes: oportunidadesRecentes },
    alertas: alertas ?? { total: 0, ultimos_30d: 0, ultimo_em: null },
    ana: ana ?? { conversas: 0, ultimos_30d: 0, ultima_em: null },
    curso,
    historico: historico.map((item) => ({
      ...item,
      rotulo: ACAO_LABEL[item.acao] ?? item.acao,
    })),
  };
}

function rotulo(recurso: string): string {
  return (RECURSO_LABEL as Record<string, string>)[recurso] ?? recurso;
}
