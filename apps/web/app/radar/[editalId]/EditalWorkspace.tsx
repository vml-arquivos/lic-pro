'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { errorText, send } from '../../../lib/api';
import { Badge } from '../../components/ui';
import { brl, deadlineInfo, portalDoEdital } from '../radar-lib';
import { DocumentacaoTecnica } from './DocumentacaoTecnica';
import './documentacao.css';
import './ficha.css';
import { DadosDoEdital, DocumentosDoEdital, useLeitura } from './LeituraDoEdital';
import { ConcorrentesDoEdital, PrecosDoEdital } from './MercadoDoEdital';
import { ValoresFechados } from './ValoresFechados';

type Edital = {
  id: string;
  detalhes_coletados_em?: string | null;
  titulo: string;
  orgao?: string | null;
  uf?: string | null;
  modalidade?: string | null;
  catmat_catser?: string | null;
  valor_estimado?: number | string | null;
  data_publicacao?: string | null;
  url_origem?: string | null;
  fonte?: string;
  sistema_origem?: string | null;
  orgao_cnpj?: string | null;
  numero_compra?: string | null;
  processo?: string | null;
  amparo_legal?: string | null;
  fonte_orcamentaria?: string | null;
  emenda_parlamentar?: boolean | null;
  normativo_base?: string | null;
  criterio_julgamento?: string | null;
  orcamento_sigiloso?: boolean | null;
  possui_nfe?: boolean | null;
  informacao_complementar?: string | null;
  municipio_nome?: string | null;
  esfera?: string | null;
  poder?: string | null;
  situacao?: string | null;
  instrumento?: string | null;
  modo_disputa?: string | null;
  srp?: boolean | null;
  valor_homologado?: number | string | null;
  data_abertura_proposta?: string | null;
  data_encerramento_proposta?: string | null;
  data_atualizacao?: string | null;
};
type Change = { campo: string; antes: unknown; depois: unknown };
type Evento = {
  id: string;
  tipo: string;
  fonte?: string | null;
  ocorrido_em?: string | null;
  created_at: string;
  payload?: { campos?: Change[] } & Record<string, unknown>;
};
type Documento = {
  id: string;
  tipo?: string | null;
  nome_arquivo?: string | null;
  url?: string | null;
  estado?: string | null;
  created_at: string;
};
type Interacao = { favorito: boolean; descartado: boolean; nota: string | null };
type Item = {
  id: string;
  numero: string;
  descricao: string;
  unidade?: string | null;
  quantidade?: number | string | null;
  catmat_catser?: string | null;
  beneficio?: string | null;
  situacao_item?: string | null;
};
type Evidence = {
  id?: string;
  pagina?: number | null;
  secao?: string | null;
  conteudo: string;
  fonte?: string | null;
  confianca?: number | null;
  status_validacao?: string;
};
type ReaderEvidence = {
  chunk_id?: string | null;
  pagina?: number | null;
  secao?: string | null;
  trecho: string;
  fonte?: string | null;
  confianca?: number | null;
  status_validacao?: string;
};
type ReaderResult = {
  resumo: string;
  riscos: string[];
  pontos_atencao: string[];
  checklist_documentos: string[];
  perguntas: string[];
  evidencias: ReaderEvidence[];
  disclaimer: string;
};
type Company = { id: string; razao_social: string };
type Detail = {
  edital: Edital;
  itens: Item[];
  versoes: Array<{ id: string; numero: number; fonte: string; hash_conteudo: string }>;
  evidencias: Evidence[];
  interacao?: Interacao;
  documentos?: Documento[];
  eventos?: Evento[];
  analise: {
    status: string;
    resultado?: ReaderResult | null;
    modelo?: string;
    prompt_version?: string;
  } | null;
};

const FIELD_LABELS: Record<string, string> = {
  situacao: 'Situação',
  valor_estimado: 'Valor estimado',
  valor_homologado: 'Valor homologado',
  data_abertura_proposta: 'Abertura das propostas',
  data_encerramento_proposta: 'Encerramento das propostas',
  modalidade: 'Modalidade',
  titulo: 'Objeto',
};

function simNao(valor: boolean | null | undefined): string | null {
  return valor === null || valor === undefined ? null : valor ? 'Sim' : 'Não';
}

function showValue(campo: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return 'vazio';
  if (campo.startsWith('valor')) return brl(value as number | string);
  if (campo.startsWith('data_')) return fmtDateTime(String(value));
  return String(value);
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      });
}

function formatCnpj(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length === 14
    ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : (value ?? '—');
}

/** Última ficha vista de cada edital, por conta: reabrir mostra na hora e atualiza por baixo. */
const fichas = new Map<string, { detail: Detail; em: number }>();
const VALIDADE_DA_FICHA_MS = 10 * 60_000;
function guardarFicha(usuario: string, editalId: string, detail: Detail): void {
  fichas.set(`${usuario}|${editalId}`, { detail, em: Date.now() });
  while (fichas.size > 30) fichas.delete(fichas.keys().next().value as string);
}
function lerFicha(usuario: string, editalId: string): Detail | null {
  const guardada = fichas.get(`${usuario}|${editalId}`);
  return guardada && Date.now() - guardada.em < VALIDADE_DA_FICHA_MS ? guardada.detail : null;
}

export function EditalWorkspace({
  editalId,
  canPipeline = true,
  canPractice = false,
  signedIn = true,
  canAnalyze = false,
  usuario = 'anonimo',
}: {
  editalId: string;
  canPipeline?: boolean;
  canPractice?: boolean;
  signedIn?: boolean;
  canAnalyze?: boolean;
  usuario?: string;
}) {
  const [detail, setDetail] = useState<Detail | null>(() => lerFicha(usuario, editalId));
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [question, setQuestion] = useState('Faça uma leitura inicial do edital.');
  const [analysis, setAnalysis] = useState<ReaderResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(() => lerFicha(usuario, editalId) === null);
  const [interacao, setInteracao] = useState<Interacao>({
    favorito: false,
    descartado: false,
    nota: null,
  });
  const [note, setNote] = useState('');
  const [fetchingDetails, setFetchingDetails] = useState(false);

  async function fetchDetails(force = false) {
    setFetchingDetails(true);
    setMessage('');
    try {
      const result = await send<{ atualizado: boolean; itens?: number; documentos?: number }>(
        'POST',
        `/editais/${editalId}/detalhes/atualizar`,
        { force },
      );
      setMessage(
        !result.atualizado
          ? 'Itens e documentos já estão atualizados.'
          : `Encontrados ${result.itens ?? 0} item(ns) e ${result.documentos ?? 0} documento(s).`,
      );
      await load();
    } catch (cause) {
      setMessage(errorText(cause));
    } finally {
      setFetchingDetails(false);
    }
  }

  const marcouVisto = useRef(false);
  async function load() {
    // A ficha vem sozinha: a lista de empresas do pipeline carrega à parte e não a atrasa.
    const detailResponse = await fetch(`/api/core/editais/${editalId}`);
    if (detailResponse.ok) {
      const loaded = (await detailResponse.json()) as Detail;
      setDetail(loaded);
      guardarFicha(usuario, editalId, loaded);
      if (loaded.interacao) {
        setInteracao(loaded.interacao);
        setNote(loaded.interacao.nota ?? '');
      }
      if (signedIn && !marcouVisto.current) {
        marcouVisto.current = true;
        void send('POST', `/editais/${editalId}/interacao`, { visto: true }).catch(() => undefined);
      }
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, [editalId]);

  useEffect(() => {
    if (!canPipeline) return;
    let vivo = true;
    void fetch('/api/core/companies')
      .then(async (response) => {
        if (!vivo || !response.ok) return;
        const rows = ((await response.json()) as { data?: Company[] }).data ?? [];
        setCompanies(rows);
        setCompanyId((current) => current || rows[0]?.id || '');
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [canPipeline]);

  // Itens e documentos do PNCP: confere a cada abertura. O servidor só consulta a fonte se o que
  // está gravado venceu (ou o edital mudou). Com a ficha já na tela, tudo acontece por baixo.
  const revalidouDetalhes = useRef(false);
  useEffect(() => {
    const atual = detail?.edital;
    if (!atual || !signedIn || revalidouDetalhes.current) return;
    if (atual.fonte !== 'pncp') return;
    revalidouDetalhes.current = true;
    const semItens = detail.itens.length === 0;
    if (semItens) setFetchingDetails(true);
    void (async () => {
      try {
        const resposta = await send<{ atualizado: boolean; motivo?: string }>(
          'POST',
          `/editais/${editalId}/detalhes/atualizar`,
          { force: false },
        );
        if (resposta.atualizado) await load();
        else if (semItens && resposta.motivo === 'em_andamento') {
          // Outra pessoa já está buscando este edital: espera os itens chegarem.
          for (let tentativa = 0; tentativa < 6; tentativa += 1) {
            await new Promise((resolve) => setTimeout(resolve, 4000));
            await load();
          }
        }
      } catch {
        // a ficha segue na tela; o botão de atualizar continua disponível
      } finally {
        setFetchingDetails(false);
      }
    })();
  }, [detail, signedIn, editalId]);

  // Documentos do edital: lidos no servidor sozinhos; recomeça quando chegam itens ou documentos novos.
  const leitura = useLeitura(
    editalId,
    signedIn && Boolean(detail?.edital) && !fetchingDetails,
    `${detail?.itens.length ?? 0}-${detail?.documentos?.length ?? 0}`,
  );

  async function interact(change: Partial<Interacao>) {
    const before = interacao;
    setInteracao({
      ...before,
      ...change,
      ...(change.favorito ? { descartado: false } : {}),
      ...(change.descartado ? { favorito: false } : {}),
    });
    try {
      const saved = await send<Interacao>('POST', `/editais/${editalId}/interacao`, change);
      setInteracao({ favorito: saved.favorito, descartado: saved.descartado, nota: saved.nota });
      if (change.nota !== undefined) setMessage('Anotação salva.');
    } catch {
      setInteracao(before);
      setMessage('Não foi possível salvar agora. Tente novamente.');
    }
  }

  async function saveOpportunity() {
    const response = await fetch('/api/core/opportunities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(companyId ? { empresa_id: companyId } : {}),
        edital_id: editalId,
        status: 'triagem',
      }),
    });
    if (response.status === 409) {
      setMessage('Cadastre os dados da empresa antes de salvar no pipeline.');
      return;
    }
    setMessage(
      response.ok
        ? 'Edital salvo no pipeline. Veja em Oportunidades.'
        : 'Não foi possível salvar no pipeline.',
    );
  }

  async function analyzeReader() {
    setMessage('Analisando…');
    const response = await fetch('/api/reader/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ edital_id: editalId, pergunta: question }),
    });
    if (!response.ok) {
      setMessage('Análise indisponível agora.');
      return;
    }
    setAnalysis((await response.json()) as ReaderResult);
    setMessage('Análise pronta.');
  }

  async function ingestPdf() {
    if (!file) return;
    const body = new FormData();
    body.set('file', file);
    body.set('edital_id', editalId);
    const response = await fetch('/api/reader/ingest', { method: 'POST', body });
    setMessage(
      response.ok ? 'PDF enviado. Agora é só perguntar.' : 'Não foi possível enviar o PDF.',
    );
    if (response.ok) await load();
  }

  if (loading)
    return (
      <section className="detail-card">
        <p>Carregando o edital…</p>
      </section>
    );
  if (!detail?.edital)
    return (
      <section className="detail-card">
        <h2>Edital não encontrado</h2>
        <Link href="/radar">Voltar à busca</Link>
      </section>
    );
  const edital = detail.edital;
  const portal = portalDoEdital(edital);
  const shownAnalysis = analysis ?? detail.analise?.resultado ?? null;

  return (
    <>
      <section id="ficha" className="detail-card">
        <h2>Ficha do edital</h2>
        <p>
          <Badge tone={deadlineInfo(edital.data_encerramento_proposta).tone}>
            {deadlineInfo(edital.data_encerramento_proposta).label}
          </Badge>
        </p>
        {portal || edital.url_origem ? (
          <p className="rd-portal-links">
            {portal ? (
              <Link href={`/radar?portal=${encodeURIComponent(portal.slug)}`}>
                Ver outros editais do portal {portal.nome}
              </Link>
            ) : null}
            {edital.url_origem ? (
              <a href={edital.url_origem} target="_blank" rel="noreferrer noopener">
                Abrir este edital no portal de origem
              </a>
            ) : null}
          </p>
        ) : null}
        <dl className="rd-facts">
          {(
            [
              // Em cima: fonte, edital e datas. A descrição da licitação vem logo abaixo desta ficha.
              ['Fonte', portal?.nome ?? edital.sistema_origem ?? edital.fonte],
              ['Número da compra', edital.numero_compra],
              ['Processo', edital.processo],
              ['Publicação', fmtDateTime(edital.data_publicacao)],
              ['Abertura das propostas', fmtDateTime(edital.data_abertura_proposta)],
              ['Encerramento das propostas', fmtDateTime(edital.data_encerramento_proposta)],
              ['Última atualização na fonte', fmtDateTime(edital.data_atualizacao)],
              ['Órgão', edital.orgao],
              ['CNPJ do órgão', edital.orgao_cnpj ? formatCnpj(edital.orgao_cnpj) : null],
              ['Município', edital.municipio_nome],
              ['Esfera / poder', [edital.esfera, edital.poder].filter(Boolean).join(' / ') || null],
              ['Modalidade', edital.modalidade],
              ['Modo de disputa', edital.modo_disputa],
              ['Instrumento', edital.instrumento],
              ['Amparo legal', edital.amparo_legal],
              ['Normativo base', edital.normativo_base],
              ['Critério de julgamento', edital.criterio_julgamento],
              ['Fonte orçamentária', edital.fonte_orcamentaria],
              ['Emenda parlamentar', simNao(edital.emenda_parlamentar)],
              ['Orçamento sigiloso', simNao(edital.orcamento_sigiloso)],
              ['Exige nota fiscal eletrônica', simNao(edital.possui_nfe)],
              [
                'Registro de preços',
                edital.srp === null || edital.srp === undefined ? null : edital.srp ? 'Sim' : 'Não',
              ],
              ['Situação', edital.situacao],
              ['Valor estimado', brl(edital.valor_estimado)],
              ['Valor homologado', edital.valor_homologado ? brl(edital.valor_homologado) : null],
            ] as Array<[string, string | null | undefined]>
          )
            .filter(([, value]) => value && value !== '—')
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>
        {edital.informacao_complementar ? (
          <>
            <h3>Informação complementar</h3>
            <p>{edital.informacao_complementar}</p>
          </>
        ) : null}
      </section>
      <section id="itens" className="detail-card">
        <div className="detail-summary">
          <div>
            <p className="eyebrow">
              {edital.fonte ?? 'fonte oficial'} · {edital.uf ?? 'UF não informada'}
            </p>
            <h2>{edital.titulo}</h2>
            <p>
              {edital.orgao ?? 'Órgão não informado'} ·{' '}
              {edital.modalidade ?? 'Modalidade não informada'}
            </p>
          </div>
          <span className="status-pill">Fonte ingerida</span>
        </div>
        <div className="action-row">
          {signedIn ? (
            <>
              <button
                type="button"
                aria-pressed={interacao.favorito}
                onClick={() => void interact({ favorito: !interacao.favorito })}
              >
                {interacao.favorito ? '★ Favorita' : '☆ Favoritar'}
              </button>
              <button
                type="button"
                aria-pressed={interacao.descartado}
                onClick={() => void interact({ descartado: !interacao.descartado })}
              >
                {interacao.descartado ? 'Restaurar' : 'Descartar'}
              </button>
            </>
          ) : null}
          {canAnalyze ? (
            <Link
              className="ui-btn ui-btn-ghost ui-btn-small"
              href={`/analise?${new URLSearchParams({
                aba: 'simulador',
                titulo: edital.titulo ?? 'Edital',
                ...(Number(edital.valor_estimado) > 0
                  ? { referencia: String(Number(edital.valor_estimado)) }
                  : {}),
              }).toString()}`}
            >
              Simular proposta
            </Link>
          ) : null}
          {canPractice ? (
            <Link className="ui-btn ui-btn-small" href={`/praticar/${editalId}`}>
              Praticar este edital
            </Link>
          ) : null}
          {canPipeline ? (
            <>
              <select
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
                aria-label="Empresa do pipeline"
              >
                <option value="">
                  {companies.length > 1 ? 'Selecione a empresa' : 'Minha empresa'}
                </option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.razao_social}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => void saveOpportunity()}>
                Salvar no pipeline
              </button>
            </>
          ) : null}
          <Link className="button-quiet" href={edital.url_origem ?? '#'} target="_blank">
            Abrir fonte original
          </Link>
        </div>
        {signedIn ? (
          <form
            className="rd-note"
            onSubmit={(event) => {
              event.preventDefault();
              void interact({ nota: note.trim() || null });
            }}
          >
            <label>
              Minha anotação (só você vê)
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                maxLength={2000}
              />
            </label>
            <button type="submit">Salvar anotação</button>
          </form>
        ) : null}
        <h3>Itens ({detail.itens.length})</h3>
        {signedIn && detail.edital.fonte === 'pncp' ? (
          <p>
            <button
              type="button"
              className="ui-btn ui-btn-ghost ui-btn-small"
              disabled={fetchingDetails}
              onClick={() => void fetchDetails(Boolean(detail.edital.detalhes_coletados_em))}
            >
              {fetchingDetails
                ? 'Buscando…'
                : detail.edital.detalhes_coletados_em
                  ? 'Atualizar itens e documentos'
                  : 'Buscar itens e documentos'}
            </button>
          </p>
        ) : null}
        {detail.itens.length ? (
          <ul className="item-list">
            {detail.itens.map((item) => (
              <li key={item.id}>
                <strong>{item.numero}</strong>
                <span>{item.descricao}</span>
                <small>
                  {item.quantidade ?? '—'} {item.unidade ?? ''} ·{' '}
                  {item.catmat_catser ?? 'CATMAT/CATSER não informado'}
                  {item.beneficio ? ` · ${item.beneficio}` : ''}
                  {signedIn && item.catmat_catser && /^\d{4,9}$/.test(item.catmat_catser) ? (
                    <>
                      {' · '}
                      <Link href={`/precos?catmat=${item.catmat_catser}`}>
                        ver preços praticados
                      </Link>
                    </>
                  ) : null}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p>Nenhum item normalizado ainda.</p>
        )}
        {signedIn && detail.edital.fonte === 'pncp' && detail.itens.length ? (
          <ValoresFechados editalId={editalId} />
        ) : null}
      </section>
      <section id="documentacao" className="detail-card">
        <h2>Documentação técnica</h2>
        {signedIn ? (
          <DadosDoEdital
            estado={leitura.estado}
            buscando={fetchingDetails}
            tentarDeNovo={leitura.tentarDeNovo}
          />
        ) : null}
        <DocumentacaoTecnica
          editalId={editalId}
          versao={`${detail.itens.length}-${detail.documentos?.length ?? 0}-${
            leitura.estado.s === 'pronta' ? leitura.estado.dados.gerado_em : ''
          }`}
          semArquivos={signedIn}
        />
      </section>
      {signedIn ? (
        <section id="documentos" className="detail-card">
          <h2>Documentos do edital</h2>
          <DocumentosDoEdital
            editalId={editalId}
            estado={leitura.estado}
            publicados={detail.documentos ?? []}
          />
        </section>
      ) : null}
      {signedIn ? (
        <div className="rd-duas">
          <section id="precos" className="detail-card">
            <h2>Preços pagos</h2>
            <PrecosDoEdital
              editalId={editalId}
              temItens={detail.itens.length > 0}
              buscando={fetchingDetails}
            />
          </section>
          <section id="concorrentes" className="detail-card">
            <h2>Concorrentes</h2>
            <ConcorrentesDoEdital
              editalId={editalId}
              temItens={detail.itens.length > 0}
              buscando={fetchingDetails}
            />
          </section>
        </div>
      ) : null}
      <section id="historico" className="detail-card">
        <h2>O que mudou</h2>
        {(detail.eventos ?? []).length ? (
          <ul className="simple-list">
            {(detail.eventos ?? []).map((evento) => (
              <li key={evento.id}>
                <strong>
                  {evento.tipo === 'alteracao' ? 'Alteração' : evento.tipo} ·{' '}
                  {fmtDateTime(evento.ocorrido_em ?? evento.created_at)}
                </strong>
                {(evento.payload?.campos ?? []).map((change) => (
                  <span key={change.campo}>
                    {FIELD_LABELS[change.campo] ?? change.campo}:{' '}
                    {showValue(change.campo, change.antes)} →{' '}
                    {showValue(change.campo, change.depois)}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p>Nenhuma alteração registrada desde que o edital entrou no Alerta de Licitações.</p>
        )}
        {!signedIn && (detail.documentos ?? []).length ? (
          <>
            <h3>Documentos ({(detail.documentos ?? []).length})</h3>
            <ul className="simple-list">
              {(detail.documentos ?? []).map((doc) => (
                <li key={doc.id}>
                  <strong>{doc.nome_arquivo ?? doc.tipo ?? 'Documento'}</strong>
                  <span>{doc.tipo ?? 'anexo'}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
      <section id="analise" className="detail-card analysis-card">
        <div className="analysis-heading">
          <div>
            <h2>Perguntas sobre o edital</h2>
          </div>
          <span className="status-pill">
            {detail.analise?.status ?? (analysis ? 'concluída' : 'pendente')}
          </span>
        </div>
        <div className="reader-controls">
          <label>
            Sua pergunta
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={2}
            />
          </label>
          <div className="action-row">
            <button type="button" onClick={() => void analyzeReader()}>
              Perguntar
            </button>
            <label className="file-input">
              Anexar PDF
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            {file ? (
              <button type="button" onClick={() => void ingestPdf()}>
                Ingerir {file.name}
              </button>
            ) : null}
          </div>
        </div>
        {shownAnalysis ? (
          <div className="analysis-content">
            <h3>Resumo</h3>
            <p>{shownAnalysis.resumo}</p>
            <div className="analysis-columns">
              <div>
                <h3>Riscos e atenção</h3>
                {[...shownAnalysis.riscos, ...shownAnalysis.pontos_atencao].map((item) => (
                  <p key={item}>• {item}</p>
                ))}
              </div>
              <div>
                <h3>Checklist</h3>
                {shownAnalysis.checklist_documentos.map((item) => (
                  <label key={item}>
                    <input type="checkbox" /> {item}
                  </label>
                ))}
              </div>
            </div>
            <div className="evidence-list">
              <h3>Evidências</h3>
              {shownAnalysis.evidencias.map((evidence, index) => (
                <blockquote key={`${evidence.chunk_id ?? index}-${evidence.pagina}`}>
                  <span>{evidence.trecho}</span>
                  <cite>
                    {evidence.fonte ?? 'fonte do edital'} · p. {evidence.pagina ?? '—'} · confiança{' '}
                    {evidence.confianca ?? '—'} · {evidence.status_validacao ?? 'extraído'}
                  </cite>
                </blockquote>
              ))}
            </div>
            <p className="analysis-warning">{shownAnalysis.disclaimer}</p>
          </div>
        ) : (
          <p>Anexe o PDF do edital e faça sua pergunta.</p>
        )}
        {message ? (
          <p className="success-message" aria-live="polite">
            {message}
          </p>
        ) : null}
      </section>
      <section id="versoes" className="detail-card">
        <h2>Versões e rastreabilidade</h2>
        {detail.versoes.length ? (
          <ul className="simple-list">
            {detail.versoes.map((version) => (
              <li key={version.id}>
                <strong>Versão {version.numero}</strong>
                <span>
                  {version.fonte} · hash {version.hash_conteudo}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>Nenhuma versão adicional registrada.</p>
        )}
      </section>
      <section id="raio-x" className="detail-card">
        <h2>Raio-X</h2>
        <p>Fatos, itens e versões do edital.</p>
      </section>
      <section id="proposta" className="detail-card">
        <h2>Proposta</h2>
        <p>Use o pipeline para acompanhar a proposta.</p>
      </section>
    </>
  );
}
