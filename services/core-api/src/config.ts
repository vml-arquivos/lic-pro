export type RuntimeConfig = {
  port: number;
  jwtSecret: string;
  databaseUrl?: string;
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
    nodeEnv: env.NODE_ENV ?? 'development',
  };
  if (env.DATABASE_URL) config.databaseUrl = env.DATABASE_URL;
  return config;
}
