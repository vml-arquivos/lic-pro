import { describe, expect, it } from 'vitest';
import { atalhoDeInspecao } from './ProtecaoDeCodigo';

const tecla = (key: string, extra: Partial<Parameters<typeof atalhoDeInspecao>[0]> = {}) =>
  atalhoDeInspecao({
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...extra,
  });

describe('atalhos de inspeção', () => {
  it('bloqueia F12 e os atalhos que abrem o código ou as ferramentas', () => {
    expect(tecla('F12')).toBe(true);
    expect(tecla('u', { ctrlKey: true })).toBe(true);
    expect(tecla('U', { metaKey: true })).toBe(true);
    expect(tecla('s', { ctrlKey: true })).toBe(true);
    expect(tecla('I', { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(tecla('j', { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(tecla('c', { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(tecla('i', { metaKey: true, altKey: true })).toBe(true);
  });

  it('deixa passar o uso normal do teclado', () => {
    expect(tecla('a')).toBe(false);
    expect(tecla('Enter')).toBe(false);
    expect(tecla('f', { ctrlKey: true })).toBe(false);
    expect(tecla('p', { ctrlKey: true })).toBe(false);
    expect(tecla('r', { ctrlKey: true })).toBe(false);
    expect(tecla('v', { ctrlKey: true })).toBe(false);
    expect(tecla('c', { ctrlKey: true })).toBe(false);
    expect(tecla('F5')).toBe(false);
  });
});
