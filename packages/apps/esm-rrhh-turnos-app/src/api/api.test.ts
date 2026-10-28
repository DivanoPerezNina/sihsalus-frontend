import { describe, expect, it, vi } from 'vitest';
import { maxGuardiasPorIngreso } from '../domain/parametros';
import { cruces, guardiasMes, horasMes } from '../domain/reglas';
import { turnosConAsistencia } from '../domain/asistencia';
import { TRABAJADORES_DEMO, marcacionesDemo, rolDemo } from './demo';
import { crearFuenteFrappe, upssDeDepartamento } from './frappe';
import { leerFechaHora, mesVecino, rangoMarcaciones } from './fuente-datos';

describe('fuente demo', () => {
  const mes = '2026-10';
  const p = rolDemo(mes);

  it('el rol de cada trabajador cumple horas mínimas, tope de guardias y no tiene cruces', () => {
    for (const w of TRABAJADORES_DEMO) {
      expect(horasMes(p, mes, w.id), w.nombre).toBeGreaterThanOrEqual(150);
      expect(guardiasMes(p, mes, w.id), w.nombre).toBeLessThanOrEqual(maxGuardiasPorIngreso(w.anioIngreso));
      for (const [d, c] of Object.entries(p[mes][w.upss][w.id]))
        expect(cruces(p, mes, w.id, w.upss, +d, c), `${w.nombre} día ${d}`).toEqual([]);
    }
  });

  it('las marcaciones son siempre las mismas y dejan casos de inasistencia y de falta de salida', () => {
    const ahora = new Date(2026, 10, 15);
    const [desde, hasta] = rangoMarcaciones(mes);
    const a = marcacionesDemo(desde, hasta, ahora);
    expect(marcacionesDemo(desde, hasta, ahora)).toEqual(a);
    const estados = new Set(turnosConAsistencia(p, mes, a, ahora).map((t) => t.estado));
    expect([...estados].sort()).toEqual(['asistio', 'inasistencia', 'sin_salida']);
  });

  it('no inventa marcaciones en el futuro', () => {
    const ahora = new Date(2026, 9, 10, 8);
    const [desde, hasta] = rangoMarcaciones(mes);
    expect(marcacionesDemo(desde, hasta, ahora).every((m) => m.fechaHora <= ahora)).toBe(true);
  });
});

describe('utilidades de fechas', () => {
  it('lee fechas y horas de Frappe en hora local', () => {
    expect(leerFechaHora('2026-10-05 07:01:30.000000')).toEqual(new Date(2026, 9, 5, 7, 1, 30));
    expect(leerFechaHora('2026-10-05')).toEqual(new Date(2026, 9, 5));
  });

  it('calcula meses vecinos', () => {
    expect(mesVecino('2026-12', 1)).toBe('2027-01');
    expect(mesVecino('2026-01', -1)).toBe('2025-12');
  });
});

describe('fuente Frappe HR', () => {
  const respuesta = (data: unknown, status = 200) =>
    ({ ok: status < 400, status, json: async () => ({ data }) }) as Response;

  it('quita el sufijo de la empresa del departamento', () => {
    expect(upssDeDepartamento('Hospitalización - HSC')).toBe('Hospitalización');
    expect(upssDeDepartamento(null)).toBe('');
  });

  it('traduce empleados y consulta solo los activos', async () => {
    const fetchFn = vi.fn(async (_url: string) =>
      respuesta([
        {
          name: 'HR-EMP-00001',
          employee_name: 'Raúl Panduro',
          department: 'HOSP - HSC',
          user_id: 'rpanduro',
          attendance_device_id: '1001',
          date_of_joining: '2011-03-01',
        },
      ]),
    );
    const t = await crearFuenteFrappe('/rrhh/', fetchFn).trabajadores();
    expect(t).toEqual([
      { id: 'HR-EMP-00001', nombre: 'Raúl Panduro', upss: 'HOSP', anioIngreso: 2011, usuario: 'rpanduro', pinReloj: '1001' },
    ]);
    const url = new URL(fetchFn.mock.calls[0][0], 'http://x');
    expect(url.pathname).toBe('/rrhh/api/resource/Employee');
    expect(JSON.parse(url.searchParams.get('filters') ?? '')).toEqual([['status', '=', 'Active']]);
  });

  it('expande las asignaciones de turno a días del mes e ignora los tipos que no son códigos', async () => {
    const fetchFn = vi.fn(async (_url: string) =>
      respuesta([
        { employee: 'E1', shift_type: 'GNO', start_date: '2026-09-30', end_date: '2026-10-02', department: 'HOSP - HSC' },
        { employee: 'E1', shift_type: 'M', start_date: '2026-10-31', end_date: null, department: 'HOSP - HSC' },
        { employee: 'E2', shift_type: 'Turno administrativo', start_date: '2026-10-05', end_date: '2026-10-05' },
        { employee: 'E3', shift_type: 'T', start_date: '2026-09-01', end_date: '2026-09-30', department: 'EMG - HSC' },
      ]),
    );
    const p = await crearFuenteFrappe('/rrhh', fetchFn).rolDelMes('2026-10');
    expect(p).toEqual({ '2026-10': { HOSP: { E1: { 1: 'GNO', 2: 'GNO', 31: 'M' } } } });
  });

  it('traduce las marcaciones del reloj', async () => {
    const fetchFn = vi.fn(async (_url: string) =>
      respuesta([
        { employee: 'E1', time: '2026-10-05 06:55:00', log_type: 'IN', device_id: 'ZK-01' },
        { employee: 'E1', time: '2026-10-05 13:04:00', log_type: '', device_id: null },
      ]),
    );
    const m = await crearFuenteFrappe('/rrhh', fetchFn).marcaciones(new Date(2026, 9, 1), new Date(2026, 10, 1));
    expect(m).toEqual([
      { workerId: 'E1', fechaHora: new Date(2026, 9, 5, 6, 55), tipo: 'IN', dispositivo: 'ZK-01' },
      { workerId: 'E1', fechaHora: new Date(2026, 9, 5, 13, 4), tipo: undefined, dispositivo: undefined },
    ]);
    const url = new URL(fetchFn.mock.calls[0][0], 'http://x');
    expect(JSON.parse(url.searchParams.get('filters') ?? '')).toEqual([
      ['time', 'between', ['2026-10-01 00:00:00', '2026-11-01 00:00:00']],
    ]);
  });

  it('un error de Frappe HR no se muestra tal cual: se lanza un error con el código', async () => {
    const fetchFn = vi.fn(async (_url: string) => respuesta(null, 403));
    await expect(crearFuenteFrappe('/rrhh', fetchFn).trabajadores()).rejects.toThrow('Frappe HR respondió 403');
  });
});
