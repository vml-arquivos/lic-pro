import { describe, expect, it } from 'vitest';
import {
  API_DOS_RECURSOS,
  AREA_MENUS,
  menuSemBloqueios,
  normalizarBloqueios,
  paginaBloqueada,
  paginaSoDoSuperadmin,
  PAINEIS_DE_RECURSOS,
  recursoDaPagina,
  RECURSOS_ACESSO,
  rotaBloqueada,
} from '../src/index';

describe('catálogo de funções bloqueáveis', () => {
  it('vem do menu e deixa de fora início, conta e equipe', () => {
    const chaves = RECURSOS_ACESSO.map((item) => item.href);
    expect(chaves).toContain('/radar');
    expect(chaves).toContain('/admin/financeiro');
    expect(chaves).toContain('/gestao/alunos');
    for (const fora of ['/painel', '/admin', '/gestao', '/conta', '/admin/equipe']) {
      expect(chaves).not.toContain(fora);
    }
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it('a tela de marcação cobre cada painel e todas as funções', () => {
    const itens = PAINEIS_DE_RECURSOS.flatMap((painel) =>
      painel.grupos.flatMap((grupo) => grupo.itens.map((item) => item.href)),
    );
    expect(new Set(itens)).toEqual(new Set(RECURSOS_ACESSO.map((item) => item.href)));
    expect(PAINEIS_DE_RECURSOS.map((painel) => painel.area)).toContain('administracao');
  });

  it('todo bloqueio tem rota de API mapeada ou é só de tela de propósito', () => {
    const sem = RECURSOS_ACESSO.map((item) => item.href).filter((href) => !API_DOS_RECURSOS[href]);
    expect(sem).toEqual([]);
    for (const chave of Object.keys(API_DOS_RECURSOS)) {
      expect(RECURSOS_ACESSO.map((item) => item.href)).toContain(chave);
    }
  });
});

describe('bloqueio de páginas e menu', () => {
  it('ignora chave inventada e repetida', () => {
    expect(normalizarBloqueios(['/radar', '/radar', '/qualquer', '/painel'])).toEqual(['/radar']);
    expect(normalizarBloqueios(undefined)).toEqual([]);
  });

  it('a função mais específica manda na página', () => {
    expect(recursoDaPagina('/mentor/encontros')).toBe('/mentor/encontros');
    expect(recursoDaPagina('/mentor/devolutivas/123')).toBe('/mentor/devolutivas');
    expect(recursoDaPagina('/radar/abc')).toBe('/radar');
    expect(recursoDaPagina('/login')).toBeNull();
    expect(paginaBloqueada(['/mentor'], '/mentor/encontros')).toBe(false);
    expect(paginaBloqueada(['/mentor'], '/mentor')).toBe(true);
    expect(paginaBloqueada(['/radar'], '/radar/edital-1?x=1')).toBe(true);
    expect(paginaBloqueada([], '/radar')).toBe(false);
  });

  it('menu perde o bloqueado e o grupo vazio; só o superadmin vê a equipe', () => {
    const admin = AREA_MENUS.administracao;
    const reduzido = menuSemBloqueios(
      admin,
      ['/admin/financeiro', '/admin/auditoria', '/admin/fontes'],
      false,
    );
    const hrefs = reduzido.flatMap((grupo) => grupo.items.map((item) => item.href));
    expect(hrefs).not.toContain('/admin/financeiro');
    expect(hrefs).not.toContain('/admin/equipe');
    expect(hrefs).toContain('/admin/assinantes');
    expect(reduzido.some((grupo) => grupo.label === 'Dados e controle')).toBe(false);
    const todos = menuSemBloqueios(admin, [], true).flatMap((grupo) =>
      grupo.items.map((i) => i.href),
    );
    expect(todos).toContain('/admin/equipe');
    expect(paginaSoDoSuperadmin('/admin/equipe')).toBe(true);
    expect(paginaSoDoSuperadmin('/admin/financeiro')).toBe(false);
  });
});

describe('bloqueio na API', () => {
  it('fecha a rota da função bloqueada e deixa o resto', () => {
    expect(rotaBloqueada(['/precos'], '/precos/referencia?catmat=1')).toBe(true);
    expect(rotaBloqueada(['/precos'], '/portais')).toBe(false);
    expect(rotaBloqueada([], '/precos/itens')).toBe(false);
  });

  it('rota que serve a duas telas só fecha quando as duas estão bloqueadas', () => {
    expect(rotaBloqueada(['/admin/financeiro'], '/admin/financeiro/resumo')).toBe(false);
    expect(rotaBloqueada(['/admin/financeiro', '/gestao/financeiro'], '/admin/financeiro')).toBe(
      true,
    );
    expect(rotaBloqueada(['/radar'], '/editais/1')).toBe(false);
    expect(rotaBloqueada(['/radar', '/pregoes'], '/editais/1')).toBe(true);
  });
});
