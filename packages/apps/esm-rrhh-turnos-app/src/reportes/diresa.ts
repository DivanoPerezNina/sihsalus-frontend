/* RF24: rol mensual en el formato de la DIRESA Loreto. Una fila por trabajador y una columna por día con el código. */
import type { TrabajadorRrhh } from '../api/fuente-datos';
import { PROFESIONES } from '../domain/catalogos';
import { diasDelMes, guardiasMes, horasMes, type MesId, type Programacion } from '../domain/reglas';
import type { Hoja } from './excel';

export function hojaDiresa(
  version: 'Registro' | 'Ejecutado',
  mes: MesId,
  p: Programacion,
  trabajadores: readonly TrabajadorRrhh[],
  microRed: string,
  upss?: string,
): Hoja {
  const dias = diasDelMes(mes);
  const filas: (string | number)[][] = [];
  for (const [u, roles] of Object.entries(p[mes] ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (upss && u !== upss) continue;
    for (const w of trabajadores.filter((x) => roles[x.id]).sort((a, b) => a.nombre.localeCompare(b.nombre)))
      filas.push([
        filas.length + 1,
        w.susalud?.numDoc ?? '',
        w.susalud ? `${w.susalud.apellidos} ${w.susalud.nombres}` : w.nombre,
        u,
        PROFESIONES[w.profesion ?? ''] ?? w.profesion ?? '',
        w.condicion ?? '',
        microRed,
        ...dias.map((d) => roles[w.id][d.d] ?? ''),
        horasMes(p, mes, w.id),
        guardiasMes(p, mes, w.id),
      ]);
  }
  return {
    nombre: version,
    titulo: `Rol de turnos y guardias ${mes} (${version})`,
    columnas: ['N°', 'DNI', 'Apellidos y nombres', 'Área', 'Profesión', 'Condición laboral', 'Micro red', ...dias.map((d) => String(d.d)), 'Horas', 'Guardias'],
    filas,
  };
}
