'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatarCpfOuCnpj } from '@licitecomigo/shared';
import { errorText, send } from '../../../lib/api';
import { reais } from '../../../lib/money';
import {
  Alert,
  Badge,
  Empty,
  Panel,
  Resource,
  Table,
  formatDate,
  useResource,
} from '../../components/ui';

type Acompanhado = {
  id: string;
  cnpj: string;
  nome: string | null;
  apelido: string | null;
  ultimo_visto_em: string;
  contratos_novos: number;
  disponivel: boolean;
  ultimo_contrato: {
    objeto: string | null;
    orgao: string | null;
    valor: number | null;
    data: string | null;
    link: string | null;
  } | null;
};

export function AcompanharApp() {
  const [lista, recarregar] = useResource<{ data: Acompanhado[]; limite: number }>(
    '/fornecedores-acompanhados',
  );
  const [cnpj, setCnpj] = useState('');
  const [apelido, setApelido] = useState('');
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(
    null,
  );

  async function executar(acao: () => Promise<unknown>, ok: string) {
    setMensagem(null);
    try {
      await acao();
      setMensagem({ tipo: 'success', texto: ok });
      recarregar();
    } catch (causa) {
      setMensagem({ tipo: 'error', texto: errorText(causa) });
    }
  }

  return (
    <>
      <Panel title="Adicionar fornecedor">
        <form
          className="ui-form conc-form"
          onSubmit={(evento) => {
            evento.preventDefault();
            void executar(async () => {
              await send('POST', '/fornecedores-acompanhados', {
                cnpj,
                ...(apelido.trim() ? { apelido: apelido.trim() } : {}),
              });
              setCnpj('');
              setApelido('');
            }, 'Fornecedor adicionado.');
          }}
        >
          <label>
            CNPJ
            <input
              value={cnpj}
              onChange={(e) => setCnpj(formatarCpfOuCnpj(e.target.value))}
              inputMode="numeric"
              placeholder="00.000.000/0000-00"
              required
            />
          </label>
          <label>
            Apelido
            <input
              value={apelido}
              onChange={(e) => setApelido(e.target.value)}
              maxLength={80}
              placeholder="Opcional"
            />
          </label>
          <button type="submit" className="ui-btn">
            Acompanhar
          </button>
        </form>
      </Panel>

      {mensagem ? <Alert kind={mensagem.tipo}>{mensagem.texto}</Alert> : null}

      <Resource value={lista}>
        {(dados) => (
          <Panel title="Sua lista" meta={`${dados.data.length} de ${dados.limite}`}>
            {dados.data.length ? (
              <Table
                head={['Fornecedor', 'Novos', 'Último contrato', 'Valor', '']}
                label="Fornecedores acompanhados"
              >
                {dados.data.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="conc-nome">
                        {item.apelido ?? item.nome ?? formatarCpfOuCnpj(item.cnpj)}
                      </span>
                      {item.apelido || item.nome ? (
                        <span className="conc-sub">{formatarCpfOuCnpj(item.cnpj)}</span>
                      ) : null}
                    </td>
                    <td>
                      {!item.disponivel ? (
                        <Badge tone="muted">Sem resposta</Badge>
                      ) : item.contratos_novos > 0 ? (
                        <Badge tone="warn">{`${item.contratos_novos} novo${item.contratos_novos > 1 ? 's' : ''}`}</Badge>
                      ) : (
                        <Badge tone="muted">Nenhum</Badge>
                      )}
                    </td>
                    <td className="conc-objeto">
                      {item.ultimo_contrato ? (
                        <>
                          {item.ultimo_contrato.objeto ?? '—'}
                          <span className="conc-sub">
                            {item.ultimo_contrato.orgao ?? ''} ·{' '}
                            {formatDate(item.ultimo_contrato.data)}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{reais(item.ultimo_contrato?.valor)}</td>
                    <td>
                      <span className="conc-linha-acoes">
                        <Link
                          className="ui-btn ui-btn-ghost"
                          href={`/concorrencia?cnpj=${item.cnpj}`}
                        >
                          Ver contratos
                        </Link>
                        {item.contratos_novos > 0 ? (
                          <button
                            type="button"
                            className="ui-btn ui-btn-ghost"
                            onClick={() =>
                              void executar(
                                () => send('POST', `/fornecedores-acompanhados/${item.id}/visto`),
                                'Marcado como visto.',
                              )
                            }
                          >
                            Marcar como visto
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="ui-btn ui-btn-ghost ui-btn-danger"
                          onClick={() =>
                            void executar(
                              () => send('DELETE', `/fornecedores-acompanhados/${item.id}`),
                              'Fornecedor removido.',
                            )
                          }
                        >
                          Remover
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>Nenhum fornecedor na lista.</Empty>
            )}
          </Panel>
        )}
      </Resource>
    </>
  );
}
