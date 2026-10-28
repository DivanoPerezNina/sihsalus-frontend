/*
 * Fuente de datos sobre Frappe HR (API REST /api/resource). Mapeo en docs/plan-desarrollo.md del prototipo:
 * Employee → trabajador, Shift Assignment (Shift Type = código del rol) → rol del mes, Employee Checkin → marcaciones del reloj.
 */
import { CODIGOS, type Codigo } from '../domain/catalogos';
import type { Marcacion } from '../domain/asistencia';
import type { MesId, Programacion } from '../domain/reglas';
import { fechaHoraIso, fechaIso, leerFechaHora, type FuenteDatos, type TrabajadorRrhh } from './fuente-datos';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

interface EmployeeFrappe {
  name: string;
  employee_name: string;
  department?: string | null;
  user_id?: string | null;
  attendance_device_id?: string | null;
  date_of_joining?: string | null;
}

interface ShiftAssignmentFrappe {
  employee: string;
  shift_type: string;
  start_date: string;
  end_date?: string | null;
  department?: string | null;
}

interface CheckinFrappe {
  employee: string;
  time: string;
  log_type?: 'IN' | 'OUT' | '' | null;
  device_id?: string | null;
}

export class ErrorFrappe extends Error {
  constructor(readonly status: number) {
    super(`Frappe HR respondió ${status}`);
  }
}

// Frappe nombra los departamentos "Hospitalización - HSC"; la UPSS es el nombre sin el sufijo de la empresa
export const upssDeDepartamento = (departamento?: string | null) => (departamento ?? '').replace(/ - [^-]+$/, '').trim();

const esCodigo = (x: string): x is Codigo => x in CODIGOS;

export function crearFuenteFrappe(baseUrl: string, fetchFn: Fetch = (u, i) => fetch(u, i)): FuenteDatos {
  const base = baseUrl.replace(/\/$/, '');

  async function lista<T>(doctype: string, fields: string[], filters: unknown[]): Promise<T[]> {
    const q = new URLSearchParams({
      fields: JSON.stringify(fields),
      filters: JSON.stringify(filters),
      limit_page_length: '0',
    });
    const r = await fetchFn(`${base}/api/resource/${encodeURIComponent(doctype)}?${q}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) throw new ErrorFrappe(r.status);
    return ((await r.json()) as { data: T[] }).data;
  }

  return {
    async trabajadores(): Promise<TrabajadorRrhh[]> {
      const filas = await lista<EmployeeFrappe>(
        'Employee',
        ['name', 'employee_name', 'department', 'user_id', 'attendance_device_id', 'date_of_joining'],
        [['status', '=', 'Active']],
      );
      return filas.map((e) => ({
        id: e.name,
        nombre: e.employee_name,
        upss: upssDeDepartamento(e.department),
        anioIngreso: e.date_of_joining ? +e.date_of_joining.slice(0, 4) : new Date().getFullYear(),
        usuario: e.user_id ?? undefined,
        pinReloj: e.attendance_device_id ?? undefined,
      }));
    },

    async rolDelMes(mes: MesId): Promise<Programacion> {
      const [y, m] = mes.split('-').map(Number);
      const primero = new Date(y, m - 1, 1);
      const ultimo = new Date(y, m, 0);
      const filas = await lista<ShiftAssignmentFrappe>(
        'Shift Assignment',
        ['employee', 'shift_type', 'start_date', 'end_date', 'department'],
        [
          ['docstatus', '=', 1],
          ['status', '=', 'Active'],
          ['start_date', '<=', fechaIso(ultimo)],
        ],
      );
      const p: Programacion = { [mes]: {} };
      for (const a of filas) {
        if (!esCodigo(a.shift_type)) continue; // tipos de turno que no son códigos del rol
        const desde = leerFechaHora(a.start_date);
        const hasta = a.end_date ? leerFechaHora(a.end_date) : ultimo;
        if (hasta < primero) continue;
        const upss = upssDeDepartamento(a.department);
        p[mes][upss] = p[mes][upss] ?? {};
        const rol = p[mes][upss][a.employee] ?? {};
        p[mes][upss][a.employee] = rol;
        for (let d = new Date(Math.max(+desde, +primero)); d <= hasta && d <= ultimo; d.setDate(d.getDate() + 1))
          rol[d.getDate()] = a.shift_type;
      }
      return p;
    },

    async marcaciones(desde: Date, hasta: Date): Promise<Marcacion[]> {
      const filas = await lista<CheckinFrappe>(
        'Employee Checkin',
        ['employee', 'time', 'log_type', 'device_id'],
        [['time', 'between', [fechaHoraIso(desde), fechaHoraIso(hasta)]]],
      );
      return filas.map((c) => ({
        workerId: c.employee,
        fechaHora: leerFechaHora(c.time),
        tipo: c.log_type || undefined,
        dispositivo: c.device_id ?? undefined,
      }));
    },
  };
}
