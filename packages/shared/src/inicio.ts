/**
 * Início da empresa: sugestões do servidor x lista "Primeiros passos".
 *
 * A lista de primeiros passos já cobre estes passos de configuração. Enquanto ela aparece, repetir
 * a mesma sugestão em outro bloco só gera dois botões para o mesmo lugar. Os avisos que dependem do
 * dia a dia (documento vencendo, prazo, tarefa atrasada etc.) nunca são escondidos.
 */
export const PASSOS_DE_CONFIGURACAO = ['empresa', 'docs_vazio', 'busca', 'pipeline'] as const;

export type PassoSugerido = { codigo: string; texto: string; href: string };

export function passosSemRepeticao<T extends PassoSugerido>(
  passos: readonly T[],
  listaDePrimeirosPassosVisivel: boolean,
): T[] {
  if (!listaDePrimeirosPassosVisivel) return [...passos];
  const cobertos: readonly string[] = PASSOS_DE_CONFIGURACAO;
  return passos.filter((passo) => !cobertos.includes(passo.codigo));
}
