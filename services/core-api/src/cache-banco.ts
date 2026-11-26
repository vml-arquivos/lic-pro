/**
 * Cliente do cache compartilhado que guarda no PostgreSQL (tabela `cache_fontes`, migration 0040).
 * Serve de "Redis" quando não há Redis ligado: o dado das fontes oficiais sobrevive a reinício e
 * deploy, e a trava curta (`NX`) funciona entre instâncias. Se a tabela ainda não existe ou o
 * banco não responde, o cache compartilhado cai para a memória do processo, como já faz com o Redis.
 */
import type { Pool } from 'pg';
import type { ClienteRedis } from './cache-compartilhado.js';

const VALIDADE_PADRAO_MS = 3_600_000;

export function clienteDoBanco(pool: Pool, sorteio: () => number = Math.random): ClienteRedis {
  return {
    async get(chave) {
      const achou = await pool.query<{ valor: string }>(
        'SELECT valor FROM cache_fontes WHERE chave = $1 AND expira_em > now()',
        [chave],
      );
      return achou.rows[0]?.valor ?? null;
    },
    async set(chave, valor, opcoes) {
      const ms = Math.max(1, Math.round(opcoes?.PX ?? VALIDADE_PADRAO_MS));
      if (opcoes?.NX) {
        const gravou = await pool.query(
          `INSERT INTO cache_fontes (chave, valor, expira_em)
           VALUES ($1, $2, now() + ($3 || ' milliseconds')::interval)
           ON CONFLICT (chave) DO UPDATE
             SET valor = EXCLUDED.valor, expira_em = EXCLUDED.expira_em
           WHERE cache_fontes.expira_em <= now()
           RETURNING 1`,
          [chave, valor, String(ms)],
        );
        return gravou.rowCount ? 'OK' : null;
      }
      await pool.query(
        `INSERT INTO cache_fontes (chave, valor, expira_em)
         VALUES ($1, $2, now() + ($3 || ' milliseconds')::interval)
         ON CONFLICT (chave) DO UPDATE
           SET valor = EXCLUDED.valor, expira_em = EXCLUDED.expira_em`,
        [chave, valor, String(ms)],
      );
      // De vez em quando, limpa o que já venceu.
      if (sorteio() < 0.02) {
        void pool
          .query("DELETE FROM cache_fontes WHERE expira_em < now() - interval '1 hour'")
          .catch(() => undefined);
      }
      return 'OK';
    },
    async del(chave) {
      await pool.query('DELETE FROM cache_fontes WHERE chave = $1', [chave]);
    },
  };
}
