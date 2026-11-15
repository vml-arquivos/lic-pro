/**
 * Endereços dos painéis. Cada tipo de conta entra pelo seu endereço (PANEL_URL_*); sem eles,
 * vale o APP_URL de sempre.
 */
function clean(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '');
}

/** Painel da empresa (onde entram os assinantes). */
export function companyPanelUrl(): string {
  return clean(process.env.PANEL_URL_EMPRESA) || clean(process.env.APP_URL);
}

/** Painel do aluno, só quando existir endereço próprio. */
export function studentPanelUrl(): string {
  return clean(process.env.PANEL_URL_ALUNO) || clean(process.env.APP_URL);
}

export function hasSeparateStudentPanel(): boolean {
  return Boolean(clean(process.env.PANEL_URL_ALUNO));
}
