import type { FastifyInstance } from 'fastify';
import { activeArea } from './auth.js';

/**
 * Contexto da Ana: o que está acontecendo na conta de quem pergunta, escrito para o tipo de
 * usuário (empresa, aluno, mentoria, administração). A Ana usa isto para abrir com um resumo,
 * sugerir perguntas e responder sabendo onde a pessoa está.
 *
 * Os números vêm das mesmas rotas que as telas já usam (com a sessão de quem pergunta), então
 * valem as mesmas permissões e o mesmo isolamento por conta. Nada aqui grava dados.
 */

export type AnaArea = 'administracao' | 'curso' | 'empresa' | 'aluno' | 'mentor' | 'colaborador';
export type AnaDestaque = { texto: string; href?: string | undefined; tom: 'info' | 'atencao' };
export type AnaContexto = {
  area: AnaArea;
  papel: string;
  nome: string | null;
  resumo: string[];
  destaques: AnaDestaque[];
  sugestoes: string[];
  /** Dados compactos para o modelo de linguagem; nunca são mostrados como estão. */
  fatos: Record<string, unknown>;
  gerado_em: string;
};

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Obj) : {};
const list = (value: unknown): Obj[] => (Array.isArray(value) ? value.map(obj) : []);
const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;

const DIA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
});
const HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
function dia(value: unknown): string {
  const date = new Date(text(value));
  return Number.isNaN(date.getTime()) ? '' : DIA.format(date);
}
function diaHora(value: unknown): string {
  const date = new Date(text(value));
  return Number.isNaN(date.getTime()) ? '' : HORA.format(date).replace(',', ' às');
}
const reais = (value: unknown): string => {
  const n = num(value);
  if (!n) return '';
  if (n >= 1_000_000)
    return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (n >= 1_000)
    return `R$ ${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return `R$ ${n.toLocaleString('pt-BR')}`;
};

export type DadosEmpresa = { inicio: unknown; radar: unknown; me: unknown };
export type DadosAluno = { inicio: unknown; radar: unknown; me: unknown };
export type DadosMentor = { alunos: unknown; me: unknown };
export type DadosAdmin = { overview: unknown; me: unknown; modulo: 'curso' | 'profissional' };
export type DadosColaborador = { radar: unknown; me: unknown };

type Base = Pick<AnaContexto, 'resumo' | 'destaques' | 'sugestoes' | 'fatos'>;

/** Licitações em destaque do Radar (as melhores para o perfil), em até 3 linhas. */
function destaquesDoRadar(radar: unknown): AnaDestaque[] {
  return list(obj(radar).destaques)
    .slice(0, 3)
    .map((edital) => {
      const onde = [text(edital.orgao), text(edital.uf)].filter(Boolean).join(' · ');
      const prazo = edital.data_encerramento_proposta
        ? `encerra ${dia(edital.data_encerramento_proposta)}`
        : '';
      const compat = edital.compat != null ? `compatibilidade ${num(edital.compat)}%` : '';
      const valor = reais(edital.valor_estimado);
      const detalhe = [onde, valor, prazo, compat].filter(Boolean).join(' · ');
      return {
        texto: `${text(edital.titulo).slice(0, 110)}${detalhe ? ` — ${detalhe}` : ''}`,
        href: `/radar/${text(edital.id)}`,
        tom: 'info' as const,
      };
    })
    .filter((item) => item.texto.trim().length > 0 && item.href !== '/radar/');
}

function linhasDoRadar(radar: unknown, quem: 'empresa' | 'aluno' | 'colaborador'): string[] {
  const cards = obj(obj(radar).cards);
  const out: string[] = [];
  const abertas = num(cards.abertas);
  if (abertas) {
    out.push(
      quem === 'aluno'
        ? `${plural(abertas, 'licitação aberta', 'licitações abertas')} no seu nicho para você treinar.`
        : `${plural(abertas, 'licitação aberta', 'licitações abertas')} no seu perfil agora.`,
    );
  }
  if (cards.compativeis != null && num(cards.compativeis) > 0) {
    out.push(`${num(cards.compativeis)} delas combinam bem com o seu perfil (70% ou mais).`);
  }
  const hoje = num(cards.encerram_hoje);
  const tres = num(cards.encerram_3_dias);
  if (hoje || tres) {
    out.push(
      `${hoje ? `${plural(hoje, 'encerra', 'encerram')} hoje` : 'Nenhuma encerra hoje'}` +
        `${tres ? ` e ${tres} em até 3 dias` : ''}.`,
    );
  }
  const novas = num(cards.novas);
  if (novas) out.push(`${plural(novas, 'nova', 'novas')} desde a sua última visita ao Radar.`);
  const alteradas = num(cards.alteradas);
  if (alteradas)
    out.push(
      `${plural(alteradas, 'licitação mudou', 'licitações mudaram')} (prazo, situação ou valor).`,
    );
  return out;
}

export function contextoEmpresa(dados: DadosEmpresa): Base {
  const inicio = obj(dados.inicio);
  const radar = obj(dados.radar);
  const resumo = linhasDoRadar(radar, 'empresa');
  const destaques: AnaDestaque[] = [];
  const documentos = obj(inicio.documentos);
  if (num(documentos.vencidos)) {
    destaques.push({
      texto: `${plural(num(documentos.vencidos), 'documento vencido', 'documentos vencidos')} na habilitação.`,
      href: '/documentos',
      tom: 'atencao',
    });
  }
  if (num(documentos.vencendo)) {
    destaques.push({
      texto: `${plural(num(documentos.vencendo), 'documento vence', 'documentos vencem')} nos próximos 30 dias.`,
      href: '/documentos',
      tom: 'atencao',
    });
  }
  const prazos = list(inicio.prazos_semana);
  if (prazos.length) {
    const primeiro = prazos[0]!;
    resumo.push(
      `${plural(prazos.length, 'prazo', 'prazos')} na agenda desta semana; o primeiro é “${text(primeiro.titulo)}” em ${dia(primeiro.vence_em)}.`,
    );
  }
  const pipeline = obj(inicio.pipeline);
  const noPipeline = Object.values(pipeline).reduce<number>((soma, valor) => soma + num(valor), 0);
  if (noPipeline)
    resumo.push(`${plural(noPipeline, 'oportunidade', 'oportunidades')} no seu pipeline.`);
  for (const passo of list(inicio.proximos_passos).slice(0, 2)) {
    destaques.push({
      texto: text(passo.texto),
      href: text(passo.href) || undefined,
      tom: 'atencao',
    });
  }
  if (!radar.perfil_configurado) {
    destaques.unshift({
      texto:
        'Complete o perfil (nicho, segmento, estados e faixa de valor) para eu separar as melhores para você.',
      href: '/radar',
      tom: 'atencao',
    });
  } else if (!num(inicio.buscas_ativas)) {
    destaques.push({
      texto: 'Crie um alerta para ser avisado assim que sair uma licitação do seu segmento.',
      href: '/alertas',
      tom: 'info',
    });
  }
  destaques.push(...destaquesDoRadar(radar));
  return {
    resumo,
    destaques: destaques.filter((item) => item.texto).slice(0, 8),
    sugestoes: [
      'Quais licitações abertas combinam mais com o meu segmento?',
      'O que preciso fazer esta semana?',
      'Como montar uma proposta competitiva?',
      'Quais documentos de habilitação costumam ser pedidos?',
    ],
    fatos: {
      radar: obj(radar.cards),
      perfil_configurado: Boolean(radar.perfil_configurado),
      alertas_ativos: num(inicio.buscas_ativas),
      documentos,
      pipeline,
      prazos_semana: prazos.length,
      empresa: text(obj(inicio.empresa).razao_social) || null,
    },
  };
}

export function contextoAluno(dados: DadosAluno): Base {
  const inicio = obj(dados.inicio);
  const progresso = obj(inicio.progresso);
  const resumo: string[] = [];
  const destaques: AnaDestaque[] = [];
  const total = num(progresso.aulas_total);
  const feitas = num(progresso.aulas_concluidas);
  if (total) {
    resumo.push(
      `Você concluiu ${feitas} de ${total} aulas (${Math.round((100 * feitas) / total)}%).`,
    );
  }
  const continuar = obj(inicio.continuar);
  if (text(continuar.titulo)) {
    destaques.push({
      texto: `Continue de onde parou: ${text(continuar.titulo)}.`,
      href: '/academia',
      tom: 'info',
    });
  }
  const meta = obj(inicio.meta_semana);
  if (num(meta.total)) {
    resumo.push(`Meta da semana: ${num(meta.feitos)} de ${num(meta.total)} atividades feitas.`);
  }
  const atividade = obj(inicio.proxima_atividade);
  if (text(atividade.atividade) || text(atividade.objetivo)) {
    destaques.push({
      texto: `Próxima atividade do plano: ${text(atividade.atividade) || text(atividade.objetivo)}`,
      href: '/plano-30-dias',
      tom: 'info',
    });
  }
  const praticas = obj(inicio.praticas);
  if (num(praticas.devolvidas)) {
    destaques.push({
      texto: `${plural(num(praticas.devolvidas), 'prática devolvida', 'práticas devolvidas')} pela mentoria — vale ler o retorno.`,
      href: '/praticar',
      tom: 'atencao',
    });
  }
  const sessao = obj(inicio.proxima_sessao);
  if (sessao.inicio_at) {
    destaques.push({
      texto: `Sua próxima mentoria: ${text(sessao.titulo) || 'sessão'} em ${diaHora(sessao.inicio_at)}.`,
      href: '/mentoria',
      tom: 'info',
    });
  }
  const encontro = obj(inicio.proximo_encontro);
  if (encontro.inicio_at) {
    destaques.push({
      texto: `Próximo encontro ao vivo: ${text(encontro.titulo) || 'encontro'} em ${diaHora(encontro.inicio_at)}.`,
      href: '/encontros',
      tom: 'info',
    });
  }
  if (!inicio.diagnostico_feito) {
    destaques.unshift({
      texto: 'Faça o diagnóstico inicial para eu montar um caminho de estudo para o seu nível.',
      href: '/diagnostico',
      tom: 'atencao',
    });
  } else if (!inicio.plano_criado) {
    destaques.push({
      texto: 'Você ainda não tem plano de estudos; posso ajudar a montar.',
      href: '/plano-30-dias',
      tom: 'info',
    });
  }
  const recado = obj(inicio.recado_mentor);
  if (text(recado.texto)) {
    resumo.push(
      `Recado de ${text(recado.mentor) || 'sua mentoria'}: “${text(recado.texto).slice(0, 140)}”.`,
    );
  }
  resumo.push(...linhasDoRadar(dados.radar, 'aluno').slice(0, 2));
  destaques.push(...destaquesDoRadar(dados.radar).slice(0, 2));
  return {
    resumo,
    destaques: destaques.slice(0, 8),
    sugestoes: [
      'O que devo estudar hoje?',
      'Explique o que é habilitação em linguagem simples',
      'Como analiso um edital passo a passo?',
      'Quais licitações abertas posso usar para treinar?',
    ],
    fatos: { progresso, meta_semana: meta, praticas, acesso_ate: inicio.acesso_ate ?? null },
  };
}

export function contextoMentor(dados: DadosMentor): Base {
  const alunos = list(obj(dados.alunos).data);
  const agora = Date.now();
  const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;
  const parados = alunos.filter((aluno) => {
    const ultimo = aluno.ultimo_progresso ? new Date(text(aluno.ultimo_progresso)).getTime() : 0;
    return !ultimo || agora - ultimo > SETE_DIAS;
  });
  const aDevolver = alunos.reduce((soma, aluno) => soma + num(aluno.praticas_a_devolver), 0);
  const aRevisar = alunos.reduce((soma, aluno) => soma + num(aluno.plano_a_revisar), 0);
  const sessoes = alunos
    .filter((aluno) => aluno.proxima_sessao)
    .sort((a, b) => text(a.proxima_sessao).localeCompare(text(b.proxima_sessao)));
  const resumo: string[] = [
    `${plural(alunos.length, 'aluno ativo', 'alunos ativos')} na sua carteira.`,
  ];
  const destaques: AnaDestaque[] = [];
  if (aDevolver) {
    destaques.push({
      texto: `${plural(aDevolver, 'prática aguarda', 'práticas aguardam')} a sua devolutiva.`,
      href: '/mentor/devolutivas',
      tom: 'atencao',
    });
  }
  if (aRevisar) {
    destaques.push({
      texto: `${plural(aRevisar, 'atividade do plano', 'atividades do plano')} para revisar.`,
      href: '/mentor',
      tom: 'atencao',
    });
  }
  if (parados.length) {
    destaques.push({
      texto: `${plural(parados.length, 'aluno sem avanço', 'alunos sem avanço')} há mais de 7 dias: ${parados
        .slice(0, 3)
        .map((aluno) => text(aluno.nome).split(' ')[0])
        .join(', ')}${parados.length > 3 ? '…' : ''}.`,
      href: '/mentor',
      tom: 'atencao',
    });
  }
  if (sessoes[0]) {
    destaques.push({
      texto: `Próxima sessão: ${text(sessoes[0].nome)} em ${diaHora(sessoes[0].proxima_sessao)}.`,
      href: '/mentor/sessoes',
      tom: 'info',
    });
  }
  return {
    resumo,
    destaques,
    sugestoes: [
      'Quais alunos precisam de atenção esta semana?',
      'Sugira um feedback para uma prática de edital',
      'Como estruturar a próxima sessão de mentoria?',
      'Resuma o progresso da turma',
    ],
    fatos: {
      alunos: alunos.length,
      parados_7d: parados.length,
      devolutivas_pendentes: aDevolver,
      planos_a_revisar: aRevisar,
    },
  };
}

export function contextoAdmin(dados: DadosAdmin): Base {
  const overview = obj(dados.overview);
  const resumo: string[] = [];
  const destaques: AnaDestaque[] = [];
  const curso = dados.modulo === 'curso';
  if (curso) {
    const c = obj(overview.curso);
    resumo.push(
      `${num(c.alunos_ativos)} alunos ativos, ${num(c.mentores_ativos)} mentores e ${num(c.turmas_ativas)} turmas ativas.`,
    );
    if (num(c.convites_pendentes)) {
      destaques.push({
        texto: `${plural(num(c.convites_pendentes), 'convite pendente', 'convites pendentes')} de aceite.`,
        href: '/gestao/alunos',
        tom: 'info',
      });
    }
  } else {
    const e = obj(overview.empresas_clientes);
    resumo.push(`${num(e.total)} empresas clientes (${num(e.novos_30d)} novas em 30 dias).`);
    const a = obj(overview.alertas);
    resumo.push(
      `${plural(num(a.ultimas_24h), 'alerta enviado', 'alertas enviados')} nas últimas 24 horas.`,
    );
  }
  const leads = obj(overview.leads);
  if (num(leads.novos)) {
    destaques.push({
      texto: `${plural(num(leads.novos), 'lead novo', 'leads novos')} sem atendimento (${num(leads.novos_7d)} chegaram em 7 dias).`,
      href: curso ? '/gestao/leads' : '/leads',
      tom: 'atencao',
    });
  }
  const editais = obj(overview.editais);
  if (!curso) {
    resumo.push(
      `${num(editais.total).toLocaleString('pt-BR')} editais na base; ${num(editais.capturados_24h).toLocaleString('pt-BR')} capturados em 24 h.`,
    );
    const ultima = new Date(text(editais.ultima_captura)).getTime();
    if (Number.isFinite(ultima) && Date.now() - ultima > 60 * 60 * 1000) {
      destaques.push({
        texto: `A última captura de editais foi em ${diaHora(editais.ultima_captura)}. Vale conferir as fontes.`,
        href: '/admin/fontes',
        tom: 'atencao',
      });
    }
  }
  const ingestao = obj(overview.ingestao);
  if (num(ingestao.dead_letters_pendentes)) {
    destaques.push({
      texto: `${plural(num(ingestao.dead_letters_pendentes), 'item da coleta falhou', 'itens da coleta falharam')} e aguardam análise.`,
      href: '/admin/fontes',
      tom: 'atencao',
    });
  }
  resumo.push(
    `${plural(num(obj(overview.ana).conversas_7d), 'conversa com a Ana', 'conversas com a Ana')} em 7 dias.`,
  );
  return {
    resumo,
    destaques,
    sugestoes: curso
      ? [
          'Como está o engajamento dos alunos?',
          'Quais leads preciso atender primeiro?',
          'Gere um relatório da semana',
          'Quais convites estão pendentes?',
        ]
      : [
          'Gere um relatório da semana',
          'Como está a coleta de editais?',
          'Quais leads preciso atender primeiro?',
          'Quais empresas estão sem acessar?',
        ],
    fatos: {
      modulo: dados.modulo,
      contas_por_papel: overview.contas_por_papel ?? [],
      empresas_clientes: overview.empresas_clientes ?? null,
      curso: overview.curso ?? null,
      leads,
      editais,
      ingestao,
      alertas_24h: obj(overview.alertas).ultimas_24h ?? 0,
    },
  };
}

export function contextoColaborador(dados: DadosColaborador): Base {
  const radar = obj(dados.radar);
  return {
    resumo: linhasDoRadar(radar, 'colaborador'),
    destaques: destaquesDoRadar(radar),
    sugestoes: [
      'Quais licitações abertas combinam mais com os meus nichos?',
      'Explique o que devo conferir em um edital',
      'O que encerra hoje?',
    ],
    fatos: { radar: obj(radar.cards) },
  };
}

export function montarContexto(
  area: AnaArea,
  papel: string,
  dados: {
    empresa?: DadosEmpresa;
    aluno?: DadosAluno;
    mentor?: DadosMentor;
    admin?: DadosAdmin;
    colaborador?: DadosColaborador;
    me: unknown;
  },
): AnaContexto {
  const nome = text(obj(dados.me).nome).trim().split(/\s+/)[0] || null;
  let base: Base;
  if (area === 'empresa')
    base = contextoEmpresa(dados.empresa ?? { inicio: null, radar: null, me: dados.me });
  else if (area === 'aluno')
    base = contextoAluno(dados.aluno ?? { inicio: null, radar: null, me: dados.me });
  else if (area === 'mentor') base = contextoMentor(dados.mentor ?? { alunos: null, me: dados.me });
  else if (area === 'colaborador')
    base = contextoColaborador(dados.colaborador ?? { radar: null, me: dados.me });
  else
    base = contextoAdmin(
      dados.admin ?? {
        overview: null,
        me: dados.me,
        modulo: area === 'curso' ? 'curso' : 'profissional',
      },
    );
  return { area, papel, nome, ...base, gerado_em: new Date().toISOString() };
}

export function registerAnaContextoRoutes(app: FastifyInstance): void {
  app.get('/ana/contexto', async (request, reply) => {
    const role = request.user.role;
    const header = request.headers['x-acting-as'];
    const area = activeArea(role, Array.isArray(header) ? header[0] : header) as AnaArea;
    const authorization = request.headers.authorization;
    const headers: Record<string, string> = authorization ? { authorization } : {};
    if (typeof header === 'string') headers['x-acting-as'] = header;
    const get = async (url: string): Promise<unknown> => {
      try {
        const response = await app.inject({ method: 'GET', url, headers });
        return response.statusCode === 200 ? response.json() : null;
      } catch {
        return null;
      }
    };
    const me = await get('/me');
    let contexto: AnaContexto;
    if (area === 'empresa') {
      const [inicio, radar] = [await get('/empresa/inicio'), await get('/radar/painel')];
      contexto = montarContexto(area, role, { empresa: { inicio, radar, me }, me });
    } else if (area === 'aluno') {
      const [inicio, radar] = [await get('/aluno/inicio'), await get('/radar/painel')];
      contexto = montarContexto(area, role, { aluno: { inicio, radar, me }, me });
    } else if (area === 'mentor') {
      contexto = montarContexto(area, role, {
        mentor: { alunos: await get('/mentor/alunos'), me },
        me,
      });
    } else if (area === 'colaborador') {
      contexto = montarContexto(area, role, {
        colaborador: { radar: await get('/radar/painel'), me },
        me,
      });
    } else {
      const modulo = area === 'curso' ? 'curso' : 'profissional';
      contexto = montarContexto(area, role, {
        admin: { overview: await get(`/platform/overview?modulo=${modulo}`), me, modulo },
        me,
      });
    }
    reply.header('cache-control', 'no-store');
    return reply.send(contexto);
  });
}
