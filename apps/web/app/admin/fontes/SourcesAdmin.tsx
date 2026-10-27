'use client';

import { useEffect, useState } from 'react';
import { errorText, send } from '../../../lib/api';
import {
  Alert,
  Badge,
  Kpi,
  type Loaded,
  Panel,
  Resource,
  formatDate,
  formatNumber,
  useResource,
} from '../../components/ui';

type Ingest = {
  checkpoints: { checkpoints: number; atualizados_24h: number; ultima_atualizacao: string | null };
  dead_letters: { total: number; pendentes: number; ultimo_registro: string | null };
};

type AlertStatus = {
  motor_ligado: boolean;
  email_disponivel: boolean;
  execucoes: Array<{
    id: string;
    iniciado_em: string;
    finalizado_em: string | null;
    regras: number;
    criadas: number;
    liberadas: number;
    emails: number;
    erros: number;
  }>;
  entregas_por_status: Array<{ status: string; total: number }>;
};

function AlertEngine() {
  const [status, reload] = useResource<AlertStatus>('/admin/alerts/status');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function runNow() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await send<{
        skipped: boolean;
        created: number;
        released: number;
        emails: number;
        errors: number;
      }>('POST', '/admin/alerts/run');
      setMessage({
        kind: 'success',
        text: result.skipped
          ? 'Outra verificação já estava em andamento. Tente de novo em instantes.'
          : `Verificação concluída: ${result.created} aviso(s) novo(s), ${result.released} liberado(s), ${result.emails} e-mail(s), ${result.errors} erro(s).`,
      });
      reload();
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Motor de alertas"
      description="Procura oportunidades novas para as buscas salvas e entrega os avisos."
      actions={
        <button
          type="button"
          className="ui-btn ui-btn-small"
          disabled={busy}
          onClick={() => void runNow()}
        >
          {busy ? 'Verificando…' : 'Verificar agora'}
        </button>
      }
    >
      {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
      <Resource value={status}>
        {(data) => (
          <>
            <p>
              Motor{' '}
              <Badge tone={data.motor_ligado ? 'ok' : 'bad'}>
                {data.motor_ligado ? 'Ligado' : 'Desligado'}
              </Badge>{' '}
              E-mail{' '}
              <Badge tone={data.email_disponivel ? 'ok' : 'warn'}>
                {data.email_disponivel ? 'Configurado' : 'Não configurado'}
              </Badge>
            </p>
            <ul className="ui-list">
              {data.entregas_por_status.map((item) => (
                <li key={item.status}>
                  <span>Avisos {item.status}</span>
                  <strong>{formatNumber(item.total)}</strong>
                </li>
              ))}
            </ul>
            {data.execucoes.length === 0 ? (
              <Alert kind="info">Nenhuma verificação registrada ainda.</Alert>
            ) : (
              <ul className="ui-list">
                {data.execucoes.slice(0, 5).map((run) => (
                  <li key={run.id}>
                    <span>{formatDate(run.iniciado_em, true)}</span>
                    <strong>
                      {run.regras} regra(s) · {run.criadas} nova(s) · {run.emails} e-mail(s)
                      {run.erros ? ` · ${run.erros} erro(s)` : ''}
                    </strong>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Resource>
    </Panel>
  );
}

type Coleta = {
  ligada: boolean;
  intervalo_minutos: number;
  dias_por_rodada: number;
  max_paginas: number;
  fonte: string;
  modalidades: Array<{ codigo: number; nome: string }>;
  catalogo: {
    total: number;
    capturados_24h: number;
    abertos: number;
    ultima_publicacao: string | null;
  };
  execucoes: Array<{
    id: string;
    origem: string;
    iniciado_em: string;
    finalizado_em: string | null;
    janela_inicio: string;
    janela_fim: string;
    status: 'rodando' | 'ok' | 'parcial' | 'erro';
    paginas: number;
    lidos: number;
    inseridos: number;
    atualizados: number;
    ignorados: number;
    erros: number;
    ultimo_erro: string | null;
  }>;
};

const RUN_TONE = { rodando: 'warn', ok: 'ok', parcial: 'warn', erro: 'bad' } as const;
const RUN_LABEL = {
  rodando: 'Em andamento',
  ok: 'Concluída',
  parcial: 'Parcial',
  erro: 'Com erro',
} as const;

/** Coleta dos editais do governo (PNCP), feita pelo próprio servidor. */
function PncpCollector() {
  const [coleta, reload] = useResource<Coleta>('/admin/coleta/status');
  const [dias, setDias] = useState(3);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const running =
    coleta.state === 'ready' && coleta.data.execucoes.some((run) => run.status === 'rodando');

  // Enquanto uma rodada está em andamento, atualiza o quadro sozinho.
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(reload, 5000);
    return () => clearInterval(timer);
  }, [running, reload]);

  async function runNow() {
    setBusy(true);
    setMessage(null);
    try {
      await send('POST', '/admin/coleta/run', { dias });
      setMessage({
        kind: 'success',
        text: `Coleta iniciada (últimos ${dias} dia(s)). Ela roda em segundo plano; o quadro atualiza sozinho.`,
      });
      reload();
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Editais do governo (PNCP)"
      description="Leitura direta do Portal Nacional de Contratações Públicas, sem serviço extra."
      actions={
        <span className="ui-header-actions">
          <label className="sr-only" htmlFor="coleta-dias">
            Período a coletar
          </label>
          <select
            id="coleta-dias"
            className="audience-select"
            style={{ width: 'auto' }}
            value={dias}
            onChange={(event) => setDias(Number(event.target.value))}
          >
            {[1, 3, 7, 15, 30].map((value) => (
              <option key={value} value={value}>
                Últimos {value} dia(s)
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ui-btn ui-btn-small"
            disabled={busy || running}
            onClick={() => void runNow()}
          >
            {busy || running ? 'Coletando…' : 'Sincronizar agora'}
          </button>
        </span>
      }
    >
      {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
      <Resource value={coleta}>
        {(data) => (
          <>
            <div className="ui-kpis">
              <Kpi
                label="Editais no catálogo"
                value={formatNumber(data.catalogo.total)}
                hint="Vindos do PNCP"
              />
              <Kpi
                label="Com proposta aberta"
                value={formatNumber(data.catalogo.abertos)}
                tone={data.catalogo.abertos ? 'ok' : 'warn'}
              />
              <Kpi label="Capturados em 24 h" value={formatNumber(data.catalogo.capturados_24h)} />
              <Kpi
                label="Última publicação lida"
                value={formatDate(data.catalogo.ultima_publicacao)}
              />
            </div>
            <p>
              Coleta automática{' '}
              <Badge tone={data.ligada ? 'ok' : 'bad'}>
                {data.ligada ? 'Ligada' : 'Desligada'}
              </Badge>{' '}
              a cada {data.intervalo_minutos} min, olhando os últimos {data.dias_por_rodada} dia(s).
              Modalidades: {data.modalidades.map((item) => item.nome).join(', ')}. Fonte:{' '}
              {data.fonte}.
            </p>
            {data.catalogo.total === 0 && data.execucoes.length === 0 ? (
              <Alert kind="info">
                Nenhuma coleta registrada ainda. A primeira roda cerca de 1 minuto depois de o
                servidor iniciar; se preferir, use “Sincronizar agora”.
              </Alert>
            ) : null}
            {data.execucoes.length ? (
              <ul className="ui-list">
                {data.execucoes.slice(0, 6).map((run) => (
                  <li key={run.id}>
                    <span>
                      {formatDate(run.iniciado_em, true)} ·{' '}
                      {run.origem === 'manual' ? 'manual' : 'agendada'}
                      <small>
                        {run.lidos} lido(s) · {run.inseridos} novo(s) · {run.atualizados}{' '}
                        atualizado(s)
                        {run.erros ? ` · ${run.erros} erro(s)` : ''}
                        {run.ultimo_erro ? ` — ${run.ultimo_erro}` : ''}
                      </small>
                    </span>
                    <Badge tone={RUN_TONE[run.status]}>{RUN_LABEL[run.status]}</Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </Resource>
    </Panel>
  );
}

export function SourcesAdmin() {
  const [ingest] = useResource<Ingest>('/operations/ingest');
  return (
    <>
      <PncpCollector />
      <LegacyIngest ingest={ingest} />
      <AlertEngine />
    </>
  );
}

function LegacyIngest({ ingest }: Readonly<{ ingest: Loaded<Ingest> }>) {
  return (
    <Resource value={ingest}>
      {(data) => (
        <>
          <div className="ui-kpis">
            <Kpi
              label="Fontes acompanhadas"
              value={formatNumber(data.checkpoints.checkpoints)}
              hint="Com ponto de leitura registrado"
            />
            <Kpi
              label="Atualizadas em 24 h"
              value={formatNumber(data.checkpoints.atualizados_24h)}
              tone={data.checkpoints.atualizados_24h ? 'ok' : 'warn'}
            />
            <Kpi
              label="Falhas pendentes"
              value={formatNumber(data.dead_letters.pendentes)}
              hint={`${data.dead_letters.total} registradas no total`}
              tone={data.dead_letters.pendentes ? 'warn' : 'ok'}
            />
          </div>
          <Panel
            title="Serviço de coleta externo (opcional)"
            description="Só aparece atividade aqui se o serviço de ingestão separado estiver ligado."
          >
            <ul className="ui-list">
              <li>
                <span>Última atualização de fonte</span>
                <strong>{formatDate(data.checkpoints.ultima_atualizacao, true)}</strong>
              </li>
              <li>
                <span>Último registro de falha</span>
                <strong>{formatDate(data.dead_letters.ultimo_registro, true)}</strong>
              </li>
            </ul>
            {data.checkpoints.checkpoints === 0 ? (
              <Alert kind="info">
                Nenhuma coleta registrada ainda. Confira se o serviço de coleta está ligado.
              </Alert>
            ) : null}
          </Panel>
        </>
      )}
    </Resource>
  );
}
