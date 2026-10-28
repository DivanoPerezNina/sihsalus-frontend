import { describe, expect, it } from 'vitest';
import { emparejar, finTurno, resumenAsistencia, turnosConAsistencia, type Marcacion } from './asistencia';
import type { Programacion } from './reglas';

const f = (dia: number, hh: number, mm = 0) => new Date(2026, 9, dia, hh, mm);
const m = (workerId: string, fechaHora: Date, tipo?: 'IN' | 'OUT'): Marcacion => ({ workerId, fechaHora, tipo });

describe('fin del turno', () => {
  it('la mañana termina el mismo día y la guardia nocturna al día siguiente', () => {
    expect(finTurno('2026-10', 5, 'M')).toEqual(f(5, 13));
    expect(finTurno('2026-10', 5, 'GNO')).toEqual(f(6, 7));
    expect(finTurno('2026-10', 31, 'GNO')).toEqual(new Date(2026, 10, 1, 7));
  });

  it('los códigos sin horario no tienen fin', () => {
    expect(finTurno('2026-10', 5, 'L')).toBeNull();
  });
});

describe('emparejar marcaciones con un turno', () => {
  it('toma la primera marcación como ingreso y la última como salida', () => {
    const r = emparejar(f(5, 7), f(5, 13), [m('1', f(5, 6, 52)), m('1', f(5, 7, 5)), m('1', f(5, 13, 10))]);
    expect(r).toEqual({ ingreso: f(5, 6, 52), salida: f(5, 13, 10) });
  });

  it('ignora marcaciones fuera de la ventana', () => {
    expect(emparejar(f(5, 7), f(5, 13), [m('1', f(5, 4)), m('1', f(5, 18))])).toEqual({});
  });

  it('respeta el tipo informado por el reloj', () => {
    expect(emparejar(f(5, 7), f(5, 13), [m('1', f(5, 7), 'OUT'), m('1', f(5, 13), 'IN')])).toEqual({});
  });

  it('una guardia nocturna se cierra con la marcación de la mañana siguiente', () => {
    expect(emparejar(f(5, 19), f(6, 7), [m('1', f(5, 18, 50)), m('1', f(6, 7, 15))])).toEqual({
      ingreso: f(5, 18, 50),
      salida: f(6, 7, 15),
    });
  });
});

describe('asistencia del mes (RF08)', () => {
  const P: Programacion = {
    '2026-10': {
      HOSP: { A: { 1: 'M', 2: 'T', 3: 'GNO', 4: 'L', 6: 'M' }, B: { 1: 'GDO', 2: 'M' } },
    },
  };
  const marcaciones = [
    m('A', f(1, 6, 55)),
    m('A', f(1, 13, 2)),
    m('A', f(2, 12, 58)), // tarde del 2: solo ingreso
    m('B', f(2, 13, 5)), // mañana del 2 de B: solo salida
  ];
  const ahora = f(6, 9);
  const turnos = turnosConAsistencia(P, '2026-10', marcaciones, ahora);

  it('incluye solo turnos con horario, ordenados por inicio', () => {
    expect(turnos.map((t) => `${t.workerId}${t.dia}${t.codigo}`)).toEqual(['A1M', 'B1GDO', 'B2M', 'A2T', 'A3GNO', 'A6M']);
  });

  it('clasifica cada turno', () => {
    expect(Object.fromEntries(turnos.map((t) => [`${t.workerId}${t.dia}`, t.estado]))).toEqual({
      A1: 'asistio',
      B1: 'inasistencia',
      A2: 'sin_salida',
      B2: 'sin_ingreso',
      A3: 'inasistencia',
      A6: 'en_curso',
    });
  });

  it('resume los estados', () => {
    expect(resumenAsistencia(turnos)).toEqual({
      asistio: 1,
      sin_salida: 1,
      sin_ingreso: 1,
      inasistencia: 2,
      en_curso: 1,
      por_venir: 0,
    });
  });

  it('un turno futuro está por venir', () => {
    expect(turnosConAsistencia(P, '2026-10', [], f(1, 0))[0].estado).toBe('por_venir');
  });
});
