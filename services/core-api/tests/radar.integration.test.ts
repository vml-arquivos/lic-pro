import { randomUUID } from 'node:crypto';
import { NICHE_CATALOG } from '@licitecomigo/shared';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/password.js';
import { buildApp } from '../src/server.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

const niche = NICHE_CATALOG[0]!;
const term = niche.terms[0]!;
const DAY = 24 * 60 * 60 * 1000;

suite('Radar: busca, facetas, favoritos, histórico e exportação (PostgreSQL real)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;
  const suffix = randomUUID().slice(0, 8);
  const platformTenant = randomUUID();
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const adminA = randomUUID();
  const operadorA = randomUUID();
  const alunoA = randomUUID();
  const adminB = randomUUID();
  const ids: Record<string, string> = {};

  const token = (sub: string, tenantId: string, role: string) =>
    app.jwt.sign({ sub, tenantId, role });
  const as = (sub: string, tenantId: string, role: string) => ({
    authorization: `Bearer ${token(sub, tenantId, role)}`,
  });
  const adminHeaders = () => as(adminA, tenantA, 'admin');
  const list = async (query: string, headers = adminHeaders()) => {
    const response = await app.inject({ method: 'GET', url: `/editais?${query}`, headers });
    expect(response.statusCode, response.body).toBe(200);
    return response.json() as {
      data: Array<Record<string, unknown>>;
      total: number;
      facetas: Record<string, Array<{ valor: string; total: number }>>;
    };
  };
  const mine = (rows: Array<Record<string, unknown>>) =>
    rows.filter((row) => String(row.id_externo).endsWith(suffix));
  const titles = (rows: Array<Record<string, unknown>>) =>
    mine(rows)
      .map((row) => String(row.id_externo).split('-')[0])
      .sort();

  async function insertUser(id: string, tenantId: string, papel: string, nome: string) {
    const email = `${nome.toLowerCase().replace(/\s+/g, '.')}.${suffix}@example.test`;
    await setup.query(
      `INSERT INTO usuarios (id, tenant_id, email, nome, papel, password_hash, email_verificado_em,
                             nicho_preferencias, onboarding_concluido)
       VALUES ($1, $2, $3, $4, $5, $6, now(), $7::jsonb, true)`,
      [
        id,
        tenantId,
        email,
        nome,
        papel,
        hashPassword('Senha-Forte-2026!'),
        JSON.stringify([niche.code]),
      ],
    );
  }

  async function insertEdital(key: string, fields: Record<string, unknown>) {
    const base: Record<string, unknown> = {
      tenant_id: platformTenant,
      fonte: 'fixture',
      id_externo: `${key}-${suffix}`,
      titulo: `Contratação de ${term} ${key} ${suffix}`,
      hash_conteudo: `h-${key}-${suffix}`,
      ...fields,
    };
    const columns = Object.keys(base);
    const result = await setup.query<{ id: string }>(
      `INSERT INTO editais (${columns.join(', ')})
       VALUES (${columns.map((_c, index) => `$${index + 1}`).join(', ')}) RETURNING id`,
      Object.values(base),
    );
    ids[key] = result.rows[0]!.id;
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: connectionString! });
    setup = new Pool({ connectionString: setupConnectionString! });
    app = buildApp({
      jwtSecret: 'test-secret',
      logger: false,
      pool,
      config: loadConfig({
        NODE_ENV: 'test',
        JWT_SECRET: 'test-secret',
        DATABASE_URL: connectionString!,
        APP_URL: 'https://app.example.test',
      }),
    });
    await app.ready();
    for (const [id, nome] of [
      [platformTenant, 'Plataforma'],
      [tenantA, 'Empresa A'],
      [tenantB, 'Empresa B'],
    ] as const) {
      await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        id,
        nome,
        `r-${id.slice(0, 8)}`,
      ]);
    }
    await setup.query('INSERT INTO plataforma_tenants (id) VALUES ($1)', [platformTenant]);
    await insertUser(adminA, tenantA, 'admin', 'Admin Radar A');
    await insertUser(operadorA, tenantA, 'operador', 'Operador Radar A');
    await insertUser(alunoA, tenantA, 'aluno', 'Aluno Radar A');
    await insertUser(adminB, tenantB, 'admin', 'Admin Radar B');

    const now = Date.now();
    await setup.query(
      `INSERT INTO municipios_ibge (codigo_ibge, municipio, sigla_uf, regiao, latitude, longitude)
       VALUES ('9900001', $1, 'DF', 'centro-oeste', -15.79, -47.88),
              ('9900002', $2, 'GO', 'centro-oeste', -16.68, -49.25),
              ('9900003', $3, 'AM', 'norte', -3.12, -60.02)
       ON CONFLICT (codigo_ibge) DO NOTHING`,
      [`Cidade Teste ${suffix}`, `Vizinha ${suffix}`, `Distante ${suffix}`],
    );
    // aberto, DF, pregão, pequeno, encerra amanhã
    await insertEdital('a', {
      uf: 'DF',
      modalidade: 'Pregão Eletrônico',
      situacao: 'Divulgada',
      esfera: 'Federal',
      valor_estimado: 50_000,
      municipio_ibge: '9900001',
      data_publicacao: new Date(now - 1 * DAY),
      data_encerramento_proposta: new Date(now + 1 * DAY),
    });
    // aberto, GO, concorrência, grande vulto, encerra em 20 dias
    await insertEdital('b', {
      uf: 'GO',
      modalidade: 'Concorrência',
      situacao: 'Divulgada',
      esfera: 'Estadual',
      valor_estimado: 250_000_000,
      municipio_ibge: '9900002',
      data_publicacao: new Date(now - 3 * DAY),
      data_encerramento_proposta: new Date(now + 20 * DAY),
    });
    // encerrado, AM, pregão
    await insertEdital('c', {
      uf: 'AM',
      modalidade: 'Pregão Eletrônico',
      situacao: 'Divulgada',
      esfera: 'Municipal',
      valor_estimado: 1_000,
      municipio_ibge: '9900003',
      data_publicacao: new Date(now - 30 * DAY),
      data_encerramento_proposta: new Date(now - 10 * DAY),
    });
    // suspenso, DF, texto com palavra a excluir
    await insertEdital('d', {
      uf: 'DF',
      modalidade: 'Pregão Eletrônico',
      situacao: 'Suspensa',
      esfera: 'Federal',
      valor_estimado: 80_000,
      municipio_ibge: '9900001',
      titulo: `Contratação de ${term} com locação de veículos ${suffix}`,
      data_publicacao: new Date(now - 2 * DAY),
      data_encerramento_proposta: new Date(now + 5 * DAY),
    });
    await insertEdital('priv', {
      tenant_id: tenantB,
      uf: 'DF',
      modalidade: 'Pregão Eletrônico',
    });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    await setup.end();
  });

  it('filtra por UF, região, valor, texto e exclusões, sem expor o edital privado de outra conta', async () => {
    expect(titles((await list(`uf=DF&page_size=100`)).data)).toEqual(['a', 'd']);
    expect(titles((await list(`regiao=centro-oeste&page_size=100`)).data)).toEqual(['a', 'b', 'd']);
    expect(titles((await list(`valor_min=60000&valor_max=100000&page_size=100`)).data)).toEqual([
      'd',
    ]);
    expect(titles((await list(`excluir=locação&page_size=100`)).data)).toEqual(['a', 'b', 'c']);
    expect(titles((await list(`q=veículos&page_size=100`)).data)).toEqual(['d']);
    const all = await list('page_size=100');
    expect(mine(all.data).some((row) => String(row.id_externo).startsWith('priv'))).toBe(false);
  });

  it('prazo, situação e grande vulto', async () => {
    expect(titles((await list('situacao_prazo=abertas&page_size=100')).data)).toEqual([
      'a',
      'b',
      'd',
    ]);
    expect(titles((await list('situacao_prazo=vencendo_3&page_size=100')).data)).toEqual(['a']);
    expect(titles((await list('situacao_prazo=encerradas&page_size=100')).data)).toEqual(['c']);
    expect(titles((await list('situacao_tipo=suspensa&page_size=100')).data)).toEqual(['d']);
    expect(titles((await list('grande_vulto=true&page_size=100')).data)).toEqual(['b']);
    expect(
      titles(
        (
          await list(
            'periodo_tipo=publicacao&periodo_de=' +
              new Date(Date.now() - 2.5 * DAY).toISOString() +
              '&page_size=100',
          )
        ).data,
      ),
    ).toEqual(['a', 'd']);
  });

  it('ordena por encerramento e por valor', async () => {
    const byDeadline = mine((await list('ordem=encerram&page_size=100')).data).map((row) =>
      String(row.id_externo).charAt(0),
    );
    expect(byDeadline.slice(0, 3)).toEqual(['a', 'd', 'b']);
    const byValue = mine((await list('ordem=valor&page_size=100')).data).map((row) =>
      String(row.id_externo).charAt(0),
    );
    expect(byValue[0]).toBe('b');
  });

  it('devolve facetas que ignoram o próprio filtro', async () => {
    const result = await list('uf=DF&page_size=100');
    const ufs = result.facetas.uf!.map((item) => item.valor);
    expect(ufs).toContain('DF');
    expect(ufs).toContain('GO');
    expect(ufs).toContain('AM');
    const modalidades = result.facetas.modalidade!.map((item) => item.valor);
    expect(modalidades).toContain('Pregão Eletrônico');
    expect(modalidades).not.toContain('Concorrência');
    const sem = await list('facetas=false');
    expect(sem.facetas).toEqual({});
  });

  it('proximidade por município e por coordenadas', async () => {
    const near = await list('perto_municipio=9900001&raio_km=300&ordem=proximas&page_size=100');
    expect(titles(near.data)).toEqual(['a', 'b', 'd']);
    const first = mine(near.data)[0]!;
    expect(String(first.id_externo).startsWith('a')).toBe(true);
    expect(Number(first.distancia_km)).toBeLessThan(5);
    const point = await list('perto_lat=-15.79&perto_lon=-47.88&raio_km=50&page_size=100');
    expect(titles(point.data)).toEqual(['a', 'd']);
  });

  it('favoritar e descartar se excluem, ficam por usuário e o descartado some da lista', async () => {
    const post = (sub: string, tenantId: string, role: string, body: unknown, id = ids.a!) =>
      app.inject({
        method: 'POST',
        url: `/editais/${id}/interacao`,
        headers: as(sub, tenantId, role),
        payload: body as object,
      });
    expect((await post(adminA, tenantA, 'admin', { favorito: true })).json().favorito).toBe(true);
    const flipped = (await post(adminA, tenantA, 'admin', { descartado: true })).json();
    expect(flipped).toMatchObject({ favorito: false, descartado: true });
    expect(titles((await list('page_size=100')).data)).not.toContain('a');
    expect(titles((await list('estado=descartadas&page_size=100')).data)).toEqual(['a']);
    expect(titles((await list('incluir_descartadas=true&page_size=100')).data)).toContain('a');

    // outro usuário da mesma conta não herda o descarte
    const other = await list('page_size=100', as(operadorA, tenantA, 'operador'));
    expect(titles(other.data)).toContain('a');

    await post(adminA, tenantA, 'admin', { favorito: true, nota: 'ver anexo II' });
    await post(adminA, tenantA, 'admin', { visto: true });
    const favoritas = await list('estado=favoritas&page_size=100');
    expect(titles(favoritas.data)).toEqual(['a']);
    expect(favoritas.data[0]).toMatchObject({ favorito: true, descartado: false, visto: true });
    expect(titles((await list('estado=nao_vistas&page_size=100')).data)).not.toContain('a');

    const detail = await app.inject({
      method: 'GET',
      url: `/editais/${ids.a}`,
      headers: adminHeaders(),
    });
    expect(detail.json().interacao).toMatchObject({ favorito: true, nota: 'ver anexo II' });

    expect((await post(adminA, tenantA, 'admin', {})).statusCode).toBe(400);
    const missing = await post(adminA, tenantA, 'admin', { favorito: true }, randomUUID());
    expect(missing.statusCode).toBe(404);
  });

  it('as tabelas pessoais respeitam RLS por usuário e por conta', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [operadorA]);
      await client.query("SELECT set_config('app.role', 'operador', true)");
      const seen = await client.query('SELECT count(*)::int AS total FROM edital_interacoes');
      expect(seen.rows[0].total).toBe(0);
      await expect(
        client.query(
          `INSERT INTO edital_interacoes (tenant_id, usuario_id, edital_id, favorito)
           VALUES ($1, $2, $3, true)`,
          [tenantA, adminA, ids.b],
        ),
      ).rejects.toThrow(/row-level security/);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('perfil do Radar gera a nota de compatibilidade explicada', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/radar/perfil',
      headers: adminHeaders(),
      payload: {
        ufs: ['df'],
        palavras_interesse: [term],
        valor_min: 10_000,
        valor_max: 100_000,
        modalidades: ['Pregão Eletrônico'],
      },
    });
    expect(put.statusCode).toBe(200);
    const get = await app.inject({ method: 'GET', url: '/radar/perfil', headers: adminHeaders() });
    expect(get.json().perfil.ufs).toEqual(['DF']);

    const result = await list('ordem=compat&incluir_descartadas=true&page_size=100');
    const rows = mine(result.data);
    expect(String(rows[0]!.id_externo).startsWith('a')).toBe(true);
    expect(rows[0]!.compat).toBe(100);
    const detail = rows[0]!.compat_detalhe as Array<{
      criterio: string;
      pontos: number;
      maximo: number;
    }>;
    expect(detail.map((item) => item.criterio).sort()).toEqual(
      ['modalidade', 'palavras', 'segmento', 'uf', 'valor'].sort(),
    );
    const b = rows.find((row) => String(row.id_externo).startsWith('b'))!;
    expect(Number(b.compat)).toBeLessThan(100);
    const filtered = await list('compat_min=90&incluir_descartadas=true&page_size=100');
    expect(titles(filtered.data)).toEqual(['a', 'd']);

    const invalid = await app.inject({
      method: 'PUT',
      url: '/radar/perfil',
      headers: adminHeaders(),
      payload: { valor_min: 10, valor_max: 1 },
    });
    expect(invalid.statusCode).toBe(400);

    // o perfil é pessoal: outro usuário da conta não o enxerga
    const other = await app.inject({
      method: 'GET',
      url: '/radar/perfil',
      headers: as(operadorA, tenantA, 'operador'),
    });
    expect(other.json().perfil.ufs).toEqual([]);
  });

  it('registra o histórico de alterações do edital e filtra por alterados', async () => {
    const before = new Date(Date.now() - 1000).toISOString();
    await setup.query(
      `UPDATE editais SET valor_estimado = 60000, situacao = 'Retificada' WHERE id = $1`,
      [ids.a],
    );
    const detail = await app.inject({
      method: 'GET',
      url: `/editais/${ids.a}`,
      headers: adminHeaders(),
    });
    const changes = (
      detail.json().eventos as Array<{
        tipo: string;
        payload: { campos: Array<{ campo: string; antes: unknown; depois: unknown }> };
      }>
    ).filter((event) => event.tipo === 'alteracao');
    expect(changes.length).toBeGreaterThanOrEqual(1);
    const fields = changes.flatMap((event) => event.payload.campos.map((campo) => campo.campo));
    expect(fields).toContain('valor_estimado');
    expect(fields).toContain('situacao');

    const changed = await list(
      `alterados_desde=${encodeURIComponent(before)}&incluir_descartadas=true&page_size=100`,
    );
    expect(titles(changed.data)).toEqual(['a']);
    // atualização sem mudança relevante não gera evento
    const countBefore = changes.length;
    await setup.query(`UPDATE editais SET updated_at = now() WHERE id = $1`, [ids.a]);
    const again = await app.inject({
      method: 'GET',
      url: `/editais/${ids.a}`,
      headers: adminHeaders(),
    });
    expect(
      (again.json().eventos as Array<{ tipo: string }>).filter(
        (event) => event.tipo === 'alteracao',
      ),
    ).toHaveLength(countBefore);
  });

  it('exporta CSV e Excel só para empresa e administração, com auditoria', async () => {
    const csv = await app.inject({
      method: 'GET',
      url: `/editais/export?formato=csv&uf=DF&incluir_descartadas=true`,
      headers: adminHeaders(),
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('Número da compra');
    expect(csv.body).toContain(suffix);
    const xlsx = await app.inject({
      method: 'GET',
      url: `/editais/export?formato=xlsx&uf=DF`,
      headers: as(operadorA, tenantA, 'operador'),
    });
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.rawPayload.subarray(0, 2).toString()).toBe('PK');
    const denied = await app.inject({
      method: 'GET',
      url: '/editais/export?formato=csv',
      headers: as(alunoA, tenantA, 'aluno'),
    });
    expect(denied.statusCode).toBe(403);
    const audited = await setup.query(
      `SELECT count(*)::int AS total FROM auditoria WHERE tenant_id = $1 AND acao = 'radar.exported'`,
      [tenantA],
    );
    expect(audited.rows[0].total).toBe(2);
  });

  it('painel traz contadores e destaques; visita guarda a última data', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/radar/visita',
      headers: adminHeaders(),
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().visita_anterior).toBeNull();
    const panel = await app.inject({
      method: 'GET',
      url: '/radar/painel',
      headers: adminHeaders(),
    });
    expect(panel.statusCode, panel.body).toBe(200);
    const body = panel.json();
    expect(body.perfil_configurado).toBe(true);
    expect(body.cards.abertas).toBeGreaterThanOrEqual(2);
    expect(body.cards.grande_vulto).toBeGreaterThanOrEqual(1);
    expect(body.cards.favoritas).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.destaques)).toBe(true);
    const second = await app.inject({
      method: 'POST',
      url: '/radar/visita',
      headers: adminHeaders(),
    });
    expect(second.json().visita_anterior).not.toBeNull();
  });

  it('autocompleta municípios', async () => {
    const found = await app.inject({
      method: 'GET',
      url: `/municipios?q=${encodeURIComponent('Cidade Teste')}&uf=DF`,
      headers: adminHeaders(),
    });
    expect(found.statusCode).toBe(200);
    expect(found.json().data[0]).toMatchObject({ codigo_ibge: '9900001', sigla_uf: 'DF' });
    const bad = await app.inject({
      method: 'GET',
      url: '/municipios?q=a',
      headers: adminHeaders(),
    });
    expect(bad.statusCode).toBe(400);
  });

  it('aluno só enxerga os próprios nichos', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/editais?nicho=outro-nicho-inexistente',
      headers: as(alunoA, tenantA, 'aluno'),
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});
