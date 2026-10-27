/**
 * Plano de 30 dias do aluno, montado por regra fixa (sem IA) a partir das aulas da trilha.
 *
 * Dias 7, 14, 21 e 28 são de prática com edital real; 29 é revisão geral e 30 é fechamento.
 * Os outros 24 dias recebem as aulas, em ordem. Com poucas aulas elas ficam espaçadas; com
 * muitas, algumas aulas dividem o mesmo dia. O mentor pode ajustar qualquer dia depois.
 */
export type PlanLesson = { id: string; titulo: string; modulo: string };
export type PlanDay = {
  dia: number;
  tipo: 'aula' | 'quiz' | 'pratica' | 'revisao' | 'livre';
  objetivo: string;
  atividade: string;
  aula_id: string | null;
};

const PRACTICE_DAYS = new Set([7, 14, 21, 28]);

export function studyDays(): number[] {
  const days: number[] = [];
  for (let day = 1; day <= 28; day += 1) if (!PRACTICE_DAYS.has(day)) days.push(day);
  return days;
}

export function buildPlan(lessons: readonly PlanLesson[]): PlanDay[] {
  const slots = studyDays();
  const byDay = new Map<number, PlanLesson[]>();
  lessons.forEach((lesson, index) => {
    const slot =
      slots[
        Math.min(slots.length - 1, Math.floor((index * slots.length) / Math.max(lessons.length, 1)))
      ]!;
    byDay.set(slot, [...(byDay.get(slot) ?? []), lesson]);
  });

  const days: PlanDay[] = [];
  for (let dia = 1; dia <= 30; dia += 1) {
    if (PRACTICE_DAYS.has(dia)) {
      days.push({
        dia,
        tipo: 'pratica',
        objetivo: 'Aplicar o que estudou em um edital de verdade',
        atividade:
          'Escolha um edital no Radar, clique em “Praticar este edital” e responda as perguntas guiadas. O mentor devolve com comentários.',
        aula_id: null,
      });
    } else if (dia === 29) {
      days.push({
        dia,
        tipo: 'revisao',
        objetivo: 'Revisar o que ficou com dúvida',
        atividade:
          'Releia suas anotações, refaça os questionários e leve as dúvidas para a Ana ou para o mentor.',
        aula_id: null,
      });
    } else if (dia === 30) {
      days.push({
        dia,
        tipo: 'revisao',
        objetivo: 'Fechar o ciclo',
        atividade:
          'Confira o progresso, emita o certificado interno se concluiu a trilha e combine os próximos passos com o mentor.',
        aula_id: null,
      });
    } else {
      const planned = byDay.get(dia) ?? [];
      if (planned.length === 0) {
        days.push({
          dia,
          tipo: 'livre',
          objetivo: 'Dia livre de estudo',
          atividade:
            'Reveja a aula do dia anterior, explore o Radar ou tire uma dúvida com a Ana. Nada obrigatório hoje.',
          aula_id: null,
        });
      } else {
        days.push({
          dia,
          tipo: 'aula',
          objetivo: planned.length === 1 ? planned[0]!.modulo : 'Estudar o conteúdo do dia',
          atividade: planned.map((lesson) => lesson.titulo).join(' · '),
          aula_id: planned[0]!.id,
        });
      }
    }
  }
  return days;
}

/** Data de calendário do dia do plano (dia 1 = data de início). */
export function planDate(inicio: string, dia: number): string {
  const date = new Date(`${inicio.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dia - 1);
  return date.toISOString().slice(0, 10);
}
