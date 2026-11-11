'use client';

import { useState } from 'react';
import { NICHE_CATALOG } from '@licitecomigo/shared';
import { errorText, send } from '../../lib/api';
import { Alert } from '../components/ui';
import { UfPicker } from '../components/UfPicker';
import { faixaDeValor, nomeDoNicho, type Perfil, type PerfilCompleto } from './perfil-lib';

/**
 * "Meu perfil": nichos, estados, faixa de valor e palavras num só lugar, salvo uma vez.
 * Depois de salvo vira uma linha-resumo; as buscas passam a usar o perfil sozinhas.
 */
export function PerfilRadar({
  dados,
  modalidades,
  nichosTravados,
  usando,
  onUsar,
  onSaved,
}: Readonly<{
  dados: PerfilCompleto;
  modalidades: string[];
  /** Colaborador: os nichos são definidos pelo Painel admin. */
  nichosTravados: boolean;
  usando: boolean;
  onUsar: (usar: boolean) => void;
  onSaved: () => void;
}>) {
  const { perfil, nichos } = dados;
  const configurado = nichos.length > 0;
  const [editando, setEditando] = useState(!configurado);
  const [mensagem, setMensagem] = useState<{ kind: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [ocupado, setOcupado] = useState(false);
  const [escolhidos, setEscolhidos] = useState<string[]>([...nichos, '', '', ''].slice(0, 3));
  const [ufs, setUfs] = useState<string[]>(perfil.ufs);

  async function salvar(form: FormData) {
    const novosNichos = [...new Set(escolhidos.filter(Boolean))];
    if (!nichosTravados && novosNichos.length === 0) {
      setMensagem({ kind: 'error', text: 'Escolha pelo menos um nicho.' });
      return;
    }
    const numero = (nome: string) => {
      const bruto = String(form.get(nome) ?? '').trim();
      return bruto === '' ? null : Number(bruto);
    };
    const modalidade = String(form.get('modalidade') ?? '');
    const corpo: Perfil = {
      ufs,
      palavras_interesse: String(form.get('palavras') ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length >= 2),
      valor_min: numero('valor_min'),
      valor_max: numero('valor_max'),
      modalidades: modalidade ? [modalidade] : [],
    };
    setOcupado(true);
    setMensagem(null);
    try {
      if (!nichosTravados && novosNichos.join() !== nichos.join()) {
        await send('PATCH', '/me', { nichos: novosNichos, onboarding_concluido: true });
      }
      await send('PUT', '/radar/perfil', corpo);
      setMensagem({ kind: 'success', text: 'Perfil salvo. As buscas já usam estas escolhas.' });
      setEditando(false);
      onSaved();
    } catch (error) {
      setMensagem({ kind: 'error', text: errorText(error) });
    } finally {
      setOcupado(false);
    }
  }

  if (configurado && !editando) {
    return (
      <section className="ui-panel rd-perfil" aria-label="Meu perfil">
        <div className="rd-perfil-linha">
          <div>
            <strong>Meu perfil</strong>
            <ul className="rd-perfil-itens">
              <li>{nichos.map(nomeDoNicho).join(' · ')}</li>
              <li>{perfil.ufs.length ? perfil.ufs.join(', ') : 'Todo o Brasil'}</li>
              <li>{faixaDeValor(perfil)}</li>
              {perfil.palavras_interesse.length ? (
                <li>{perfil.palavras_interesse.slice(0, 4).join(', ')}</li>
              ) : null}
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
            <button
              type="button"
              className="ui-btn ui-btn-ghost ui-btn-small"
              onClick={() => {
                setEscolhidos([...nichos, '', '', ''].slice(0, 3));
                setUfs(perfil.ufs);
                setEditando(true);
              }}
            >
              Editar perfil
            </button>
          </div>
        </div>
        {mensagem ? <Alert kind={mensagem.kind}>{mensagem.text}</Alert> : null}
      </section>
    );
  }

  return (
    <section className="ui-panel rd-perfil" aria-label="Meu perfil">
      <h2 className="rd-perfil-titulo">
        {configurado ? 'Editar meu perfil' : 'Comece pelo seu perfil'}
      </h2>
      <p className="rd-hint">
        Preencha uma vez. O Radar, a Análise e os Pregões passam a mostrar só o que combina com
        você. Nada disso sai do Licite Comigo.
      </p>
      <form
        className="ui-form rd-perfil-form"
        onSubmit={(event) => {
          event.preventDefault();
          void salvar(new FormData(event.currentTarget));
        }}
      >
        {nichosTravados ? (
          <p className="rd-hint rd-perfil-wide">
            Seus nichos são definidos pelo Painel admin: {nichos.map(nomeDoNicho).join(', ') || '—'}
            .
          </p>
        ) : (
          escolhidos.map((codigo, indice) => (
            <label key={indice}>
              {`Nicho ${indice + 1}${indice === 0 ? '' : ' (opcional)'}`}
              <select
                value={codigo}
                onChange={(event) =>
                  setEscolhidos((atual) =>
                    atual.map((valor, posicao) =>
                      posicao === indice ? event.target.value : valor,
                    ),
                  )
                }
              >
                <option value="">{indice === 0 ? 'Escolha um nicho' : 'Não usar'}</option>
                {NICHE_CATALOG.map((nicho) => (
                  <option
                    key={nicho.code}
                    value={nicho.code}
                    disabled={escolhidos.some(
                      (outro, posicao) => posicao !== indice && outro === nicho.code,
                    )}
                  >
                    {nicho.label}
                  </option>
                ))}
              </select>
            </label>
          ))
        )}
        <UfPicker value={ufs} onChange={setUfs} label="Estados em que você atua" />
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
          Modalidade preferida
          <select name="modalidade" defaultValue={perfil.modalidades[0] ?? ''}>
            <option value="">Qualquer</option>
            {[...new Set([...modalidades, ...perfil.modalidades])].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="rd-perfil-wide">
          Palavras de interesse (separe por vírgula, opcional)
          <input
            name="palavras"
            defaultValue={perfil.palavras_interesse.join(', ')}
            placeholder="ex.: notebook, software, uniforme"
          />
        </label>
        <div className="ui-form-actions rd-perfil-wide">
          <button className="ui-btn" type="submit" disabled={ocupado}>
            {ocupado ? 'Salvando…' : 'Salvar perfil'}
          </button>
          {configurado ? (
            <button
              type="button"
              className="ui-btn ui-btn-ghost"
              onClick={() => setEditando(false)}
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </form>
      {mensagem ? <Alert kind={mensagem.kind}>{mensagem.text}</Alert> : null}
    </section>
  );
}
