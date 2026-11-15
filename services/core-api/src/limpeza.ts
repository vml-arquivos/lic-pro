import type { Pool } from 'pg';
import type { RuntimeConfig } from './config.js';

export type LimpezaResult = {
  coleta: number;
  alertas: number;
  eventos: number;
  notificacoes: number;
};

/** Apaga registros técnicos antigos (rodadas da coleta/alertas, histórico e avisos já lidos). */
export async function runCleanup(
  pool: Pool,
  config: Pick<RuntimeConfig, 'logRetentionDays' | 'historyRetentionDays'>,
): Promise<LimpezaResult> {
  const result = await pool.query<LimpezaResult>(
    'SELECT coleta, alertas, eventos, notificacoes FROM limpar_registros_tecnicos($1, $2)',
    [config.logRetentionDays, config.historyRetentionDays],
  );
  return result.rows[0] ?? { coleta: 0, alertas: 0, eventos: 0, notificacoes: 0 };
}

/** Limpa 5 minutos depois de subir e a cada 6 horas. Falha em silêncio (só registra). */
export function startCleanup(
  deps: { pool: Pool; config: RuntimeConfig },
  log: (message: string) => void,
): () => void {
  let running = false;
  const tick = (): void => {
    if (running) return;
    running = true;
    runCleanup(deps.pool, deps.config)
      .then((result) => {
        const total = result.coleta + result.alertas + result.eventos + result.notificacoes;
        if (total > 0) log(`limpeza: ${JSON.stringify(result)}`);
      })
      .catch((error: unknown) =>
        log(
          `limpeza: não foi possível limpar (${error instanceof Error ? error.message : 'erro'})`,
        ),
      )
      .finally(() => {
        running = false;
      });
  };
  const first = setTimeout(tick, 5 * 60_000);
  const timer = setInterval(tick, 6 * 60 * 60_000);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
