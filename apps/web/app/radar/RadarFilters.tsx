'use client';

import { useEffect, useRef, useState } from 'react';
import { NICHE_CATALOG, UFS } from '@licitecomigo/shared';
import { api } from '../../lib/api';
import {
  ESTADOS,
  ORDENS,
  PERIODOS,
  PRAZOS,
  REGIOES,
  activeFilterCount,
  paramsFromForm,
} from './radar-lib';

type Catalog = {
  nichos?: Array<{ code: string; label: string }>;
  modalidade?: string[];
  esfera?: string[];
  poder?: string[];
};
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
}: Readonly<{
  params: URLSearchParams;
  onApply: (next: URLSearchParams) => void;
  signedIn: boolean;
  hasProfile: boolean;
}>) {
  const [catalog, setCatalog] = useState<Catalog>({});
  const [cities, setCities] = useState<CityHit[]>([]);
  const cityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void api<Catalog>('/catalog/filters')
      .then(setCatalog)
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
  const selectedUfs = new Set((params.get('uf') ?? '').split(',').filter(Boolean));
  const asOptions = (list: string[] | undefined) =>
    (list ?? []).map((item) => [item, item] as const);
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
      <div className="rd-filters-main">
        <label className="rd-wide">
          Palavras-chave
          <input
            name="q"
            defaultValue={params.get('q') ?? ''}
            placeholder="ex.: uniformes, manutenção predial, software"
            maxLength={200}
          />
        </label>
        <label>
          Sem estas palavras
          <input
            name="excluir"
            defaultValue={params.get('excluir') ?? ''}
            placeholder="ex.: locação, obra"
          />
        </label>
        <Select
          label="Prazo"
          name="situacao_prazo"
          value={params.get('situacao_prazo') ?? ''}
          options={PRAZOS}
        />
        <Select label="Região" name="regiao" value={params.get('regiao') ?? ''} options={REGIOES} />
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
        <fieldset className="rd-ufs">
          <legend>Estados</legend>
          {UFS.map((uf) => (
            <label key={uf} className="rd-chip">
              <input type="checkbox" name="uf" value={uf} defaultChecked={selectedUfs.has(uf)} />
              <span>{uf}</span>
            </label>
          ))}
        </fieldset>
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
