'use client';

import { Badge, Panel, Resource, useResource } from '../../components/ui';
import { TIPOS } from '../etapas';

type Material = {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: string;
  url: string | null;
  conteudo: string | null;
};

export function MaterialLeitura({ id }: Readonly<{ id: string }>) {
  const [data] = useResource<Material>(`/aluno/materiais/${id}`);
  return (
    <Resource value={data}>
      {(material) => (
        <>
          <header className="ui-header">
            <div>
              <p className="eyebrow">{TIPOS[material.tipo] ?? 'Material'}</p>
              <h1>{material.titulo}</h1>
              {material.descricao ? <p>{material.descricao}</p> : null}
            </div>
            {material.url ? (
              <a className="ui-btn" href={material.url} target="_blank" rel="noreferrer">
                Abrir arquivo
              </a>
            ) : null}
          </header>
          {material.conteudo ? (
            <Panel title="Conteúdo">
              <div className="material-texto">{material.conteudo}</div>
            </Panel>
          ) : (
            <Badge tone="muted">Arquivo externo</Badge>
          )}
        </>
      )}
    </Resource>
  );
}
