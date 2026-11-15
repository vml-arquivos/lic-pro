'use client';

import Link from 'next/link';
import type { AnaContexto } from './useAnaChat';

/**
 * "Resumo da Ana": o que importa agora para quem está no painel (empresa, aluno, mentoria ou
 * administração), com links para agir e perguntas sugeridas. Só aparece quando a Ana conseguiu
 * ler a conta.
 */
export function AnaResumo({
  contexto,
  onPerguntar,
  desabilitado,
}: Readonly<{
  contexto: AnaContexto;
  onPerguntar: (pergunta: string) => void;
  desabilitado: boolean;
}>) {
  const temConteudo = contexto.resumo.length > 0 || contexto.destaques.length > 0;
  if (!temConteudo && contexto.sugestoes.length === 0) return null;
  return (
    <section className="ana-resumo" aria-label="Resumo da Ana">
      <strong>
        {contexto.nome ? `Oi, ${contexto.nome}! Isto é o que importa agora` : 'Resumo da Ana'}
      </strong>
      {contexto.resumo.length ? (
        <ul>
          {contexto.resumo.slice(0, 5).map((linha) => (
            <li key={linha}>{linha}</li>
          ))}
        </ul>
      ) : null}
      {contexto.destaques.length ? (
        <ul className="ana-resumo-acoes">
          {contexto.destaques.slice(0, 5).map((item) => (
            <li key={item.texto} className={item.tom === 'atencao' ? 'atencao' : undefined}>
              {item.href ? <Link href={item.href}>{item.texto}</Link> : item.texto}
            </li>
          ))}
        </ul>
      ) : null}
      {contexto.sugestoes.length ? (
        <div className="ana-box-suggestions">
          {contexto.sugestoes.slice(0, 4).map((texto) => (
            <button
              key={texto}
              type="button"
              disabled={desabilitado}
              onClick={() => onPerguntar(texto)}
            >
              {texto}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** Links que a Ana devolve junto da resposta (telas e licitações para abrir). */
export function AnaLinks({
  links,
}: Readonly<{ links: ReadonlyArray<{ texto: string; href: string }> }>) {
  if (!links.length) return null;
  return (
    <ul className="ana-links">
      {links.map((link) => (
        <li key={link.href}>
          <Link href={link.href}>{link.texto}</Link>
        </li>
      ))}
    </ul>
  );
}
