export type RuntimeConfig = {
  port: number;
  jwtSecret: string;
  databaseUrl?: string;
  redisUrl?: string;
  appUrl?: string;
  apiUrl?: string;
  wsUrl?: string;
  allowedOrigins: string[];
  nodeEnv: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret && env.NODE_ENV !== 'test') {
    throw new Error('JWT_SECRET é obrigatório fora dos testes');
  }

  const config: RuntimeConfig = {
    port: Number(env.CORE_API_PORT ?? 3001),
    jwtSecret: jwtSecret ?? 'test-only-secret',
    allowedOrigins: (env.ALLOWED_ORIGINS ?? env.APP_URL ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    nodeEnv: env.NODE_ENV ?? 'development',
  };
  if (env.DATABASE_URL) config.databaseUrl = env.DATABASE_URL;
  if (env.REDIS_URL) config.redisUrl = env.REDIS_URL;
  if (env.APP_URL) config.appUrl = env.APP_URL;
  if (env.API_URL) config.apiUrl = env.API_URL;
  if (env.WS_URL) config.wsUrl = env.WS_URL;
  return config;
}
