import { describe, expect, it } from 'vitest';
import { diasEntre, esDomingo, formatoLargo, hoyMadrid, proximoDomingo, relativo, serie, sumarDias } from '../../src/lib/fechas';

describe('fechas', () => {
  it('formatea como en el ejemplo pedido', () => {
    expect(formatoLargo('2026-10-25')).toBe('Domingo, 25 de octubre de 2026');
  });

  it('calcula "hoy" en Madrid y no en UTC', () => {
    // 23:30 UTC del 24/10 → ya es 25/10 en Madrid (UTC+2 en horario de verano)
    expect(hoyMadrid(new Date('2026-10-24T23:30:00Z'))).toBe('2026-10-25');
    // 22:30 UTC del 24/12 → 23:30 en Madrid (UTC+1): sigue siendo 24
    expect(hoyMadrid(new Date('2026-12-24T22:30:00Z'))).toBe('2026-12-24');
  });

  it('suma días sin desfases en el cambio de hora (25/10/2026)', () => {
    expect(sumarDias('2026-10-18', 14)).toBe('2026-11-01');
    expect(sumarDias('2026-03-22', 14)).toBe('2026-04-05');
    expect(diasEntre('2026-10-18', '2026-11-01')).toBe(14);
  });

  it('cada 14 días desde un domingo siempre cae en domingo; cada 15 no', () => {
    const cada14 = serie('2026-10-25', 14, 26);
    expect(cada14.every(esDomingo)).toBe(true);
    expect(new Set(cada14).size).toBe(26);
    expect(serie('2026-10-25', 15, 2)[1]).toBe('2026-11-09');
    expect(esDomingo('2026-11-09')).toBe(false);
  });

  it('próximo domingo', () => {
    expect(proximoDomingo('2026-10-25')).toBe('2026-10-25');
    expect(proximoDomingo('2026-10-26')).toBe('2026-11-01');
  });

  it('textos relativos', () => {
    expect(relativo('2026-10-25', '2026-10-25')).toBe('Hoy');
    expect(relativo('2026-10-26', '2026-10-25')).toBe('Mañana');
    expect(relativo('2026-11-08', '2026-10-25')).toBe('En 14 días');
    expect(relativo('2026-10-22', '2026-10-25')).toBe('Hace 3 días');
  });
});
