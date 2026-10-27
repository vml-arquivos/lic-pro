'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { send } from '../../../lib/api';
import { Badge } from '../../components/ui';
import { brl, deadlineInfo } from '../radar-lib';

type Edital = {
  id: string;
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

export function EditalWorkspace({
  editalId,
  canPipeline = true,
  canPractice = false,
  signedIn = true,
}: {
  editalId: string;
  canPipeline?: boolean;
  canPractice?: boolean;
  signedIn?: boolean;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [question, setQuestion] = useState('Faça uma leitura inicial do edital.');
  const [analysis, setAnalysis] = useState<ReaderResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [interacao, setInteracao] = useState<Interacao>({
    favorito: false,
    descartado: false,
    nota: null,
  });
  const [note, setNote] = useState('');

  async function load() {
    const [detailResponse, companyResponse] = await Promise.all([
      fetch(`/api/core/editais/${editalId}`),
      canPipeline
        ? fetch('/api/core/companies')
        : Promise.resolve(new Response(null, { status: 204 })),
    ]);
    if (detailResponse.ok) {
      const loaded = (await detailResponse.json()) as Detail;
      setDetail(loaded);
      if (loaded.interacao) {
        setInteracao(loaded.interacao);
        setNote(loaded.interacao.nota ?? '');
      }
      if (signedIn)
        void send('POST', `/editais/${editalId}/interacao`, { visto: true }).catch(() => undefined);
    }
    if (canPipeline && companyResponse.ok) {
      const rows = ((await companyResponse.json()) as { data?: Company[] }).data ?? [];
      setCompanies(rows);
      setCompanyId((current) => current || rows[0]?.id || '');
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, [editalId]);

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
    setMessage('Reader trabalhando somente sobre o edital e seus chunks persistidos…');
    const response = await fetch('/api/reader/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ edital_id: editalId, pergunta: question }),
    });
    if (!response.ok) {
      setMessage('Reader indisponível ou sem sessão válida.');
      return;
    }
    setAnalysis((await response.json()) as ReaderResult);
    setMessage('Análise gerada com evidências.');
  }

  async function ingestPdf() {
    if (!file) return;
    const body = new FormData();
    body.set('file', file);
    body.set('edital_id', editalId);
    const response = await fetch('/api/reader/ingest', { method: 'POST', body });
    setMessage(
      response.ok
        ? 'PDF ingerido; agora você pode pedir a análise.'
        : 'Não foi possível ingerir o PDF.',
    );
    if (response.ok) await load();
  }

  if (loading)
    return (
      <section className="detail-card">
        <p>Carregando edital, versões e evidências…</p>
      </section>
    );
  if (!detail?.edital)
    return (
      <section className="detail-card">
        <h2>Edital não encontrado</h2>
        <Link href="/radar">Voltar ao Radar</Link>
      </section>
    );
  const edital = detail.edital;
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
        <dl className="rd-facts">
          {(
            [
              ['Número da compra', edital.numero_compra],
              ['Processo', edital.processo],
              ['Órgão', edital.orgao],
              ['CNPJ do órgão', edital.orgao_cnpj ? formatCnpj(edital.orgao_cnpj) : null],
              ['Município', edital.municipio_nome],
              ['Esfera / poder', [edital.esfera, edital.poder].filter(Boolean).join(' / ') || null],
              ['Modalidade', edital.modalidade],
              ['Modo de disputa', edital.modo_disputa],
              ['Instrumento', edital.instrumento],
              ['Amparo legal', edital.amparo_legal],
              [
                'Registro de preços',
                edital.srp === null || edital.srp === undefined ? null : edital.srp ? 'Sim' : 'Não',
              ],
              ['Situação', edital.situacao],
              ['Valor estimado', brl(edital.valor_estimado)],
              ['Valor homologado', edital.valor_homologado ? brl(edital.valor_homologado) : null],
              ['Publicação', fmtDateTime(edital.data_publicacao)],
              ['Abertura das propostas', fmtDateTime(edital.data_abertura_proposta)],
              ['Encerramento das propostas', fmtDateTime(edital.data_encerramento_proposta)],
              ['Última atualização na fonte', fmtDateTime(edital.data_atualizacao)],
              ['Fonte', edital.sistema_origem ?? edital.fonte],
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
        {detail.itens.length ? (
          <ul className="item-list">
            {detail.itens.map((item) => (
              <li key={item.id}>
                <strong>{item.numero}</strong>
                <span>{item.descricao}</span>
                <small>
                  {item.quantidade ?? '—'} {item.unidade ?? ''} ·{' '}
                  {item.catmat_catser ?? 'CATMAT/CATSER não informado'}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p>Nenhum item normalizado ainda.</p>
        )}
      </section>
      <section id="historico" className="detail-card">
        <h2>O que mudou e documentos</h2>
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
          <p>Nenhuma alteração registrada desde que o edital entrou no Radar.</p>
        )}
        <h3>Documentos ({(detail.documentos ?? []).length})</h3>
        {(detail.documentos ?? []).length ? (
          <ul className="simple-list">
            {(detail.documentos ?? []).map((doc) => (
              <li key={doc.id}>
                <strong>{doc.nome_arquivo ?? doc.tipo ?? 'Documento'}</strong>
                <span>
                  {doc.tipo ?? 'anexo'}
                  {doc.url ? (
                    <>
                      {' · '}
                      <a href={doc.url} target="_blank" rel="noreferrer noopener">
                        abrir na fonte
                      </a>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            A fonte não trouxe documentos para este edital. Confira os anexos no portal de origem.
          </p>
        )}
      </section>
      <section id="analise" className="detail-card analysis-card">
        <div className="analysis-heading">
          <div>
            <p className="eyebrow">Reader v1 · evidência primeiro</p>
            <h2>Análise IA</h2>
          </div>
          <span className="status-pill">
            {detail.analise?.status ?? (analysis ? 'concluída' : 'pendente')}
          </span>
        </div>
        <div className="reader-controls">
          <label>
            Pergunta para o Reader
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={2}
            />
          </label>
          <div className="action-row">
            <button type="button" onClick={() => void analyzeReader()}>
              Analisar fonte
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
          <p>
            Faça upload de um PDF ingerido ou selecione uma pergunta para gerar a primeira leitura
            com evidências.
          </p>
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
        <p>
          O MVP 1 mostra os fatos ingeridos, itens, versões e evidências. Classificações de risco
          não confirmadas aparecem como perguntas para revisão.
        </p>
      </section>
      <section id="proposta" className="detail-card">
        <h2>Proposta</h2>
        <p>
          O MVP 1 não envia propostas a portais. Use o pipeline e o checklist para organizar a
          próxima decisão com aprovação humana.
        </p>
      </section>
    </>
  );
}
