import { describe, expect, it, vi } from 'vitest';
import { maxGuardiasPorIngreso } from '../domain/parametros';
import { cruces, guardiasMes, horasMes } from '../domain/reglas';
import { turnosConAsistencia } from '../domain/asistencia';
import { TRABAJADORES_DEMO, marcacionesDemo, rolDemo } from './demo';
import { crearFuenteFrappe, upssDeDepartamento } from './frappe';
import { estadoGlobal, leerFechaHora, mesVecino, rangoMarcaciones } from './fuente-datos';

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
          sihsalus_usuario: 'rpanduro.hsc',
          sihsalus_profesion: 'CMP',
        },
      ]),
    );
    const t = await crearFuenteFrappe('/rrhh/', fetchFn).trabajadores();
    expect(t).toEqual([
      {
        id: 'HR-EMP-00001',
        nombre: 'Raúl Panduro',
        upss: 'HOSP',
        anioIngreso: 2011,
        profesion: 'CMP',
        usuario: 'rpanduro.hsc',
        pinReloj: '1001',
        susalud: { tipoDoc: 'DNI', numDoc: '', apellidos: '', nombres: '', colegiatura: '', especialidad: '' },
      },
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

  it('guardar un turno cancela la asignación del día, crea la nueva con sus bloques y deja el motivo', async () => {
    const llamadas: { url: string; metodo: string; cuerpo?: unknown }[] = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      llamadas.push({ url, metodo: init?.method ?? 'GET', cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes('/api/resource/Shift%20Assignment?'))
        return respuesta([{ name: 'HR-SHA-1', start_date: '2026-11-16', end_date: '2026-11-16' }]);
      if (url.endsWith('/api/resource/Shift%20Assignment')) return { ok: true, status: 200, json: async () => ({ data: { name: 'HR-SHA-2' } }) } as Response;
      return respuesta({});
    });
    const bloques = [{ servicio: 'HOSP' as const, ingreso: '07:00', salida: '19:00' }];
    await crearFuenteFrappe('/rrhh', fetchFn).guardarTurno({
      mes: '2026-11', upss: 'HOSP', workerId: 'E1', dia: 16, codigo: 'GDO', bloques, motivo: 'Reemplazo',
    });
    expect(llamadas.map((l) => `${l.metodo} ${l.url.split('?')[0]}`)).toEqual([
      'GET /rrhh/api/resource/Shift%20Assignment',
      'POST /rrhh/api/method/frappe.client.cancel',
      'POST /rrhh/api/resource/Shift%20Assignment',
      'POST /rrhh/api/resource/Comment',
    ]);
    expect(llamadas[2].cuerpo).toMatchObject({ employee: 'E1', shift_type: 'GDO', start_date: '2026-11-16', end_date: '2026-11-16', docstatus: 1 });
    expect(JSON.parse((llamadas[2].cuerpo as { sihsalus_bloques: string }).sihsalus_bloques)).toEqual(bloques);
    expect(llamadas[3].cuerpo).toMatchObject({ reference_name: 'HR-SHA-2', content: 'Motivo del cambio: Reemplazo' });
  });

  it('cancelar un turno (código sin horario) no crea una asignación nueva', async () => {
    const metodos: string[] = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      metodos.push(`${init?.method ?? 'GET'} ${url.split('?')[0]}`);
      return url.includes('Shift%20Assignment?') ? respuesta([{ name: 'HR-SHA-1', start_date: '2026-11-16', end_date: '2026-11-16' }]) : respuesta({});
    });
    await crearFuenteFrappe('/rrhh', fetchFn).guardarTurno({ mes: '2026-11', upss: 'HOSP', workerId: 'E1', dia: 16, codigo: 'L', bloques: [] });
    expect(metodos).toEqual(['GET /rrhh/api/resource/Shift%20Assignment', 'POST /rrhh/api/method/frappe.client.cancel']);
  });

  it('el estado del cronograma se crea la primera vez y luego se actualiza, con la observación como comentario', async () => {
    const metodos: string[] = [];
    let existe = false;
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      metodos.push(`${init?.method ?? 'GET'} ${decodeURIComponent(url)}`);
      if (!init?.method && url.includes('CT-2026-11-HOSP')) return existe ? respuesta({ estado: 'Enviado a aprobación' }) : respuesta(null, 404);
      return respuesta({});
    });
    const f = crearFuenteFrappe('/rrhh', fetchFn);
    await f.cambiarEstado('2026-11', 'HOSP', 'Enviado a aprobación');
    existe = true;
    await f.cambiarEstado('2026-11', 'HOSP', 'Borrador', 'Falta cubrir el 12');
    expect(metodos).toEqual([
      'GET /rrhh/api/resource/Cronograma Turnos/CT-2026-11-HOSP',
      'POST /rrhh/api/resource/Cronograma Turnos',
      'GET /rrhh/api/resource/Cronograma Turnos/CT-2026-11-HOSP',
      'PUT /rrhh/api/resource/Cronograma Turnos/CT-2026-11-HOSP',
      'POST /rrhh/api/resource/Comment',
    ]);
    expect(await f.estadoCronograma('2026-11', 'HOSP')).toBe('Enviado a aprobación');
  });

  it('la respuesta del trabajador actualiza su asignación del día', async () => {
    const llamadas: { url: string; metodo: string; cuerpo?: unknown }[] = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      llamadas.push({ url: decodeURIComponent(url), metodo: init?.method ?? 'GET', cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined });
      return url.includes('Shift%20Assignment?') ? respuesta([{ name: 'HR-SHA-9', start_date: '2026-11-03', end_date: '2026-11-03' }]) : respuesta({});
    });
    await crearFuenteFrappe('/rrhh', fetchFn).responderTurno({ mes: '2026-11', upss: 'HOSP', workerId: 'E1', dia: 3, estado: 'no_asiste', motivo: 'Licencia' });
    expect(llamadas[1]).toEqual({
      url: '/rrhh/api/resource/Shift Assignment/HR-SHA-9',
      metodo: 'PUT',
      cuerpo: { sihsalus_confirmacion: 'no_asiste', sihsalus_motivo_respuesta: 'Licencia' },
    });
  });

  it('un error de Frappe HR no se muestra tal cual: se lanza un error con el código', async () => {
    const fetchFn = vi.fn(async (_url: string) => respuesta(null, 403));
    await expect(crearFuenteFrappe('/rrhh', fetchFn).trabajadores()).rejects.toThrow('Frappe HR respondió 403');
  });
});

describe('estado de sincronización (RF12)', () => {
  it('el estado global es error si algún evento falló, pendiente si alguno espera y ok en otro caso', () => {
    const e = (estado: 'ok' | 'pendiente' | 'error') => ({ fecha: new Date(), flujo: 'F1', descripcion: '', estado, intentos: 0 });
    expect(estadoGlobal([e('ok'), e('error'), e('pendiente')])).toBe('error');
    expect(estadoGlobal([e('ok'), e('pendiente')])).toBe('pendiente');
    expect(estadoGlobal([e('ok')])).toBe('ok');
    expect(estadoGlobal([])).toBe('ok');
  });
});
