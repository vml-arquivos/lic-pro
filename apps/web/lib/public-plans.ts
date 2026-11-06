/** Planos à venda, lidos no servidor do app (sem sessão). Falha de rede = lista vazia, nunca erro. */
export type PublicPlan = {
  slug: string;
  nome: string;
  descricao: string;
  tipo: 'assinatura' | 'curso';
  preco_centavos: number;
  ciclo: 'mensal' | 'anual' | 'unico';
  beneficios: string[];
};

export async function loadPublicPlans(): Promise<{ vendasAtivas: boolean; planos: PublicPlan[] }> {
  const baseUrl = process.env.CORE_API_INTERNAL_URL?.replace(/\/$/, '');
  if (!baseUrl) return { vendasAtivas: false, planos: [] };
  try {
    const response = await fetch(`${baseUrl}/public/planos`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { vendasAtivas: false, planos: [] };
    const data = (await response.json()) as { vendas_ativas: boolean; planos: PublicPlan[] };
    return { vendasAtivas: Boolean(data.vendas_ativas), planos: data.planos ?? [] };
  } catch {
    return { vendasAtivas: false, planos: [] };
  }
}
