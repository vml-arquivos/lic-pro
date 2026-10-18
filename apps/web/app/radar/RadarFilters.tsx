'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { NICHE_CATALOG } from '@licitecomigo/shared';

type CatalogResponse = {
  nichos?: Array<{ code: string; label: string; description: string; source: string }>;
  ufs?: string[];
  fonte?: string[];
  sistema_origem?: string[];
  esfera?: string[];
  poder?: string[];
  modalidade?: string[];
  modo_disputa?: string[];
  situacao?: string[];
  instrumento?: string[];
  catmat_catser?: string[];
};

type MeResponse = { nicho_preferencias?: unknown };

const staticUfs = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
];

function valuesFromSearch(searchParams: ReturnType<typeof useSearchParams>, name: string) {
  return searchParams.getAll(name);
}

function nicheCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function SelectField({
  label,
  name,
  value,
  options,
  disabled = false,
}: {
  label: string;
  name: string;
  value: string;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value} disabled={disabled}>
        <option value="">Qualquer opção</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RadarFilters() {
  const searchParams = useSearchParams();
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [accountNiches, setAccountNiches] = useState<string[]>([]);
  const selectedNiches = valuesFromSearch(searchParams, 'nicho');

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch('/api/core/catalog/filters', { cache: 'no-store', signal: controller.signal }),
      fetch('/api/core/me', { cache: 'no-store', signal: controller.signal }),
    ])
      .then(async ([catalogResponse, meResponse]) => {
        if (catalogResponse.ok) setCatalog((await catalogResponse.json()) as CatalogResponse);
        if (meResponse.ok) {
          const me = (await meResponse.json()) as MeResponse;
          setAccountNiches(nicheCodes(me.nicho_preferencias));
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const niches = catalog?.nichos ?? NICHE_CATALOG;
  const nicheOptions = useMemo(() => niches.map((niche) => niche.code), [niches]);
  const labels = useMemo(() => new Map(niches.map((niche) => [niche.code, niche.label])), [niches]);
  const option = (name: string) => catalog?.[name as keyof CatalogResponse] as string[] | undefined;
  const selected = (index: number) => selectedNiches[index] ?? accountNiches[index] ?? '';

  return (
    <form className="filter-card" action="/radar" method="get">
      <div className="filter-card-heading">
        <div>
          <p className="eyebrow">Busca por seleção</p>
          <h2>Escolha até três nichos e refine a consulta.</h2>
        </div>
        <Link href="/radar">Limpar filtros</Link>
      </div>
      <p className="filter-card-note">
        Os nichos limitam o escopo de descoberta da sua conta. Os resultados continuam dependendo do
        conteúdo real capturado e da leitura do edital original.
      </p>
      <div className="filter-grid">
        {[0, 1, 2].map((index) => (
          <label key={index}>
            {`Nicho ${index + 1}`}
            <select name="nicho" defaultValue={selected(index)}>
              <option value="">{index === 0 ? 'Selecione um nicho' : 'Não usar'}</option>
              {nicheOptions.map((code) => (
                <option key={code} value={code}>
                  {labels.get(code) ?? code}
                </option>
              ))}
            </select>
          </label>
        ))}
        <SelectField
          label="UF"
          name="uf"
          value={searchParams.get('uf') ?? ''}
          options={catalog?.ufs ?? staticUfs}
        />
        <SelectField
          label="Esfera"
          name="esfera"
          value={searchParams.get('esfera') ?? ''}
          options={option('esfera') ?? []}
        />
        <SelectField
          label="Poder"
          name="poder"
          value={searchParams.get('poder') ?? ''}
          options={option('poder') ?? []}
        />
        <SelectField
          label="Modalidade"
          name="modalidade"
          value={searchParams.get('modalidade') ?? ''}
          options={option('modalidade') ?? []}
        />
        <SelectField
          label="Modo de disputa"
          name="modo_disputa"
          value={searchParams.get('modo_disputa') ?? ''}
          options={option('modo_disputa') ?? []}
        />
        <SelectField
          label="Situação"
          name="situacao"
          value={searchParams.get('situacao') ?? ''}
          options={option('situacao') ?? []}
        />
        <SelectField
          label="Instrumento"
          name="instrumento"
          value={searchParams.get('instrumento') ?? ''}
          options={option('instrumento') ?? []}
        />
        <SelectField
          label="Fonte"
          name="fonte"
          value={searchParams.get('fonte') ?? ''}
          options={option('fonte') ?? []}
        />
        <SelectField
          label="CATMAT/CATSER observado"
          name="catmat_catser"
          value={searchParams.get('catmat_catser') ?? ''}
          options={option('catmat_catser') ?? []}
          disabled={!option('catmat_catser')?.length}
        />
        <SelectField
          label="Propostas"
          name="prazo_proposta_aberto"
          value={searchParams.get('prazo_proposta_aberto') ?? ''}
          options={['true', 'false']}
        />
        <SelectField
          label="SRP"
          name="srp"
          value={searchParams.get('srp') ?? ''}
          options={['true', 'false']}
        />
      </div>
      <button type="submit">Buscar editais</button>
    </form>
  );
}
