import { describe, expect, it } from 'vitest';
import {
  areasForPanel,
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

const withColaborador = parsePanels({
  PANEL_URL_ADMIN: 'https://admin.licite.test',
  PANEL_URL_EMPRESA: 'https://app.licite.test',
  PANEL_URL_ALUNO: 'https://aluno.licite.test',
  PANEL_URL_COLABORADOR: 'https://equipe.licite.test',
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

  it('sem endereço de Colaborador, o colaborador usa o painel da Administração; com endereço, não', () => {
    expect(roleAllowedOnPanel(all, 'administracao', 'colaborador')).toBe(true);
    expect(roleAllowedOnPanel(withColaborador, 'administracao', 'colaborador')).toBe(false);
    expect(roleAllowedOnPanel(withColaborador, 'colaborador', 'colaborador')).toBe(true);
    expect(roleAllowedOnPanel(all, 'empresa', 'colaborador')).toBe(false);
    expect(roleAllowedOnPanel(all, 'aluno', 'colaborador')).toBe(false);
    expect(panelUrlForRole(all, 'colaborador')).toBe('https://admin.licite.test');
    expect(panelUrlForRole(withColaborador, 'colaborador')).toBe('https://equipe.licite.test');
    expect(panelPathAllowed(all, 'administracao', '/oportunidades')).toBe(true);
    expect(panelPathAllowed(all, 'administracao', '/assinatura')).toBe(false);
  });

  it('cada painel só abre as próprias páginas', () => {
    expect(panelPathAllowed(all, 'administracao', '/admin/assinantes')).toBe(true);
    expect(panelPathAllowed(withColaborador, 'administracao', '/oportunidades')).toBe(false);
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

const withCurso = parsePanels({
  PANEL_URL_ADMIN: 'https://admin.licite.test',
  PANEL_URL_EMPRESA: 'https://app.licite.test',
  PANEL_URL_ALUNO: 'https://mentoria.licite.test',
  PANEL_URL_CURSO: 'https://gestao.licite.test',
});

describe('módulo Curso: administração própria', () => {
  it('sem endereço próprio, a Administração do curso vive no endereço do Aluno', () => {
    expect(areasForPanel(all, 'aluno')).toEqual(['curso', 'aluno', 'mentor']);
    expect(areasForPanel(withCurso, 'aluno')).toEqual(['aluno', 'mentor']);
    expect(areasForPanel(withCurso, 'curso')).toEqual(['curso']);
    expect(panelPathAllowed(all, 'aluno', '/gestao/financeiro')).toBe(true);
    expect(panelPathAllowed(all, 'aluno', '/gestao/usuarios/abc')).toBe(true);
    expect(panelPathAllowed(withCurso, 'aluno', '/gestao/alunos')).toBe(false);
    expect(panelPathAllowed(withCurso, 'curso', '/gestao/alunos')).toBe(true);
    expect(panelPathAllowed(withCurso, 'curso', '/mentor/encontros')).toBe(true);
    expect(panelUrlForRole(all, 'plataforma')).toBe('https://admin.licite.test');
  });

  it('o módulo Profissional nunca abre as páginas do Curso, e o inverso também', () => {
    for (const path of ['/gestao', '/gestao/financeiro', '/gestao/leads']) {
      expect(panelPathAllowed(all, 'administracao', path), path).toBe(false);
      expect(panelPathAllowed(all, 'empresa', path), path).toBe(false);
      expect(panelPathAllowed(withCurso, 'curso', path), path).toBe(true);
    }
    for (const path of ['/admin', '/admin/financeiro', '/admin/assinantes', '/leads']) {
      expect(panelPathAllowed(all, 'aluno', path), path).toBe(false);
      expect(panelPathAllowed(withCurso, 'curso', path), path).toBe(false);
      expect(panelPathAllowed(all, 'administracao', path), path).toBe(true);
    }
  });

  it('só a equipe entra no endereço da Administração do curso', () => {
    expect(roleAllowedOnPanel(withCurso, 'curso', 'plataforma')).toBe(true);
    for (const role of ['admin', 'operador', 'aluno', 'mentor', 'colaborador']) {
      expect(roleAllowedOnPanel(withCurso, 'curso', role), role).toBe(false);
    }
    expect(roleAllowedOnPanel(all, 'aluno', 'aluno')).toBe(true);
    expect(roleAllowedOnPanel(withCurso, 'aluno', 'aluno')).toBe(true);
  });

  it('a Administração do curso não tem páginas públicas', () => {
    expect(panelPathPublic('curso', '/radar')).toBe(false);
    expect(panelPathPublic('curso', '/gestao')).toBe(false);
    expect(panelPathPublic('curso', '/login')).toBe(true);
  });

  it('as rotas de administração da API existem onde a administração do curso vive', () => {
    expect(panelApiAllowed('curso', '/admin/financeiro', withCurso)).toBe(true);
    expect(panelApiAllowed('aluno', '/admin/financeiro', all)).toBe(true);
    expect(panelApiAllowed('aluno', '/admin/financeiro', withCurso)).toBe(false);
    expect(panelApiAllowed('empresa', '/admin/financeiro', all)).toBe(false);
  });
});
