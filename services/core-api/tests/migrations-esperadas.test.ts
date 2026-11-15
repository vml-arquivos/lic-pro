import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS_SEM_ACESSO,
  ULTIMA_MIGRATION_ESPERADA,
  estadoMigrations,
} from '../src/migrations-esperadas.js';

describe('aviso de migrations pendentes', () => {
  it('a constante acompanha o último arquivo de db/migrations', () => {
    const dir = resolve(__dirname, '../../../db/migrations');
    const last = readdirSync(dir)
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort()
      .at(-1);
    expect(ULTIMA_MIGRATION_ESPERADA).toBe(last);
  });

  it('banco em dia, atrasado e sem leitura', () => {
    expect(estadoMigrations(ULTIMA_MIGRATION_ESPERADA)).toMatchObject({
      pendente: false,
      motivo: 'em_dia',
    });
    expect(estadoMigrations('0028_colaboradores_e_alerta_sessao.sql')).toMatchObject({
      pendente: true,
      motivo: 'atrasado',
    });
    expect(estadoMigrations(null).pendente).toBe(true);
    expect(MIGRATIONS_SEM_ACESSO).toMatchObject({ pendente: true, motivo: 'sem_acesso' });
  });
});
