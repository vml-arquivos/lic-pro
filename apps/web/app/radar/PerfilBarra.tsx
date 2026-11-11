'use client';

import Link from 'next/link';
import { faixaDeValor, nomeDoNicho, type PerfilCompleto } from './perfil-lib';

/** Linha curta mostrando o perfil em uso, com a opção de ver tudo. */
export function PerfilBarra({
  dados,
  usando,
  onUsar,
}: Readonly<{ dados: PerfilCompleto; usando: boolean; onUsar: (usar: boolean) => void }>) {
  const { perfil, nichos } = dados;
  if (nichos.length === 0) return null;
  return (
    <section className="ui-panel rd-perfil" aria-label="Meu perfil">
      <div className="rd-perfil-linha">
        <div>
          <strong>Meu perfil</strong>
          <ul className="rd-perfil-itens">
            <li>{nichos.map(nomeDoNicho).join(' · ')}</li>
            <li>{perfil.ufs.length ? perfil.ufs.join(', ') : 'Todo o Brasil'}</li>
            <li>{faixaDeValor(perfil)}</li>
          </ul>
        </div>
        <div className="rd-perfil-acoes">
          <label className="ui-check">
            <input
              type="checkbox"
              checked={usando}
              onChange={(event) => onUsar(event.target.checked)}
            />
            Filtrar pelo meu perfil
          </label>
          <Link className="ui-btn ui-btn-ghost ui-btn-small" href="/radar">
            Editar perfil
          </Link>
        </div>
      </div>
    </section>
  );
}
