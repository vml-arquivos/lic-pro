'use client';

import { PAINEIS_DE_RECURSOS } from '@licitecomigo/shared';
import './acessos.css';

/** Marque o que a pessoa NÃO pode abrir. Sem marcação, ela vê tudo do acesso dela. */
export function AcessosEditor({
  bloqueados,
  onChange,
  disabled = false,
}: Readonly<{
  bloqueados: readonly string[];
  onChange: (lista: string[]) => void;
  disabled?: boolean;
}>) {
  const fechado = new Set(bloqueados);

  function alternar(href: string) {
    const proximo = new Set(fechado);
    if (proximo.has(href)) proximo.delete(href);
    else proximo.add(href);
    onChange([...proximo]);
  }

  function marcarPainel(area: string, valor: boolean) {
    const painel = PAINEIS_DE_RECURSOS.find((item) => item.area === area);
    if (!painel) return;
    const proximo = new Set(fechado);
    for (const grupo of painel.grupos) {
      for (const item of grupo.itens) {
        if (valor) proximo.add(item.href);
        else proximo.delete(item.href);
      }
    }
    onChange([...proximo]);
  }

  return (
    <div className="ac">
      <p className="ac-titulo">
        Marque o que esta pessoa <strong>não pode</strong> abrir
      </p>
      {PAINEIS_DE_RECURSOS.map((painel) => (
        <details key={painel.area} className="ac-painel">
          <summary>
            {painel.titulo}
            <small>
              {' '}
              {painel.grupos.reduce(
                (total, grupo) =>
                  total + grupo.itens.filter((item) => fechado.has(item.href)).length,
                0,
              )}{' '}
              bloqueadas
            </small>
          </summary>
          <div className="ac-acoes">
            <button
              type="button"
              className="ui-btn ui-btn-ghost ui-btn-small"
              disabled={disabled}
              onClick={() => marcarPainel(painel.area, true)}
            >
              Bloquear tudo
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-ghost ui-btn-small"
              disabled={disabled}
              onClick={() => marcarPainel(painel.area, false)}
            >
              Liberar tudo
            </button>
          </div>
          {painel.grupos.map((grupo) => (
            <fieldset key={`${painel.area}-${grupo.label}`} className="ac-grupo">
              {grupo.label ? <legend>{grupo.label}</legend> : null}
              {grupo.itens.map((item) => (
                <label key={item.href} className="ac-item">
                  <input
                    type="checkbox"
                    checked={fechado.has(item.href)}
                    disabled={disabled}
                    onChange={() => alternar(item.href)}
                  />
                  {item.label}
                </label>
              ))}
            </fieldset>
          ))}
        </details>
      ))}
    </div>
  );
}
