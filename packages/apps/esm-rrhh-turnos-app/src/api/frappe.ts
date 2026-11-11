/*
 * Fuente de datos sobre Frappe HR (API REST). Mapeo:
 * Employee → trabajador · Shift Assignment (Shift Type = código del rol) → rol del mes · Employee Checkin → marcaciones
 * del reloj · DocTypes propios: Cronograma Turnos (estado), Bitacora Turnos (RNF03), Parametros Turnos, Turno Ejecutado
 * (RF28), Acceso Excepcional (RF05) y Evento Sincronizacion (RF12). Los crea sihsalus-rrhh-integracion/frappe/sembrar.py.
 */
import type { Marcacion } from '../domain/asistencia';
import { CODIGOS, type Codigo } from '../domain/catalogos';
import type { EstadoCronograma } from '../domain/flujo';
import { PARAMS_DEFECTO, type Parametros } from '../domain/parametros';
import type { Bloque, Confirmacion, ConfirmacionTurno, MesId, Programacion } from '../domain/reglas';
import {
  estadoProvisional,
  fechaHoraIso,
  fechaIso,
  leerFechaHora,
  type CambioEjecutado,
  type CambioTurno,
  type EntradaBitacora,
  type EventoSync,
  type FuenteDatos,
  type TrabajadorRrhh,
} from './fuente-datos';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface OpcionesFrappe {
  usuario?: string; // usuario de SIH SALUS, para la bitácora y el acceso excepcional
  integracionUrl?: string; // capa de integración (Camel): responde si la petición viene de la red del hospital
  fetchFn?: Fetch;
}

interface EmployeeFrappe {
  name: string;
  employee_name: string;
  first_name?: string | null;
  last_name?: string | null;
  department?: string | null;
  user_id?: string | null;
  attendance_device_id?: string | null;
  date_of_joining?: string | null;
  sihsalus_usuario?: string | null;
  sihsalus_profesion?: string | null;
  sihsalus_tipo_doc?: string | null;
  sihsalus_num_doc?: string | null;
  sihsalus_colegiatura?: string | null;
  sihsalus_especialidad?: string | null;
  sihsalus_condicion?: string | null;
  sihsalus_openmrs_provider?: string | null;
}

interface AsignacionFrappe {
  name: string;
  employee: string;
  shift_type: string;
  start_date: string;
  end_date?: string | null;
  department?: string | null;
  sihsalus_bloques?: string | null;
  sihsalus_confirmacion?: Confirmacion | '' | null;
  sihsalus_motivo_respuesta?: string | null;
}

export class ErrorFrappe extends Error {
  constructor(readonly status: number) {
    super(`Frappe HR respondió ${status}`);
  }
}

// Frappe nombra los departamentos "HOSP - HSC"; la UPSS es el nombre sin el sufijo de la empresa
export const upssDeDepartamento = (departamento?: string | null) => (departamento ?? '').replace(/ - [^-]+$/, '').trim();

const esCodigo = (x: string): x is Codigo => x in CODIGOS;
const CRONOGRAMA = 'Cronograma Turnos';
const PARAMETROS = 'Parametros Turnos';
const nombreCronograma = (mes: MesId, upss: string) => `CT-${mes}-${upss}`;
const fechaDe = (mes: MesId, dia: number) => `${mes}-${String(dia).padStart(2, '0')}`;

// Nombres de los parámetros en el DocType (snake_case) ↔ en el componente
const CAMPOS_PARAMETROS: Record<keyof Parametros, string> = {
  horasMinimasMes: 'horas_minimas_mes',
  guardiasMaxAntiguos: 'guardias_max_antiguos',
  guardiasMaxNuevos: 'guardias_max_nuevos',
  anioCorteAntiguos: 'anio_corte_antiguos',
  mesesAdelante: 'meses_adelante',
  recordatorioHoras: 'recordatorio_horas',
  accesoExcepcionalMin: 'acceso_excepcional_min',
  requiereAprobacion: 'requiere_aprobacion',
  cacheDias: 'cache_dias',
};

export function crearFuenteFrappe(baseUrl: string, opciones: OpcionesFrappe = {}): FuenteDatos {
  const base = baseUrl.replace(/\/$/, '');
  const fetchFn: Fetch = opciones.fetchFn ?? ((u, i) => fetch(u, i));
  const usuario = opciones.usuario ?? '';
  const recurso = (doctype: string, nombre?: string) =>
    `${base}/api/resource/${encodeURIComponent(doctype)}${nombre ? `/${encodeURIComponent(nombre)}` : ''}`;

  // Con sesión de Frappe (cookie), las escrituras necesitan CSRF salvo que el sitio lo desactive (solo en desarrollo)
  // o que la petición llegue con el token de Keycloak, que es el camino previsto detrás del gateway.
  async function enviar<T>(url: string, cuerpo: unknown, method: 'POST' | 'PUT' = 'POST'): Promise<T> {
    const r = await fetchFn(url, {
      method,
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    if (!r.ok) throw new ErrorFrappe(r.status);
    return (await r.json()) as T;
  }

  async function leer<T>(url: string): Promise<T | undefined> {
    const r = await fetchFn(url, { credentials: 'include', headers: { Accept: 'application/json' } });
    if (r.status === 404) return undefined;
    if (!r.ok) throw new ErrorFrappe(r.status);
    return ((await r.json()) as { data: T }).data;
  }

  async function lista<T>(doctype: string, fields: string[], filters: unknown[], extra: Record<string, string> = {}): Promise<T[]> {
    const q = new URLSearchParams({ fields: JSON.stringify(fields), filters: JSON.stringify(filters), limit_page_length: '0', ...extra });
    return (await leer<T[]>(`${recurso(doctype)}?${q}`)) ?? [];
  }

  const asignacionesDelDia = (workerId: string, dia: number, mes: MesId) =>
    lista<AsignacionFrappe>(
      'Shift Assignment',
      ['name', 'shift_type', 'start_date', 'end_date', 'sihsalus_bloques'],
      [
        ['employee', '=', workerId],
        ['docstatus', '=', 1],
        ['start_date', '<=', fechaDe(mes, dia)],
        ['end_date', '>=', fechaDe(mes, dia)],
      ],
    );

  // RNF03: una entrada por cada cambio. Frappe fija el autor (owner) y la fecha (creation).
  const registrar = (e: Omit<EntradaBitacora, 'fecha' | 'usuario'>) =>
    enviar(recurso('Bitacora Turnos'), {
      accion: e.accion,
      mes: e.mes,
      upss: e.upss,
      employee: e.workerId,
      dia: e.dia,
      detalle: e.detalle,
      motivo: e.motivo,
      usuario_sihsalus: usuario,
    });

  async function parametros(): Promise<Parametros> {
    const doc = await leer<Record<string, number | null>>(recurso(PARAMETROS, PARAMETROS));
    if (!doc?.horas_minimas_mes) return PARAMS_DEFECTO; // todavía sin configurar
    const p = Object.fromEntries(
      Object.entries(CAMPOS_PARAMETROS).map(([k, campo]) => [k, doc[campo] ?? PARAMS_DEFECTO[k as keyof Parametros]]),
    ) as unknown as Parametros;
    return { ...p, requiereAprobacion: Boolean(doc.requiere_aprobacion) };
  }

  return {
    parametros,

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
          'sihsalus_condicion',
          'sihsalus_openmrs_provider',
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
        condicion: e.sihsalus_condicion ?? undefined,
        practitionerId: e.sihsalus_openmrs_provider ?? undefined,
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
      const filas = await lista<AsignacionFrappe>(
        'Shift Assignment',
        ['employee', 'shift_type', 'start_date', 'end_date', 'department'],
        [
          ['docstatus', '=', 1],
          ['status', '=', 'Active'],
          ['start_date', '<=', fechaIso(ultimo)],
        ],
        // Las asignaciones sin fecha de fin (creadas a mano en Frappe HR) siguen vigentes
        { or_filters: JSON.stringify([['end_date', '>=', fechaIso(primero)], ['end_date', 'is', 'not set']]) },
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
      const filas = await lista<{ employee: string; time: string; log_type?: 'IN' | 'OUT' | '' | null; device_id?: string | null }>(
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

    // Sin registro, el estado provisional (meses anteriores al uso del componente)
    async estadoCronograma(mes: MesId, upss: string) {
      const doc = await leer<{ estado: EstadoCronograma }>(recurso(CRONOGRAMA, nombreCronograma(mes, upss)));
      return doc?.estado ?? estadoProvisional(mes, new Date());
    },

    async cambiarEstado(mes: MesId, upss: string, estado: EstadoCronograma, observacion?: string) {
      const nombre = nombreCronograma(mes, upss);
      if (await leer(recurso(CRONOGRAMA, nombre))) await enviar(recurso(CRONOGRAMA, nombre), { estado }, 'PUT');
      else await enviar(recurso(CRONOGRAMA), { mes, upss, estado });
      await registrar({ accion: 'estado', mes, upss, detalle: estado, motivo: observacion });
    },

    // RF26: los bloques SUSALUD van como JSON en el campo sihsalus_bloques del Shift Assignment
    async bloques(mes, _upss, workerId, dia) {
      const [a] = await asignacionesDelDia(workerId, dia, mes);
      return a?.sihsalus_bloques ? (JSON.parse(a.sihsalus_bloques) as Bloque[]) : undefined;
    },

    async bloquesDelMes(mes: MesId) {
      const filas = await lista<AsignacionFrappe>(
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

    // Reemplaza el turno del día: cancela la asignación de ese día y, si el código tiene horario, crea otra
    async guardarTurno(c: CambioTurno) {
      const anteriores = await asignacionesDelDia(c.workerId, c.dia, c.mes);
      for (const a of anteriores) {
        // ponytail: el componente solo crea asignaciones de un día; las de varios días se editan en Frappe HR
        if (a.start_date !== a.end_date) throw new Error('El turno es parte de una asignación de varios días');
        await enviar(`${base}/api/method/frappe.client.cancel`, { doctype: 'Shift Assignment', name: a.name });
      }
      if (esCodigo(c.codigo) && 'inicio' in CODIGOS[c.codigo])
        await enviar(recurso('Shift Assignment'), {
          employee: c.workerId,
          shift_type: c.codigo,
          start_date: fechaDe(c.mes, c.dia),
          end_date: fechaDe(c.mes, c.dia),
          status: 'Active',
          sihsalus_bloques: JSON.stringify(c.bloques),
          docstatus: 1,
        });
      await registrar({
        accion: 'turno',
        mes: c.mes,
        upss: c.upss,
        workerId: c.workerId,
        dia: c.dia,
        detalle: `${anteriores[0]?.shift_type ?? 'L'} → ${c.codigo}`,
        motivo: c.motivo,
      });
    },

    // RF03, RF20: la respuesta del trabajador va en campos del Shift Assignment editables tras el envío
    async confirmaciones(mes: MesId): Promise<ConfirmacionTurno[]> {
      const filas = await lista<AsignacionFrappe>(
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
        estado: a.sihsalus_confirmacion as Confirmacion,
        motivo: a.sihsalus_motivo_respuesta ?? undefined,
      }));
    },

    async responderTurno(r: ConfirmacionTurno) {
      const [a] = await asignacionesDelDia(r.workerId, r.dia, r.mes);
      if (!a) throw new Error('No hay un turno asignado ese día');
      await enviar(recurso('Shift Assignment', a.name), { sihsalus_confirmacion: r.estado, sihsalus_motivo_respuesta: r.motivo ?? '' }, 'PUT');
    },

    async eventosSync(): Promise<EventoSync[]> {
      const filas = await lista<{ creation: string; flujo: string; descripcion: string; referencia?: string; estado: EventoSync['estado']; intentos?: number }>(
        'Evento Sincronizacion',
        ['creation', 'flujo', 'descripcion', 'referencia', 'estado', 'intentos'],
        [],
        { order_by: 'creation desc', limit_page_length: '50' },
      );
      return filas.map((e) => ({ ...e, fecha: leerFechaHora(e.creation), intentos: e.intentos ?? 0 }));
    },

    async guardarParametros(p: Parametros, motivo: string) {
      const actual = await parametros();
      const cambios = (Object.keys(CAMPOS_PARAMETROS) as (keyof Parametros)[]).filter((k) => p[k] !== actual[k]);
      if (cambios.length === 0) return;
      await enviar(
        recurso(PARAMETROS, PARAMETROS),
        Object.fromEntries(Object.entries(CAMPOS_PARAMETROS).map(([k, campo]) => [campo, Number(p[k as keyof Parametros])])),
        'PUT',
      );
      await registrar({ accion: 'parametros', detalle: cambios.map((k) => `${k}: ${actual[k]} → ${p[k]}`).join('; '), motivo });
    },

    async bitacora(filtro = {}): Promise<EntradaBitacora[]> {
      const filas = await lista<{
        creation: string;
        owner: string;
        accion: EntradaBitacora['accion'];
        mes?: string;
        upss?: string;
        employee?: string;
        dia?: number;
        detalle?: string;
        motivo?: string;
        usuario_sihsalus?: string;
      }>(
        'Bitacora Turnos',
        ['creation', 'owner', 'accion', 'mes', 'upss', 'employee', 'dia', 'detalle', 'motivo', 'usuario_sihsalus'],
        filtro.workerId ? [['employee', '=', filtro.workerId]] : [],
        { order_by: 'creation desc', limit_page_length: '100' },
      );
      return filas.map((b) => ({
        fecha: leerFechaHora(b.creation),
        usuario: b.usuario_sihsalus || b.owner,
        accion: b.accion,
        mes: b.mes || undefined,
        upss: b.upss || undefined,
        workerId: b.employee || undefined,
        dia: b.dia || undefined,
        detalle: b.detalle || undefined,
        motivo: b.motivo || undefined,
      }));
    },

    async ejecutado(mes: MesId): Promise<Programacion> {
      const filas = await lista<{ upss: string; employee: string; dia: number; codigo: string }>(
        'Turno Ejecutado',
        ['upss', 'employee', 'dia', 'codigo'],
        [['mes', '=', mes]],
      );
      const p: Programacion = { [mes]: {} };
      for (const e of filas) {
        if (!esCodigo(e.codigo)) continue;
        p[mes][e.upss] = p[mes][e.upss] ?? {};
        p[mes][e.upss][e.employee] = { ...p[mes][e.upss][e.employee], [e.dia]: e.codigo };
      }
      return p;
    },

    async guardarEjecutado(c: CambioEjecutado) {
      const nombre = `TE-${c.mes}-${c.upss}-${c.workerId}-${c.dia}`;
      if (await leer(recurso('Turno Ejecutado', nombre))) await enviar(recurso('Turno Ejecutado', nombre), { codigo: c.codigo }, 'PUT');
      else await enviar(recurso('Turno Ejecutado'), { mes: c.mes, upss: c.upss, employee: c.workerId, dia: c.dia, codigo: c.codigo });
      await registrar({ accion: 'ejecutado', mes: c.mes, upss: c.upss, workerId: c.workerId, dia: c.dia, detalle: c.codigo, motivo: c.motivo });
    },

    // RNF09: lo decide la capa de integración mirando la IP de origen. Si no responde, se asume fuera de la red
    // (cerrado por defecto); el gateway sigue siendo la autoridad.
    async enRedHospital() {
      if (!opciones.integracionUrl) return false;
      try {
        const r = await fetchFn(`${opciones.integracionUrl.replace(/\/$/, '')}/red`, { headers: { Accept: 'application/json' } });
        return r.ok && ((await r.json()) as { enRed?: boolean }).enRed === true;
      } catch {
        return false;
      }
    },

    async accesoExcepcionalHasta() {
      const [a] = await lista<{ hasta: string }>(
        'Acceso Excepcional',
        ['hasta'],
        [
          ['usuario_sihsalus', '=', usuario],
          ['hasta', '>', fechaHoraIso(new Date())],
        ],
        { order_by: 'hasta desc', limit_page_length: '1' },
      );
      return a ? leerFechaHora(a.hasta) : undefined;
    },

    async solicitarAcceso(motivo: string, minutos: number) {
      const hasta = new Date(Date.now() + minutos * 60_000);
      await enviar(recurso('Acceso Excepcional'), { usuario_sihsalus: usuario, motivo, hasta: fechaHoraIso(hasta) });
      await registrar({ accion: 'acceso_excepcional', detalle: `${minutos} min`, motivo });
      return hasta;
    },
  };
}
