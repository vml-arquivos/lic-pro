import Link from 'next/link';
import type { HubNodeData } from '@licitecomigo/shared';
import { Icon } from './Icon';

/** Atalhos para as ferramentas da área. A Ana fica no menu e no botão flutuante, como apoio. */
export function ToolGrid({ nodes }: Readonly<{ nodes: readonly HubNodeData[] }>) {
  return (
    <nav className="tool-grid" aria-label="Atalhos">
      {nodes.map((node) => (
        <Link key={node.href} className="hub-node" data-tone={node.tone} href={node.href}>
          <span className="hub-node-icon">
            <Icon name={node.icon} size={18} />
          </span>
          <span className="hub-node-text">
            <strong>{node.label}</strong>
            <small>{node.caption}</small>
          </span>
        </Link>
      ))}
    </nav>
  );
}
