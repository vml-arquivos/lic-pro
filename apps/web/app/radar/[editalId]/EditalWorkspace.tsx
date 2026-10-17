'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

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
};
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
  analise: {
    status: string;
    resultado?: ReaderResult | null;
    modelo?: string;
    prompt_version?: string;
  } | null;
};

export function EditalWorkspace({ editalId }: { editalId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [question, setQuestion] = useState('Faça uma leitura inicial do edital.');
  const [analysis, setAnalysis] = useState<ReaderResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    const [detailResponse, companyResponse] = await Promise.all([
      fetch(`/api/core/editais/${editalId}`),
      fetch('/api/core/companies'),
    ]);
    if (detailResponse.ok) setDetail((await detailResponse.json()) as Detail);
    if (companyResponse.ok) {
      const rows = ((await companyResponse.json()) as { data?: Company[] }).data ?? [];
      setCompanies(rows);
      setCompanyId((current) => current || rows[0]?.id || '');
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, [editalId]);

  async function saveOpportunity() {
    if (!companyId) {
      setMessage('Crie ou selecione uma empresa antes de salvar no pipeline.');
      return;
    }
    const response = await fetch('/api/core/opportunities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ empresa_id: companyId, edital_id: editalId, status: 'triagem' }),
    });
    setMessage(
      response.ok ? 'Edital salvo no pipeline em triagem.' : 'Não foi possível salvar no pipeline.',
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
          <select
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            aria-label="Empresa do pipeline"
          >
            <option value="">Selecione a empresa</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.razao_social}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void saveOpportunity()}>
            Salvar no pipeline
          </button>
          <Link className="button-quiet" href={edital.url_origem ?? '#'} target="_blank">
            Abrir fonte original
          </Link>
        </div>
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
