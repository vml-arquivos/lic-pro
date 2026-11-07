/** Planos à venda, lidos no servidor do app (sem sessão). Falha de rede = lista vazia, nunca erro. */
export type PublicPlan = {
  slug: string;
  nome: string;
  descricao: string;
  tipo: 'assinatura' | 'curso';
  preco_centavos: number;
  ciclo: 'mensal' | 'anual' | 'unico';
  beneficios: string[];
  trial_dias: number;
};

export async function loadPublicPlans(): Promise<{
  vendasAtivas: boolean;
  siteUrl: string | null;
  planos: PublicPlan[];
}> {
  const baseUrl = process.env.CORE_API_INTERNAL_URL?.replace(/\/$/, '');
  if (!baseUrl) return { vendasAtivas: false, siteUrl: null, planos: [] };
  try {
    const response = await fetch(`${baseUrl}/public/planos`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { vendasAtivas: false, siteUrl: null, planos: [] };
    const data = (await response.json()) as {
      vendas_ativas: boolean;
      site_url?: string | null;
      planos: PublicPlan[];
    };
    return {
      vendasAtivas: Boolean(data.vendas_ativas),
      siteUrl: data.site_url?.replace(/\/$/, '') ?? null,
      planos: data.planos ?? [],
    };
  } catch {
    return { vendasAtivas: false, siteUrl: null, planos: [] };
  }
}
