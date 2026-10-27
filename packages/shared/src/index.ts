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

export {
  AREAS,
  AREA_LABELS,
  AREA_MENUS,
  PAGE_RULES,
  canOpenPage,
  flatMenu,
  isArea,
  pageAreas,
  requiresSession,
} from './areas.js';
export type { Area, MenuGroup, MenuItem, PageRule } from './areas.js';

export {
  GRANDE_VULTO_PADRAO,
  REGIAO_LABELS,
  REGIOES,
  UFS,
  UFS_POR_REGIAO,
  regiaoDaUf,
  ufsDaRegiao,
} from './geo.js';
export type { Regiao } from './geo.js';

export { HUB_CTA, HUB_NODES, HUB_VISITOR } from './hubs.js';
export type { HubNodeData, HubTone } from './hubs.js';
