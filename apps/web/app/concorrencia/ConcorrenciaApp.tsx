'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { UFS, formatarCpfOuCnpj } from '@licitecomigo/shared';
import { api, errorText, send } from '../../lib/api';
import { reais } from '../../lib/money';
import { Alert, Empty, Kpi, Panel, Table, formatDate } from '../components/ui';

type Contrato = {
  numero_controle: string | null;
  fornecedor: string | null;
  cnpj: string | null;
  valor: number | null;
  assinatura: string | null;
  vigencia_fim: string | null;
  orgao: string | null;
  uf: string | null;
  municipio: string | null;
  objeto: string | null;
  link: string | null;
};
type Fornecedor = {
  cnpj: string;
  nome: string | null;
  resumo: {
    contratos: number;
    valor_total: number;
    maior_contrato: number | null;
    por_uf: Array<{ uf: string; contratos: number; valor_total: number }>;
    principais_orgaos: Array<{ orgao: string; contratos: number; valor_total: number }>;
    por_ano: Array<{ ano: string; contratos: number; valor_total: number }>;
  };
  contratos: Contrato[];
  parcial: boolean;
  dados: { consultado_em: string };
};
type Mercado = {
  q: string;
  contratos_lidos: number;
  total_na_fonte: number;
  valor_total: number;
  fornecedores: Array<{
    cnpj: string | null;
    nome: string | null;
    contratos: number;
    valor_total: number;
    ufs: string[];
    ultimo_contrato: string | null;
  }>;
  dados: { consultado_em: string };
};

const soNumeros = (texto: string) => texto.replace(/\D/g, '');

export function ConcorrenciaApp({
  cnpjInicial,
  assuntoInicial,
}: Readonly<{ cnpjInicial: string; assuntoInicial: string }>) {
  const [modo, setModo] = useState<'assunto' | 'cnpj'>(cnpjInicial ? 'cnpj' : 'assunto');
  const [assunto, setAssunto] = useState(assuntoInicial);
  const [uf, setUf] = useState('');
  const [cnpj, setCnpj] = useState(cnpjInicial ? formatarCpfOuCnpj(cnpjInicial) : '');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [mercado, setMercado] = useState<Mercado | null>(null);
  const [fornecedor, setFornecedor] = useState<Fornecedor | null>(null);

  async function consultarCnpj(valor: string) {
    const digitos = soNumeros(valor);
    if (digitos.length !== 14) {
      setErro('Informe um CNPJ com 14 números.');
      return;
    }
    setCarregando(true);
    setErro('');
    setAviso('');
    try {
      setFornecedor(await api<Fornecedor>(`/concorrencia/fornecedor?cnpj=${digitos}`));
    } catch (causa) {
      setFornecedor(null);
      setErro(errorText(causa));
    } finally {
      setCarregando(false);
    }
  }

  async function consultarAssunto() {
    if (assunto.trim().length < 3) {
      setErro('Digite ao menos 3 letras.');
      return;
    }
    setCarregando(true);
    setErro('');
    setAviso('');
    try {
      const consulta = new URLSearchParams({ q: assunto.trim() });
      if (uf) consulta.set('uf', uf);
      setMercado(await api<Mercado>(`/concorrencia/mercado?${consulta.toString()}`));
    } catch (causa) {
      setMercado(null);
      setErro(errorText(causa));
    } finally {
      setCarregando(false);
    }
  }

  async function acompanhar(documento: string, nome: string | null) {
    setAviso('');
    setErro('');
    try {
      await send('POST', '/fornecedores-acompanhados', {
        cnpj: documento,
        ...(nome ? { nome } : {}),
      });
      setAviso('Fornecedor adicionado em Fornecedores acompanhados.');
    } catch (causa) {
      setErro(errorText(causa));
    }
  }

  useEffect(() => {
    if (cnpjInicial) void consultarCnpj(cnpjInicial);
    else if (assuntoInicial.trim().length >= 3) void consultarAssunto();
    // só na abertura da página
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function verFornecedor(documento: string) {
    setModo('cnpj');
    setCnpj(formatarCpfOuCnpj(documento));
    void consultarCnpj(documento);
  }

  return (
    <>
      <div className="conc-tabs" role="tablist" aria-label="Tipo de consulta">
        <button
          type="button"
          role="tab"
          className="ui-btn ui-btn-ghost ui-tab"
          aria-selected={modo === 'assunto'}
          onClick={() => setModo('assunto')}
        >
          Por assunto
        </button>
        <button
          type="button"
          role="tab"
          className="ui-btn ui-btn-ghost ui-tab"
          aria-selected={modo === 'cnpj'}
          onClick={() => setModo('cnpj')}
        >
          Por CNPJ
        </button>
      </div>

      {modo === 'assunto' ? (
        <Panel title="Quem fecha contratos deste assunto">
          <form
            className="ui-form conc-form"
            onSubmit={(evento) => {
              evento.preventDefault();
              void consultarAssunto();
            }}
          >
            <label>
              Assunto
              <input
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
                placeholder="Ex.: material de limpeza"
                maxLength={120}
              />
            </label>
            <label>
              Estado
              <select value={uf} onChange={(e) => setUf(e.target.value)}>
                <option value="">Todos</option>
                {UFS.map((codigo) => (
                  <option key={codigo} value={codigo}>
                    {codigo}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="ui-btn" disabled={carregando}>
              {carregando ? 'Consultando…' : 'Consultar'}
            </button>
          </form>
        </Panel>
      ) : (
        <Panel title="Contratos de um fornecedor">
          <form
            className="ui-form conc-form"
            onSubmit={(evento) => {
              evento.preventDefault();
              void consultarCnpj(cnpj);
            }}
          >
            <label>
              CNPJ
              <input
                value={cnpj}
                onChange={(e) => setCnpj(formatarCpfOuCnpj(e.target.value))}
                inputMode="numeric"
                placeholder="00.000.000/0000-00"
              />
            </label>
            <button type="submit" className="ui-btn" disabled={carregando}>
              {carregando ? 'Consultando…' : 'Consultar'}
            </button>
          </form>
        </Panel>
      )}

      {erro ? <Alert kind="error">{erro}</Alert> : null}
      {aviso ? (
        <Alert kind="success">
          {aviso} <Link href="/concorrencia/acompanhar">Abrir lista</Link>
        </Alert>
      ) : null}

      {modo === 'assunto' && mercado ? (
        <Panel
          title="Fornecedores"
          meta={`Consultado em ${formatDate(mercado.dados.consultado_em, true)}`}
        >
          <div className="ui-kpis">
            <Kpi
              label="Contratos lidos"
              value={mercado.contratos_lidos}
              hint={`de ${mercado.total_na_fonte.toLocaleString('pt-BR')} no PNCP`}
            />
            <Kpi label="Valor nos contratos lidos" value={reais(mercado.valor_total)} />
            <Kpi label="Fornecedores" value={mercado.fornecedores.length} />
          </div>
          {mercado.fornecedores.length ? (
            <Table
              head={['Fornecedor', 'Contratos', 'Valor', 'Estados', 'Último', '']}
              label="Fornecedores do assunto"
            >
              {mercado.fornecedores.map((item) => (
                <tr key={item.cnpj ?? item.nome}>
                  <td>
                    <span className="conc-nome">{item.nome ?? 'Sem nome'}</span>
                    {item.cnpj ? (
                      <span className="conc-sub">{formatarCpfOuCnpj(item.cnpj)}</span>
                    ) : null}
                  </td>
                  <td>{item.contratos}</td>
                  <td>{reais(item.valor_total)}</td>
                  <td>{item.ufs.join(', ') || '—'}</td>
                  <td>{formatDate(item.ultimo_contrato)}</td>
                  <td>
                    {item.cnpj ? (
                      <span className="conc-linha-acoes">
                        <button
                          type="button"
                          className="ui-btn ui-btn-ghost"
                          onClick={() => verFornecedor(item.cnpj!)}
                        >
                          Ver contratos
                        </button>
                        <button
                          type="button"
                          className="ui-btn ui-btn-ghost"
                          onClick={() => void acompanhar(item.cnpj!, item.nome)}
                        >
                          Acompanhar
                        </button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>Nenhum contrato encontrado para este assunto.</Empty>
          )}
        </Panel>
      ) : null}

      {modo === 'cnpj' && fornecedor ? (
        <>
          <Panel
            title={fornecedor.nome ?? formatarCpfOuCnpj(fornecedor.cnpj)}
            meta={`${formatarCpfOuCnpj(fornecedor.cnpj)} · consultado em ${formatDate(fornecedor.dados.consultado_em, true)}`}
            actions={
              <button
                type="button"
                className="ui-btn"
                onClick={() => void acompanhar(fornecedor.cnpj, fornecedor.nome)}
              >
                Acompanhar
              </button>
            }
          >
            <div className="ui-kpis">
              <Kpi
                label="Contratos"
                value={fornecedor.resumo.contratos}
                hint={fornecedor.parcial ? 'Mais recentes' : undefined}
              />
              <Kpi label="Valor total" value={reais(fornecedor.resumo.valor_total)} />
              <Kpi label="Maior contrato" value={reais(fornecedor.resumo.maior_contrato)} />
            </div>
          </Panel>
          <div className="conc-split">
            <Panel title="Principais órgãos">
              {fornecedor.resumo.principais_orgaos.length ? (
                <Table head={['Órgão', 'Contratos', 'Valor']} label="Principais órgãos">
                  {fornecedor.resumo.principais_orgaos.map((linha) => (
                    <tr key={linha.orgao}>
                      <td>{linha.orgao}</td>
                      <td>{linha.contratos}</td>
                      <td>{reais(linha.valor_total)}</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>Sem contratos.</Empty>
              )}
            </Panel>
            <Panel title="Onde vende">
              {fornecedor.resumo.por_uf.length ? (
                <Table head={['Estado', 'Contratos', 'Valor']} label="Contratos por estado">
                  {fornecedor.resumo.por_uf.map((linha) => (
                    <tr key={linha.uf}>
                      <td>{linha.uf}</td>
                      <td>{linha.contratos}</td>
                      <td>{reais(linha.valor_total)}</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>Sem contratos.</Empty>
              )}
            </Panel>
          </div>
          <Panel title="Contratos">
            {fornecedor.contratos.length ? (
              <Table
                head={['Assinatura', 'Órgão', 'Objeto', 'Valor', 'UF', '']}
                label="Contratos do fornecedor"
              >
                {fornecedor.contratos.map((linha, indice) => (
                  <tr key={linha.numero_controle ?? indice}>
                    <td>{formatDate(linha.assinatura)}</td>
                    <td>{linha.orgao ?? '—'}</td>
                    <td className="conc-objeto">{linha.objeto ?? '—'}</td>
                    <td>{reais(linha.valor)}</td>
                    <td>{linha.uf ?? '—'}</td>
                    <td>
                      {linha.link ? (
                        <a href={linha.link} target="_blank" rel="noreferrer">
                          PNCP
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>O PNCP não tem contratos publicados para este CNPJ.</Empty>
            )}
          </Panel>
        </>
      ) : null}
    </>
  );
}
