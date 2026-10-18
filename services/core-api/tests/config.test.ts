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
});
