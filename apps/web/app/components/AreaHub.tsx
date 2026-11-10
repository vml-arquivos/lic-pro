import type { Area } from '@licitecomigo/shared';
import { HUB_CTA, HUB_NODES, hubPhoto } from './hubs';
import { NetworkHub } from './NetworkHub';

/** Rede de especialistas da área, para os painéis (componente de servidor). */
export function AreaHub({ area }: Readonly<{ area: Area }>) {
  const nodes = HUB_NODES[area];
  // O nó da Ana já leva à conversa: o cartão de chamada só aparece se a área não tiver esse nó.
  const hasAnaNode = nodes.some((node) => node.href === '/ana');
  const cta = HUB_CTA[area];
  return (
    <NetworkHub
      nodes={nodes}
      photo={hubPhoto()}
      {...(hasAnaNode
        ? {}
        : { cta: { label: 'Conversar', href: '/ana', title: cta.title, text: cta.text } })}
    />
  );
}
