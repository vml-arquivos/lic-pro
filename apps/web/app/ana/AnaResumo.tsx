'use client';

import Link from 'next/link';
import type { AnaContexto } from './useAnaChat';

/**
 * "Resumo da Ana": o que importa agora para quem está no painel (empresa, aluno, mentoria ou
 * administração), com links para agir. A pergunta é sempre livre: não há perguntas prontas. Só aparece quando a Ana conseguiu
 * ler a conta.
 */
export function AnaResumo({ contexto }: Readonly<{ contexto: AnaContexto }>) {
  const temConteudo = contexto.resumo.length > 0 || contexto.destaques.length > 0;
  if (!temConteudo) return null;
  return (
    <section className="ana-resumo" aria-label="Por onde começar">
      <strong>
        {contexto.nome
          ? `${contexto.nome}, se preferir, comece por aqui`
          : 'Se preferir, comece por aqui'}
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
