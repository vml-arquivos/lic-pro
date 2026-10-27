import { describe, expect, it } from 'vitest';
import {
  ALL_AREAS,
  activeArea,
  allowedAreas,
  areaForRole,
  databaseRole,
  isNicheRestricted,
  userRoleSchema,
} from '../src/auth.js';

describe('áreas e papéis', () => {
  it('cada papel pertence a uma única área própria', () => {
    expect(areaForRole('plataforma')).toBe('administracao');
    expect(areaForRole('admin')).toBe('empresa');
    expect(areaForRole('operador')).toBe('empresa');
    expect(areaForRole('aluno')).toBe('aluno');
    expect(areaForRole('mentor')).toBe('mentor');
  });

  it('só a plataforma abre todas as áreas', () => {
    expect(allowedAreas('plataforma')).toEqual(ALL_AREAS);
    for (const role of ['admin', 'operador', 'aluno', 'mentor'] as const) {
      expect(allowedAreas(role)).toEqual([areaForRole(role)]);
    }
  });

  it('"ver como" só vale para a plataforma e ignora valores inválidos', () => {
    expect(activeArea('plataforma')).toBe('administracao');
    expect(activeArea('plataforma', 'aluno')).toBe('aluno');
    expect(activeArea('plataforma', 'qualquer-coisa')).toBe('administracao');
    expect(activeArea('admin', 'administracao')).toBe('empresa');
    expect(activeArea('aluno', 'mentor')).toBe('aluno');
  });

  it('a plataforma age como admin dentro da própria conta no banco', () => {
    expect(databaseRole('plataforma')).toBe('admin');
    expect(databaseRole('admin')).toBe('admin');
    expect(databaseRole('aluno')).toBe('aluno');
  });

  it('só a plataforma fica fora do escopo de nichos', () => {
    expect(isNicheRestricted('plataforma')).toBe(false);
    for (const role of ['admin', 'operador', 'aluno', 'mentor'] as const) {
      expect(isNicheRestricted(role)).toBe(true);
    }
  });

  it('aceita exatamente os papéis conhecidos', () => {
    expect(userRoleSchema.options).toEqual(['plataforma', 'admin', 'operador', 'mentor', 'aluno']);
  });
});
