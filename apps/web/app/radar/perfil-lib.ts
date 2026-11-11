'use client';

import { useCallback, useEffect, useState } from 'react';
import { NICHE_CATALOG } from '@licitecomigo/shared';
import { api } from '../../lib/api';

/** Perfil do Radar: guardado uma vez e aplicado sozinho nas buscas. */
export type Perfil = {
  ufs: string[];
  palavras_interesse: string[];
  valor_min: number | null;
  valor_max: number | null;
  modalidades: string[];
};

export type PerfilCompleto = { perfil: Perfil; nichos: string[] };

export const PERFIL_VAZIO: Perfil = {
  ufs: [],
  palavras_interesse: [],
  valor_min: null,
  valor_max: null,
  modalidades: [],
};

/** Parâmetro de URL que desliga o perfil nas buscas ("Ver tudo"). */
export const SEM_PERFIL = 'sem_perfil';

export function usePerfil(): {
  dados: PerfilCompleto | null;
  carregando: boolean;
  recarregar: () => void;
} {
  const [dados, setDados] = useState<PerfilCompleto | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    void Promise.all([
      api<{ perfil: Perfil }>('/radar/perfil').catch(() => ({ perfil: PERFIL_VAZIO })),
      api<{ nicho_preferencias?: string[] | null }>('/me').catch(() => ({
        nicho_preferencias: [],
      })),
    ]).then(([radar, eu]) => {
      if (!ativo) return;
      setDados({
        perfil: radar.perfil,
        nichos: Array.isArray(eu.nicho_preferencias) ? eu.nicho_preferencias : [],
      });
      setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, [versao]);

  const recarregar = useCallback(() => setVersao((valor) => valor + 1), []);
  return { dados, carregando, recarregar };
}

export const nomeDoNicho = (codigo: string): string =>
  NICHE_CATALOG.find((nicho) => nicho.code === codigo)?.label ?? codigo;

const abreviar = (valor: number): string =>
  valor >= 1_000_000
    ? `R$ ${(valor / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
    : valor >= 1_000
      ? `R$ ${(valor / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`
      : `R$ ${valor.toLocaleString('pt-BR')}`;

export function faixaDeValor(perfil: Perfil): string {
  const { valor_min: min, valor_max: max } = perfil;
  if (min !== null && max !== null) return `${abreviar(min)} a ${abreviar(max)}`;
  if (min !== null) return `a partir de ${abreviar(min)}`;
  if (max !== null) return `até ${abreviar(max)}`;
  return 'Qualquer valor';
}

/** Perfil com algo que realmente filtra (estados ou valor). */
export function perfilFiltra(perfil: Perfil | null | undefined): boolean {
  return Boolean(
    perfil && (perfil.ufs.length || perfil.valor_min !== null || perfil.valor_max !== null),
  );
}

/**
 * Junta o perfil à busca quando o usuário não escolheu aquele filtro. Quem filtrou à mão manda;
 * o perfil só preenche o que faltou. Retorna uma cópia sem o parâmetro `sem_perfil`.
 */
export function comPerfil(params: URLSearchParams, perfil: Perfil | null): URLSearchParams {
  const efetivos = new URLSearchParams(params);
  const desligado = efetivos.get(SEM_PERFIL) === '1';
  efetivos.delete(SEM_PERFIL);
  if (!perfil || desligado) return efetivos;
  if (!efetivos.get('uf') && !efetivos.get('regiao') && perfil.ufs.length) {
    efetivos.set('uf', perfil.ufs.join(','));
  }
  if (!efetivos.get('valor_min') && perfil.valor_min !== null) {
    efetivos.set('valor_min', String(perfil.valor_min));
  }
  if (!efetivos.get('valor_max') && perfil.valor_max !== null) {
    efetivos.set('valor_max', String(perfil.valor_max));
  }
  return efetivos;
}
