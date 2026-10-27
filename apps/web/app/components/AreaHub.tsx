import type { Area } from '@licitecomigo/shared';
import { HUB_CTA, HUB_NODES, hubPhoto } from './hubs';
import { NetworkHub } from './NetworkHub';

/** Rede de especialistas da área, para os painéis (componente de servidor). */
export function AreaHub({ area }: Readonly<{ area: Area }>) {
  const cta = HUB_CTA[area];
  return (
    <NetworkHub
      nodes={HUB_NODES[area]}
      photo={hubPhoto()}
      cta={{ label: 'Conversar', href: '/ana', title: cta.title, text: cta.text }}
    />
  );
}
