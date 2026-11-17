import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PORTAIS_CONHECIDOS,
  hostDoLink,
  infoDoPortal,
  portalDaLicitacao,
  slugDePortal,
} from '../src/index.js';

describe('portalDaLicitacao', () => {
  it('usa o nome informado pelo PNCP e junta variações no mesmo portal', () => {
    expect(
      portalDaLicitacao({ usuario: 'BLL - Bolsa de Licitações e Leilões do Brasil' })?.slug,
    ).toBe('bll-compras');
    expect(portalDaLicitacao({ usuario: 'Bll Compras' })?.nome).toBe('BLL Compras');
    expect(portalDaLicitacao({ usuario: 'BNC - Bolsa Nacional de Compras' })?.slug).toBe('bnc');
    expect(portalDaLicitacao({ usuario: 'Compras.gov.br' })?.nome).toBe('Compras.gov.br');
    expect(portalDaLicitacao({ usuario: 'COMPRASNET 4.0' })?.slug).toBe('compras-gov-br');
  });

  it('cai para o link de origem quando o nome não ajuda', () => {
    const p = portalDaLicitacao({ link: 'https://www.portaldecompraspublicas.com.br/18/x?id=1' });
    expect(p).toEqual({
      slug: 'portal-de-compras-publicas',
      nome: 'Portal de Compras Públicas',
      conhecido: true,
    });
    expect(portalDaLicitacao({ link: 'https://app.licitanet.com.br/x' })?.slug).toBe('licitanet');
  });

  it('usa o prefixo do objeto só quando é um portal conhecido', () => {
    expect(
      portalDaLicitacao({ objeto: '[Portal de Compras Públicas] - Aquisição de material' })?.slug,
    ).toBe('portal-de-compras-publicas');
    expect(portalDaLicitacao({ objeto: '[Urgente] - Aquisição de material' })).toBeNull();
  });

  it('mantém portal desconhecido com o nome do PNCP', () => {
    expect(portalDaLicitacao({ usuario: 'Sistema Próprio da Prefeitura de X' })).toEqual({
      slug: 'sistema-proprio-da-prefeitura-de-x',
      nome: 'Sistema Próprio da Prefeitura de X',
      conhecido: false,
    });
    expect(portalDaLicitacao({ link: 'https://compras.cidade.sp.gov.br/p' })?.conhecido).toBe(
      false,
    );
  });

  it('não confunde nomes curtos no meio de outras palavras', () => {
    expect(portalDaLicitacao({ usuario: 'Abnconsultoria' })?.conhecido).toBe(false);
  });

  it('volta null sem nenhuma informação', () => {
    expect(portalDaLicitacao({})).toBeNull();
    expect(portalDaLicitacao({ usuario: '  ', link: '', objeto: null })).toBeNull();
  });
});

describe('auxiliares de portal', () => {
  it('hostDoLink aceita link sem protocolo e recusa texto solto', () => {
    expect(hostDoLink('www.bnc.org.br/x')).toBe('bnc.org.br');
    expect(hostDoLink('texto qualquer')).toBeNull();
    expect(hostDoLink(null)).toBeNull();
  });

  it('slugDePortal tira acento e símbolos', () => {
    expect(slugDePortal('Licitações-e (BB)')).toBe('licitacoes-e-bb');
    expect(slugDePortal('???')).toBe('portal');
  });

  it('o catálogo tem slugs únicos e infoDoPortal encontra por nome ou slug', () => {
    const slugs = PORTAIS_CONHECIDOS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(infoDoPortal('bnc')?.site).toContain('bnc.org.br');
    expect(infoDoPortal('BLL Compras')?.slug).toBe('bll-compras');
    expect(infoDoPortal('nada')).toBeNull();
  });
});

describe('espelho em Python da ingestão', () => {
  const caminho = new URL('../../../services/ingest/src/portais.py', import.meta.url);

  it.skipIf(!existsSync(caminho))('tem os mesmos portais, nomes e endereços', () => {
    const python = readFileSync(caminho, 'utf-8');
    for (const portal of PORTAIS_CONHECIDOS) {
      expect(python, portal.slug).toContain(`"${portal.slug}"`);
      expect(python, portal.nome).toContain(`"${portal.nome}"`);
      for (const host of portal.hosts) expect(python, host).toContain(`"${host}"`);
      for (const nome of portal.nomes) expect(python, nome).toContain(`"${nome}"`);
    }
  });
});
