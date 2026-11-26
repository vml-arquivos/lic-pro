'use client';

import { useEffect, useRef, useState } from 'react';
import { NICHE_CATALOG } from '@licitecomigo/shared';
import { api } from '../../lib/api';
import { SegmentoPicker } from '../components/SegmentoPicker';
import { UfPicker } from '../components/UfPicker';
import {
  ESTADOS,
  ORDENS,
  PERIODOS,
  PRAZOS,
  REGIOES,
  STATUS_PNCP,
  activeFilterCount,
  anosDaContratacao,
  paramsFromForm,
} from './radar-lib';

type Catalog = {
  nichos?: Array<{ code: string; label: string }>;
  modalidade?: string[];
  esfera?: string[];
  poder?: string[];
  instrumento?: string[];
  modo_disputa?: string[];
  amparo_legal?: string[];
  fonte_orcamentaria?: string[];
  normativo_base?: string[];
  criterio_julgamento?: string[];
};
const SIM_NAO: ReadonlyArray<readonly [string, string]> = [
  ['true', 'Sim'],
  ['false', 'Não'],
];
type PortalOpcao = { slug: string; nome: string; total: number; conhecido?: boolean };
type CityHit = { codigo_ibge: string; municipio: string; sigla_uf: string };

function Select({
  label,
  name,
  value,
  options,
  empty = 'Qualquer',
}: Readonly<{
  label: string;
  name: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  empty?: string;
}>) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value}>
        <option value="">{empty}</option>
        {options.map(([code, text]) => (
          <option key={code} value={code}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RadarFilters({
  params,
  onApply,
  signedIn,
  hasProfile,
  meusNichos = [],
}: Readonly<{
  params: URLSearchParams;
  onApply: (next: URLSearchParams) => void;
  signedIn: boolean;
  hasProfile: boolean;
  /** Nichos da conta: a lista de segmentos mostra só os deles (vazio = todos). */
  meusNichos?: readonly string[];
}>) {
  const [catalog, setCatalog] = useState<Catalog>({});
  const [cities, setCities] = useState<CityHit[]>([]);
  const [portais, setPortais] = useState<PortalOpcao[]>([]);
  const cityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void api<Catalog>('/catalog/filters')
      .then(setCatalog)
      .catch(() => undefined);
    // Portais de compras (BLL, BNC, Compras.gov.br…): só os que têm editais entram na lista.
    void api<{ portais: PortalOpcao[] }>('/portais')
      .then((resposta) => setPortais(resposta.portais))
      .catch(() => undefined);
  }, []);

  function searchCities(text: string) {
    if (cityTimer.current) clearTimeout(cityTimer.current);
    if (text.trim().length < 2 || /\(\d{7}\)\s*$/.test(text)) return;
    cityTimer.current = setTimeout(() => {
      void api<{ data: CityHit[] }>(`/municipios?q=${encodeURIComponent(text.trim())}`)
        .then((result) => setCities(result.data))
        .catch(() => setCities([]));
    }, 250);
  }

  const niches = catalog.nichos ?? NICHE_CATALOG;
  const selectedNiches = params.getAll('nicho');
  const [ufs, setUfs] = useState<string[]>(() =>
    (params.get('uf') ?? '').split(',').filter(Boolean),
  );
  const [segmentos, setSegmentos] = useState<string[]>(() => params.getAll('segmento'));
  const [itens, setItens] = useState<string[]>(() => params.getAll('item'));
  const nichosDaLista = selectedNiches.length ? selectedNiches : meusNichos;
  const asOptions = (list: string[] | undefined) =>
    (list ?? []).map((item) => [item, item] as const);
  const portaisEscolhidos = params.getAll('portal');
  // Todos os portais conhecidos (mesmo sem edital agora) e os que apareceram na coleta.
  const portalOpcoes = portais.filter(
    (portal) =>
      portal.conhecido !== false || portal.total > 0 || portaisEscolhidos.includes(portal.slug),
  );
  const nearDefault = params.get('perto_municipio')
    ? `Município escolhido (${params.get('perto_municipio')})`
    : (params.get('municipio') ?? '');
  const advancedOpen = activeFilterCount(params) > 3;

  return (
    <form
      className="rd-filters"
      key={params.toString()}
      onSubmit={(event) => {
        event.preventDefault();
        onApply(paramsFromForm(new FormData(event.currentTarget)));
      }}
    >
      <fieldset className="rd-status">
        <legend>Status</legend>
        {STATUS_PNCP.map(([codigo, texto]) => (
          <label key={codigo} className="rd-status-opcao">
            <input
              type="radio"
              name="status"
              value={codigo}
              defaultChecked={(params.get('status') ?? 'todos') === codigo}
            />
            {texto}
          </label>
        ))}
      </fieldset>
      <div className="rd-filters-main">
        <label className="rd-wide">
          Palavras-chave
          <input
            name="q"
            defaultValue={params.get('q') ?? ''}
            placeholder="palavras que não estão nas listas ao lado"
            maxLength={200}
          />
        </label>
        <SegmentoPicker
          nichos={nichosDaLista}
          segmentos={segmentos}
          onSegmentos={setSegmentos}
          itens={itens}
          onItens={setItens}
          name
        />
        <Select
          label="Prazo"
          name="situacao_prazo"
          value={params.get('situacao_prazo') ?? ''}
          options={PRAZOS}
        />
        <UfPicker value={ufs} onChange={setUfs} name="uf" label="Estados" />
        <label>
          Valor mínimo (R$)
          <input
            name="valor_min"
            type="number"
            min={0}
            step="any"
            defaultValue={params.get('valor_min') ?? ''}
          />
        </label>
        <label>
          Valor máximo (R$)
          <input
            name="valor_max"
            type="number"
            min={0}
            step="any"
            defaultValue={params.get('valor_max') ?? ''}
          />
        </label>
        <Select
          label="Ordenar por"
          name="ordem"
          value={params.get('ordem') ?? ''}
          options={ORDENS.filter(([code]) => code !== 'compat' || hasProfile)}
          empty="Mais recentes"
        />
      </div>

      <details className="rd-advanced" open={advancedOpen}>
        <summary>Mais filtros</summary>
        <div className="rd-filters-grid">
          <label>
            Sem estas palavras
            <input
              name="excluir"
              defaultValue={params.get('excluir') ?? ''}
              placeholder="ex.: locação, obra"
            />
          </label>
          <Select
            label="Região"
            name="regiao"
            value={params.get('regiao') ?? ''}
            options={REGIOES}
          />
          {[0, 1, 2].map((index) => (
            <label key={index}>
              {`Nicho ${index + 1}`}
              <select name="nicho" defaultValue={selectedNiches[index] ?? ''}>
                <option value="">{index === 0 ? 'Meus nichos (padrão)' : 'Não usar'}</option>
                {niches.map((niche) => (
                  <option key={niche.code} value={niche.code}>
                    {niche.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <Select
            label="Modalidade"
            name="modalidade"
            value={params.get('modalidade') ?? ''}
            options={asOptions(catalog.modalidade)}
          />
          <Select
            label="Instrumento convocatório"
            name="instrumento"
            value={params.get('instrumento') ?? ''}
            options={asOptions(catalog.instrumento)}
          />
          <Select
            label="Ano da contratação"
            name="ano"
            value={params.get('ano') ?? ''}
            options={anosDaContratacao().map((ano) => [ano, ano] as const)}
          />
          <Select
            label="Modo de disputa"
            name="modo_disputa"
            value={params.get('modo_disputa') ?? ''}
            options={asOptions(catalog.modo_disputa)}
          />
          <Select
            label="Amparo legal"
            name="amparo_legal"
            value={params.get('amparo_legal') ?? ''}
            options={asOptions(catalog.amparo_legal)}
          />
          <Select
            label="Fonte orçamentária"
            name="fonte_orcamentaria"
            value={params.get('fonte_orcamentaria') ?? ''}
            options={asOptions(catalog.fonte_orcamentaria)}
          />
          <Select
            label="Normativo base"
            name="normativo_base"
            value={params.get('normativo_base') ?? ''}
            options={asOptions(catalog.normativo_base)}
          />
          <Select
            label="Critério de julgamento"
            name="criterio_julgamento"
            value={params.get('criterio_julgamento') ?? ''}
            options={asOptions(catalog.criterio_julgamento)}
          />
          <Select
            label="Emenda parlamentar"
            name="emenda"
            value={params.get('emenda') ?? ''}
            options={SIM_NAO}
          />
          <Select
            label="Item sigiloso"
            name="sigiloso"
            value={params.get('sigiloso') ?? ''}
            options={SIM_NAO}
          />
          <Select
            label="Exige nota fiscal eletrônica"
            name="nfe"
            value={params.get('nfe') ?? ''}
            options={SIM_NAO}
          />
          <label>
            Órgão (nome ou CNPJ)
            <input name="orgao" defaultValue={params.get('orgao') ?? ''} maxLength={160} />
          </label>
          <label>
            Unidade (código)
            <input name="uasg" defaultValue={params.get('uasg') ?? ''} maxLength={30} />
          </label>
          <Select
            label="Esfera"
            name="esfera"
            value={params.get('esfera') ?? ''}
            options={asOptions(catalog.esfera)}
          />
          <Select
            label="Poder"
            name="poder"
            value={params.get('poder') ?? ''}
            options={asOptions(catalog.poder)}
          />
          <fieldset className="rd-portais">
            <legend>Portais de compras</legend>
            <ul>
              {portalOpcoes.map((portal) => (
                <li
                  key={portal.slug}
                  className={portal.total === 0 ? 'rd-portal-vazio' : undefined}
                >
                  <label>
                    <input
                      type="checkbox"
                      name="portal"
                      value={portal.slug}
                      defaultChecked={portaisEscolhidos.includes(portal.slug)}
                    />
                    <span>{portal.nome}</span>
                    <small>{portal.total.toLocaleString('pt-BR')}</small>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <Select
            label="Período por"
            name="periodo_tipo"
            value={params.get('periodo_tipo') ?? ''}
            options={PERIODOS}
            empty="Publicação"
          />
          <label>
            De
            <input name="periodo_de" type="date" defaultValue={params.get('periodo_de') ?? ''} />
          </label>
          <label>
            Até
            <input name="periodo_ate" type="date" defaultValue={params.get('periodo_ate') ?? ''} />
          </label>
          <label>
            Perto de (cidade)
            <input
              name="perto"
              list="rd-cities"
              defaultValue={nearDefault}
              placeholder="digite o nome da cidade"
              onChange={(event) => searchCities(event.target.value)}
            />
            <datalist id="rd-cities">
              {cities.map((city) => (
                <option
                  key={city.codigo_ibge}
                  value={`${city.municipio} — ${city.sigla_uf} (${city.codigo_ibge})`}
                />
              ))}
            </datalist>
          </label>
          <Select
            label="Raio"
            name="raio_km"
            value={params.get('raio_km') ?? ''}
            options={[50, 100, 200, 300, 500, 1000].map((km) => [String(km), `${km} km`] as const)}
            empty="Sem limite"
          />
          {signedIn ? (
            <Select
              label="Meus editais"
              name="estado"
              value={params.get('estado') ?? ''}
              options={ESTADOS}
            />
          ) : null}
          {hasProfile ? (
            <label>
              Compatibilidade mínima (%)
              <input
                name="compat_min"
                type="number"
                min={0}
                max={100}
                defaultValue={params.get('compat_min') ?? ''}
              />
            </label>
          ) : null}
        </div>
        <div className="rd-checks">
          <label>
            <input
              type="checkbox"
              name="grande_vulto"
              value="true"
              defaultChecked={params.get('grande_vulto') === 'true'}
            />
            Só grande vulto
          </label>
          <label>
            <input
              type="checkbox"
              name="srp"
              value="true"
              defaultChecked={params.get('srp') === 'true'}
            />
            Só registro de preços (SRP)
          </label>
          {signedIn ? (
            <label>
              <input
                type="checkbox"
                name="incluir_descartadas"
                value="true"
                defaultChecked={params.get('incluir_descartadas') === 'true'}
              />
              Mostrar descartadas
            </label>
          ) : null}
        </div>
      </details>

      <div className="rd-filters-actions">
        <button className="ui-btn" type="submit">
          Buscar editais
        </button>
        <button
          className="ui-btn ui-btn-ghost"
          type="button"
          onClick={() => onApply(new URLSearchParams())}
        >
          Limpar filtros
        </button>
      </div>
    </form>
  );
}
