import type { Area } from '@licitecomigo/shared';
import { HUB_NODES, hubPhoto } from './hubs';
import { NetworkHub } from './NetworkHub';

/**
 * Rede de especialistas da área, para os painéis (componente de servidor). A Ana ocupa o centro e
 * é o botão da conversa: por isso o atalho "Ana" e o cartão de chamada não aparecem mais.
 */
export function AreaHub({ area }: Readonly<{ area: Area }>) {
  const nodes = HUB_NODES[area].filter((node) => node.href !== '/ana');
  return <NetworkHub nodes={nodes} photo={hubPhoto()} />;
}
