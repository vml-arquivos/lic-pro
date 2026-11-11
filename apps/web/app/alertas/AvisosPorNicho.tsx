'use client';

import Link from 'next/link';
import { useState } from 'react';
import { NICHE_CATALOG } from '@licitecomigo/shared';
import { api, errorText, send } from '../../lib/api';
import { Alert, Empty, Panel, Resource, useResource } from '../components/ui';

type Busca = { id: string; nome: string; ativa: boolean };
type Regra = { id: string; busca_id: string; ativa: boolean; tipos: string[] };

const TIPOS = [
  ['novos', 'Aberturas e novas licitações'],
  ['alteracao', 'Mudanças no edital'],
  ['prazo', 'Prazos chegando'],
  ['sessao', 'Sessão ao vivo'],
] as const;

const nomeDaBusca = (code: string) =>
  `Nicho: ${NICHE_CATALOG.find((niche) => niche.code === code)?.label ?? code}`;

/**
 * Atalho para receber avisos por nicho: um clique cria (ou ajusta) a busca do nicho e a regra
 * de aviso, sem precisar passar por Buscas salvas.
 */
export function AvisosPorNicho({
  nichos,
  travados,
}: Readonly<{ nichos: readonly string[]; travados: boolean }>) {
  const [buscas, reloadBuscas] = useResource<{ data: Busca[] }>('/saved-searches');
  const [regras, reloadRegras] = useResource<{ data: Regra[] }>('/alert-rules');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function toggle(code: string, tipo: string, on: boolean) {
    setBusy(`${code}:${tipo}`);
    setMessage(null);
    try {
      const name = nomeDaBusca(code);
      let busca =
        buscas.state === 'ready' ? buscas.data.data.find((b) => b.nome === name) : undefined;
      if (!busca) {
        if (!on) return;
        busca = await send<Busca>('POST', '/saved-searches', {
          nome: name,
          filtros: { nicho: [code] },
        });
      }
      const current = await api<{ data: Regra[] }>('/alert-rules');
      const rules = current.data;
      const rule = rules.find((item) => item.busca_id === busca!.id);
      if (!rule) throw new Error('Não foi possível preparar o aviso desta busca.');
      const atuais = rule.ativa ? rule.tipos : [];
      const proximos = on
        ? [...new Set([...atuais, tipo])]
        : atuais.filter((item) => item !== tipo);
      if (proximos.length === 0) {
        await send('PATCH', `/alert-rules/${rule.id}`, { ativa: false });
      } else {
        await send('PATCH', `/alert-rules/${rule.id}`, {
          ativa: true,
          tipos: proximos,
          frequencia: 'imediata',
          canais: ['in_app'],
        });
      }
      reloadBuscas();
      reloadRegras();
      setMessage({ kind: 'success', text: 'Aviso atualizado.' });
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    } finally {
      setBusy('');
    }
  }

  const ready = buscas.state === 'ready' && regras.state === 'ready';
  const isOn = (code: string, tipo: string) => {
    if (!ready) return false;
    const busca = buscas.data.data.find((b) => b.nome === nomeDaBusca(code));
    const rule = busca ? regras.data.data.find((r) => r.busca_id === busca.id) : undefined;
    return Boolean(rule?.ativa && rule.tipos.includes(tipo));
  };

  return (
    <Panel
      title="Avisos por nicho"
      description="Marque o que você quer receber de cada nicho. Os avisos chegam no sino e aqui, e a sessão ao vivo avisa 1 hora e 15 minutos antes e quando começa."
    >
      {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
      {nichos.length === 0 ? (
        <Empty>
          {travados ? (
            'Seus nichos ainda não foram liberados pela equipe.'
          ) : (
            <>
              Escolha seus nichos para receber avisos.{' '}
              <Link href="/onboarding">Escolher nichos</Link>
            </>
          )}
        </Empty>
      ) : (
        <Resource value={buscas}>
          {() => (
            <div className="al-nichos">
              {nichos.map((code) => (
                <fieldset key={code} className="al-nicho">
                  <legend>
                    {NICHE_CATALOG.find((niche) => niche.code === code)?.label ?? code}
                  </legend>
                  {TIPOS.map(([tipo, label]) => (
                    <label className="ui-check" key={tipo}>
                      <input
                        type="checkbox"
                        checked={isOn(code, tipo)}
                        disabled={!ready || busy === `${code}:${tipo}`}
                        onChange={(event) => void toggle(code, tipo, event.target.checked)}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          )}
        </Resource>
      )}
    </Panel>
  );
}
