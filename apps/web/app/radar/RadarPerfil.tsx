'use client';

import { useEffect, useState } from 'react';
import { UFS } from '@licitecomigo/shared';
import { api, errorText, send } from '../../lib/api';
import { Alert } from '../components/ui';

type Perfil = {
  ufs: string[];
  palavras_interesse: string[];
  valor_min: number | null;
  valor_max: number | null;
  modalidades: string[];
};

export function RadarPerfil({
  modalidades,
  onSaved,
}: Readonly<{ modalidades: string[]; onSaved: () => void }>) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ perfil: Perfil }>('/radar/perfil')
      .then((result) => setPerfil(result.perfil))
      .catch(() => undefined);
  }, []);

  async function save(form: FormData) {
    setBusy(true);
    setMessage(null);
    const number = (name: string) => {
      const raw = String(form.get(name) ?? '').trim();
      return raw === '' ? null : Number(raw);
    };
    const body: Perfil = {
      ufs: form.getAll('ufs').map(String),
      palavras_interesse: String(form.get('palavras') ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length >= 2),
      valor_min: number('valor_min'),
      valor_max: number('valor_max'),
      modalidades: form.getAll('modalidades').map(String),
    };
    try {
      await send('PUT', '/radar/perfil', body);
      setPerfil(body);
      setMessage({ kind: 'success', text: 'Perfil salvo. A compatibilidade já usa estes dados.' });
      onSaved();
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  if (!perfil) return null;
  return (
    <details className="ui-panel rd-profile">
      <summary>Meu perfil do Radar (usado na nota de compatibilidade)</summary>
      <p className="rd-hint">
        A nota é calculada por regras simples e visíveis: nicho, estado, faixa de valor, palavras de
        interesse e modalidade. Nada disso é enviado para fora do Licite Comigo.
      </p>
      <form
        className="ui-form"
        key={JSON.stringify(perfil)}
        onSubmit={(event) => {
          event.preventDefault();
          void save(new FormData(event.currentTarget));
        }}
      >
        <label>
          Palavras de interesse (separe por vírgula)
          <input name="palavras" defaultValue={perfil.palavras_interesse.join(', ')} />
        </label>
        <label>
          Valor mínimo (R$)
          <input
            name="valor_min"
            type="number"
            min={0}
            step="any"
            defaultValue={perfil.valor_min ?? ''}
          />
        </label>
        <label>
          Valor máximo (R$)
          <input
            name="valor_max"
            type="number"
            min={0}
            step="any"
            defaultValue={perfil.valor_max ?? ''}
          />
        </label>
        <label>
          Modalidades preferidas
          <select name="modalidades" multiple size={4} defaultValue={perfil.modalidades}>
            {[...new Set([...modalidades, ...perfil.modalidades])].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="rd-ufs">
          <legend>Estados em que você atua</legend>
          {UFS.map((uf) => (
            <label key={uf} className="rd-chip">
              <input
                type="checkbox"
                name="ufs"
                value={uf}
                defaultChecked={perfil.ufs.includes(uf)}
              />
              <span>{uf}</span>
            </label>
          ))}
        </fieldset>
        <div className="ui-form-actions">
          <button className="ui-btn" type="submit" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar perfil'}
          </button>
        </div>
      </form>
      {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
    </details>
  );
}
