import type { Pool } from 'pg';
import { withTenant } from './db.js';

export type ReminderResult = { avisos: number; erros: number };

type Target = {
  tenant_id: string;
  usuario_id: string;
  tipo: 'prazo' | 'tarefa' | 'documento';
  titulo: string;
  vence_em: Date;
  chave: string;
  link: string;
};

const LABEL: Record<Target['tipo'], string> = {
  prazo: 'Prazo chegando',
  tarefa: 'Tarefa para hoje',
  documento: 'Documento com validade',
};

function when(target: Target, now: Date): string {
  const hours = Math.round((target.vence_em.getTime() - now.getTime()) / 3_600_000);
  if (target.tipo === 'documento') {
    const days = Math.floor((target.vence_em.getTime() - now.getTime()) / 86_400_000);
    return days < 0 ? 'venceu' : days === 0 ? 'vence hoje' : `vence em ${days} dia(s)`;
  }
  if (hours < 0) return 'está atrasada';
  return hours <= 24 ? 'vence em menos de 24 horas' : `vence em ${Math.round(hours / 24)} dia(s)`;
}

/**
 * Cria os avisos do sino para prazos, tarefas e documentos que estão para vencer. Cada
 * aviso é gravado uma única vez por pessoa (tabela `lembretes_enviados`). Respeita
 * "pausar todos os avisos" e "mostrar no sino" das preferências.
 */
export async function runReminderCycle(
  pool: Pool,
  now: Date = new Date(),
): Promise<ReminderResult> {
  const result: ReminderResult = { avisos: 0, erros: 0 };
  const targets = await pool.query<Target>(
    'SELECT tenant_id, usuario_id, tipo, titulo, vence_em, chave, link FROM lembretes_alvos($1)',
    [now],
  );
  for (const target of targets.rows) {
    try {
      const created = await withTenant(
        pool,
        { tenantId: target.tenant_id, userId: target.usuario_id, role: 'admin' },
        async (client) => {
          const prefs = await client.query<{ pausar_tudo: boolean; em_app_ativo: boolean }>(
            'SELECT pausar_tudo, em_app_ativo FROM preferencias_alertas WHERE usuario_id = $1',
            [target.usuario_id],
          );
          if (prefs.rows[0]?.pausar_tudo || prefs.rows[0]?.em_app_ativo === false) return false;
          const marked = await client.query(
            `INSERT INTO lembretes_enviados (tenant_id, usuario_id, chave) VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING RETURNING chave`,
            [target.tenant_id, target.usuario_id, target.chave],
          );
          if (!marked.rows[0]) return false;
          await client.query(
            `INSERT INTO notificacoes (tenant_id, usuario_id, tipo, titulo, mensagem, dados)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
            [
              target.tenant_id,
              target.usuario_id,
              `lembrete_${target.tipo}`,
              LABEL[target.tipo],
              `${target.titulo}: ${when(target, now)}.`,
              JSON.stringify({ link: target.link }),
            ],
          );
          return true;
        },
      );
      if (created) result.avisos += 1;
    } catch {
      result.erros += 1;
    }
  }
  return result;
}
