/*
 * RF08: cruce entre el rol publicado y las marcaciones del reloj (ZKTeco, registradas en Frappe HR como Employee Checkin).
 * Solo dice si hubo ingreso y salida para cada turno. No calcula tardanzas ni descuentos: están fuera del alcance.
 */
import { CODIGOS, type Codigo } from './catalogos';
import { inicioTurno, type MesId, type Programacion, type UpssId, type WorkerId } from './reglas';

export interface Marcacion {
  workerId: WorkerId;
  fechaHora: Date;
  tipo?: 'IN' | 'OUT'; // si el reloj no lo informa, se deduce por la hora
  dispositivo?: string; // número de serie del reloj
}

export type EstadoAsistencia = 'asistio' | 'sin_salida' | 'sin_ingreso' | 'inasistencia' | 'en_curso' | 'por_venir';

export interface TurnoAsistencia {
  workerId: WorkerId;
  upss: UpssId;
  dia: number;
  codigo: Codigo;
  inicio: Date;
  fin: Date;
  ingreso?: Date;
  salida?: Date;
  estado: EstadoAsistencia;
}

// Minutos antes del inicio y después del fin en que una marcación todavía cuenta para el turno
export interface VentanaMarcacion {
  antesDelInicio: number;
  despuesDelFin: number;
}

export const VENTANA_DEFECTO: Readonly<VentanaMarcacion> = { antesDelInicio: 120, despuesDelFin: 240 };

const MIN = 60_000;

// Fin del turno; las nocturnas terminan al día siguiente
export function finTurno(mes: MesId, dia: number, codigo: Codigo): Date | null {
  const ini = inicioTurno(mes, dia, codigo);
  const c = CODIGOS[codigo];
  if (!ini || !('fin' in c)) return null;
  const fin = new Date(ini);
  fin.setHours(+c.fin.slice(0, 2), +c.fin.slice(3, 5), 0, 0);
  if (fin <= ini) fin.setDate(fin.getDate() + 1);
  return fin;
}

// Ingreso: la primera marcación entre (inicio − ventana) y la mitad del turno. Salida: la última entre la mitad y (fin + ventana).
// Una marcación en el cambio de turno (13:00) puede ser la salida de la mañana y el ingreso de la tarde a la vez.
export function emparejar(
  inicio: Date,
  fin: Date,
  marcaciones: readonly Marcacion[],
  ventana: Readonly<VentanaMarcacion> = VENTANA_DEFECTO,
): { ingreso?: Date; salida?: Date } {
  const mitad = (inicio.getTime() + fin.getTime()) / 2;
  const desde = inicio.getTime() - ventana.antesDelInicio * MIN;
  const hasta = fin.getTime() + ventana.despuesDelFin * MIN;
  let ingreso: Date | undefined;
  let salida: Date | undefined;
  for (const m of marcaciones) {
    const t = m.fechaHora.getTime();
    if (m.tipo !== 'OUT' && t >= desde && t < mitad && (!ingreso || t < ingreso.getTime())) ingreso = m.fechaHora;
    if (m.tipo !== 'IN' && t >= mitad && t <= hasta && (!salida || t > salida.getTime())) salida = m.fechaHora;
  }
  return { ingreso, salida };
}

export function estadoTurno(inicio: Date, fin: Date, ingreso: Date | undefined, salida: Date | undefined, ahora: Date): EstadoAsistencia {
  if (ahora < inicio) return 'por_venir';
  if (ahora < fin) return 'en_curso';
  if (ingreso && salida) return 'asistio';
  if (ingreso) return 'sin_salida';
  if (salida) return 'sin_ingreso';
  return 'inasistencia';
}

// Turnos con horario del mes (los libres y licencias no se marcan), con su ingreso, salida y estado
export function turnosConAsistencia(
  p: Programacion,
  mes: MesId,
  marcaciones: readonly Marcacion[],
  ahora: Date,
  ventana: Readonly<VentanaMarcacion> = VENTANA_DEFECTO,
): TurnoAsistencia[] {
  const porTrabajador = new Map<WorkerId, Marcacion[]>();
  for (const m of marcaciones) porTrabajador.set(m.workerId, [...(porTrabajador.get(m.workerId) ?? []), m]);
  const out: TurnoAsistencia[] = [];
  for (const [upss, roles] of Object.entries(p[mes] ?? {}))
    for (const [workerId, rol] of Object.entries(roles))
      for (const [d, codigo] of Object.entries(rol)) {
        const inicio = inicioTurno(mes, +d, codigo);
        const fin = finTurno(mes, +d, codigo);
        if (!inicio || !fin) continue;
        const { ingreso, salida } = emparejar(inicio, fin, porTrabajador.get(workerId) ?? [], ventana);
        out.push({ workerId, upss, dia: +d, codigo, inicio, fin, ingreso, salida, estado: estadoTurno(inicio, fin, ingreso, salida, ahora) });
      }
  return out.sort((a, b) => a.inicio.getTime() - b.inicio.getTime() || a.workerId.localeCompare(b.workerId));
}

export function resumenAsistencia(turnos: readonly TurnoAsistencia[]): Record<EstadoAsistencia, number> {
  const r = { asistio: 0, sin_salida: 0, sin_ingreso: 0, inasistencia: 0, en_curso: 0, por_venir: 0 };
  for (const t of turnos) r[t.estado]++;
  return r;
}
