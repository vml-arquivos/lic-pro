'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Badge, Empty, Panel, Resource, formatNumber, useResource } from '../components/ui';

type Portal = {
  slug: string;
  nome: string;
  site: string | null;
  descricao: string | null;
  total: number;
  conhecido: boolean;
};
type Resposta = {
  portais: Portal[];
  total: number;
  sem_portal: number;
  fonte: { nome: string; observacao: string };
};

export function PortaisApp() {
  const [abertas, setAbertas] = useState(true);
  const consulta = abertas ? '?situacao_prazo=abertas' : '';
  const [valor] = useResource<Resposta>(`/portais${consulta}`);
  const radar = (slug: string) =>
    `/radar?portal=${encodeURIComponent(slug)}${abertas ? '&situacao_prazo=abertas' : ''}`;

  return (
    <div className="pt-pagina">
      <div className="pt-filtro" role="group" aria-label="Quais editais contar">
        <button
          type="button"
          className={`ui-btn ui-btn-small ${abertas ? '' : 'ui-btn-ghost'}`}
          aria-pressed={abertas}
          onClick={() => setAbertas(true)}
        >
          Só com propostas abertas
        </button>
        <button
          type="button"
          className={`ui-btn ui-btn-small ${abertas ? 'ui-btn-ghost' : ''}`}
          aria-pressed={!abertas}
          onClick={() => setAbertas(false)}
        >
          Todos os editais
        </button>
      </div>

      <Resource value={valor}>
        {(dados) => {
          const comEditais = dados.portais.filter((portal) => portal.total > 0);
          const semEditais = dados.portais.filter((portal) => portal.total === 0);
          return (
            <>
              <p className="pt-resumo">
                <strong>{formatNumber(dados.total)}</strong> editais
                {abertas ? ' com propostas abertas' : ''} em{' '}
                <strong>{formatNumber(comEditais.length)}</strong> portais
                {dados.sem_portal > 0
                  ? `; ${formatNumber(dados.sem_portal)} sem portal informado.`
                  : '.'}
              </p>

              {comEditais.length ? (
                <ul className="pt-lista">
                  {comEditais.map((portal) => (
                    <li key={portal.slug} className="pt-card">
                      <header>
                        <h3>{portal.nome}</h3>
                        {portal.conhecido ? null : <Badge tone="muted">Sistema do órgão</Badge>}
                      </header>
                      <p className="pt-total">
                        <strong>{formatNumber(portal.total)}</strong>{' '}
                        {portal.total === 1 ? 'edital' : 'editais'}
                      </p>
                      <div className="pt-acoes">
                        <Link className="ui-btn ui-btn-small" href={radar(portal.slug)}>
                          Ver editais deste portal
                        </Link>
                        {portal.site ? (
                          <a
                            className="ui-btn ui-btn-ghost ui-btn-small"
                            href={portal.site}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            Abrir o portal
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>Nenhum edital com portal ainda.</Empty>
              )}

              {semEditais.length ? (
                <Panel title="Outros portais comuns">
                  <ul className="pt-outros">
                    {semEditais.map((portal) => (
                      <li key={portal.slug}>
                        {portal.site ? (
                          <a href={portal.site} target="_blank" rel="noreferrer noopener">
                            {portal.nome}
                          </a>
                        ) : (
                          portal.nome
                        )}
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}

              <Alert kind="info">
                {dados.fonte.observacao} Para pesquisar dentro do portal (com o seu login), use o
                botão “Abrir o portal”; os editais mostrados aqui vêm do PNCP e cada um tem o link
                direto para a página dele no portal.
              </Alert>
            </>
          );
        }}
      </Resource>
    </div>
  );
}
