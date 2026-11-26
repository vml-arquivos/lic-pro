'use client';

import { useEffect } from 'react';

/** Campos onde digitar, colar e copiar continuam normais. */
const EDITAVEL =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-copiavel]';

function emCampoEditavel(alvo: EventTarget | null): boolean {
  return alvo instanceof Element && alvo.closest(EDITAVEL) !== null;
}

/**
 * Atalhos que abrem o código da página ou as ferramentas do navegador: F12, Ctrl/Cmd+U,
 * Ctrl/Cmd+S, Ctrl+Shift+I/J/C/K e Cmd+Option+I/J/C/U.
 */
export function atalhoDeInspecao(evento: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  const tecla = evento.key.toLowerCase();
  if (evento.key === 'F12') return true;
  const comando = evento.ctrlKey || evento.metaKey;
  if (!comando) return false;
  if ((tecla === 'u' || tecla === 's') && !evento.shiftKey) return true;
  if (evento.shiftKey && ['i', 'j', 'c', 'k'].includes(tecla)) return true;
  if (evento.metaKey && evento.altKey && ['i', 'j', 'c', 'u'].includes(tecla)) return true;
  return false;
}

/**
 * Impede ver o código pela tela: botão direito, atalhos de inspeção, arrastar e copiar o que
 * está escrito na página. Só acessa e usa: campos de digitação, botões de copiar do sistema e
 * qualquer função continuam funcionando. É uma barreira para curiosos; o que protege de verdade
 * é o código do servidor nunca sair dele e as regras serem conferidas lá.
 */
export function ProtecaoDeCodigo() {
  useEffect(() => {
    const bloquearMenu = (evento: MouseEvent) => {
      if (!emCampoEditavel(evento.target)) evento.preventDefault();
    };
    const bloquearAtalho = (evento: KeyboardEvent) => {
      if (atalhoDeInspecao(evento)) {
        evento.preventDefault();
        evento.stopPropagation();
        return;
      }
      const comando = evento.ctrlKey || evento.metaKey;
      const tecla = evento.key.toLowerCase();
      if (comando && ['a', 'c', 'x'].includes(tecla) && !emCampoEditavel(evento.target)) {
        evento.preventDefault();
      }
    };
    const bloquearCopia = (evento: ClipboardEvent) => {
      if (!emCampoEditavel(evento.target)) evento.preventDefault();
    };
    const bloquearArrastar = (evento: DragEvent) => {
      if (!emCampoEditavel(evento.target)) evento.preventDefault();
    };
    document.addEventListener('contextmenu', bloquearMenu);
    document.addEventListener('keydown', bloquearAtalho, true);
    document.addEventListener('copy', bloquearCopia);
    document.addEventListener('cut', bloquearCopia);
    document.addEventListener('dragstart', bloquearArrastar);
    return () => {
      document.removeEventListener('contextmenu', bloquearMenu);
      document.removeEventListener('keydown', bloquearAtalho, true);
      document.removeEventListener('copy', bloquearCopia);
      document.removeEventListener('cut', bloquearCopia);
      document.removeEventListener('dragstart', bloquearArrastar);
    };
  }, []);
  return null;
}
