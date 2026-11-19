'use client';

import {
  UFS,
  formatarCep,
  formatarCnpj,
  somenteDigitos,
  type DadosCep,
  type DadosCnpj,
} from '@licitecomigo/shared';
import { useEffect, useRef, useState } from 'react';
import { useConsultaCadastral, type EstadoConsulta } from './useConsultaCadastral';

export type EmpresaDados = {
  id?: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string | null;
  porte?: string | null;
  segmento?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  telefone?: string | null;
  email_contato?: string | null;
  cnae_principal?: string | null;
  cnae_descricao?: string | null;
  situacao_cadastral?: string | null;
  data_abertura?: string | null;
  natureza_juridica?: string | null;
};

type Campos = {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  porte: string;
  segmento: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  telefone: string;
  email_contato: string;
  cnae_principal: string;
  cnae_descricao: string;
  situacao_cadastral: string;
  data_abertura: string;
  natureza_juridica: string;
};

const VAZIO: Campos = {
  cnpj: '',
  razao_social: '',
  nome_fantasia: '',
  porte: '',
  segmento: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  telefone: '',
  email_contato: '',
  cnae_principal: '',
  cnae_descricao: '',
  situacao_cadastral: '',
  data_abertura: '',
  natureza_juridica: '',
};

function formatarTelefone(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function deEmpresa(empresa: EmpresaDados | null): Campos {
  if (!empresa) return VAZIO;
  return {
    cnpj: formatarCnpj(empresa.cnpj),
    razao_social: empresa.razao_social ?? '',
    nome_fantasia: empresa.nome_fantasia ?? '',
    porte: empresa.porte ?? '',
    segmento: empresa.segmento ?? '',
    cep: formatarCep(empresa.cep),
    logradouro: empresa.logradouro ?? '',
    numero: empresa.numero ?? '',
    complemento: empresa.complemento ?? '',
    bairro: empresa.bairro ?? '',
    cidade: empresa.cidade ?? '',
    uf: empresa.uf ?? '',
    telefone: formatarTelefone(empresa.telefone ?? ''),
    email_contato: empresa.email_contato ?? '',
    cnae_principal: empresa.cnae_principal ?? '',
    cnae_descricao: empresa.cnae_descricao ?? '',
    situacao_cadastral: empresa.situacao_cadastral ?? '',
    data_abertura: empresa.data_abertura?.slice(0, 10) ?? '',
    natureza_juridica: empresa.natureza_juridica ?? '',
  };
}

function Status({ estado }: { estado: EstadoConsulta }) {
  if (estado.fase === 'parado') return null;
  const classe =
    estado.fase === 'erro'
      ? 'campo-status campo-status-erro'
      : `campo-status campo-status-${estado.fase}`;
  return (
    <small className={classe} role={estado.fase === 'erro' ? 'alert' : 'status'}>
      {estado.mensagem}
    </small>
  );
}

/**
 * Cadastro da empresa. Ao completar um CNPJ válido, busca razão social, porte, atividade e
 * endereço; ao completar o CEP, busca rua, bairro, cidade e UF. Tudo continua editável.
 */
export function EmpresaForm({
  empresa,
  salvando,
  mensagem,
  onSalvar,
  onCancelar,
}: {
  empresa: EmpresaDados | null;
  salvando: boolean;
  mensagem: string;
  onSalvar: (corpo: Record<string, string>) => void;
  onCancelar?: () => void;
}) {
  const [campos, setCampos] = useState<Campos>(() => deEmpresa(empresa));
  const numeroRef = useRef<HTMLInputElement>(null);
  const set = (parcial: Partial<Campos>) => setCampos((atual) => ({ ...atual, ...parcial }));

  const consulta = useConsultaCadastral({
    aoEncontrarCnpj: (dados: DadosCnpj) => {
      set({
        razao_social: dados.razao_social,
        nome_fantasia: dados.nome_fantasia ?? '',
        porte: dados.porte ?? '',
        cep: formatarCep(dados.cep),
        logradouro: dados.logradouro ?? '',
        numero: dados.numero ?? '',
        complemento: dados.complemento ?? '',
        bairro: dados.bairro ?? '',
        cidade: dados.cidade ?? '',
        uf: dados.uf ?? '',
        telefone: formatarTelefone(dados.telefone ?? ''),
        email_contato: dados.email ?? '',
        cnae_principal: dados.cnae_principal ?? '',
        cnae_descricao: dados.cnae_descricao ?? '',
        situacao_cadastral: dados.situacao ?? '',
        data_abertura: dados.data_abertura ?? '',
        natureza_juridica: dados.natureza_juridica ?? '',
      });
    },
    aoEncontrarCep: (dados: DadosCep) => {
      set({
        logradouro: dados.logradouro ?? '',
        bairro: dados.bairro ?? '',
        cidade: dados.cidade ?? '',
        uf: dados.uf ?? '',
      });
      numeroRef.current?.focus();
    },
  });

  useEffect(() => {
    const inicial = deEmpresa(empresa);
    setCampos(inicial);
    consulta.marcarComoConsultados(inicial.cnpj, inicial.cep);
    // só recarrega quando muda a empresa em edição
  }, [empresa?.id]);

  const cnpjDigitos = somenteDigitos(campos.cnpj);
  const cnpjOk = cnpjDigitos.length === 14 && consulta.cnpj.fase !== 'erro';

  function enviar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cnpjOk) return;
    const corpo: Record<string, string> = {
      cnpj: cnpjDigitos,
      razao_social: campos.razao_social.trim(),
    };
    const opcionais: Array<[string, string]> = [
      ['nome_fantasia', campos.nome_fantasia],
      ['porte', campos.porte],
      ['segmento', campos.segmento],
      ['cep', somenteDigitos(campos.cep)],
      ['logradouro', campos.logradouro],
      ['numero', campos.numero],
      ['complemento', campos.complemento],
      ['bairro', campos.bairro],
      ['cidade', campos.cidade],
      ['uf', campos.uf],
      ['telefone', somenteDigitos(campos.telefone)],
      ['email_contato', campos.email_contato],
      ['cnae_principal', campos.cnae_principal],
      ['cnae_descricao', campos.cnae_descricao],
      ['situacao_cadastral', campos.situacao_cadastral],
      ['data_abertura', campos.data_abertura],
      ['natureza_juridica', campos.natureza_juridica],
    ];
    for (const [chave, valor] of opcionais) if (valor.trim()) corpo[chave] = valor.trim();
    onSalvar(corpo);
  }

  return (
    <form className="dashboard-card auth-form empresa-form" onSubmit={enviar}>
      <h2>{empresa ? 'Editar empresa' : 'Nova empresa'}</h2>

      <label>
        CNPJ
        <input
          value={campos.cnpj}
          onChange={(event) => set({ cnpj: consulta.digitarCnpj(event.target.value) })}
          inputMode="numeric"
          autoComplete="off"
          placeholder="00.000.000/0000-00"
          aria-invalid={consulta.cnpj.fase === 'erro'}
          required
        />
        <Status estado={consulta.cnpj} />
      </label>

      <div className="empresa-form-grid">
        <label className="campo-largo">
          Razão social
          <input
            value={campos.razao_social}
            onChange={(event) => set({ razao_social: event.target.value })}
            required
          />
        </label>
        <label>
          Nome fantasia
          <input
            value={campos.nome_fantasia}
            onChange={(event) => set({ nome_fantasia: event.target.value })}
          />
        </label>
        <label>
          Porte
          <select value={campos.porte} onChange={(event) => set({ porte: event.target.value })}>
            <option value="">Não informado</option>
            <option value="mei">MEI</option>
            <option value="micro">Microempresa</option>
            <option value="pequena">Pequena empresa</option>
            <option value="media">Média empresa</option>
            <option value="grande">Grande empresa</option>
          </select>
        </label>
        <label>
          Segmento
          <input
            value={campos.segmento}
            onChange={(event) => set({ segmento: event.target.value })}
            placeholder="ex.: serviços"
          />
        </label>
        <label>
          Atividade principal (CNAE)
          <input
            value={campos.cnae_descricao || campos.cnae_principal}
            onChange={(event) => set({ cnae_descricao: event.target.value })}
          />
        </label>
      </div>

      <h3 className="empresa-form-secao">Endereço</h3>
      <div className="empresa-form-grid">
        <label>
          CEP
          <input
            value={campos.cep}
            onChange={(event) => set({ cep: consulta.digitarCep(event.target.value) })}
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            aria-invalid={consulta.cep.fase === 'erro'}
          />
          <Status estado={consulta.cep} />
        </label>
        <label className="campo-largo">
          Rua / avenida
          <input
            value={campos.logradouro}
            onChange={(event) => set({ logradouro: event.target.value })}
            autoComplete="address-line1"
          />
        </label>
        <label>
          Número
          <input
            ref={numeroRef}
            value={campos.numero}
            onChange={(event) => set({ numero: event.target.value })}
          />
        </label>
        <label>
          Complemento
          <input
            value={campos.complemento}
            onChange={(event) => set({ complemento: event.target.value })}
          />
        </label>
        <label>
          Bairro
          <input value={campos.bairro} onChange={(event) => set({ bairro: event.target.value })} />
        </label>
        <label>
          Cidade
          <input value={campos.cidade} onChange={(event) => set({ cidade: event.target.value })} />
        </label>
        <label>
          UF
          <select value={campos.uf} onChange={(event) => set({ uf: event.target.value })}>
            <option value="">—</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h3 className="empresa-form-secao">Contato</h3>
      <div className="empresa-form-grid">
        <label>
          Telefone
          <input
            value={campos.telefone}
            onChange={(event) => set({ telefone: formatarTelefone(event.target.value) })}
            inputMode="tel"
            autoComplete="tel"
          />
        </label>
        <label className="campo-largo">
          E-mail da empresa
          <input
            type="email"
            value={campos.email_contato}
            onChange={(event) => set({ email_contato: event.target.value })}
            autoComplete="email"
          />
        </label>
      </div>

      <div className="empresa-form-acoes">
        <button type="submit" disabled={salvando || !cnpjOk}>
          {salvando ? 'Salvando…' : empresa ? 'Salvar alterações' : 'Salvar empresa'}
        </button>
        {onCancelar ? (
          <button type="button" className="empresa-form-cancelar" onClick={onCancelar}>
            Cancelar
          </button>
        ) : null}
      </div>
      {mensagem ? <p className="success-message">{mensagem}</p> : null}
    </form>
  );
}
