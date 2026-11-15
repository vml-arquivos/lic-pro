import { beforeEach, describe, expect, it } from 'vitest';
import {
  consultarCep,
  consultarCnpj,
  limparCacheDeConsultas,
  limparLimitesDeConsulta,
} from '../src/lookup.js';
import { buildApp } from '../src/server.js';

const CNPJ = '11222333000181';

const brasilApiCnpj = {
  cnpj: CNPJ,
  razao_social: 'EMPRESA EXEMPLO COMERCIO LTDA',
  nome_fantasia: 'EXEMPLO LICITACOES',
  descricao_situacao_cadastral: 'ATIVA',
  data_inicio_atividade: '2015-03-10',
  natureza_juridica: 'Sociedade Empresária Limitada',
  cnae_fiscal: 4751201,
  cnae_fiscal_descricao: 'COMERCIO VAREJISTA DE EQUIPAMENTOS DE INFORMATICA',
  cep: '74000100',
  descricao_tipo_de_logradouro: 'AVENIDA',
  logradouro: 'GOIAS',
  numero: '1200',
  complemento: 'SALA 4',
  bairro: 'CENTRO',
  municipio: 'GOIANIA',
  uf: 'GO',
  ddd_telefone_1: '6232221111',
  email: 'CONTATO@EXEMPLO.COM.BR',
  porte: 'EMPRESA DE PEQUENO PORTE',
  opcao_pelo_mei: false,
};

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  limparCacheDeConsultas();
  limparLimitesDeConsulta();
});

describe('consulta de CNPJ', () => {
  it('normaliza a resposta da BrasilAPI', async () => {
    const urls: string[] = [];
    const result = await consultarCnpj('11.222.333/0001-81', {
      fetchImpl: async (url) => {
        urls.push(url);
        return respond(200, brasilApiCnpj);
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(urls).toEqual([`https://brasilapi.com.br/api/cnpj/v1/${CNPJ}`]);
    expect(result.data).toMatchObject({
      cnpj: CNPJ,
      razao_social: 'EMPRESA EXEMPLO COMERCIO LTDA',
      nome_fantasia: 'Exemplo Licitacoes',
      porte: 'pequena',
      ativa: true,
      data_abertura: '2015-03-10',
      cnae_principal: '4751201',
      cep: '74000100',
      logradouro: 'Avenida Goias',
      numero: '1200',
      bairro: 'Centro',
      cidade: 'Goiania',
      uf: 'GO',
      telefone: '6232221111',
      email: 'contato@exemplo.com.br',
    });
  });

  it('recusa CNPJ com dígito errado sem chamar ninguém', async () => {
    let chamadas = 0;
    const result = await consultarCnpj('11.222.333/0001-82', {
      fetchImpl: async () => {
        chamadas += 1;
        return respond(200, brasilApiCnpj);
      },
    });
    expect(result).toMatchObject({ ok: false, erro: 'invalido' });
    expect(chamadas).toBe(0);
  });

  it('usa a fonte de reserva quando a primeira falha e guarda em cache', async () => {
    let chamadas = 0;
    const fetchImpl = async (url: string) => {
      chamadas += 1;
      if (url.includes('brasilapi')) throw new Error('fora do ar');
      return respond(200, {
        razao_social: 'EMPRESA RESERVA SA',
        porte: { descricao: 'Demais' },
        natureza_juridica: { descricao: 'Sociedade Anônima' },
        estabelecimento: {
          nome_fantasia: null,
          situacao_cadastral: 'Baixada',
          data_inicio_atividade: '2001-01-02',
          atividade_principal: {
            subclasse: '6201-5/01',
            descricao: 'Desenvolvimento de programas',
          },
          cep: '01001000',
          tipo_logradouro: 'PRAÇA',
          logradouro: 'DA SE',
          numero: 'S/N',
          bairro: 'SE',
          cidade: { nome: 'São Paulo' },
          estado: { sigla: 'SP' },
          ddd1: '11',
          telefone1: '999998888',
          email: null,
        },
      });
    };
    const first = await consultarCnpj(CNPJ, { fetchImpl });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.fonte).toBe('cnpj.ws');
    expect(first.data).toMatchObject({
      razao_social: 'EMPRESA RESERVA SA',
      porte: 'media',
      ativa: false,
      situacao: 'Baixada',
      cnae_principal: '6201501',
      logradouro: 'Praça da Se',
      uf: 'SP',
      telefone: '11999998888',
    });
    const antes = chamadas;
    const second = await consultarCnpj(CNPJ, { fetchImpl });
    expect(second.ok && second.cache).toBe(true);
    expect(chamadas).toBe(antes);
  });

  it('diferencia "não encontrado" de "fonte fora do ar"', async () => {
    const naoAcha = await consultarCnpj(CNPJ, { fetchImpl: async () => respond(404, {}) });
    expect(naoAcha).toMatchObject({ ok: false, erro: 'nao_encontrado' });
    limparCacheDeConsultas();
    const fora = await consultarCnpj(CNPJ, {
      fetchImpl: async () => {
        throw new Error('rede');
      },
    });
    expect(fora).toMatchObject({ ok: false, erro: 'indisponivel' });
    // falha de rede não fica guardada: a próxima tentativa consulta de novo
    const volta = await consultarCnpj(CNPJ, { fetchImpl: async () => respond(200, brasilApiCnpj) });
    expect(volta.ok).toBe(true);
  });
});

describe('consulta de CEP', () => {
  it('normaliza a BrasilAPI e cai para o ViaCEP', async () => {
    const ok = await consultarCep('74000-100', {
      fetchImpl: async () =>
        respond(200, {
          cep: '74000100',
          state: 'GO',
          city: 'Goiânia',
          neighborhood: 'Centro',
          street: 'Avenida Goiás',
        }),
    });
    expect(ok.ok && ok.data).toEqual({
      cep: '74000100',
      logradouro: 'Avenida Goiás',
      bairro: 'Centro',
      cidade: 'Goiânia',
      uf: 'GO',
    });
    limparCacheDeConsultas();
    const reserva = await consultarCep('01001000', {
      fetchImpl: async (url) => {
        if (url.includes('brasilapi')) return respond(500, {});
        return respond(200, {
          logradouro: 'Praça da Sé',
          bairro: 'Sé',
          localidade: 'São Paulo',
          uf: 'SP',
        });
      },
    });
    expect(reserva.ok && reserva.fonte).toBe('viacep');
  });

  it('recusa CEP inválido e trata CEP inexistente', async () => {
    expect(await consultarCep('123')).toMatchObject({ ok: false, erro: 'invalido' });
    const inexistente = await consultarCep('74000999', {
      fetchImpl: async (url) =>
        url.includes('viacep') ? respond(200, { erro: true }) : respond(404, {}),
    });
    expect(inexistente).toMatchObject({ ok: false, erro: 'nao_encontrado' });
  });
});

describe('rotas /lookup', () => {
  const build = () =>
    buildApp({
      jwtSecret: 'test-secret',
      logger: false,
      lookup: { fetchImpl: async () => respond(200, brasilApiCnpj) },
    });

  it('exige sessão', async () => {
    const app = build();
    await app.ready();
    const response = await app.inject({ method: 'GET', url: `/lookup/cnpj/${CNPJ}` });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('responde com os dados e com o erro certo para CNPJ inválido', async () => {
    const app = build();
    await app.ready();
    const token = app.jwt.sign({
      sub: '00000000-0000-4000-8000-000000000001',
      tenantId: '00000000-0000-4000-8000-000000000002',
      role: 'admin',
    });
    const headers = { authorization: `Bearer ${token}` };
    const ok = await app.inject({ method: 'GET', url: `/lookup/cnpj/${CNPJ}`, headers });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().data.razao_social).toBe('EMPRESA EXEMPLO COMERCIO LTDA');
    const ruim = await app.inject({ method: 'GET', url: '/lookup/cnpj/11222333000182', headers });
    expect(ruim.statusCode).toBe(422);
    expect(ruim.json().error).toBe('invalido');
    await app.close();
  });
});
