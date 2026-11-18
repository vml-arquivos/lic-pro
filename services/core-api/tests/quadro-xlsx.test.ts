import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/server.js';

describe('Quadro de decisão: planilha', () => {
  const corpo = {
    titulo: 'Quadro de decisão',
    cabecalho: ['Edital', 'Valor'],
    linhas: [['90001/2026', 1500]],
    larguras: [14, 16],
  };

  it('exige login', async () => {
    const app = buildApp({ jwtSecret: 'test-secret', logger: false });
    const resposta = await app.inject({
      method: 'POST',
      url: '/analise/quadro/xlsx',
      payload: corpo,
    });
    expect(resposta.statusCode).toBe(401);
    await app.close();
  });

  it('devolve um arquivo .xlsx para quem tem acesso', async () => {
    const app = buildApp({ jwtSecret: 'test-secret', logger: false });
    await app.ready();
    const token = app.jwt.sign({
      sub: '00000000-0000-4000-8000-000000000001',
      tenantId: '00000000-0000-4000-8000-000000000002',
      role: 'admin',
    });
    const resposta = await app.inject({
      method: 'POST',
      url: '/analise/quadro/xlsx',
      headers: { authorization: `Bearer ${token}` },
      payload: corpo,
    });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(resposta.headers['content-disposition']).toContain('quadro-de-decisao-');
    expect(resposta.rawPayload.subarray(0, 2).toString()).toBe('PK');
    await app.close();
  });

  it('recusa planilha sem cabeçalho', async () => {
    const app = buildApp({ jwtSecret: 'test-secret', logger: false });
    await app.ready();
    const token = app.jwt.sign({
      sub: '00000000-0000-4000-8000-000000000001',
      tenantId: '00000000-0000-4000-8000-000000000002',
      role: 'admin',
    });
    const resposta = await app.inject({
      method: 'POST',
      url: '/analise/quadro/xlsx',
      headers: { authorization: `Bearer ${token}` },
      payload: { ...corpo, cabecalho: [] },
    });
    expect(resposta.statusCode).toBe(400);
    await app.close();
  });
});
