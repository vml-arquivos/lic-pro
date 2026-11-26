'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { send } from '../../lib/api';
import { Alert, Badge, Empty, Panel, Resource, formatNumber, useResource } from '../components/ui';
import { brl } from '../radar/radar-lib';

type Portal = {
  slug: string;
  nome: string;
  site: string | null;
  descricao: string | null;
  total: number;
  conhecido: boolean;
  abertas: number;
  encerram_3_dias: number;
  valor_abertas: number;
};
type Resposta = {
  portais: Portal[];
  total: number;
  sem_portal: number;
  fonte: { nome: string; observacao: string };
};
type Opcoes = { ufs?: string[]; modalidade?: string[] };
type Filtros = { uf: string; modalidade: string; q: string };

const ORDENS = [
  ['editais', 'Mais editais'],
  ['abertas', 'Mais abertos'],
  ['valor', 'Maior valor'],
  ['nome', 'A–Z'],
] as const;
type Ordem = (typeof ORDENS)[number][0];

const ordenar = (lista: Portal[], ordem: Ordem): Portal[] =>
  [...lista].sort((a, b) => {
    if (ordem === 'nome') return a.nome.localeCompare(b.nome, 'pt-BR');
    const chave = { editais: 'total', abertas: 'abertas', valor: 'valor_abertas' }[ordem] as
      'total' | 'abertas' | 'valor_abertas';
    return b[chave] - a[chave] || a.nome.localeCompare(b.nome, 'pt-BR');
  });

export function PortaisApp({ podeAvisar = true }: Readonly<{ podeAvisar?: boolean }>) {
  const [abertas, setAbertas] = useState(true);
  const [filtros, setFiltros] = useState<Filtros>({ uf: '', modalidade: '', q: '' });
  const [rascunho, setRascunho] = useState<Filtros>(filtros);
  const [ordem, setOrdem] = useState<Ordem>('editais');
  const [nomeBusca, setNomeBusca] = useState('');
  const [avisos, setAvisos] = useState<Record<string, 'salvando' | 'ok' | string>>({});
  const [opcoes] = useResource<Opcoes>('/catalog/filters');

  const parametros = useMemo(() => {
    const p = new URLSearchParams();
    if (abertas) p.set('situacao_prazo', 'abertas');
    if (filtros.uf) p.set('uf', filtros.uf);
    if (filtros.modalidade) p.set('modalidade', filtros.modalidade);
    if (filtros.q) p.set('q', filtros.q);
    return p;
  }, [abertas, filtros]);
  const texto = parametros.toString();
  const [valor] = useResource<Resposta>(`/portais${texto ? `?${texto}` : ''}`);

  const noFarol = (slug: string) => {
    const p = new URLSearchParams(parametros);
    p.set('portal', slug);
    return `/radar?${p.toString()}`;
  };
  const aplicar = (evento: FormEvent) => {
    evento.preventDefault();
    setFiltros(rascunho);
  };
  const limpar = () => {
    const vazio = { uf: '', modalidade: '', q: '' };
    setRascunho(vazio);
    setFiltros(vazio);
    setNomeBusca('');
  };
  const avisar = async (portal: Portal) => {
    setAvisos((atual) => ({ ...atual, [portal.slug]: 'salvando' }));
    const filtrosDaBusca: Record<string, string> = {
      portal: portal.slug,
      situacao_prazo: 'abertas',
    };
    if (filtros.uf) filtrosDaBusca.uf = filtros.uf;
    if (filtros.modalidade) filtrosDaBusca.modalidade = filtros.modalidade;
    if (filtros.q) filtrosDaBusca.q = filtros.q;
    try {
      await send('POST', '/saved-searches', {
        nome: `Portal ${portal.nome}`,
        filtros: filtrosDaBusca,
      });
      setAvisos((atual) => ({ ...atual, [portal.slug]: 'ok' }));
    } catch (erro) {
      setAvisos((atual) => ({
        ...atual,
        [portal.slug]: erro instanceof Error ? erro.message : 'Não foi possível salvar.',
      }));
    }
  };

  const ufs = opcoes.state === 'ready' ? (opcoes.data.ufs ?? []) : [];
  const modalidades = opcoes.state === 'ready' ? (opcoes.data.modalidade ?? []) : [];
  const temFiltro = Boolean(filtros.uf || filtros.modalidade || filtros.q || nomeBusca);

  return (
    <div className="pt-pagina">
      <form className="pt-filtros" onSubmit={aplicar}>
        <label>
          Palavra-chave
          <input
            value={rascunho.q}
            maxLength={200}
            onChange={(e) => setRascunho({ ...rascunho, q: e.target.value })}
          />
        </label>
        <label>
          Estado
          <select
            value={rascunho.uf}
            onChange={(e) => setRascunho({ ...rascunho, uf: e.target.value })}
          >
            <option value="">Todos</option>
            {ufs.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </label>
        <label>
          Modalidade
          <select
            value={rascunho.modalidade}
            onChange={(e) => setRascunho({ ...rascunho, modalidade: e.target.value })}
          >
            <option value="">Todas</option>
            {modalidades.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          Buscar portal
          <input value={nomeBusca} onChange={(e) => setNomeBusca(e.target.value)} />
        </label>
        <label>
          Ordenar por
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
            {ORDENS.map(([codigo, rotulo]) => (
              <option key={codigo} value={codigo}>
                {rotulo}
              </option>
            ))}
          </select>
        </label>
        <div className="pt-filtros-acoes">
          <button type="submit" className="ui-btn ui-btn-small">
            Aplicar
          </button>
          {temFiltro ? (
            <button type="button" className="ui-btn ui-btn-ghost ui-btn-small" onClick={limpar}>
              Limpar
            </button>
          ) : null}
        </div>
      </form>

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
          const busca = nomeBusca.trim().toLocaleLowerCase('pt-BR');
          const visiveis = dados.portais.filter(
            (portal) => !busca || portal.nome.toLocaleLowerCase('pt-BR').includes(busca),
          );
          const comEditais = ordenar(
            visiveis.filter((portal) => portal.total > 0),
            ordem,
          );
          const semEditais = visiveis.filter((portal) => portal.total === 0);
          const nPortais = dados.portais.filter((portal) => portal.total > 0).length;
          return (
            <>
              <p className="pt-resumo">
                <strong>{formatNumber(dados.total)}</strong> editais
                {abertas ? ' com propostas abertas' : ''} em{' '}
                <strong>{formatNumber(nPortais)}</strong> portais
                {dados.sem_portal > 0
                  ? `; ${formatNumber(dados.sem_portal)} sem portal informado.`
                  : '.'}
              </p>

              {comEditais.length ? (
                <ul className="pt-lista">
                  {comEditais.map((portal) => {
                    const aviso = avisos[portal.slug];
                    return (
                      <li key={portal.slug} className="pt-card">
                        <header>
                          <h3>{portal.nome}</h3>
                          {portal.conhecido ? null : <Badge tone="muted">Outro sistema</Badge>}
                        </header>
                        <dl className="pt-numeros">
                          <div>
                            <dt>Editais</dt>
                            <dd>{formatNumber(portal.total)}</dd>
                          </div>
                          <div>
                            <dt>Abertos</dt>
                            <dd>{formatNumber(portal.abertas)}</dd>
                          </div>
                          <div>
                            <dt>Encerram em 3 dias</dt>
                            <dd>{formatNumber(portal.encerram_3_dias)}</dd>
                          </div>
                          <div>
                            <dt>Valor dos abertos</dt>
                            <dd>{portal.valor_abertas > 0 ? brl(portal.valor_abertas) : '—'}</dd>
                          </div>
                        </dl>
                        <div className="pt-acoes">
                          <Link className="ui-btn ui-btn-small" href={noFarol(portal.slug)}>
                            Ver editais
                          </Link>
                          {podeAvisar ? (
                            <button
                              type="button"
                              className="ui-btn ui-btn-ghost ui-btn-small"
                              disabled={aviso === 'salvando' || aviso === 'ok'}
                              onClick={() => void avisar(portal)}
                            >
                              {aviso === 'ok' ? 'Alerta criado' : 'Avisar de novos'}
                            </button>
                          ) : null}
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
                        {aviso && aviso !== 'ok' && aviso !== 'salvando' ? (
                          <p className="pt-erro" role="alert">
                            {aviso}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty>Nenhum edital com esses filtros.</Empty>
              )}

              {semEditais.length ? (
                <Panel title="Sem editais agora">
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

              <Alert kind="info">{dados.fonte.observacao}</Alert>
            </>
          );
        }}
      </Resource>
    </div>
  );
}
