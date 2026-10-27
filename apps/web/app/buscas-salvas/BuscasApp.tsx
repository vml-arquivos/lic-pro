'use client';

import Link from 'next/link';
import { useState } from 'react';
import { errorText, send } from '../../lib/api';
import { Alert, Badge, Empty, Panel, Resource, formatDate, useResource } from '../components/ui';

type Regra = {
  id: string;
  busca_id: string;
  busca_nome: string;
  filtros: Record<string, unknown>;
  ativa: boolean;
  frequencia: 'imediata' | 'diario' | 'semanal';
  horario_diario: number | null;
  dia_semana: number | null;
  canais: string[];
  tipos: string[];
  destinatarios: string[];
  entregas: number;
};
type Busca = {
  id: string;
  nome: string;
  filtros: Record<string, unknown>;
  ativa: boolean;
  updated_at: string;
};
type Opcoes = {
  canais: Array<{ codigo: string; nome: string; disponivel: boolean; motivo: string | null }>;
  destinatarios: Array<{ id: string; nome: string; email: string }>;
};

const FREQUENCIAS: ReadonlyArray<readonly [Regra['frequencia'], string]> = [
  ['imediata', 'A cada verificação (poucos minutos)'],
  ['diario', 'Uma vez por dia'],
  ['semanal', 'Uma vez por semana'],
];
const HORARIOS = [7, 12, 18];
const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const TIPOS: ReadonlyArray<readonly [string, string]> = [
  ['novos', 'Oportunidades novas'],
  ['alteracao', 'Alterações no edital'],
  ['prazo', 'Prazos chegando'],
];

function radarHref(filtros: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filtros)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, String(item)));
    else if (value !== null && value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `/radar?${query}` : '/radar';
}

export function BuscasApp() {
  const [buscas, reloadBuscas] = useResource<{ data: Busca[] }>('/saved-searches');
  const [regras, reloadRegras] = useResource<{ data: Regra[] }>('/alert-rules');
  const [opcoes] = useResource<Opcoes>('/alert-options');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function run(action: () => Promise<unknown>, okText: string) {
    setMessage(null);
    try {
      await action();
      setMessage({ kind: 'success', text: okText });
      reloadBuscas();
      reloadRegras();
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    }
  }

  return (
    <>
      {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
      <Resource value={buscas}>
        {({ data }) =>
          data.length === 0 ? (
            <Panel title="Nenhuma busca salva">
              <Empty>
                No <Link href="/radar">Radar</Link>, escolha seus filtros e use “Salvar esta busca”.
                Os avisos são criados junto.
              </Empty>
            </Panel>
          ) : (
            <Resource value={regras}>
              {({ data: rules }) => (
                <Resource value={opcoes}>
                  {(options) => (
                    <>
                      {data.map((busca) => {
                        const regra = rules.find((item) => item.busca_id === busca.id);
                        return (
                          <Panel
                            key={busca.id}
                            title={busca.nome}
                            description={`Atualizada em ${formatDate(busca.updated_at, true)}`}
                            actions={
                              <div className="ui-table-actions">
                                <Link
                                  className="ui-btn ui-btn-small"
                                  href={radarHref(busca.filtros)}
                                >
                                  Abrir no Radar
                                </Link>
                                <button
                                  type="button"
                                  className="ui-btn ui-btn-danger ui-btn-small"
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Excluir a busca “${busca.nome}” e os avisos dela?`,
                                      )
                                    )
                                      void run(
                                        () => send('DELETE', `/saved-searches/${busca.id}`),
                                        'Busca excluída.',
                                      );
                                  }}
                                >
                                  Excluir
                                </button>
                              </div>
                            }
                          >
                            {regra ? (
                              <RegraForm
                                key={`${regra.id}-${JSON.stringify(regra)}`}
                                regra={regra}
                                options={options}
                                onSave={(body) =>
                                  run(
                                    () => send('PATCH', `/alert-rules/${regra.id}`, body),
                                    'Avisos atualizados.',
                                  )
                                }
                              />
                            ) : (
                              <Empty>Esta busca ainda não tem avisos configurados.</Empty>
                            )}
                          </Panel>
                        );
                      })}
                    </>
                  )}
                </Resource>
              )}
            </Resource>
          )
        }
      </Resource>
    </>
  );
}

function RegraForm({
  regra,
  options,
  onSave,
}: Readonly<{
  regra: Regra;
  options: Opcoes;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}>) {
  const [frequencia, setFrequencia] = useState(regra.frequencia);
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData) {
    setBusy(true);
    const body: Record<string, unknown> = {
      ativa: form.get('ativa') === 'on',
      frequencia,
      canais: form.getAll('canais').map(String),
      tipos: form.getAll('tipos').map(String),
    };
    if (frequencia === 'diario') body.horario_diario = Number(form.get('horario') ?? 7);
    if (frequencia === 'semanal') body.dia_semana = Number(form.get('dia') ?? 1);
    const people = form.getAll('destinatarios').map(String);
    if (people.length) body.destinatarios = people;
    await onSave(body);
    setBusy(false);
  }

  return (
    <form
      className="ui-form al-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(new FormData(event.currentTarget));
      }}
    >
      <label className="ui-check">
        <input type="checkbox" name="ativa" defaultChecked={regra.ativa} />
        Avisos ligados{' '}
        <Badge tone={regra.ativa ? 'ok' : 'muted'}>{regra.ativa ? 'Ativa' : 'Pausada'}</Badge>
      </label>
      <label>
        Com que frequência
        <select
          value={frequencia}
          onChange={(event) => setFrequencia(event.target.value as Regra['frequencia'])}
        >
          {FREQUENCIAS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {frequencia === 'diario' ? (
        <label>
          Horário (Brasília)
          <select name="horario" defaultValue={regra.horario_diario ?? 7}>
            {HORARIOS.map((hour) => (
              <option key={hour} value={hour}>
                {String(hour).padStart(2, '0')}h
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {frequencia === 'semanal' ? (
        <label>
          Dia da semana
          <select name="dia" defaultValue={regra.dia_semana ?? 1}>
            {DIAS.map((label, index) => (
              <option key={label} value={index + 1}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <fieldset>
        <legend>O que avisar</legend>
        {TIPOS.map(([value, label]) => (
          <label className="ui-check" key={value}>
            <input
              type="checkbox"
              name="tipos"
              value={value}
              defaultChecked={regra.tipos.includes(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Por onde</legend>
        {options.canais.map((canal) => (
          <label className="ui-check" key={canal.codigo}>
            <input
              type="checkbox"
              name="canais"
              value={canal.codigo}
              disabled={!canal.disponivel}
              defaultChecked={canal.disponivel && regra.canais.includes(canal.codigo)}
            />
            {canal.nome}
            {canal.disponivel ? null : <small> — {canal.motivo}</small>}
          </label>
        ))}
      </fieldset>
      {options.destinatarios.length > 1 ? (
        <fieldset>
          <legend>Quem recebe</legend>
          {options.destinatarios.map((person) => (
            <label className="ui-check" key={person.id}>
              <input
                type="checkbox"
                name="destinatarios"
                value={person.id}
                defaultChecked={regra.destinatarios.includes(person.id)}
              />
              {person.nome} <small>{person.email}</small>
            </label>
          ))}
        </fieldset>
      ) : null}
      <p className="rd-hint">{regra.entregas} aviso(s) já gerado(s) por esta busca.</p>
      <button className="ui-btn" disabled={busy}>
        {busy ? 'Salvando…' : 'Salvar avisos'}
      </button>
    </form>
  );
}
