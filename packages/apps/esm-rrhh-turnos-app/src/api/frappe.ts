/*
 * Fuente de datos sobre Frappe HR (API REST /api/resource). Mapeo en docs/plan-desarrollo.md del prototipo:
 * Employee → trabajador, Shift Assignment (Shift Type = código del rol) → rol del mes, Employee Checkin → marcaciones del reloj.
 */
import { CODIGOS, type Codigo } from '../domain/catalogos';
import type { Marcacion } from '../domain/asistencia';
import type { EstadoCronograma } from '../domain/flujo';
import type { Bloque, Confirmacion, ConfirmacionTurno, MesId, Programacion } from '../domain/reglas';
import {
  estadoProvisional,
  fechaHoraIso,
  fechaIso,
  leerFechaHora,
  type CambioTurno,
  type EventoSync,
  type FuenteDatos,
  type TrabajadorRrhh,
} from './fuente-datos';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

interface EmployeeFrappe {
  name: string;
  employee_name: string;
  department?: string | null;
  user_id?: string | null;
  attendance_device_id?: string | null;
  date_of_joining?: string | null;
  sihsalus_usuario?: string | null; // campos personalizados creados por sihsalus-rrhh-integracion/frappe/sembrar.py
  sihsalus_profesion?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  sihsalus_tipo_doc?: string | null;
  sihsalus_num_doc?: string | null;
  sihsalus_colegiatura?: string | null;
  sihsalus_especialidad?: string | null;
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

const CRONOGRAMA = 'Cronograma Turnos';
const nombreCronograma = (mes: MesId, upss: string) => `CT-${mes}-${upss}`;

export function crearFuenteFrappe(baseUrl: string, fetchFn: Fetch = (u, i) => fetch(u, i)): FuenteDatos {
  const base = baseUrl.replace(/\/$/, '');

  // Con sesión de Frappe (cookie), las escrituras necesitan CSRF salvo que el sitio lo desactive (solo en desarrollo)
  // o que la petición venga con un token Bearer de Keycloak, que es el camino previsto detrás del gateway.
  async function enviar<T>(ruta: string, cuerpo: unknown, method: 'POST' | 'PUT' = 'POST'): Promise<T> {
    const r = await fetchFn(`${base}${ruta}`, {
      method,
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    if (!r.ok) throw new ErrorFrappe(r.status);
    return (await r.json()) as T;
  }

  // Un documento por nombre; undefined si no existe
  async function documento<T>(doctype: string, nombre: string): Promise<T | undefined> {
    const r = await fetchFn(`${base}/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(nombre)}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (r.status === 404) return undefined;
    if (!r.ok) throw new ErrorFrappe(r.status);
    return ((await r.json()) as { data: T }).data;
  }

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
        [
          'name',
          'employee_name',
          'first_name',
          'last_name',
          'department',
          'user_id',
          'attendance_device_id',
          'date_of_joining',
          'sihsalus_usuario',
          'sihsalus_profesion',
          'sihsalus_tipo_doc',
          'sihsalus_num_doc',
          'sihsalus_colegiatura',
          'sihsalus_especialidad',
        ],
        [['status', '=', 'Active']],
      );
      return filas.map((e) => ({
        id: e.name,
        nombre: e.employee_name,
        upss: upssDeDepartamento(e.department),
        anioIngreso: e.date_of_joining ? +e.date_of_joining.slice(0, 4) : new Date().getFullYear(),
        profesion: e.sihsalus_profesion ?? undefined,
        // El vínculo es el usuario de SIH SALUS; user_id (usuario de Frappe, un correo) solo como respaldo
        usuario: e.sihsalus_usuario ?? e.user_id ?? undefined,
        pinReloj: e.attendance_device_id ?? undefined,
        susalud: {
          tipoDoc: e.sihsalus_tipo_doc === 'CE' ? 'CE' : 'DNI',
          numDoc: e.sihsalus_num_doc ?? '',
          apellidos: (e.last_name ?? '').toUpperCase(),
          nombres: (e.first_name ?? '').toUpperCase(),
          colegiatura: e.sihsalus_colegiatura ?? '',
          especialidad: e.sihsalus_especialidad ?? '',
        },
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

    // El estado vive en el DocType propio «Cronograma Turnos» (uno por mes y UPSS); sin registro, el provisional
    async estadoCronograma(mes: MesId, upss: string) {
      const doc = await documento<{ estado: EstadoCronograma }>(CRONOGRAMA, nombreCronograma(mes, upss));
      return doc?.estado ?? estadoProvisional(mes, new Date());
    },

    async cambiarEstado(mes: MesId, upss: string, estado: EstadoCronograma, observacion?: string) {
      const nombre = nombreCronograma(mes, upss);
      const ruta = `/api/resource/${encodeURIComponent(CRONOGRAMA)}`;
      if (await documento(CRONOGRAMA, nombre)) await enviar(`${ruta}/${encodeURIComponent(nombre)}`, { estado }, 'PUT');
      else await enviar(ruta, { mes, upss, estado });
      if (observacion)
        await enviar('/api/resource/Comment', {
          comment_type: 'Comment',
          reference_doctype: CRONOGRAMA,
          reference_name: nombre,
          content: `Observación del director: ${observacion}`,
        });
    },

    // RF03, RF20: la respuesta del trabajador se guarda en campos del Shift Assignment editables tras el envío
    async confirmaciones(mes: MesId): Promise<ConfirmacionTurno[]> {
      const filas = await lista<{
        employee: string;
        start_date: string;
        department?: string | null;
        sihsalus_confirmacion: Confirmacion;
        sihsalus_motivo_respuesta?: string | null;
      }>(
        'Shift Assignment',
        ['employee', 'start_date', 'department', 'sihsalus_confirmacion', 'sihsalus_motivo_respuesta'],
        [
          ['docstatus', '=', 1],
          ['start_date', 'like', `${mes}-%`],
          ['sihsalus_confirmacion', 'is', 'set'],
        ],
      );
      return filas.map((a) => ({
        mes,
        upss: upssDeDepartamento(a.department),
        workerId: a.employee,
        dia: +a.start_date.slice(8, 10),
        estado: a.sihsalus_confirmacion,
        motivo: a.sihsalus_motivo_respuesta ?? undefined,
      }));
    },

    async eventosSync(): Promise<EventoSync[]> {
      const q = new URLSearchParams({
        fields: JSON.stringify(['creation', 'flujo', 'descripcion', 'referencia', 'estado', 'intentos']),
        order_by: 'creation desc',
        limit_page_length: '50',
      });
      const r = await fetchFn(`${base}/api/resource/${encodeURIComponent('Evento Sincronizacion')}?${q}`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!r.ok) throw new ErrorFrappe(r.status);
      const filas = ((await r.json()) as { data: { creation: string; flujo: string; descripcion: string; referencia?: string; estado: EventoSync['estado']; intentos?: number }[] }).data;
      return filas.map((e) => ({ ...e, fecha: leerFechaHora(e.creation), intentos: e.intentos ?? 0 }));
    },

    async responderTurno(r: ConfirmacionTurno) {
      const [a] = await asignacionesDelDia(r.workerId, r.dia, r.mes);
      if (!a) throw new Error('No hay un turno asignado ese día');
      await enviar(
        `/api/resource/${encodeURIComponent('Shift Assignment')}/${encodeURIComponent(a.name)}`,
        { sihsalus_confirmacion: r.estado, sihsalus_motivo_respuesta: r.motivo ?? '' },
        'PUT',
      );
    },

    // RF26: los bloques SUSALUD se guardan como JSON en el campo personalizado sihsalus_bloques del Shift Assignment
    async bloques(_mes, _upss, workerId, dia) {
      const [a] = await asignacionesDelDia(workerId, dia, _mes);
      return a?.sihsalus_bloques ? (JSON.parse(a.sihsalus_bloques) as Bloque[]) : undefined;
    },

    async bloquesDelMes(mes: MesId) {
      const filas = await lista<{ employee: string; start_date: string; department?: string | null; sihsalus_bloques?: string | null }>(
        'Shift Assignment',
        ['employee', 'start_date', 'department', 'sihsalus_bloques'],
        [
          ['docstatus', '=', 1],
          ['start_date', 'like', `${mes}-%`],
          ['sihsalus_bloques', 'is', 'set'],
        ],
      );
      return Object.fromEntries(
        filas.map((a) => [`${upssDeDepartamento(a.department)}|${a.employee}|${+a.start_date.slice(8, 10)}`, JSON.parse(a.sihsalus_bloques ?? '[]')]),
      );
    },

    // Reemplaza el turno del día: cancela la asignación de ese día y, si el código tiene horario, crea otra.
    // El motivo (RF30) queda como comentario en la asignación nueva o en la cancelada.
    async guardarTurno(c: CambioTurno) {
      const anteriores = await asignacionesDelDia(c.workerId, c.dia, c.mes);
      for (const a of anteriores) {
        if (a.start_date !== a.end_date)
          throw new Error('El turno es parte de una asignación de varios días; edítala en Frappe HR'); // ponytail: el componente solo crea asignaciones de un día
        await enviar('/api/method/frappe.client.cancel', { doctype: 'Shift Assignment', name: a.name });
      }
      const fecha = `${c.mes}-${String(c.dia).padStart(2, '0')}`;
      let referencia = anteriores[0]?.name;
      if (esCodigo(c.codigo) && 'inicio' in CODIGOS[c.codigo]) {
        const nueva = await enviar<{ data: { name: string } }>(`/api/resource/${encodeURIComponent('Shift Assignment')}`, {
          employee: c.workerId,
          shift_type: c.codigo,
          start_date: fecha,
          end_date: fecha,
          status: 'Active',
          sihsalus_bloques: JSON.stringify(c.bloques),
          docstatus: 1,
        });
        referencia = nueva.data.name;
      }
      if (c.motivo && referencia)
        await enviar(`/api/resource/Comment`, {
          comment_type: 'Comment',
          reference_doctype: 'Shift Assignment',
          reference_name: referencia,
          content: `Motivo del cambio: ${c.motivo}`,
        });
    },
  };

  async function asignacionesDelDia(workerId: string, dia: number, mes: MesId) {
    const fecha = `${mes}-${String(dia).padStart(2, '0')}`;
    return lista<{ name: string; start_date: string; end_date?: string | null; sihsalus_bloques?: string | null }>(
      'Shift Assignment',
      ['name', 'start_date', 'end_date', 'sihsalus_bloques'],
      [
        ['employee', '=', workerId],
        ['docstatus', '=', 1],
        ['start_date', '<=', fecha],
        ['end_date', '>=', fecha],
      ],
    );
  }
}
