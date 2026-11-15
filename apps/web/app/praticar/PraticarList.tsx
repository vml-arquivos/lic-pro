'use client';

import Link from 'next/link';
import { Badge, Empty, Panel, Resource, formatDate, useResource } from '../components/ui';

type Pratica = {
  id: string;
  edital_id: string;
  status: 'rascunho' | 'enviada' | 'devolvida';
  titulo: string;
  orgao: string | null;
  uf: string | null;
  modalidade: string | null;
  nota: number | null;
  devolutiva: string | null;
  devolvida_em: string | null;
  enviada_em: string | null;
  updated_at: string;
};

const LABEL = {
  rascunho: ['Rascunho', 'muted'],
  enviada: ['Aguardando o mentor', 'warn'],
  devolvida: ['Devolvida', 'ok'],
} as const;

export function PraticarList() {
  const [list] = useResource<{ data: Pratica[] }>('/aluno/praticas');
  return (
    <>
      <Panel title="Como funciona">
        <ol className="ui-list">
          <li>1. No Radar, escolha um edital e abra a ficha dele.</li>
          <li>2. Clique em “Praticar este edital” e responda as perguntas com suas palavras.</li>
          <li>3. Envie ao mentor. Ele devolve com comentários e uma nota de 1 a 5.</li>
        </ol>
        <Link className="ui-btn" href="/radar">
          Escolher um edital no Radar
        </Link>
      </Panel>
      <Panel title="Minhas práticas">
        <Resource value={list}>
          {({ data }) =>
            data.length === 0 ? (
              <Empty>Você ainda não começou nenhuma prática.</Empty>
            ) : (
              <ul className="ui-list">
                {data.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>
                        <Link href={`/praticar/${item.edital_id}`}>{item.titulo}</Link>
                      </strong>
                      <small>
                        {item.orgao ?? 'Órgão não informado'}
                        {item.uf ? ` · ${item.uf}` : ''}
                        {item.modalidade ? ` · ${item.modalidade}` : ''}
                      </small>
                      <small>
                        Atualizada em {formatDate(item.updated_at, true)}
                        {item.nota ? ` · nota ${item.nota}/5` : ''}
                      </small>
                    </div>
                    <Badge tone={LABEL[item.status][1]}>{LABEL[item.status][0]}</Badge>
                  </li>
                ))}
              </ul>
            )
          }
        </Resource>
      </Panel>
    </>
  );
}
