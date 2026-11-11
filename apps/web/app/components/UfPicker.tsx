'use client';

import { useId, useState } from 'react';
import { REGIAO_LABELS, REGIOES, UFS, UFS_POR_REGIAO, type Regiao } from '@licitecomigo/shared';

/**
 * Escolha de estados em um select só: o usuário adiciona um estado (ou uma região inteira) e
 * vê o que escolheu como etiquetas que se removem com um clique. Sem lista de 27 caixas.
 *
 * `name` gera um campo escondido por estado, para formulários que leem `FormData`.
 */
export function UfPicker({
  value,
  onChange,
  name,
  label = 'Estados',
  vazio = 'Todo o Brasil',
}: Readonly<{
  value: string[];
  onChange: (next: string[]) => void;
  name?: string;
  label?: string;
  vazio?: string;
}>) {
  const id = useId();
  const [seletor, setSeletor] = useState('');
  const escolhidos = new Set(value);
  const livres = UFS.filter((uf) => !escolhidos.has(uf));

  function adicionar(codigo: string) {
    setSeletor('');
    if (!codigo) return;
    const novos = codigo.startsWith('regiao:')
      ? [...UFS_POR_REGIAO[codigo.slice(7) as Regiao]]
      : [codigo];
    onChange([...new Set([...value, ...novos])].sort());
  }

  return (
    <div className="uf-picker">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={seletor} onChange={(event) => adicionar(event.target.value)}>
        <option value="">{value.length ? 'Adicionar outro estado…' : 'Escolher estado…'}</option>
        <optgroup label="Região inteira">
          {REGIOES.map((regiao) => (
            <option key={regiao} value={`regiao:${regiao}`}>
              {REGIAO_LABELS[regiao]}
            </option>
          ))}
        </optgroup>
        <optgroup label="Estado">
          {livres.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </optgroup>
      </select>
      <ul className="uf-picker-lista" aria-label="Estados escolhidos">
        {value.length === 0 ? <li className="uf-picker-vazio">{vazio}</li> : null}
        {value.map((uf) => (
          <li key={uf} className="uf-chip">
            <span>{uf}</span>
            <button
              type="button"
              aria-label={`Remover ${uf}`}
              onClick={() => onChange(value.filter((item) => item !== uf))}
            >
              ×
            </button>
            {name ? <input type="hidden" name={name} value={uf} /> : null}
          </li>
        ))}
        {value.length > 1 ? (
          <li>
            <button type="button" className="uf-picker-limpar" onClick={() => onChange([])}>
              Limpar
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
