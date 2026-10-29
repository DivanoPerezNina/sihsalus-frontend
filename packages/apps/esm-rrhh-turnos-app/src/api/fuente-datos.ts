/*
 * Contrato entre las pantallas y el origen de los datos. Hoy hay dos implementaciones:
 * - demo: datos sintéticos generados en el navegador (mientras no exista Frappe HR en el ambiente).
 * - frappe: Frappe HR por su API REST, detrás del gateway de SIH SALUS.
 */
import type { Marcacion } from '../domain/asistencia';
import type { Codigo } from '../domain/catalogos';
import type { EstadoCronograma } from '../domain/flujo';
import type { Bloque, ConfirmacionTurno, MesId, Programacion, UpssId, WorkerId } from '../domain/reglas';

export type { EstadoCronograma };

export interface TrabajadorRrhh {
  id: WorkerId;
  nombre: string;
  upss: UpssId;
  anioIngreso: number;
  profesion?: string; // abreviatura del colegio (CMP, CEP, TE…); define los bloques SUSALUD sugeridos
  usuario?: string; // usuario de SIH SALUS (Employee.user_id en Frappe HR)
  pinReloj?: string; // PIN del reloj ZKTeco (Employee.attendance_device_id)
  susalud?: DatosSusalud; // RF27, RF31: datos que pide la plantilla TuASUSALUD
}

export interface DatosSusalud {
  tipoDoc: 'DNI' | 'CE';
  numDoc: string;
  apellidos: string;
  nombres: string;
  colegiatura: string;
  especialidad: string;
}

// Un turno nuevo, modificado o cancelado (cancelar = poner un código sin horario, como L)
export interface CambioTurno {
  mes: MesId;
  upss: UpssId;
  workerId: WorkerId;
  dia: number;
  codigo: Codigo;
  bloques: Bloque[]; // RF26; vacío si el código no tiene horario
  motivo?: string; // RF30: obligatorio si el cronograma está publicado
}

export interface FuenteDatos {
  trabajadores(): Promise<TrabajadorRrhh[]>;
  rolDelMes(mes: MesId): Promise<Programacion>;
  marcaciones(desde: Date, hasta: Date): Promise<Marcacion[]>;
  estadoCronograma(mes: MesId, upss: UpssId): Promise<EstadoCronograma>;
  bloques(mes: MesId, upss: UpssId, workerId: WorkerId, dia: number): Promise<Bloque[] | undefined>;
  // Bloques guardados del mes, por `upss|workerId|dia` (los turnos sin bloques usan los sugeridos)
  bloquesDelMes(mes: MesId): Promise<Record<string, Bloque[]>>;
  guardarTurno(cambio: CambioTurno): Promise<void>;
  // RF18, RF19: cambio de estado del cronograma (la observación del director va como comentario)
  cambiarEstado(mes: MesId, upss: UpssId, estado: EstadoCronograma, observacion?: string): Promise<void>;
  // RF03, RF20: respuestas de los trabajadores a sus turnos publicados
  confirmaciones(mes: MesId): Promise<ConfirmacionTurno[]>;
  responderTurno(respuesta: ConfirmacionTurno): Promise<void>;
}

// Estado de un cronograma que todavía no tiene registro: los meses pasados y el actual se consideran publicados
// (se programaron antes de usar el componente) y los futuros, borrador.
export const estadoProvisional = (mes: MesId, ahora: Date): EstadoCronograma =>
  mes <= mesDe(ahora) ? 'Publicado' : 'Borrador';

export type TipoFuente = 'demo' | 'frappe';

const dosDigitos = (n: number) => String(n).padStart(2, '0');

export const mesDe = (fecha: Date): MesId => `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}`;

export function mesVecino(mes: MesId, delta: number): MesId {
  const [y, m] = mes.split('-').map(Number);
  return mesDe(new Date(y, m - 1 + delta, 1));
}

// Rango de marcaciones de un mes: incluye la mañana del día 1 del mes siguiente (salida de la última guardia nocturna)
export function rangoMarcaciones(mes: MesId): [Date, Date] {
  const [y, m] = mes.split('-').map(Number);
  return [new Date(y, m - 1, 1, 0, 0), new Date(y, m, 1, 12, 0)];
}

// 'AAAA-MM-DD' ↔ Date en hora local (Frappe HR guarda fechas y horas sin zona horaria, en la hora del servidor)
export const fechaIso = (d: Date) => `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
export const fechaHoraIso = (d: Date) =>
  `${fechaIso(d)} ${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}:${dosDigitos(d.getSeconds())}`;

export function leerFechaHora(texto: string): Date {
  const [f, h = '00:00:00'] = texto.split(' ');
  const [y, m, d] = f.split('-').map(Number);
  const [hh, mm, ss] = h.split(':').map((x) => Math.trunc(Number(x)));
  return new Date(y, m - 1, d, hh, mm, ss || 0);
}
