/*
 * Contrato entre las pantallas y el origen de los datos. Hoy hay dos implementaciones:
 * - demo: datos sintéticos generados en el navegador (mientras no exista Frappe HR en el ambiente).
 * - frappe: Frappe HR por su API REST, detrás del gateway de SIH SALUS.
 */
import type { Marcacion } from '../domain/asistencia';
import type { MesId, Programacion, UpssId, WorkerId } from '../domain/reglas';

export interface TrabajadorRrhh {
  id: WorkerId;
  nombre: string;
  upss: UpssId;
  anioIngreso: number;
  usuario?: string; // usuario de SIH SALUS (Employee.user_id en Frappe HR)
  pinReloj?: string; // PIN del reloj ZKTeco (Employee.attendance_device_id)
}

export interface FuenteDatos {
  trabajadores(): Promise<TrabajadorRrhh[]>;
  rolDelMes(mes: MesId): Promise<Programacion>;
  marcaciones(desde: Date, hasta: Date): Promise<Marcacion[]>;
}

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
