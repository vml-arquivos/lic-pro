import { headers } from 'next/headers';
import {
  panelForHost,
  parsePanels,
  panelsConfigured,
  type Area,
  type PanelMap,
} from '@licitecomigo/shared';

/**
 * Painéis com endereço próprio (variáveis `PANEL_URL_*`). Sem nenhuma delas, o sistema se
 * comporta como antes: um endereço só, com todas as áreas.
 */
export function configuredPanels(): PanelMap {
  return parsePanels(process.env);
}

export function panelsEnabled(): boolean {
  return panelsConfigured(configuredPanels());
}

/**
 * Painel do endereço que recebeu a requisição. Usa só o cabeçalho `Host` (o proxy do Coolify o
 * repassa). Sondas internas e endereços desconhecidos retornam `null` e não são restringidos.
 */
export function currentPanel(): Area | null {
  const panels = configuredPanels();
  if (!panelsConfigured(panels)) return null;
  return panelForHost(panels, headers().get('host'));
}
