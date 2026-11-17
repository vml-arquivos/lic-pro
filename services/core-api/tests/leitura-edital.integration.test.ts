import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import {
  CacheDeLeitura,
  chaveDoDocumento,
  escolherParaLer,
  lerDocumentos,
  urlDoPncp,
} from '../src/leitura-edital.js';
import { hashPassword } from '../src/password.js';
import { buildApp } from '../src/server.js';

const PDF_BASE64 =
  'JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDggMCBSIC9NZWRpYUJveCBbIDAgMCA1OTUuMjc1NiA4NDEuODg5OCBdIC9QYXJlbnQgNyAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNCAwIG9iago8PAovQ29udGVudHMgOSAwIFIgL01lZGlhQm94IFsgMCAwIDU5NS4yNzU2IDg0MS44ODk4IF0gL1BhcmVudCA3IDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdCj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9QYWdlTW9kZSAvVXNlTm9uZSAvUGFnZXMgNyAwIFIgL1R5cGUgL0NhdGFsb2cKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL0F1dGhvciAoYW5vbnltb3VzKSAvQ3JlYXRpb25EYXRlIChEOjIwMjYxMTE3MTgxODI1LTAzJzAwJykgL0NyZWF0b3IgKGFub255bW91cykgL0tleXdvcmRzICgpIC9Nb2REYXRlIChEOjIwMjYxMTE3MTgxODI1LTAzJzAwJykgL1Byb2R1Y2VyIChSZXBvcnRMYWIgUERGIExpYnJhcnkgLSBcKG9wZW5zb3VyY2VcKSkgCiAgL1N1YmplY3QgKHVuc3BlY2lmaWVkKSAvVGl0bGUgKHVudGl0bGVkKSAvVHJhcHBlZCAvRmFsc2UKPj4KZW5kb2JqCjcgMCBvYmoKPDwKL0NvdW50IDIgL0tpZHMgWyAzIDAgUiA0IDAgUiBdIC9UeXBlIC9QYWdlcwo+PgplbmRvYmoKOCAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCAzODIKPj4Kc3RyZWFtCkdhczJEYnRjLzEmOzlNI01FLypiZE5mOXFmOVFWP1dHNThrQGtXYlIrQk5RIUNhXDY0OywhKzYmQT4vR3F0JihYKDxEVzU4NVU6NS8kT0NOOm07TjAuJnNBIzMxcGtpWGdlaVVcQmhHKkVzUkREWmVMRF8hUDhPaFZyaTlSVSxiJ2llL25ARi9XUWNxQVI8cHFMXlYvVz9jXi1yOVRVR2MkZ0RlRVk6VUlLMTNEdHFcO3FEVjRXdE9McFhbNi1RNTdibGtmPitKVDNZTlQ/IlZfc1VlV0Y8JHE1LWwzWkI4a1A4MGs8RUxtQ0ZKYnIiJCJkR20nSzNRbF9dOi02aUkrMiVVUCU7RGU6WT8xQ08jL14iN1NAW1EzNyEvbWVHYCNTX3N0ZF9JNTJIMkwwRCxfQy9wIUhecDI+MVZMOHJbLEw5OGMwMjg6KmMiJS45Ty4pcHBNTXI6cW9CODI+RC4vNyUiL3E4I1ZJLlwjcWAmaXNJL21rZF0xblhafj5lbmRzdHJlYW0KZW5kb2JqCjkgMCBvYmoKPDwKL0ZpbHRlciBbIC9BU0NJSTg1RGVjb2RlIC9GbGF0ZURlY29kZSBdIC9MZW5ndGggMzUyCj4+CnN0cmVhbQpHYXMyRDU+VDBOJjRjSkRNVmokOCtyJDMncmc+OlFLWiZEXS9yK2ldN1lyZShZOC0/IzdsRm1DVEl1Tl1nW0VzPkssUVY5WkojbU0odS4+NUJcImpYUl5Rcz5UKC1KMCNQMyM5XzU+NWRZJGpkTjJcZlhRR2pDV0gxPHBqajQsSXAoayIpLW9Fb05gKzYpLF1iS0hRWCs+bS0xbV8vWDE7WV09IWJHdEwlRnFjJ1wqNSUmOi4+J0tqZFojMikpQWl0Uz5oRSsmIk9iLm4yUShYOTM2cG5mSl5eODpDakZMaSpQVWxaSz5QUGc4MixSLW8jOE8mb2w8JGpDIj9fOiNuUEo4VWVFRFA1ND9aRSUrR2FrMGMkcXMjM0VRVFk6UjZfY2smc3RRcWRRL3NMUCYoYSQoTnFLKC05MVIyQ2dNLi1nQGRlT2N1IlNzLSUqRDMsczNDUSZgZyJdIj05Mn4+ZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgMTAKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDYxIDAwMDAwIG4gCjAwMDAwMDAwOTIgMDAwMDAgbiAKMDAwMDAwMDE5OSAwMDAwMCBuIAowMDAwMDAwNDAyIDAwMDAwIG4gCjAwMDAwMDA2MDUgMDAwMDAgbiAKMDAwMDAwMDY3MyAwMDAwMCBuIAowMDAwMDAwOTM0IDAwMDAwIG4gCjAwMDAwMDA5OTkgMDAwMDAgbiAKMDAwMDAwMTQ3MSAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9JRCAKWzxjNmExMTZlMTVmNTkzYmI1ZTNiZGRkNDE2ZTRhMTMzMT48YzZhMTE2ZTE1ZjU5M2JiNWUzYmRkZDQxNmU0YTEzMzE+XQolIFJlcG9ydExhYiBnZW5lcmF0ZWQgUERGIGRvY3VtZW50IC0tIGRpZ2VzdCAob3BlbnNvdXJjZSkKCi9JbmZvIDYgMCBSCi9Sb290IDUgMCBSCi9TaXplIDEwCj4+CnN0YXJ0eHJlZgoxOTEzCiUlRU9GCg==';
const pdf = () => new Uint8Array(Buffer.from(PDF_BASE64, 'base64'));
const resposta = (corpo: Uint8Array | string, status = 200) =>
  new Response(corpo as BodyInit, { status });
const URL_EDITAL = 'https://pncp.gov.br/pncp-api/v1/orgaos/1/compras/2026/4/arquivos/1';
const URL_TR = 'https://pncp.gov.br/pncp-api/v1/orgaos/1/compras/2026/4/arquivos/2';
const URL_ZIP = 'https://pncp.gov.br/pncp-api/v1/orgaos/1/compras/2026/4/arquivos/3';

describe('leitura dos documentos do edital', () => {
  it('só aceita endereço do PNCP', () => {
    expect(urlDoPncp(URL_EDITAL)).toBe(true);
    expect(urlDoPncp('https://treina.pncp.gov.br/x')).toBe(true);
    expect(urlDoPncp('http://pncp.gov.br/x')).toBe(false);
    expect(urlDoPncp('https://pncp.gov.br.evil.com/x')).toBe(false);
    expect(urlDoPncp('https://exemplo.com/edital.pdf')).toBe(false);
    expect(urlDoPncp('lixo')).toBe(false);
  });

  it('escolhe edital e termo de referência e deixa comprovantes de fora', () => {
    const escolhidos = escolherParaLer([
      { tipo: 'Outros Documentos', nome: 'COMPROVANTE DE PUBLICACAO - AGM', url: URL_ZIP },
      { tipo: 'Termo de Referência', nome: 'TERMO DE REFERENCIA', url: URL_TR },
      { tipo: 'Edital', nome: 'EDITAL', url: URL_EDITAL },
      { tipo: 'Edital', nome: 'EDITAL', url: 'https://exemplo.com/fora.pdf' },
    ]);
    expect(escolhidos.map((doc) => doc.url)).toEqual([URL_EDITAL, URL_TR]);
  });

  it('lê o PDF de verdade e tira os dados com página e trecho', async () => {
    const leitura = await lerDocumentos([{ tipo: 'Edital', nome: 'EDITAL', url: URL_EDITAL }], {
      fetchImpl: async () => resposta(pdf()),
    });
    expect(leitura.documentos).toMatchObject([{ nome: 'EDITAL', estado: 'lido', paginas: 2 }]);
    const valor = (id: string) => leitura.fatos.find((fato) => fato.id === id);
    expect(valor('validade-proposta')?.valor).toBe('60 dias');
    expect(valor('amostra')).toMatchObject({ valor: 'Exigida, em até 5 dias úteis', pagina: 2 });
    expect(valor('garantia-contratual')?.valor).toBe('5% do valor do contrato');
    expect(valor('pagamento')?.valor).toBe('Até 30 dias');
    expect(leitura.alertas.map((alerta) => alerta.id)).toContain('amostra');
    expect(leitura.textos.get(chaveDoDocumento(URL_EDITAL))).toHaveLength(2);
  });

  it('o que não é PDF, falha ou não tem texto vira documento não lido', async () => {
    const leitura = await lerDocumentos(
      [
        { tipo: 'Edital', nome: 'EDITAL', url: URL_EDITAL },
        { tipo: 'Termo de Referência', nome: 'TR', url: URL_TR },
        { tipo: 'Outros', nome: 'ANEXO', url: URL_ZIP },
      ],
      {
        fetchImpl: async (entrada) => {
          const url = String(entrada);
          if (url === URL_EDITAL) return resposta('PK\u0003\u0004zip');
          if (url === URL_TR) return resposta('erro', 500);
          return resposta(pdf());
        },
        lerPdf: async () => ['', '  '],
      },
    );
    expect(leitura.documentos.map((doc) => doc.estado)).toEqual(['formato', 'falhou', 'sem_texto']);
    expect(leitura.fatos).toEqual([]);
    expect(leitura.alertas).toEqual([]);
  });

  it('guarda a leitura, não repete enquanto lê e tenta de novo depois de erro', async () => {
    let chamadas = 0;
    let falhar = true;
    let agora = 1_000_000;
    let liberar!: () => void;
    const segurar = new Promise<void>((resolve) => (liberar = resolve));
    const cache = new CacheDeLeitura(
      async (documentos) => {
        chamadas += 1;
        await segurar;
        if (falhar) throw new Error('caiu');
        return lerDocumentos(documentos, { fetchImpl: async () => resposta(pdf()) });
      },
      () => agora,
    );
    const docs = [{ tipo: 'Edital', nome: 'EDITAL', url: URL_EDITAL }];
    const id = randomUUID();
    expect(cache.consultar(id, docs)).toEqual({ estado: 'lendo' });
    expect(cache.consultar(id, docs)).toEqual({ estado: 'lendo' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(chamadas).toBe(1);
    liberar();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(cache.consultar(id, docs)).toEqual({ estado: 'erro' });
    agora += 3 * 60_000;
    falhar = false;
    expect(cache.consultar(id, docs)).toEqual({ estado: 'lendo' });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const pronta = cache.consultar(id, docs);
    expect(pronta.estado).toBe('pronta');
    expect(chamadas).toBe(2);
    expect(cache.textoLido(id)).toContain('garantia contratual');
    expect(cache.paginas(id, chaveDoDocumento(URL_EDITAL))).toHaveLength(2);
    expect(cache.paginas(id, 'abcdefabcdef')).toBeNull();
    expect(cache.textoLido(randomUUID())).toBe('');
  });
});

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

suite('rota de leitura do edital (PostgreSQL real)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;
  const tenant = randomUUID();
  const usuario = randomUUID();
  const editalSemDocumentos = randomUUID();
  const editalDeFora = randomUUID();
  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    pool = new Pool({ connectionString: connectionString! });
    setup = new Pool({ connectionString: setupConnectionString! });
    app = buildApp({
      jwtSecret: 'test-secret',
      logger: false,
      pool,
      config: loadConfig({ NODE_ENV: 'test' }),
    });
    await app.ready();
    await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
      tenant,
      'Empresa Leitura',
      `l-${tenant.slice(0, 8)}`,
    ]);
    await setup.query(
      `INSERT INTO usuarios (id, tenant_id, email, nome, papel, password_hash, email_verificado_em, nicho_preferencias, onboarding_concluido)
       VALUES ($1, $2, $3, 'Cliente Leitura', 'admin', $4, now(), '["limpeza-conservacao"]'::jsonb, true)`,
      [usuario, tenant, `leitura.${suffix}@example.test`, hashPassword('Senha-Forte-2026!')],
    );
    await setup.query(
      `INSERT INTO editais (id, tenant_id, fonte, id_externo, titulo, orgao, uf, hash_conteudo, conteudo_texto)
       VALUES ($1, $3, 'manual', $4, 'Edital sem documentos', 'Órgão X', 'RR', $5, 'texto'),
              ($2, $3, 'manual', $6, 'Edital com documento fora do PNCP', 'Órgão X', 'RR', $7, 'texto')`,
      [
        editalSemDocumentos,
        editalDeFora,
        tenant,
        `ls-${suffix}`,
        `hs-${suffix}`,
        `lf-${suffix}`,
        `hf-${suffix}`,
      ],
    );
    await setup.query(
      `INSERT INTO edital_documentos (tenant_id, edital_id, tipo, nome_arquivo, url, hash_conteudo)
       VALUES ($1, $2, 'Edital', 'EDITAL', 'https://exemplo.com/edital.pdf', $3)`,
      [tenant, editalDeFora, `doc-${suffix}`],
    );
  });

  afterAll(async () => {
    await setup.query('DELETE FROM editais WHERE id = ANY($1)', [
      [editalSemDocumentos, editalDeFora],
    ]);
    await app.close();
    await pool.end();
    await setup.end();
  });

  const headers = () => ({
    authorization: `Bearer ${app.jwt.sign({ sub: usuario, tenantId: tenant, role: 'admin' })}`,
  });

  it('exige login e edital existente', async () => {
    expect(
      (await app.inject({ method: 'GET', url: `/editais/${editalSemDocumentos}/leitura` }))
        .statusCode,
    ).toBe(401);
    const inexistente = await app.inject({
      method: 'GET',
      url: `/editais/${randomUUID()}/leitura`,
      headers: headers(),
    });
    expect(inexistente.statusCode).toBe(404);
  });

  it('sem documentos do PNCP a leitura já vem pronta e vazia (sem baixar nada)', async () => {
    for (const id of [editalSemDocumentos, editalDeFora]) {
      const corpo = (
        await app.inject({ method: 'GET', url: `/editais/${id}/leitura`, headers: headers() })
      ).json();
      expect(corpo).toMatchObject({ estado: 'pronta', documentos: [], fatos: [], alertas: [] });
    }
  });

  it('texto de documento que não foi lido volta 404', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: `/editais/${editalSemDocumentos}/leitura/abcdefabcdef`,
      headers: headers(),
    });
    expect(resposta.statusCode).toBe(404);
  });
});
