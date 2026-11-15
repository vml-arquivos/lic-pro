import { HUB_CTA, HUB_NODES, HUB_VISITOR } from '@licitecomigo/shared';

export { HUB_CTA, HUB_NODES, HUB_VISITOR };

/** Foto opcional do núcleo (ex.: da mentora). Caminho público, lido em tempo de execução. */
export function hubPhoto(): string | undefined {
  const value = process.env.MENTORA_FOTO_URL?.trim();
  return value && (value.startsWith('/') || value.startsWith('https://')) ? value : undefined;
}
