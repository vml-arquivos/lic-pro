/**
 * Calendário dos avisos. O Brasil não usa horário de verão desde 2019, então Brasília é
 * sempre UTC-3; isso evita depender de dados de fuso no servidor.
 */
export type Frequency = 'imediata' | 'diario' | 'semanal';
export const DIGEST_HOURS = [7, 12, 18] as const;
const BRT_OFFSET_HOURS = 3;

export type ScheduleRule = {
  frequencia: Frequency;
  horario_diario: number;
  /** 1 = segunda … 7 = domingo */
  dia_semana: number;
};

function slotUtc(year: number, month: number, day: number, hour: number): Date {
  return new Date(Date.UTC(year, month, day, hour + BRT_OFFSET_HOURS));
}

/** Quando um aviso criado em `now` deve chegar à pessoa. */
export function nextDelivery(now: Date, rule: ScheduleRule): Date {
  if (rule.frequencia === 'imediata') return now;
  const local = new Date(now.getTime() - BRT_OFFSET_HOURS * 3_600_000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  if (rule.frequencia === 'diario') {
    const today = slotUtc(year, month, day, rule.horario_diario);
    return today.getTime() > now.getTime()
      ? today
      : slotUtc(year, month, day + 1, rule.horario_diario);
  }
  const weekday = local.getUTCDay() === 0 ? 7 : local.getUTCDay();
  let ahead = (rule.dia_semana - weekday + 7) % 7;
  let slot = slotUtc(year, month, day + ahead, rule.horario_diario);
  if (slot.getTime() <= now.getTime()) {
    ahead += 7;
    slot = slotUtc(year, month, day + ahead, rule.horario_diario);
  }
  return slot;
}

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  imediata: 'Na hora',
  diario: 'Resumo diário',
  semanal: 'Resumo semanal',
};
