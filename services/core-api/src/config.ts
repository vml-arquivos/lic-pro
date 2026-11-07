import type { Area } from '@licitecomigo/shared';
export type RuntimeConfig = {
  port: number;
  jwtSecret: string;
  jwtIssuer?: string;
  jwtAudience?: string;
  jwtTtlSeconds: number;
  databaseUrl?: string;
  redisUrl?: string;
  appUrl?: string;
  /** Endereço de cada painel (PANEL_URL_*). Vazio = um endereço só (APP_URL). */
  panelUrls: Partial<Record<Area, string>>;
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
  /** Códigos de modalidade do PNCP (6 pregão eletrônico, 8 dispensa, 4 concorrência eletrônica, 5 concorrência presencial, 7 pregão presencial, 9 inexigibilidade). */
  pncpSyncModalidades: number[];
  /** Teto de páginas por modalidade e por rodada (cada página traz até 50 editais). */
  pncpSyncMaxPages: number;
  pncpBaseUrl: string;
  /** API de detalhes do PNCP (itens e documentos de uma contratação). */
  pncpApiBaseUrl: string;
  /** Conta da plataforma que recebe o catálogo; sem isso vale a primeira conta da plataforma. */
  pncpSyncTenantId?: string;
  /** Compras.gov.br Dados Abertos (pesquisa de preços de referência). */
  comprasBaseUrl: string;
  /** Cobrança (Asaas). Sem chave e sem token do webhook, a venda fica desligada. */
  asaasApiKey?: string;
  asaasWebhookToken?: string;
  asaasEnv: 'sandbox' | 'production';
  asaasBaseUrl: string;
  /** Verdadeiro quando a cobrança está pronta: chave da API e token do webhook definidos. */
  billingEnabled: boolean;
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
  return list.length ? [...new Set(list)] : [6, 8, 4, 5, 7, 9];
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

  const asaasEnv = clean(env.ASAAS_ENV) === 'production' ? 'production' : 'sandbox';
  const asaasApiKey = (env.ASAAS_API_KEY ?? '').trim();
  const asaasWebhookToken = (env.ASAAS_WEBHOOK_TOKEN ?? '').trim();
  if (nodeEnv === 'production' && asaasApiKey && asaasWebhookToken.length < 16) {
    throw new Error(
      'ASAAS_WEBHOOK_TOKEN é obrigatório (mínimo de 16 caracteres) quando ASAAS_API_KEY está definida.',
    );
  }

  const config: RuntimeConfig = {
    port: Number(env.CORE_API_PORT ?? 3001),
    jwtSecret: jwtSecret ?? 'test-only-secret',
    jwtTtlSeconds: Number(env.JWT_TTL_SECONDS ?? 3600),
    panelUrls: readPanelUrls(env),
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
    pncpApiBaseUrl: (env.PNCP_API_BASE_URL?.trim() || 'https://pncp.gov.br/pncp-api/v1').replace(
      /\/$/,
      '',
    ),
    comprasBaseUrl: (
      env.COMPRAS_GOV_BASE_URL?.trim() || 'https://dadosabertos.compras.gov.br'
    ).replace(/\/$/, ''),
    asaasEnv,
    asaasBaseUrl: (
      env.ASAAS_BASE_URL?.trim() ||
      (asaasEnv === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3')
    ).replace(/\/$/, ''),
    billingEnabled: Boolean(asaasApiKey && asaasWebhookToken.length >= 16),
    termsVersion: env.TERMS_VERSION ?? '2026-10-17-draft',
    privacyVersion: env.PRIVACY_VERSION ?? '2026-10-17-draft',
  };
  if (asaasApiKey) config.asaasApiKey = asaasApiKey;
  if (asaasWebhookToken) config.asaasWebhookToken = asaasWebhookToken;
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

const PANEL_ENV: Record<Area, string> = {
  administracao: 'PANEL_URL_ADMIN',
  empresa: 'PANEL_URL_EMPRESA',
  aluno: 'PANEL_URL_ALUNO',
  mentor: 'PANEL_URL_MENTOR',
};

function readPanelUrls(env: NodeJS.ProcessEnv): Partial<Record<Area, string>> {
  const urls: Partial<Record<Area, string>> = {};
  for (const [area, key] of Object.entries(PANEL_ENV) as [Area, string][]) {
    const raw = env[key]?.trim();
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.protocol === 'https:' || url.protocol === 'http:') urls[area] = url.origin;
    } catch {
      // endereço inválido: ignora
    }
  }
  return urls;
}

/**
 * Endereço base para links enviados a uma pessoa. Cada área tem o seu painel; sem endereços por
 * painel, vale o APP_URL de sempre. `requested` é o painel de onde veio o pedido (repassado pelo
 * app web) e só vale se for um dos endereços configurados.
 */
export function panelBaseUrl(config: RuntimeConfig, area: Area, requested?: string | null): string {
  const hint = requested?.trim().replace(/\/+$/, '');
  if (hint && Object.values(config.panelUrls).includes(hint)) return hint;
  const own = config.panelUrls[area] ?? (area === 'mentor' ? config.panelUrls.aluno : undefined);
  return (own ?? config.appUrl ?? config.siteUrl ?? '').replace(/\/+$/, '');
}
