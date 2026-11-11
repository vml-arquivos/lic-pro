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
  MODULES,
  MODULE_AREAS,
  MODULE_LABELS,
  PAGE_RULES,
  canOpenPage,
  flatMenu,
  isArea,
  moduleOfArea,
  pageAreas,
  requiresSession,
} from './areas.js';
export type { Area, MenuGroup, MenuItem, ModuleName, PageRule } from './areas.js';

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

export {
  PANEL_COPY,
  areaOfRole,
  areasForPanel,
  normalizeHost,
  panelApiAllowed,
  panelForHost,
  panelOpensForAreas,
  panelPathAllowed,
  panelPathPublic,
  panelUrl,
  panelUrlForRole,
  panelsConfigured,
  parsePanels,
  roleAllowedOnPanel,
} from './panels.js';
export type { PanelEntry, PanelMap } from './panels.js';

export {
  PASSWORD_HINT,
  PASSWORD_MIN_LENGTH,
  PASSWORD_TECHNICAL_MAX,
  PASSWORD_WEAK_MESSAGE,
  isAcceptablePassword,
} from './password.js';

export {
  DESCONTOS_PADRAO,
  DESCONTO_PADRAO_PCT,
  FAIXA_PADRAO_VALOR,
  FOCOS_ANALISE,
  FOCO_ROTULOS,
  LIMITE_EXCLUSIVO_ME_EPP,
  MIN_AMOSTRAS_HISTORICO,
  PESOS,
  analisarOportunidade,
  chaveDeOrdem,
  descontoTipico,
  simularProposta,
} from './analise.js';
export type {
  CenarioSimulacao,
  ComponenteAnalise,
  EntradaAnalise,
  EntradaSimulacao,
  FocoAnalise,
  ResultadoAnalise,
  ResultadoSimulacao,
  SinalAnalise,
} from './analise.js';
