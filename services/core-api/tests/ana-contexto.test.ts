import { describe, expect, it } from 'vitest';
import {
  contextoAdmin,
  contextoAluno,
  contextoEmpresa,
  contextoMentor,
  montarContexto,
} from '../src/ana-contexto.js';

describe('contexto da Ana por tipo de usuário', () => {
  it('empresa: abre com o que combina, o que encerra e o que falta configurar', () => {
    const base = contextoEmpresa({
      me: {},
      inicio: {
        buscas_ativas: 0,
        documentos: { total: 4, vencidos: 1, vencendo: 2 },
        prazos_semana: [{ titulo: 'Sessão pregão 12', vence_em: '2026-11-20T15:00:00Z' }],
        pipeline: { salva: 2, em_habilitacao: 1 },
        proximos_passos: [{ codigo: 'x', texto: 'Anexe a certidão.', href: '/documentos' }],
      },
      radar: {
        perfil_configurado: true,
        cards: { abertas: 40, compativeis: 7, encerram_hoje: 1, encerram_3_dias: 4, novas: 5 },
        destaques: [
          {
            id: 'e1',
            titulo: 'Uniformes escolares',
            orgao: 'Prefeitura X',
            uf: 'GO',
            compat: 91,
            data_encerramento_proposta: '2026-11-20T15:00:00Z',
            valor_estimado: 120000,
          },
        ],
      },
    });
    expect(base.resumo.join(' ')).toContain('Tem 40 licitações abertas');
    expect(base.resumo.join(' ')).toContain('7 combinam bem com você');
    expect(base.resumo.join(' ')).toContain('1 termina hoje e 4 nos próximos 3 dias');
    expect(base.resumo.join(' ')).toContain('Você está acompanhando 3 oportunidades');
    const textos = base.destaques.map((item) => item.texto).join('\n');
    expect(textos).toContain('1 documento da empresa está vencido');
    expect(textos).toContain('Crie um alerta');
    expect(textos).toContain('Uniformes escolares');
    expect(textos).toContain('combina 91% com você');
    expect(base.destaques.find((item) => item.texto.startsWith('Uniformes'))?.href).toBe(
      '/radar/e1',
    );
  });

  it('empresa sem perfil é convidada a preencher o perfil primeiro', () => {
    const base = contextoEmpresa({
      me: {},
      inicio: {},
      radar: { perfil_configurado: false, cards: {} },
    });
    expect(base.destaques[0]?.texto).toContain('Conte o que sua empresa vende');
    expect(base.destaques[0]?.href).toBe('/radar');
  });

  it('aluno: progresso, continuar de onde parou e devolutivas', () => {
    const base = contextoAluno({
      me: {},
      radar: { cards: { abertas: 12 } },
      inicio: {
        diagnostico_feito: true,
        plano_criado: true,
        progresso: { aulas_total: 20, aulas_concluidas: 5 },
        continuar: { titulo: 'Habilitação', trilha_slug: 'basico' },
        meta_semana: { total: 5, feitos: 2 },
        praticas: { devolvidas: 2 },
        recado_mentor: { texto: 'Bom trabalho!', mentor: 'Ana' },
      },
    });
    expect(base.resumo.join(' ')).toContain('5 de 20 aulas (25%)');
    expect(base.resumo.join(' ')).toContain('2 de 5 atividades');
    expect(base.destaques.map((d) => d.texto).join('\n')).toContain(
      'A mentoria devolveu 2 práticas',
    );
    expect(base.destaques[0]?.href).toBe('/academia');
  });

  it('aluno sem diagnóstico é levado ao diagnóstico', () => {
    const base = contextoAluno({ me: {}, radar: null, inicio: { diagnostico_feito: false } });
    expect(base.destaques[0]?.href).toBe('/diagnostico');
  });

  it('mentoria: prioriza devolutivas, alunos parados e a próxima sessão', () => {
    const velho = new Date(Date.now() - 20 * 86_400_000).toISOString();
    const base = contextoMentor({
      me: {},
      alunos: {
        data: [
          {
            nome: 'Bia Souza',
            ultimo_progresso: velho,
            praticas_a_devolver: 2,
            plano_a_revisar: 1,
          },
          {
            nome: 'Caio',
            ultimo_progresso: new Date().toISOString(),
            praticas_a_devolver: 0,
            proxima_sessao: '2026-12-01T13:00:00Z',
          },
        ],
      },
    });
    expect(base.resumo[0]).toBe('Você acompanha 2 alunos.');
    const textos = base.destaques.map((d) => d.texto).join('\n');
    expect(textos).toContain('2 práticas esperam o seu retorno');
    expect(textos).toContain('1 aluno sem avançar há mais de 7 dias: Bia');
    expect(textos).toContain('Próxima sessão: Caio');
  });

  it('administração: operação, leads e alerta de coleta parada; curso: alunos e turmas', () => {
    const velha = new Date(Date.now() - 5 * 3_600_000).toISOString();
    const overview = {
      empresas_clientes: { total: 12, novos_30d: 3 },
      alertas: { ultimas_24h: 40 },
      leads: { novos: 4, novos_7d: 9 },
      editais: { total: 90000, capturados_24h: 800, ultima_captura: velha },
      ingestao: { dead_letters_pendentes: 2 },
      ana: { conversas_7d: 30 },
      curso: { alunos_ativos: 50, mentores_ativos: 3, turmas_ativas: 2, convites_pendentes: 6 },
    };
    const adm = contextoAdmin({ me: {}, overview, modulo: 'profissional' });
    expect(adm.resumo.join(' ')).toContain('12 empresas clientes, 3 novas nos últimos 30 dias');
    const textos = adm.destaques.map((d) => d.texto).join('\n');
    expect(textos).toContain('4 leads novos esperando atendimento');
    expect(textos).toContain('A última busca de editais');
    expect(textos).toContain('2 itens da busca de editais deram erro');
    const curso = contextoAdmin({ me: {}, overview, modulo: 'curso' });
    expect(curso.resumo.join(' ')).toContain('50 alunos ativos, 3 mentores e 2 turmas ativas');
    expect(curso.destaques.map((d) => d.href)).toContain('/gestao/leads');
  });

  it('sem dados (rota indisponível) devolve um contexto vazio e válido, sem inventar', () => {
    const vazio = montarContexto('aluno', 'aluno', { me: { nome: 'Maria Silva' } });
    expect(vazio.nome).toBe('Maria');
    expect(Array.isArray(vazio.resumo)).toBe(true);
    expect(vazio.sugestoes.length).toBeGreaterThan(0);
    const admin = montarContexto('administracao', 'plataforma', { me: {} });
    expect(admin.area).toBe('administracao');
  });
});
