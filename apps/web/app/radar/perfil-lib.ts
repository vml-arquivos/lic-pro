'use client';

import { useCallback, useEffect, useState } from 'react';
import { NICHE_CATALOG, SEGMENT_CATALOG } from '@licitecomigo/shared';
import { api } from '../../lib/api';

/** Perfil do Farol: guardado uma vez e aplicado sozinho nas buscas. */
export type Perfil = {
  ufs: string[];
  palavras_interesse: string[];
  valor_min: number | null;
  valor_max: number | null;
  modalidades: string[];
  /** Segmentos e produtos/serviços escolhidos nas listas do perfil. */
  segmentos: string[];
  itens: string[];
};

export type PerfilCompleto = { perfil: Perfil; nichos: string[] };

export const PERFIL_VAZIO: Perfil = {
  ufs: [],
  palavras_interesse: [],
  valor_min: null,
  valor_max: null,
  modalidades: [],
  segmentos: [],
  itens: [],
};

/** Parâmetro de URL que desliga o perfil nas buscas ("Ver tudo"). */
export const SEM_PERFIL = 'sem_perfil';

/** Último perfil lido por conta, para a tela abrir sem esperar a resposta do servidor. */
const perfisEmMemoria = new Map<string, PerfilCompleto>();

export function usePerfil(usuario?: string): {
  dados: PerfilCompleto | null;
  carregando: boolean;
  recarregar: () => void;
} {
  const [dados, setDados] = useState<PerfilCompleto | null>(() =>
    usuario ? (perfisEmMemoria.get(usuario) ?? null) : null,
  );
  const [carregando, setCarregando] = useState(dados === null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    void Promise.all([
      api<{ perfil: Partial<Perfil> }>('/radar/perfil').catch(() => null),
      api<{ nicho_preferencias?: string[] | null }>('/me').catch(() => null),
    ]).then(([radar, eu]) => {
      if (!ativo) return;
      const anterior = usuario ? perfisEmMemoria.get(usuario) : undefined;
      // Se a consulta falhar, mantém o último perfil conhecido em vez de apagar as escolhas.
      const proximo: PerfilCompleto = {
        perfil: radar ? { ...PERFIL_VAZIO, ...radar.perfil } : (anterior?.perfil ?? PERFIL_VAZIO),
        nichos: eu
          ? Array.isArray(eu.nicho_preferencias)
            ? eu.nicho_preferencias
            : []
          : (anterior?.nichos ?? []),
      };
      if (usuario) perfisEmMemoria.set(usuario, proximo);
      // Só troca o estado se mudou: evita refazer a busca sem necessidade.
      setDados((atual) =>
        atual && JSON.stringify(atual) === JSON.stringify(proximo) ? atual : proximo,
      );
      setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, [versao, usuario]);

  const recarregar = useCallback(() => setVersao((valor) => valor + 1), []);
  return { dados, carregando, recarregar };
}

export const nomeDoNicho = (codigo: string): string =>
  NICHE_CATALOG.find((nicho) => nicho.code === codigo)?.label ?? codigo;

export const nomeDoSegmento = (codigo: string): string =>
  SEGMENT_CATALOG.find((segmento) => segmento.code === codigo)?.label ?? codigo;

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
    perfil &&
    (perfil.ufs.length ||
      perfil.valor_min !== null ||
      perfil.valor_max !== null ||
      perfil.segmentos.length ||
      perfil.itens.length),
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
  if (!efetivos.has('segmento') && !efetivos.has('nicho')) {
    for (const codigo of perfil.segmentos) efetivos.append('segmento', codigo);
  }
  if (!efetivos.has('item')) {
    for (const item of perfil.itens) efetivos.append('item', item);
  }
  return efetivos;
}
