import { Suspense } from 'react';
import { getSession } from '../../lib/session';
import { RadarApp } from './RadarApp';
import './radar.css';

export const metadata = {
  title: 'Radar | Licite Comigo',
  description: 'Busque oportunidades públicas com filtros de apoio à decisão.',
};

export default async function RadarPage() {
  const session = await getSession();
  const area = session?.area;
  const canWork = area === 'empresa' || area === 'administracao';
  return (
    <Suspense fallback={<p className="ui-loading">Carregando o Radar…</p>}>
      <RadarApp signedIn={Boolean(session)} canExport={canWork} canSave={canWork} />
    </Suspense>
  );
}
