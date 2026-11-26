'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { buscaLembrada } from './radar-cache';

/** "Voltar à busca" que devolve a pessoa à mesma busca, filtros e página. */
export function VoltarAoRadar({ usuario }: Readonly<{ usuario: string }>) {
  const [destino, setDestino] = useState('/radar');
  useEffect(() => {
    const query = buscaLembrada(usuario);
    setDestino(query ? `/radar?${query}` : '/radar');
  }, [usuario]);
  return (
    <Link className="back-link" href={destino}>
      ← Voltar à busca
    </Link>
  );
}
