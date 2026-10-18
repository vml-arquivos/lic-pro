export function register(): void {
  if (process.env.APP_ENV !== 'production') return;
  const required = ['SITE_URL', 'APP_URL', 'CORE_API_INTERNAL_URL'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length)
    throw new Error(`Variáveis obrigatórias ausentes no site: ${missing.join(', ')}`);
}
