import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UserRole } from '../src/auth.js';
import { buildApp } from '../src/server.js';

const ROLES: readonly UserRole[] = ['plataforma', 'admin', 'operador', 'mentor', 'aluno'];
const ID = '00000000-0000-4000-8000-000000000001';

type Entry = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  allowed: readonly UserRole[];
  payload?: unknown;
};

const ONLY_PLATFORM = ['plataforma'] as const;
const COMPANY = ['plataforma', 'admin', 'operador'] as const;
const STUDENT_VIEW = ['plataforma', 'aluno'] as const;
const STUDENT_ONLY = ['aluno'] as const;
const TEACHING = ['plataforma', 'mentor'] as const;
const MENTOR_ONLY = ['mentor'] as const;

/**
 * Matriz papel × rota. Sem banco configurado, uma rota autorizada responde 503 e uma rota
 * negada responde 403: dá para provar a autorização sem PostgreSQL. A tabela espelha
 * docs/permissoes.md; mudar uma exige mudar a outra.
 */
const MATRIX: readonly Entry[] = [
  { method: 'GET', url: '/admin/leads', allowed: ONLY_PLATFORM },
  { method: 'GET', url: '/admin/alerts/status', allowed: ONLY_PLATFORM },
  { method: 'POST', url: '/admin/alerts/run', allowed: ONLY_PLATFORM },
  { method: 'GET', url: '/editais/export', allowed: COMPANY },
  { method: 'GET', url: '/saved-searches', allowed: COMPANY },
  { method: 'POST', url: '/saved-searches', allowed: COMPANY, payload: { nome: 'Busca' } },
  { method: 'PATCH', url: `/saved-searches/${ID}`, allowed: COMPANY, payload: {} },
  { method: 'DELETE', url: `/saved-searches/${ID}`, allowed: COMPANY },
  { method: 'GET', url: '/alert-rules', allowed: COMPANY },
  { method: 'GET', url: '/alert-options', allowed: COMPANY },
  { method: 'PATCH', url: `/alert-rules/${ID}`, allowed: COMPANY, payload: {} },
  { method: 'GET', url: '/aluno/inicio', allowed: STUDENT_VIEW },
  { method: 'GET', url: '/aluno/progresso', allowed: STUDENT_VIEW },
  { method: 'GET', url: '/aluno/plano', allowed: STUDENT_VIEW },
  { method: 'POST', url: '/aluno/plano/gerar', allowed: STUDENT_ONLY, payload: {} },
  { method: 'PATCH', url: '/aluno/plano/dias/1', allowed: STUDENT_ONLY, payload: { feito: true } },
  { method: 'GET', url: '/aluno/praticas', allowed: STUDENT_VIEW },
  { method: 'GET', url: `/aluno/praticas/${ID}`, allowed: STUDENT_VIEW },
  {
    method: 'PUT',
    url: `/aluno/praticas/${ID}`,
    allowed: STUDENT_ONLY,
    payload: { respostas: {} },
  },
  { method: 'POST', url: `/aluno/praticas/${ID}/enviar`, allowed: STUDENT_ONLY },
  { method: 'GET', url: '/aluno/mentoria', allowed: STUDENT_VIEW },
  { method: 'GET', url: '/aluno/certificados', allowed: STUDENT_VIEW },
  { method: 'POST', url: '/aluno/certificados', allowed: STUDENT_ONLY, payload: { trilha: 'x' } },
  { method: 'GET', url: '/mentor/alunos', allowed: TEACHING },
  { method: 'GET', url: `/mentor/alunos/${ID}`, allowed: TEACHING },
  { method: 'POST', url: `/mentor/alunos/${ID}/plano/gerar`, allowed: MENTOR_ONLY, payload: {} },
  { method: 'PATCH', url: `/mentor/alunos/${ID}/plano/dias/1`, allowed: MENTOR_ONLY, payload: {} },
  { method: 'GET', url: '/mentor/devolutivas', allowed: TEACHING },
  {
    method: 'POST',
    url: `/mentor/praticas/${ID}/devolutiva`,
    allowed: MENTOR_ONLY,
    payload: { devolutiva: 'Comentário de teste' },
  },
  {
    method: 'POST',
    url: `/mentor/alunos/${ID}/notas`,
    allowed: MENTOR_ONLY,
    payload: { texto: 'x' },
  },
  { method: 'DELETE', url: `/mentor/notas/${ID}`, allowed: MENTOR_ONLY },
  { method: 'GET', url: '/mentor/sessoes', allowed: TEACHING },
  {
    method: 'POST',
    url: '/mentor/sessoes',
    allowed: MENTOR_ONLY,
    payload: { aluno_id: ID, titulo: 'Sessão', inicio_at: '2026-11-01T10:00:00-03:00' },
  },
  { method: 'PATCH', url: `/mentor/sessoes/${ID}`, allowed: MENTOR_ONLY, payload: {} },
  { method: 'GET', url: '/opportunities', allowed: COMPANY },
  { method: 'POST', url: '/opportunities', allowed: COMPANY, payload: { edital_id: ID } },
  { method: 'GET', url: `/opportunities/${ID}`, allowed: COMPANY },
  { method: 'PATCH', url: `/opportunities/${ID}`, allowed: COMPANY, payload: {} },
  { method: 'DELETE', url: `/opportunities/${ID}`, allowed: COMPANY },
  { method: 'GET', url: '/checklist-models', allowed: COMPANY },
  { method: 'POST', url: `/opportunities/${ID}/checklists`, allowed: COMPANY, payload: {} },
  { method: 'DELETE', url: `/checklists/${ID}`, allowed: COMPANY },
  { method: 'POST', url: `/checklists/${ID}/items`, allowed: COMPANY, payload: { titulo: 'Item' } },
  { method: 'PATCH', url: `/checklist-items/${ID}`, allowed: COMPANY, payload: {} },
  { method: 'DELETE', url: `/checklist-items/${ID}`, allowed: COMPANY },
  { method: 'GET', url: '/agenda', allowed: COMPANY },
  {
    method: 'POST',
    url: '/agenda/prazos',
    allowed: COMPANY,
    payload: { titulo: 'Prazo', vence_em: '2026-11-01T10:00:00-03:00' },
  },
  { method: 'PATCH', url: `/agenda/prazos/${ID}`, allowed: COMPANY, payload: {} },
  { method: 'DELETE', url: `/agenda/prazos/${ID}`, allowed: COMPANY },
  { method: 'POST', url: '/tasks', allowed: COMPANY, payload: { titulo: 'Tarefa' } },
  { method: 'PATCH', url: `/tasks/${ID}`, allowed: COMPANY, payload: {} },
  { method: 'DELETE', url: `/tasks/${ID}`, allowed: COMPANY },
  { method: 'GET', url: '/empresa/documentos', allowed: COMPANY },
  {
    method: 'POST',
    url: '/empresa/documentos',
    allowed: COMPANY,
    payload: { tipo: 'outro', nome: 'Documento' },
  },
  { method: 'PATCH', url: `/empresa/documentos/${ID}`, allowed: COMPANY, payload: {} },
  { method: 'DELETE', url: `/empresa/documentos/${ID}`, allowed: COMPANY },
  { method: 'GET', url: '/empresa/inicio', allowed: COMPANY },
  { method: 'GET', url: '/admin/users/audit', allowed: ONLY_PLATFORM },
  { method: 'GET', url: '/operations/ingest', allowed: ONLY_PLATFORM },
  { method: 'GET', url: '/users', allowed: ['plataforma', 'mentor'] },
  { method: 'GET', url: '/mentor/companies', allowed: ['plataforma', 'mentor'] },
  { method: 'GET', url: '/mentor/dashboard', allowed: ['plataforma', 'mentor'] },
  { method: 'GET', url: '/mentorado/dashboard', allowed: ['plataforma', 'aluno'] },
  { method: 'GET', url: '/professional/dashboard', allowed: ['plataforma', 'admin', 'operador'] },
  { method: 'DELETE', url: `/mentor/concessions/${ID}`, allowed: ONLY_PLATFORM },
  { method: 'PATCH', url: '/me/view-as', allowed: ONLY_PLATFORM, payload: { area: 'aluno' } },
  { method: 'GET', url: '/platform/overview', allowed: ONLY_PLATFORM },
  { method: 'GET', url: '/platform/companies', allowed: ONLY_PLATFORM },
  { method: 'GET', url: '/platform/students', allowed: ONLY_PLATFORM },
  { method: 'GET', url: '/platform/mentors', allowed: ONLY_PLATFORM },
  { method: 'GET', url: '/platform/classes', allowed: ONLY_PLATFORM },
  { method: 'GET', url: '/platform/invitations', allowed: ONLY_PLATFORM },
  {
    method: 'POST',
    url: '/platform/invitations',
    allowed: ONLY_PLATFORM,
    payload: { tipo: 'mentor', nome: 'Mentor Teste', email: 'mentor@teste.dev' },
  },
  { method: 'POST', url: `/platform/invitations/${ID}/revoke`, allowed: ONLY_PLATFORM },
  { method: 'POST', url: `/platform/invitations/${ID}/reissue`, allowed: ONLY_PLATFORM },
  { method: 'POST', url: '/platform/classes', allowed: ONLY_PLATFORM, payload: { nome: 'Turma' } },
  { method: 'PATCH', url: `/platform/classes/${ID}`, allowed: ONLY_PLATFORM, payload: {} },
  {
    method: 'PATCH',
    url: `/platform/users/${ID}/active`,
    allowed: ONLY_PLATFORM,
    payload: { ativo: false },
  },
];

describe('matriz de permissões papel × rota', () => {
  const app = buildApp({ jwtSecret: 'test-secret', logger: false });
  beforeAll(async () => {
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  for (const entry of MATRIX) {
    for (const role of ROLES) {
      const expectedDenied = !entry.allowed.includes(role);
      it(`${entry.method} ${entry.url.replace(ID, ':id')} como ${role}: ${expectedDenied ? 'nega' : 'permite'}`, async () => {
        const token = app.jwt.sign({ sub: ID, tenantId: ID, role });
        const response = await app.inject({
          method: entry.method,
          url: entry.url,
          headers: { authorization: `Bearer ${token}` },
          ...(entry.payload === undefined ? {} : { payload: entry.payload as object }),
        });
        if (expectedDenied) {
          expect(response.statusCode).toBe(403);
        } else {
          expect([401, 403]).not.toContain(response.statusCode);
        }
      });
    }
  }

  it('rotas protegidas exigem login', async () => {
    for (const entry of MATRIX) {
      const response = await app.inject({ method: entry.method, url: entry.url });
      expect(response.statusCode, `${entry.method} ${entry.url}`).toBe(401);
    }
  });

  it('o aceite de convite é público e a prévia não revela convite inexistente', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/invitations/preview',
      payload: { token: 'x'.repeat(30) },
    });
    expect(response.statusCode).toBe(503);
  });
});
