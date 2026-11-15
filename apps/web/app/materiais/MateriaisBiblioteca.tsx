'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Empty, Panel, Resource, useResource } from '../components/ui';
import { ATUACAO, ETAPAS, TIPOS } from './etapas';

export type MaterialLinha = {
  id: string;
  titulo: string;
  descricao: string | null;
  etapa: string;
  tipo: string;
  para: string;
  url: string | null;
  tem_conteudo: boolean;
};
type Data = { atuacao: string | null; data: MaterialLinha[] };

export function MateriaisBiblioteca() {
  const [todos, setTodos] = useState(false);
  const [data] = useResource<Data>(`/aluno/materiais${todos ? '?todos=1' : ''}`);
  return (
    <Resource value={data}>
      {({ atuacao, data: items }) => (
        <>
          <p className="ui-hint">
            {atuacao ? (
              <>
                Mostrando o caminho de <strong>{ATUACAO[atuacao] ?? atuacao}</strong>.{' '}
                <button className="ui-link" type="button" onClick={() => setTodos((v) => !v)}>
                  {todos ? 'Voltar ao meu caminho' : 'Ver todos os materiais'}
                </button>
              </>
            ) : (
              <>
                Faça o <Link href="/diagnostico">diagnóstico</Link> para ver primeiro o que serve ao
                seu caminho.
              </>
            )}
          </p>
          {items.length === 0 ? <Empty>Nenhum material liberado por enquanto.</Empty> : null}
          {ETAPAS.map(([id, titulo, descricao]) => {
            const lista = items.filter((item) => item.etapa === id);
            if (!lista.length) return null;
            return (
              <Panel key={id} title={titulo} description={descricao}>
                <ul className="ui-list">
                  {lista.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>
                          <Link href={`/materiais/${item.id}`}>{item.titulo}</Link>
                        </strong>
                        {item.descricao ? <small>{item.descricao}</small> : null}
                      </div>
                      <Badge tone="muted">{TIPOS[item.tipo] ?? 'Material'}</Badge>
                    </li>
                  ))}
                </ul>
              </Panel>
            );
          })}
        </>
      )}
    </Resource>
  );
}
