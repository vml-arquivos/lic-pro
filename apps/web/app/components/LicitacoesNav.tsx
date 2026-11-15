import Link from 'next/link';
import { pageAreas, type Area } from '@licitecomigo/shared';

const ITENS = [
  { href: '/radar', label: 'Explorar', ajuda: 'Buscar editais com filtros e o seu perfil' },
  { href: '/pregoes', label: 'Pregões', ajuda: 'Pregões publicados e abertos' },
  { href: '/analise', label: 'Análise', ajuda: 'Ranking, comparar e simular a proposta' },
  { href: '/precos', label: 'Preços', ajuda: 'O que o governo pagou por item' },
] as const;

/**
 * Um só caminho entre as telas de licitações: explorar, pregões, análise e preços.
 * Mostra apenas o que a área da conta pode abrir. Sem sessão, não aparece.
 */
export function LicitacoesNav({
  atual,
  area,
}: Readonly<{ atual: (typeof ITENS)[number]['href']; area: Area | null | undefined }>) {
  if (!area) return null;
  const itens = ITENS.filter((item) => pageAreas(item.href)?.includes(area));
  if (itens.length < 2) return null;
  return (
    <nav className="lic-nav" aria-label="Licitações">
      {itens.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          title={item.ajuda}
          aria-current={item.href === atual ? 'page' : undefined}
          className="lic-nav-item"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
