'use client';

import { useEffect, useState } from 'react';
import type { DocumentacaoTecnica as Documentacao, OrigemExigencia } from '@licitecomigo/shared';
import { api, errorText } from '../../../lib/api';
import { Badge } from '../../components/ui';
import './documentacao.css';

type Resposta = {
  documentacao: Documentacao;
  portal: {
    nome: string;
    slug: string;
    site: string | null;
    link_edital: string | null;
  } | null;
  itens_coletados: number;
  documentos_coletados: number;
};

const ORIGEM: Record<OrigemExigencia, string> = {
  lei: 'Padrão da lei',
  edital: 'O edital menciona',
  dados: 'Dados do PNCP',
};

/**
 * Documentação técnica do edital: o que reunir para participar, montada automaticamente.
 * Recarrega quando os itens e documentos do PNCP são buscados (`versao` muda).
 */
export function DocumentacaoTecnica({
  editalId,
  versao,
}: Readonly<{ editalId: string; versao: string }>) {
  const [estado, setEstado] = useState<
    { s: 'carregando' } | { s: 'erro'; mensagem: string } | { s: 'pronto'; dados: Resposta }
  >({ s: 'carregando' });

  useEffect(() => {
    let ativo = true;
    api<Resposta>(`/editais/${editalId}/documentacao-tecnica`)
      .then((dados) => ativo && setEstado({ s: 'pronto', dados }))
      .catch((cause: unknown) => ativo && setEstado({ s: 'erro', mensagem: errorText(cause) }));
    return () => {
      ativo = false;
    };
  }, [editalId, versao]);

  if (estado.s === 'carregando') {
    return <p className="rd-painel-msg">Montando a documentação técnica deste edital…</p>;
  }
  if (estado.s === 'erro') {
    return (
      <p className="rd-painel-msg rd-painel-erro" role="alert">
        {estado.mensagem}
      </p>
    );
  }
  const { documentacao: doc, portal } = estado.dados;

  return (
    <div className="dt">
      <p className="dt-resumo">
        <strong>{doc.tipo_objeto_nome}.</strong> {doc.resumo}
      </p>
      {portal ? (
        <p className="dt-portal">
          A disputa acontece no portal <strong>{portal.nome}</strong>
          {portal.link_edital ? (
            <>
              {' · '}
              <a href={portal.link_edital} target="_blank" rel="noreferrer noopener">
                abrir este edital no portal
              </a>
            </>
          ) : null}
          {portal.site ? (
            <>
              {' · '}
              <a href={portal.site} target="_blank" rel="noreferrer noopener">
                site do portal
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      {doc.pontos_de_atencao.length ? (
        <ul className="dt-atencao" aria-label="Pontos de atenção">
          {doc.pontos_de_atencao.map((ponto) => (
            <li key={ponto}>{ponto}</li>
          ))}
        </ul>
      ) : null}

      {doc.grupos.map((grupo) => (
        <section key={grupo.grupo} className="dt-grupo">
          <h3>{grupo.titulo}</h3>
          <ul>
            {grupo.exigencias.map((item) => (
              <li key={item.id} className={item.mencionado ? 'dt-item dt-item-edital' : 'dt-item'}>
                <div className="dt-item-topo">
                  <strong>{item.titulo}</strong>
                  <Badge tone={item.mencionado ? 'ok' : 'muted'}>
                    {item.mencionado ? 'O edital menciona' : ORIGEM[item.origem]}
                  </Badge>
                </div>
                <p>{item.detalhe}</p>
                <small>{item.base}</small>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {doc.documentos.length ? (
        <section className="dt-grupo">
          <h3>Arquivos publicados no PNCP</h3>
          <ul>
            {doc.documentos.map((arquivo, indice) => (
              <li key={`${arquivo.nome}-${indice}`} className="dt-item">
                <div className="dt-item-topo">
                  <strong>{arquivo.papel_nome}</strong>
                  {arquivo.url ? (
                    <a href={arquivo.url} target="_blank" rel="noreferrer noopener">
                      {arquivo.nome}
                    </a>
                  ) : (
                    <span>{arquivo.nome}</span>
                  )}
                </div>
                <p>{arquivo.serve}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <details className="dt-como">
        <summary>Como esta lista foi montada</summary>
        <ul>
          {doc.como_foi_montada.map((linha) => (
            <li key={linha}>{linha}</li>
          ))}
        </ul>
      </details>
      <p className="dt-aviso">{doc.aviso}</p>
    </div>
  );
}
