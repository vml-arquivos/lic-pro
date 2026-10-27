import { describe, expect, it } from 'vitest';
import { nextDelivery } from '../src/alert-schedule.js';

// 2026-10-26 é segunda-feira. 10:00 em Brasília = 13:00 UTC.
const at = (iso: string) => new Date(iso);
const daily = (hour: number) => ({
  frequencia: 'diario' as const,
  horario_diario: hour,
  dia_semana: 1,
});

describe('calendário dos avisos', () => {
  it('imediato entrega na hora', () => {
    const now = at('2026-10-26T13:00:00Z');
    expect(nextDelivery(now, { frequencia: 'imediata', horario_diario: 7, dia_semana: 1 })).toEqual(
      now,
    );
  });

  it('diário usa o próximo horário de Brasília', () => {
    const now = at('2026-10-26T13:00:00Z'); // 10:00 BRT
    expect(nextDelivery(now, daily(12)).toISOString()).toBe('2026-10-26T15:00:00.000Z');
    expect(nextDelivery(now, daily(18)).toISOString()).toBe('2026-10-26T21:00:00.000Z');
    expect(nextDelivery(now, daily(7)).toISOString()).toBe('2026-10-27T10:00:00.000Z');
  });

  it('diário respeita a virada do dia em Brasília e não em UTC', () => {
    const now = at('2026-10-27T01:30:00Z'); // 22:30 BRT de 26/10
    expect(nextDelivery(now, daily(7)).toISOString()).toBe('2026-10-27T10:00:00.000Z');
  });

  it('exatamente no horário vai para o próximo dia', () => {
    const now = at('2026-10-26T15:00:00Z'); // 12:00 BRT
    expect(nextDelivery(now, daily(12)).toISOString()).toBe('2026-10-27T15:00:00.000Z');
  });

  it('semanal espera o dia escolhido', () => {
    const now = at('2026-10-26T13:00:00Z'); // segunda 10:00 BRT
    const weekly = (day: number, hour = 7) => ({
      frequencia: 'semanal' as const,
      horario_diario: hour,
      dia_semana: day,
    });
    expect(nextDelivery(now, weekly(1, 12)).toISOString()).toBe('2026-10-26T15:00:00.000Z');
    expect(nextDelivery(now, weekly(1, 7)).toISOString()).toBe('2026-11-02T10:00:00.000Z');
    expect(nextDelivery(now, weekly(5)).toISOString()).toBe('2026-10-30T10:00:00.000Z');
    expect(nextDelivery(now, weekly(7)).toISOString()).toBe('2026-11-01T10:00:00.000Z');
  });
});
