'use client';

import { useEffect, useState, type ReactNode } from 'react';

/** Paginação simples, sempre com o mesmo visual: Anterior · Página X de Y · Próxima. */
export function Pager({
  page,
  totalPages,
  onPage,
  label = 'Páginas de resultados',
}: Readonly<{
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  label?: string;
}>) {
  if (totalPages <= 1) return null;
  return (
    <nav className="ui-pager" aria-label={label}>
      <button
        type="button"
        className="ui-btn ui-btn-ghost ui-btn-small"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        ← Anterior
      </button>
      <span>
        Página {page} de {totalPages}
      </span>
      <button
        type="button"
        className="ui-btn ui-btn-ghost ui-btn-small"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Próxima →
      </button>
    </nav>
  );
}

/** Fatia uma lista em páginas de `tamanho` itens. */
export function paginar<T>(lista: readonly T[], page: number, tamanho = 10): T[] {
  const inicio = (Math.max(1, page) - 1) * tamanho;
  return lista.slice(inicio, inicio + tamanho);
}

export const totalDePaginas = (total: number, tamanho = 10): number =>
  Math.max(1, Math.ceil(total / tamanho));

/** Mostra a lista em páginas: o filho recebe só os itens da página atual. */
export function Paginado<T>({
  itens,
  tamanho = 10,
  children,
}: Readonly<{ itens: readonly T[]; tamanho?: number; children: (visiveis: T[]) => ReactNode }>) {
  const [page, setPage] = useState(1);
  const total = totalDePaginas(itens.length, tamanho);
  useEffect(() => {
    setPage((atual) => Math.min(atual, total));
  }, [total]);
  return (
    <>
      {children(paginar(itens, page, tamanho))}
      <Pager page={page} totalPages={total} onPage={setPage} />
    </>
  );
}
