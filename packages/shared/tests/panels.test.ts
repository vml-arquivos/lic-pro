import { describe, expect, it } from 'vitest';
import {
  panelApiAllowed,
  panelForHost,
  panelPathAllowed,
  panelPathPublic,
  panelUrlForRole,
  parsePanels,
  roleAllowedOnPanel,
} from '../src/panels.js';

const all = parsePanels({
  PANEL_URL_ADMIN: 'https://admin.licite.test',
  PANEL_URL_EMPRESA: 'https://app.licite.test/',
  PANEL_URL_ALUNO: 'https://aluno.licite.test',
});
const withMentor = parsePanels({
  PANEL_URL_ADMIN: 'https://admin.licite.test',
  PANEL_URL_EMPRESA: 'https://app.licite.test',
  PANEL_URL_ALUNO: 'https://aluno.licite.test',
  PANEL_URL_MENTOR: 'https://mentor.licite.test',
});

describe('painéis por endereço', () => {
  it('lê só endereços válidos e tira a barra final', () => {
    expect(all.empresa?.url).toBe('https://app.licite.test');
    expect(parsePanels({ PANEL_URL_ADMIN: 'não é url', PANEL_URL_ALUNO: 'ftp://x.test' })).toEqual(
      {},
    );
    expect(parsePanels({})).toEqual({});
  });

  it('descobre o painel pelo endereço, ignorando maiúsculas', () => {
    expect(panelForHost(all, 'ADMIN.licite.test')).toBe('administracao');
    expect(panelForHost(all, 'app.licite.test')).toBe('empresa');
    expect(panelForHost(all, '10.0.0.5:3000')).toBeNull();
    expect(panelForHost(all, null)).toBeNull();
  });

  it('só a equipe entra em qualquer painel; os demais, só no próprio', () => {
    expect(roleAllowedOnPanel(all, 'administracao', 'plataforma')).toBe(true);
    expect(roleAllowedOnPanel(all, 'empresa', 'plataforma')).toBe(true);
    expect(roleAllowedOnPanel(all, 'administracao', 'admin')).toBe(false);
    expect(roleAllowedOnPanel(all, 'administracao', 'aluno')).toBe(false);
    expect(roleAllowedOnPanel(all, 'empresa', 'admin')).toBe(true);
    expect(roleAllowedOnPanel(all, 'empresa', 'operador')).toBe(true);
    expect(roleAllowedOnPanel(all, 'empresa', 'aluno')).toBe(false);
    expect(roleAllowedOnPanel(all, 'empresa', 'mentor')).toBe(false);
    expect(roleAllowedOnPanel(all, 'aluno', 'aluno')).toBe(true);
    expect(roleAllowedOnPanel(all, 'aluno', 'admin')).toBe(false);
  });

  it('sem endereço de Mentor, o mentor usa o painel do Aluno; com endereço, não', () => {
    expect(roleAllowedOnPanel(all, 'aluno', 'mentor')).toBe(true);
    expect(roleAllowedOnPanel(withMentor, 'aluno', 'mentor')).toBe(false);
    expect(roleAllowedOnPanel(withMentor, 'mentor', 'mentor')).toBe(true);
    expect(panelUrlForRole(all, 'mentor')).toBe('https://aluno.licite.test');
    expect(panelUrlForRole(withMentor, 'mentor')).toBe('https://mentor.licite.test');
    expect(panelUrlForRole(all, 'operador')).toBe('https://app.licite.test');
  });

  it('cada painel só abre as próprias páginas', () => {
    expect(panelPathAllowed(all, 'administracao', '/admin/assinantes')).toBe(true);
    expect(panelPathAllowed(all, 'administracao', '/oportunidades')).toBe(false);
    expect(panelPathAllowed(all, 'administracao', '/plano-30-dias')).toBe(false);
    expect(panelPathAllowed(all, 'administracao', '/mentor')).toBe(false);
    expect(panelPathAllowed(all, 'empresa', '/admin')).toBe(false);
    expect(panelPathAllowed(all, 'empresa', '/leads')).toBe(false);
    expect(panelPathAllowed(all, 'empresa', '/oportunidades/abc')).toBe(true);
    expect(panelPathAllowed(all, 'empresa', '/assinatura')).toBe(true);
    expect(panelPathAllowed(all, 'empresa', '/curso')).toBe(false);
    expect(panelPathAllowed(all, 'empresa', '/plano-30-dias')).toBe(false);
    expect(panelPathAllowed(all, 'aluno', '/plano-30-dias')).toBe(true);
    expect(panelPathAllowed(all, 'aluno', '/praticar/123')).toBe(true);
    expect(panelPathAllowed(all, 'aluno', '/curso')).toBe(true);
    expect(panelPathAllowed(all, 'aluno', '/oportunidades')).toBe(false);
    expect(panelPathAllowed(all, 'aluno', '/assinatura')).toBe(false);
    expect(panelPathAllowed(all, 'aluno', '/admin')).toBe(false);
    expect(panelPathAllowed(all, 'aluno', '/mentor')).toBe(true);
    expect(panelPathAllowed(withMentor, 'aluno', '/mentor')).toBe(false);
    expect(panelPathAllowed(withMentor, 'mentor', '/mentor/devolutivas')).toBe(true);
    expect(panelPathAllowed(withMentor, 'mentor', '/plano-30-dias')).toBe(false);
  });

  it('páginas de entrada e de saúde abrem em todos; caminho desconhecido não abre', () => {
    for (const panel of ['administracao', 'empresa', 'aluno'] as const) {
      for (const path of ['/', '/login', '/convite', '/password-reset', '/health', '/ready']) {
        expect(panelPathAllowed(all, panel, path)).toBe(true);
      }
      expect(panelPathAllowed(all, panel, '/pagina-que-nao-existe')).toBe(false);
    }
  });

  it('a Administração não tem páginas públicas; empresa e aluno mantêm Radar e Academia abertos', () => {
    expect(panelPathPublic('administracao', '/radar')).toBe(false);
    expect(panelPathPublic('administracao', '/login')).toBe(true);
    expect(panelPathPublic('empresa', '/radar')).toBe(true);
    expect(panelPathPublic('aluno', '/curso')).toBe(true);
    expect(panelPathPublic('empresa', '/oportunidades')).toBe(false);
  });

  it('as rotas de administração da API só existem no painel da Administração', () => {
    expect(panelApiAllowed('administracao', '/platform/companies')).toBe(true);
    expect(panelApiAllowed('empresa', '/platform/companies')).toBe(false);
    expect(panelApiAllowed('aluno', '/admin/leads')).toBe(false);
    expect(panelApiAllowed('aluno', '/operations/ingest')).toBe(false);
    expect(panelApiAllowed('empresa', '/opportunities')).toBe(true);
    expect(panelApiAllowed('empresa', '/administrativo-x')).toBe(true);
  });
});
