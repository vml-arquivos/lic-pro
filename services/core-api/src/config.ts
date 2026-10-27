export type RuntimeConfig = {
  port: number;
  jwtSecret: string;
  jwtIssuer?: string;
  jwtAudience?: string;
  jwtTtlSeconds: number;
  databaseUrl?: string;
  redisUrl?: string;
  appUrl?: string;
  apiUrl?: string;
  siteUrl?: string;
  allowedOrigins: string[];
  nodeEnv: string;
  signupEnabled: boolean;
  emailProvider: 'fake' | 'smtp' | 'disabled';
  smtpHost?: string;
  smtpPort: number;
  smtpUser?: string;
  smtpPassword?: string;
  emailFrom?: string;
  termsVersion: string;
  privacyVersion: string;
  /** Motor de alertas dentro do core-api (ligado por padrão; `ALERT_ENGINE_ENABLED=false` desliga). */
  alertEngineEnabled: boolean;
  alertEngineIntervalSeconds: number;
  /** Coleta do PNCP dentro do core-api (ligada por padrão; `PNCP_SYNC_ENABLED=false` desliga). */
  pncpSyncEnabled: boolean;
  pncpSyncIntervalMinutes: number;
  /** Quantos dias para trás cada rodada agendada olha (1 a 30). */
  pncpSyncDays: number;
  /** Códigos de modalidade do PNCP (6 = pregão eletrônico, 8 = dispensa, 4 = concorrência eletrônica). */
  pncpSyncModalidades: number[];
  /** Teto de páginas por modalidade e por rodada (cada página traz até 50 editais). */
  pncpSyncMaxPages: number;
  pncpBaseUrl: string;
  /** Conta da plataforma que recebe o catálogo; sem isso vale a primeira conta da plataforma. */
  pncpSyncTenantId?: string;
};

/** Variável de ambiente sem espaços nas pontas e em minúsculas (erro comum ao colar valores). */
function clean(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function boundedInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt((value ?? '').trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function modalidades(value: string | undefined): number[] {
  const list = (value ?? '')
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((code) => Number.isInteger(code) && code >= 1 && code <= 20);
  return list.length ? [...new Set(list)] : [6, 8, 4];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const jwtSecret = env.JWT_SECRET;
  const missing: string[] = [];
  if (!jwtSecret && nodeEnv !== 'test') missing.push('JWT_SECRET');
  if (nodeEnv === 'production' && !env.DATABASE_URL) missing.push('DATABASE_URL');
  if (missing.length) {
    throw new Error(`Variáveis obrigatórias ausentes no core-api: ${missing.join(', ')}`);
  }

  const signupEnabled = clean(env.SIGNUP_ENABLED) === 'true';
  const emailProvider =
    clean(env.EMAIL_PROVIDER) === 'smtp'
      ? 'smtp'
      : clean(env.EMAIL_PROVIDER) === 'disabled'
        ? 'disabled'
        : 'fake';
  if (nodeEnv === 'production' && emailProvider === 'fake') {
    throw new Error('EMAIL_PROVIDER=fake é proibido em produção');
  }
  if (nodeEnv === 'production' && emailProvider === 'disabled' && signupEnabled) {
    throw new Error(
      'Configuração inválida em produção: EMAIL_PROVIDER=disabled não pode ser usado com SIGNUP_ENABLED=true. Configure SMTP antes de habilitar o cadastro aberto ou defina SIGNUP_ENABLED=false.',
    );
  }
  if (nodeEnv === 'production' && emailProvider === 'smtp') {
    const smtpMissing = ['SMTP_HOST', 'SMTP_FROM'].filter((variable) => !env[variable]);
    if (smtpMissing.length) {
      throw new Error(`Variáveis obrigatórias ausentes no core-api: ${smtpMissing.join(', ')}`);
    }
  }

  const config: RuntimeConfig = {
    port: Number(env.CORE_API_PORT ?? 3001),
    jwtSecret: jwtSecret ?? 'test-only-secret',
    jwtTtlSeconds: Number(env.JWT_TTL_SECONDS ?? 3600),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? env.APP_URL ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    nodeEnv,
    signupEnabled,
    emailProvider,
    smtpPort: Number(env.SMTP_PORT ?? 587),
    alertEngineEnabled: clean(env.ALERT_ENGINE_ENABLED) !== 'false',
    alertEngineIntervalSeconds: Math.max(
      60,
      Number(env.ALERT_ENGINE_INTERVAL_SECONDS ?? 300) || 300,
    ),
    pncpSyncEnabled: clean(env.PNCP_SYNC_ENABLED) !== 'false',
    pncpSyncIntervalMinutes: boundedInt(env.PNCP_SYNC_INTERVAL_MINUTES, 30, 5, 1440),
    pncpSyncDays: boundedInt(env.PNCP_SYNC_DAYS, 2, 1, 30),
    pncpSyncModalidades: modalidades(env.PNCP_SYNC_MODALIDADES),
    pncpSyncMaxPages: boundedInt(env.PNCP_SYNC_MAX_PAGES, 40, 1, 200),
    pncpBaseUrl: (env.PNCP_BASE_URL?.trim() || 'https://pncp.gov.br/api/consulta').replace(
      /\/$/,
      '',
    ),
    termsVersion: env.TERMS_VERSION ?? '2026-10-17-draft',
    privacyVersion: env.PRIVACY_VERSION ?? '2026-10-17-draft',
  };
  if (env.PNCP_SYNC_TENANT_ID?.trim()) config.pncpSyncTenantId = env.PNCP_SYNC_TENANT_ID.trim();
  if (env.JWT_ISSUER) config.jwtIssuer = env.JWT_ISSUER;
  if (env.JWT_AUDIENCE) config.jwtAudience = env.JWT_AUDIENCE;
  if (env.DATABASE_URL) config.databaseUrl = env.DATABASE_URL;
  if (env.REDIS_URL) config.redisUrl = env.REDIS_URL;
  if (env.APP_URL) config.appUrl = env.APP_URL;
  if (env.API_URL) config.apiUrl = env.API_URL;
  if (env.SITE_URL) config.siteUrl = env.SITE_URL;
  if (env.SMTP_HOST) config.smtpHost = env.SMTP_HOST;
  if (env.SMTP_USER) config.smtpUser = env.SMTP_USER;
  if (env.SMTP_PASSWORD) config.smtpPassword = env.SMTP_PASSWORD;
  if (env.SMTP_FROM) config.emailFrom = env.SMTP_FROM;
  return config;
}
