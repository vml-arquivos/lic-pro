import type { Area } from '@licitecomigo/shared';
import { HUB_NODES } from './hubs';
import { ToolGrid } from './ToolGrid';

/** Atalhos da área nos painéis (componente de servidor). */
export function AreaHub({ area }: Readonly<{ area: Area }>) {
  return <ToolGrid nodes={HUB_NODES[area]} />;
}
