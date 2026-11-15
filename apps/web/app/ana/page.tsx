import Link from 'next/link';
import type { Area } from '@licitecomigo/shared';
import { getSessionResult } from '../../lib/session';
import { HUB_NODES } from '../components/hubs';
import { HoloAna } from '../components/HoloAna';
import { Icon } from '../components/Icon';
import { AnaChat } from './AnaChat';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Ana | Licite Comigo',
  description: 'Sua assistente no Licite Comigo.',
};

export default async function AnaPage() {
  const result = await getSessionResult();
  const area: Area = result.status === 'ok' ? result.session.area : 'empresa';
  const atalhos = (HUB_NODES[area] ?? []).filter((node) => node.href !== '/ana').slice(0, 5);
  return (
    <main className="ui-page ana-page">
      <header className="ana-hero">
        <span className="ana-hero-holo">
          <HoloAna />
        </span>
        <div>
          <p className="eyebrow">Sua assistente</p>
          <h1>Ana</h1>
        </div>
      </header>
      <AnaChat />
      {atalhos.length ? (
        <nav className="ana-shortcuts" aria-label="Atalhos">
          {atalhos.map((node) => (
            <Link key={node.href} href={node.href}>
              <Icon name={node.icon} size={16} />
              {node.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </main>
  );
}
