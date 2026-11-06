import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const productionEnv = {
  NODE_ENV: 'production',
  JWT_SECRET: 'production-test-secret',
  DATABASE_URL: 'postgresql://licite_core:test@localhost:5432/licite_comigo',
};

describe('core-api configuration', () => {
  it('rejects disabled email with open signup in production', () => {
    expect(() =>
      loadConfig({
        ...productionEnv,
        EMAIL_PROVIDER: 'disabled',
        SIGNUP_ENABLED: 'true',
      }),
    ).toThrow('EMAIL_PROVIDER=disabled não pode ser usado com SIGNUP_ENABLED=true');
  });

  it('allows disabled email when signup is closed', () => {
    const config = loadConfig({
      ...productionEnv,
      EMAIL_PROVIDER: 'disabled',
      SIGNUP_ENABLED: 'false',
    });

    expect(config.emailProvider).toBe('disabled');
    expect(config.signupEnabled).toBe(false);
  });

  it('allows open signup when SMTP is configured', () => {
    const config = loadConfig({
      ...productionEnv,
      EMAIL_PROVIDER: 'smtp',
      SIGNUP_ENABLED: 'true',
      SMTP_HOST: 'smtp.example.test',
      SMTP_FROM: 'Licite Comigo <no-reply@example.test>',
    });

    expect(config.emailProvider).toBe('smtp');
    expect(config.signupEnabled).toBe(true);
  });

  it('aceita valores colados com espaços e em maiúsculas', () => {
    const config = loadConfig({
      ...productionEnv,
      EMAIL_PROVIDER: ' Disabled ',
      SIGNUP_ENABLED: ' false ',
    });
    expect(config.emailProvider).toBe('disabled');
    expect(config.signupEnabled).toBe(false);
  });

  it('coleta do PNCP: padrões seguros e limites', () => {
    const defaults = loadConfig({ ...productionEnv, EMAIL_PROVIDER: 'disabled' });
    expect(defaults).toMatchObject({
      pncpSyncEnabled: true,
      pncpSyncIntervalMinutes: 30,
      pncpSyncDays: 2,
      pncpSyncModalidades: [6, 8, 4, 5, 7, 9],
      pncpSyncMaxPages: 40,
      pncpBaseUrl: 'https://pncp.gov.br/api/consulta',
    });
    const custom = loadConfig({
      ...productionEnv,
      EMAIL_PROVIDER: 'disabled',
      PNCP_SYNC_ENABLED: 'false',
      PNCP_SYNC_INTERVAL_MINUTES: '1',
      PNCP_SYNC_DAYS: '99',
      PNCP_SYNC_MODALIDADES: '6, 6, abc, 99, 9',
      PNCP_BASE_URL: 'https://pncp.example.test/api/consulta/',
    });
    expect(custom).toMatchObject({
      pncpSyncEnabled: false,
      pncpSyncIntervalMinutes: 5,
      pncpSyncDays: 30,
      pncpSyncModalidades: [6, 9],
      pncpBaseUrl: 'https://pncp.example.test/api/consulta',
    });
  });
  it('cobrança (Asaas): desligada sem chave e exige token do webhook em produção', () => {
    const off = loadConfig({ ...productionEnv, EMAIL_PROVIDER: 'disabled' });
    expect(off.billingEnabled).toBe(false);
    expect(off.asaasEnv).toBe('sandbox');
    expect(off.asaasBaseUrl).toBe('https://api-sandbox.asaas.com/v3');

    const on = loadConfig({
      ...productionEnv,
      EMAIL_PROVIDER: 'disabled',
      ASAAS_API_KEY: ' chave ',
      ASAAS_WEBHOOK_TOKEN: 'token-bem-comprido-123',
      ASAAS_ENV: ' Production ',
    });
    expect(on).toMatchObject({
      billingEnabled: true,
      asaasApiKey: 'chave',
      asaasEnv: 'production',
      asaasBaseUrl: 'https://api.asaas.com/v3',
    });
    expect(() =>
      loadConfig({ ...productionEnv, EMAIL_PROVIDER: 'disabled', ASAAS_API_KEY: 'chave' }),
    ).toThrow(/ASAAS_WEBHOOK_TOKEN/);
  });
});
