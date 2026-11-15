'use client';

import {
  cepValido,
  cnpjValido,
  formatarCep,
  formatarCnpj,
  somenteDigitos,
  type DadosCep,
  type DadosCnpj,
} from '@licitecomigo/shared';
import { useCallback, useRef, useState } from 'react';

export type EstadoConsulta = {
  /** `consultando` mostra "Buscando…"; `ok` e `aviso` mostram a mensagem abaixo do campo. */
  fase: 'parado' | 'consultando' | 'ok' | 'aviso' | 'erro';
  mensagem: string;
};

const PARADO: EstadoConsulta = { fase: 'parado', mensagem: '' };

async function buscar<T>(
  url: string,
): Promise<{ ok: true; data: T } | { ok: false; erro: string; mensagem: string }> {
  try {
    const response = await fetch(url);
    const body = (await response.json().catch(() => ({}))) as {
      data?: T;
      error?: string;
      mensagem?: string;
    };
    if (response.ok && body.data) return { ok: true, data: body.data };
    return {
      ok: false,
      erro: body.error ?? 'indisponivel',
      mensagem:
        body.mensagem ??
        (response.status === 401
          ? 'Entre de novo para consultar.'
          : 'Não consegui consultar agora. Preencha manualmente.'),
    };
  } catch {
    return {
      ok: false,
      erro: 'indisponivel',
      mensagem: 'Não consegui consultar agora. Preencha manualmente.',
    };
  }
}

/**
 * Preenchimento automático por CNPJ e por CEP, com validação enquanto a pessoa digita.
 * Quem usa passa o que fazer com os dados; o hook cuida da máscara, da validação, de ignorar
 * respostas atrasadas e das mensagens.
 */
export function useConsultaCadastral(handlers: {
  aoEncontrarCnpj: (dados: DadosCnpj) => void;
  aoEncontrarCep: (dados: DadosCep) => void;
}) {
  const [cnpj, setCnpjEstado] = useState<EstadoConsulta>(PARADO);
  const [cep, setCepEstado] = useState<EstadoConsulta>(PARADO);
  const ultimoCnpj = useRef('');
  const ultimoCep = useRef('');
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  /** Recebe o texto digitado e devolve o texto mascarado para o campo. */
  const digitarCnpj = useCallback((texto: string): string => {
    const digitos = somenteDigitos(texto).slice(0, 14);
    const mascarado = formatarCnpj(digitos);
    if (digitos.length < 14) {
      ultimoCnpj.current = '';
      setCnpjEstado(PARADO);
      return mascarado;
    }
    if (!cnpjValido(digitos)) {
      ultimoCnpj.current = '';
      setCnpjEstado({ fase: 'erro', mensagem: 'CNPJ inválido. Confira os números.' });
      return mascarado;
    }
    if (ultimoCnpj.current === digitos) return mascarado;
    ultimoCnpj.current = digitos;
    setCnpjEstado({ fase: 'consultando', mensagem: 'Buscando os dados da empresa…' });
    void buscar<DadosCnpj>(`/api/core/lookup/cnpj/${digitos}`).then((result) => {
      if (ultimoCnpj.current !== digitos) return; // a pessoa já mudou o número
      if (result.ok) {
        handlersRef.current.aoEncontrarCnpj(result.data);
        setCnpjEstado(
          result.data.ativa
            ? {
                fase: 'ok',
                mensagem: 'Dados preenchidos pela Receita. Confira e ajuste se precisar.',
              }
            : {
                fase: 'aviso',
                mensagem: `Atenção: a situação cadastral está como "${result.data.situacao}". Confira antes de usar.`,
              },
        );
      } else {
        // CNPJ com os dígitos certos continua valendo mesmo sem a consulta.
        setCnpjEstado({
          fase: 'aviso',
          mensagem: result.mensagem,
        });
      }
    });
    return mascarado;
  }, []);

  const digitarCep = useCallback((texto: string): string => {
    const digitos = somenteDigitos(texto).slice(0, 8);
    const mascarado = formatarCep(digitos);
    if (digitos.length < 8) {
      ultimoCep.current = '';
      setCepEstado(PARADO);
      return mascarado;
    }
    if (!cepValido(digitos)) {
      ultimoCep.current = '';
      setCepEstado({ fase: 'erro', mensagem: 'CEP inválido.' });
      return mascarado;
    }
    if (ultimoCep.current === digitos) return mascarado;
    ultimoCep.current = digitos;
    setCepEstado({ fase: 'consultando', mensagem: 'Buscando o endereço…' });
    void buscar<DadosCep>(`/api/core/lookup/cep/${digitos}`).then((result) => {
      if (ultimoCep.current !== digitos) return;
      if (result.ok) {
        handlersRef.current.aoEncontrarCep(result.data);
        setCepEstado({ fase: 'ok', mensagem: 'Endereço preenchido. Falta só o número.' });
      } else {
        setCepEstado({ fase: 'aviso', mensagem: result.mensagem });
      }
    });
    return mascarado;
  }, []);

  /** Marca o último número como já consultado (ao carregar uma empresa para editar). */
  const marcarComoConsultados = useCallback((cnpjValor: string, cepValor: string) => {
    ultimoCnpj.current = somenteDigitos(cnpjValor);
    ultimoCep.current = somenteDigitos(cepValor);
    setCnpjEstado(PARADO);
    setCepEstado(PARADO);
  }, []);

  return { cnpj, cep, digitarCnpj, digitarCep, marcarComoConsultados };
}
