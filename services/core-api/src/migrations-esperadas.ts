/**
 * Última migration que esta versão do código espera encontrar no banco. Sobe junto com cada
 * arquivo novo em `db/migrations` (um teste confere). A Administração usa isso para avisar
 * quando o banco está atrás do código: telas que dependem de tabelas novas falham até a
 * migration rodar.
 */
export const ULTIMA_MIGRATION_ESPERADA = '0032_limpeza_registros.sql';

export type EstadoMigrations = {
  esperada: string;
  aplicada: string | null;
  pendente: boolean;
  /** `sem_acesso` quando a API nem consegue ler o registro (migration que libera a leitura pendente). */
  motivo: 'em_dia' | 'atrasado' | 'sem_acesso';
};

export function estadoMigrations(aplicada: string | null): EstadoMigrations {
  const pendente = aplicada === null || aplicada < ULTIMA_MIGRATION_ESPERADA;
  return {
    esperada: ULTIMA_MIGRATION_ESPERADA,
    aplicada,
    pendente,
    motivo: pendente ? 'atrasado' : 'em_dia',
  };
}

export const MIGRATIONS_SEM_ACESSO: EstadoMigrations = {
  esperada: ULTIMA_MIGRATION_ESPERADA,
  aplicada: null,
  pendente: true,
  motivo: 'sem_acesso',
};
