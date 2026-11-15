/**
 * Estado da Ana compartilhado entre a figura holográfica e a conversa.
 * A conversa avisa (pensando, falando, ocioso) e a figura reage; o centro da rede avisa
 * "abrir" e a conversa abre. Tudo por eventos do navegador, sem acoplar os componentes.
 */
export type EstadoAna = 'ocioso' | 'pensando' | 'falando';

export const EVENTO_ESTADO_ANA = 'licite:ana-estado';
export const EVENTO_ABRIR_ANA = 'licite:ana-abrir';

export function avisarEstadoAna(estado: EstadoAna): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<EstadoAna>(EVENTO_ESTADO_ANA, { detail: estado }));
}

export function pedirAbrirAna(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_ANA));
}
