import { describe, expect, it } from 'vitest';
import {
  alvoPermitido,
  areasDoEscopo,
  decidirRota,
  tiposDeConviteVisiveis,
} from '../src/escopo-equipe.js';

const uuid = '11111111-2222-3333-4444-555555555555';

describe('escopo da equipe (regras por rota)', () => {
  it('acesso total não restringe nada', () => {
    expect(decidirRota('tudo', 'GET', '/admin/assinantes')).toEqual({ resultado: 'liberado' });
    expect(areasDoEscopo('tudo')).toContain('administracao');
    expect(areasDoEscopo('tudo')).toContain('curso');
  });

  it('cada escopo só abre as áreas do próprio módulo', () => {
    expect([...areasDoEscopo('curso')].sort()).toEqual(['aluno', 'curso', 'mentor']);
    expect([...areasDoEscopo('profissional')].sort()).toEqual([
      'administracao',
      'colaborador',
      'empresa',
    ]);
  });

  it('rotas que não são administrativas ficam como estão', () => {
    for (const escopo of ['curso', 'profissional'] as const) {
      expect(decidirRota(escopo, 'GET', '/me')).toEqual({ resultado: 'liberado' });
      expect(decidirRota(escopo, 'GET', '/editais?uf=RN')).toEqual({ resultado: 'liberado' });
      expect(decidirRota(escopo, 'POST', '/analise/simular')).toEqual({ resultado: 'liberado' });
    }
  });

  it('o escopo curso nega o que é do Painel admin', () => {
    for (const url of [
      '/admin/assinantes',
      '/admin/assinaturas/x/ajustar',
      '/admin/coleta/status',
      '/admin/alerts/run',
      '/admin/integracoes/testar',
      '/admin/users/audit',
      '/operations/ingest',
      '/platform/companies',
      '/platform/colaboradores',
      '/platform/team',
    ]) {
      expect(decidirRota('curso', 'GET', url).resultado, url).toBe('negado');
    }
  });

  it('o escopo profissional nega o que é da mentoria', () => {
    for (const url of [
      '/platform/students',
      '/platform/mentors',
      '/platform/classes',
      '/platform/materiais/x',
    ]) {
      expect(decidirRota('profissional', 'GET', url).resultado, url).toBe('negado');
    }
    expect(decidirRota('profissional', 'GET', '/platform/companies').resultado).toBe('liberado');
    expect(decidirRota('profissional', 'GET', '/platform/team').resultado).toBe('negado');
  });

  it('financeiro, planos, cupons, leads e visão geral exigem o módulo do próprio escopo', () => {
    for (const base of [
      '/admin/financeiro',
      '/admin/planos',
      '/admin/cupons',
      '/admin/leads',
      '/platform/overview',
    ]) {
      expect(decidirRota('curso', 'GET', `${base}?modulo=curso`).resultado, base).toBe('liberado');
      expect(decidirRota('curso', 'GET', `${base}?modulo=profissional`).resultado, base).toBe(
        'negado',
      );
      expect(decidirRota('curso', 'GET', base).resultado, base).toBe('negado');
      expect(
        decidirRota('profissional', 'GET', `${base}?modulo=profissional`).resultado,
        base,
      ).toBe('liberado');
      expect(decidirRota('profissional', 'GET', `${base}?modulo=curso`).resultado, base).toBe(
        'negado',
      );
    }
  });

  it('plano só é salvo com o tipo do módulo e sem sobrescrever plano do outro', () => {
    const url = '/admin/planos?modulo=curso';
    expect(decidirRota('curso', 'PUT', url, { tipo: 'assinatura', slug: 'x' }).resultado).toBe(
      'negado',
    );
    expect(
      decidirRota('curso', 'PUT', url, { tipo: 'curso', slug: 'curso-licite-comigo' }),
    ).toEqual({
      resultado: 'verificar',
      alvo: { tipo: 'plano', slug: 'curso-licite-comigo' },
    });
    expect(alvoPermitido('curso', { tipo: 'plano', slug: 'a' }, 'assinatura')).toBe(false);
    expect(alvoPermitido('curso', { tipo: 'plano', slug: 'a' }, 'curso')).toBe(true);
    expect(alvoPermitido('curso', { tipo: 'plano', slug: 'a' }, null)).toBe(true);
  });

  it('convites e usuários são conferidos pelo tipo de quem é alvo', () => {
    expect(
      decidirRota('curso', 'POST', '/platform/invitations', { tipo: 'mentor' }).resultado,
    ).toBe('liberado');
    for (const tipo of ['empresa', 'colaborador', 'equipe']) {
      expect(decidirRota('curso', 'POST', '/platform/invitations', { tipo }).resultado, tipo).toBe(
        'negado',
      );
    }
    for (const tipo of ['aluno', 'mentor', 'equipe']) {
      expect(
        decidirRota('profissional', 'POST', '/platform/invitations', { tipo }).resultado,
        tipo,
      ).toBe('negado');
    }
    expect(
      decidirRota('profissional', 'POST', '/platform/invitations', { tipo: 'empresa' }).resultado,
    ).toBe('liberado');

    expect(decidirRota('curso', 'GET', `/platform/users/${uuid}/ficha`)).toEqual({
      resultado: 'verificar',
      alvo: { tipo: 'usuario', id: uuid },
    });
    expect(alvoPermitido('curso', { tipo: 'usuario', id: uuid }, 'aluno')).toBe(true);
    expect(alvoPermitido('curso', { tipo: 'usuario', id: uuid }, 'plataforma')).toBe(false);
    expect(alvoPermitido('curso', { tipo: 'usuario', id: uuid }, 'admin')).toBe(false);
    expect(alvoPermitido('profissional', { tipo: 'usuario', id: uuid }, 'admin')).toBe(true);
    expect(alvoPermitido('profissional', { tipo: 'usuario', id: uuid }, 'plataforma')).toBe(false);
    expect(alvoPermitido('curso', { tipo: 'convite', id: uuid }, 'empresa')).toBe(false);
    expect(alvoPermitido('curso', { tipo: 'cobranca', id: uuid }, 'assinatura')).toBe(false);
    expect(alvoPermitido('curso', { tipo: 'cobranca', id: uuid }, 'curso')).toBe(true);
    expect(alvoPermitido('curso', { tipo: 'usuario', id: uuid }, null)).toBe(false);
  });

  it('rota administrativa desconhecida é negada para escopo restrito, e o banner de migrations é liberado', () => {
    expect(decidirRota('curso', 'GET', '/admin/coisa-nova').resultado).toBe('negado');
    expect(decidirRota('profissional', 'GET', '/platform/qualquer').resultado).toBe('negado');
    expect(decidirRota('curso', 'GET', '/platform/migracoes').resultado).toBe('liberado');
  });

  it('a lista de convites mostra a cada escopo só os próprios tipos', () => {
    expect(tiposDeConviteVisiveis('tudo')).toBeNull();
    expect(tiposDeConviteVisiveis('curso')).toEqual(['aluno', 'mentor']);
    expect(tiposDeConviteVisiveis('profissional')).toEqual(['empresa', 'colaborador']);
  });
});
