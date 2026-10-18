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
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const jwtSecret = env.JWT_SECRET;
  const missing: string[] = [];
  if (!jwtSecret && nodeEnv !== 'test') missing.push('JWT_SECRET');
  if (nodeEnv === 'production' && !env.DATABASE_URL) missing.push('DATABASE_URL');
  if (missing.length) {
    throw new Error(`Variáveis obrigatórias ausentes no core-api: ${missing.join(', ')}`);
  }

  const emailProvider = env.EMAIL_PROVIDER === 'smtp' ? 'smtp' : env.EMAIL_PROVIDER === 'disabled' ? 'disabled' : 'fake';
  if (nodeEnv === 'production' && emailProvider === 'fake') {
    throw new Error('EMAIL_PROVIDER=fake é proibido em produção');
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
    signupEnabled: env.SIGNUP_ENABLED === 'true',
    emailProvider,
    smtpPort: Number(env.SMTP_PORT ?? 587),
    termsVersion: env.TERMS_VERSION ?? '2026-10-17-draft',
    privacyVersion: env.PRIVACY_VERSION ?? '2026-10-17-draft',
  };
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
