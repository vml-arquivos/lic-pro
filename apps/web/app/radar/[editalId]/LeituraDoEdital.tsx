'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GRUPOS_FATO, type AlertaDoEdital, type FatoDoEdital } from '@licitecomigo/shared';
import { api, errorText } from '../../../lib/api';
import { Alert, Badge } from '../../components/ui';
import './leitura.css';

type DocumentoLido = {
  chave: string;
  nome: string;
  tipo: string | null;
  url: string;
  estado: 'lido' | 'formato' | 'grande' | 'sem_texto' | 'falhou';
  paginas: number;
  motivo: string | null;
};
type Dados = {
  gerado_em: string;
  documentos: DocumentoLido[];
  fatos: FatoDoEdital[];
  alertas: AlertaDoEdital[];
};
export type EstadoDaLeitura =
  { s: 'lendo' } | { s: 'erro'; mensagem: string } | { s: 'pronta'; dados: Dados };

const ESPERA_MS = 3000;
const TENTATIVAS = 60;

/**
 * Lê os documentos do edital sozinho: pede ao servidor e confere a cada poucos segundos
 * até ficar pronto. Recomeça quando `versao` muda (itens e documentos novos).
 */
export function useLeitura(editalId: string, ativo: boolean, versao: string) {
  const [estado, setEstado] = useState<EstadoDaLeitura>({ s: 'lendo' });
  const [rodada, setRodada] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    let tentativa = 0;
    setEstado({ s: 'lendo' });
    const consultar = async () => {
      try {
        const resposta = await api<{ estado: 'lendo' | 'erro' | 'pronta' } & Partial<Dados>>(
          `/editais/${editalId}/leitura`,
        );
        if (!vivo) return;
        if (resposta.estado === 'pronta') {
          setEstado({
            s: 'pronta',
            dados: {
              gerado_em: resposta.gerado_em ?? '',
              documentos: resposta.documentos ?? [],
              fatos: resposta.fatos ?? [],
              alertas: resposta.alertas ?? [],
            },
          });
          return;
        }
        if (resposta.estado === 'erro') {
          setEstado({ s: 'erro', mensagem: 'Não foi possível ler os documentos agora.' });
          return;
        }
        tentativa += 1;
        if (tentativa >= TENTATIVAS) {
          setEstado({ s: 'erro', mensagem: 'A leitura está demorando mais que o normal.' });
          return;
        }
        timer.current = setTimeout(() => void consultar(), ESPERA_MS);
      } catch (causa) {
        if (vivo) setEstado({ s: 'erro', mensagem: errorText(causa) });
      }
    };
    void consultar();
    return () => {
      vivo = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [editalId, ativo, versao, rodada]);

  const tentarDeNovo = useCallback(() => setRodada((valor) => valor + 1), []);
  return { estado, tentarDeNovo };
}

function Aguarde({ texto }: Readonly<{ texto: string }>) {
  return (
    <p className="lt-aguarde" role="status">
      <span className="lt-ponto" aria-hidden="true" />
      {texto}
    </p>
  );
}

/** Avisos e dados que o edital traz, com a página de onde saíram. */
export function DadosDoEdital({
  estado,
  buscando,
  tentarDeNovo,
}: Readonly<{ estado: EstadoDaLeitura; buscando: boolean; tentarDeNovo: () => void }>) {
  if (buscando) return <Aguarde texto="Buscando os documentos do edital…" />;
  if (estado.s === 'lendo') return <Aguarde texto="Lendo os documentos do edital…" />;
  if (estado.s === 'erro') {
    return (
      <div className="lt-erro">
        <Alert kind="error">{estado.mensagem}</Alert>
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-small" onClick={tentarDeNovo}>
          Tentar de novo
        </button>
      </div>
    );
  }
  const { fatos, alertas, documentos } = estado.dados;
  if (!fatos.length) {
    return (
      <p className="lt-vazio">
        {documentos.some((doc) => doc.estado === 'lido')
          ? 'Não achei prazos nem exigências no texto dos documentos.'
          : 'Nenhum documento do edital pôde ser lido.'}
      </p>
    );
  }
  const grupos = Object.entries(GRUPOS_FATO)
    .map(([grupo, info]) => ({
      grupo,
      titulo: info.titulo,
      ordem: info.ordem,
      fatos: fatos.filter((fato) => fato.grupo === grupo),
    }))
    .filter((grupo) => grupo.fatos.length)
    .sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="lt">
      {alertas.length ? (
        <ul className="lt-atencao" aria-label="Atenção">
          {alertas.map((alerta) => (
            <li key={alerta.id}>{alerta.texto}</li>
          ))}
        </ul>
      ) : null}
      {grupos.map((grupo) => (
        <section key={grupo.grupo} className="lt-grupo">
          <h3>{grupo.titulo}</h3>
          <ul>
            {grupo.fatos.map((fato) => (
              <li key={fato.id} className="lt-fato">
                <div className="lt-fato-topo">
                  <span>{fato.rotulo}</span>
                  <strong>{fato.valor}</strong>
                </div>
                <details>
                  <summary>
                    {fato.documento} · pág. {fato.pagina}
                  </summary>
                  <blockquote>{fato.trecho}</blockquote>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TextoDoDocumento({ editalId, chave }: Readonly<{ editalId: string; chave: string }>) {
  const [paginas, setPaginas] = useState<Array<{ numero: number; texto: string }> | null>(null);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');

  useEffect(() => {
    let vivo = true;
    api<{ paginas: Array<{ numero: number; texto: string }> }>(
      `/editais/${editalId}/leitura/${chave}`,
    )
      .then((resposta) => vivo && setPaginas(resposta.paginas))
      .catch((causa: unknown) => vivo && setErro(errorText(causa)));
    return () => {
      vivo = false;
    };
  }, [editalId, chave]);

  if (erro) return <Alert kind="error">{erro}</Alert>;
  if (!paginas) return <Aguarde texto="Abrindo…" />;
  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? paginas.filter((pagina) => pagina.texto.toLowerCase().includes(termo))
    : paginas;

  return (
    <div className="lt-texto">
      <input
        type="search"
        value={busca}
        onChange={(evento) => setBusca(evento.target.value)}
        placeholder="Procurar no documento"
        aria-label="Procurar no documento"
      />
      {termo ? (
        <small>
          {visiveis.length} {visiveis.length === 1 ? 'página' : 'páginas'}
        </small>
      ) : null}
      <div className="lt-paginas">
        {visiveis.map((pagina) => (
          <section key={pagina.numero}>
            <h4>Página {pagina.numero}</h4>
            <p>{realcar(pagina.texto, termo)}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

function realcar(texto: string, termo: string) {
  if (!termo) return texto;
  const partes: Array<string | { marca: string }> = [];
  const minusculo = texto.toLowerCase();
  let inicio = 0;
  for (
    let achou = minusculo.indexOf(termo);
    achou !== -1;
    achou = minusculo.indexOf(termo, inicio)
  ) {
    if (achou > inicio) partes.push(texto.slice(inicio, achou));
    partes.push({ marca: texto.slice(achou, achou + termo.length) });
    inicio = achou + termo.length;
  }
  partes.push(texto.slice(inicio));
  return partes.map((parte, indice) =>
    typeof parte === 'string' ? parte : <mark key={indice}>{parte.marca}</mark>,
  );
}

type DocumentoPublicado = {
  id: string;
  tipo?: string | null;
  nome_arquivo?: string | null;
  url?: string | null;
};

/** Documentos do edital: o texto abre aqui mesmo. */
export function DocumentosDoEdital({
  editalId,
  estado,
  publicados,
  buscando = false,
}: Readonly<{
  editalId: string;
  estado: EstadoDaLeitura;
  publicados: DocumentoPublicado[];
  buscando?: boolean;
}>) {
  const [aberto, setAberto] = useState<string | null>(null);

  if (!publicados.length)
    return (
      <p className="lt-vazio">
        {buscando ? 'Buscando anexos na fonte…' : 'Nenhum anexo disponível no catálogo.'}
      </p>
    );
  const lidos = estado.s === 'pronta' ? estado.dados.documentos : [];

  return (
    <ul className="lt-docs">
      {lidos.map((doc) => (
        <li key={doc.chave} className="lt-doc">
          <div className="lt-doc-topo">
            <strong>{doc.nome}</strong>
            {doc.estado === 'lido' ? (
              <button
                type="button"
                className="ui-btn ui-btn-ghost ui-btn-small"
                aria-expanded={aberto === doc.chave}
                onClick={() => setAberto(aberto === doc.chave ? null : doc.chave)}
              >
                {aberto === doc.chave ? 'Fechar' : 'Ler aqui'}
              </button>
            ) : (
              <Badge tone="warn">Não lido</Badge>
            )}
          </div>
          <small>
            {doc.tipo ?? 'Documento'}
            {doc.estado === 'lido'
              ? ` · ${doc.paginas} ${doc.paginas === 1 ? 'página' : 'páginas'}`
              : doc.motivo
                ? ` · ${doc.motivo}`
                : ''}
          </small>
          {aberto === doc.chave ? <TextoDoDocumento editalId={editalId} chave={doc.chave} /> : null}
        </li>
      ))}
      {estado.s !== 'pronta' ? (
        <li className="lt-doc">
          <Aguarde texto={`Lendo ${publicados.length} documento(s)…`} />
        </li>
      ) : null}
      {outrosPublicados(publicados, lidos).map((doc) => (
        <li key={doc.id} className="lt-doc lt-doc-fora">
          <div className="lt-doc-topo">
            <strong>{doc.nome_arquivo ?? doc.tipo ?? 'Documento'}</strong>
          </div>
          <small>{doc.tipo ?? 'Anexo'}</small>
        </li>
      ))}
    </ul>
  );
}

/** Publicados que a leitura não pegou (comprovantes, avisos): ficam só com o link. */
function outrosPublicados(publicados: DocumentoPublicado[], lidos: DocumentoLido[]) {
  const urls = new Set(lidos.map((doc) => doc.url));
  return publicados.filter((doc) => !doc.url || !urls.has(doc.url));
}
