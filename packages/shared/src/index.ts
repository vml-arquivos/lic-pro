export const PRODUCT_NAME = 'Licite Comigo';

export type ServiceHealth = {
  service: string;
  status: 'ok';
  product: typeof PRODUCT_NAME;
};

export function health(service: string): ServiceHealth {
  return { service, status: 'ok', product: PRODUCT_NAME };
}

export {
  NICHE_CATALOG,
  NICHE_CODES,
  isNicheCode,
  nicheDefinitions,
  nicheSearchExpression,
  normalizeNicheCodes,
} from './niches.js';
export type { NicheDefinition } from './niches.js';
