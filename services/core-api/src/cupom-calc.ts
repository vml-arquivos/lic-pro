import type { PoolClient } from 'pg';

/** Menor valor que o Asaas aceita cobrar. */
export const VALOR_MINIMO_CENTAVOS = 500;

export type CupomAplicado = {
  codigo: string;
  descricao: string;
  desconto_centavos: number;
  valor_final_centavos: number;
};
export type CupomResultado = { ok: true; cupom: CupomAplicado } | { ok: false; mensagem: string };

const INVALIDO = 'Cupom inválido ou expirado.';

export function normalizeCupomCodigo(raw: string): string {
  return raw.trim().toUpperCase();
}

type CupomRow = {
  codigo: string;
  descricao: string;
  tipo: 'percentual' | 'fixo';
  valor: number;
  plano_slugs: string[] | null;
  max_usos: number | null;
  valido_ate: Date | null;
  ativo: boolean;
  usos: number;
};

/**
 * Confere o cupom para um plano e calcula o desconto. Mensagem única para qualquer motivo
 * de recusa, para não revelar quais códigos existem. Usos contam cobranças pendentes e pagas.
 * Chamar dentro de `withBilling` (ou sessão da plataforma).
 */
export async function resolverCupom(
  db: PoolClient,
  codigoRaw: string,
  plano: { slug: string; preco_centavos: number },
  now: Date = new Date(),
): Promise<CupomResultado> {
  const codigo = normalizeCupomCodigo(codigoRaw);
  if (!/^[A-Z0-9_-]{3,32}$/.test(codigo)) return { ok: false, mensagem: INVALIDO };
  const row = (
    await db.query<CupomRow>(
      `SELECT c.codigo, c.descricao, c.tipo, c.valor, c.plano_slugs, c.max_usos, c.valido_ate, c.ativo,
              (SELECT count(*)::int FROM cobrancas b
                WHERE b.cupom_codigo = c.codigo AND b.status IN ('pendente', 'paga')) AS usos
         FROM cupons c WHERE c.codigo = $1`,
      [codigo],
    )
  ).rows[0];
  if (!row || !row.ativo) return { ok: false, mensagem: INVALIDO };
  if (row.valido_ate && row.valido_ate.getTime() <= now.getTime()) {
    return { ok: false, mensagem: INVALIDO };
  }
  if (row.plano_slugs && !row.plano_slugs.includes(plano.slug)) {
    return { ok: false, mensagem: INVALIDO };
  }
  if (row.max_usos !== null && row.usos >= row.max_usos) return { ok: false, mensagem: INVALIDO };

  const desconto =
    row.tipo === 'percentual'
      ? Math.floor((plano.preco_centavos * row.valor) / 100)
      : Math.min(row.valor, plano.preco_centavos);
  const final = plano.preco_centavos - desconto;
  if (final < VALOR_MINIMO_CENTAVOS) {
    return { ok: false, mensagem: 'Este cupom deixa o valor abaixo do mínimo de R$ 5,00.' };
  }
  return {
    ok: true,
    cupom: {
      codigo: row.codigo,
      descricao: row.descricao,
      desconto_centavos: desconto,
      valor_final_centavos: final,
    },
  };
}
