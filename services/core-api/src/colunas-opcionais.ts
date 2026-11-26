import type { PoolClient } from 'pg';

/**
 * Colunas de `editais` que chegam com migrations novas. Enquanto a migration não rodou, o código
 * novo não pode pedir essas colunas (a consulta inteira falharia). Quem já viu a coluna não
 * pergunta de novo; quem ainda não viu pergunta de novo depois de um tempo.
 */
const REVERIFICAR_MS = 30_000;
let camposPncp: { visto: boolean; em: number } | null = null;

export async function temCamposPncp(client: PoolClient): Promise<boolean> {
  if (camposPncp?.visto) return true;
  if (camposPncp && Date.now() - camposPncp.em < REVERIFICAR_MS) return false;
  const achadas = await client.query<{ total: number }>(
    `SELECT count(*)::int AS total
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'editais'
        AND column_name IN ('fonte_orcamentaria', 'emenda_parlamentar', 'normativo_base',
                            'criterio_julgamento', 'orcamento_sigiloso', 'possui_nfe')`,
  );
  const visto = (achadas.rows[0]?.total ?? 0) === 6;
  camposPncp = { visto, em: Date.now() };
  return visto;
}

export function esquecerColunasOpcionais(): void {
  camposPncp = null;
}
