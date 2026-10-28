/*
 * Fuente de datos de demostración: personas ficticias, rol mensual con un patrón fijo y marcaciones del reloj
 * generadas de forma determinista (las mismas en cada carga). Sirve para desarrollar y probar sin Frappe HR.
 */
import { CODIGOS, type Codigo } from '../domain/catalogos';
import { finTurno, type Marcacion } from '../domain/asistencia';
import { diasDelMes, inicioTurno, type Bloque, type MesId, type Programacion } from '../domain/reglas';
import { estadoProvisional, mesDe, type CambioTurno, type FuenteDatos, type TrabajadorRrhh } from './fuente-datos';

export const TRABAJADORES_DEMO: TrabajadorRrhh[] = [
  { id: 'HSC-0001', profesion: 'CMP', nombre: 'Raúl Panduro Ríos', upss: 'HOSP', anioIngreso: 2011, usuario: 'rpanduro', pinReloj: '1001' },
  { id: 'HSC-0002', profesion: 'CMP', nombre: 'Lucía Sangama Tuesta', upss: 'HOSP', anioIngreso: 2018, usuario: 'lsangama', pinReloj: '1002' },
  { id: 'HSC-0004', profesion: 'CEP', nombre: 'Carmen Ahuanari Vela', upss: 'HOSP', anioIngreso: 2009, usuario: 'cahuanari', pinReloj: '1004' },
  { id: 'HSC-0006', profesion: 'CEP', nombre: 'Milagros Huayunga Isuiza', upss: 'HOSP', anioIngreso: 2019, usuario: 'mhuayunga', pinReloj: '1006' },
  { id: 'HSC-0008', profesion: 'TE', nombre: 'Jorge Yumbato Rengifo', upss: 'HOSP', anioIngreso: 2006, usuario: 'jyumbato', pinReloj: '1008' },
  { id: 'HSC-0011', profesion: 'CMP', nombre: 'Víctor del Águila Soria', upss: 'EMG', anioIngreso: 2008, usuario: 'vdelaguila', pinReloj: '1011' },
  { id: 'HSC-0012', profesion: 'CMP', nombre: 'Paola Rengifo Tello', upss: 'EMG', anioIngreso: 2020, usuario: 'prengifo', pinReloj: '1012' },
  { id: 'HSC-0014', profesion: 'CEP', nombre: 'Jhon Fasabi Lomas', upss: 'EMG', anioIngreso: 2023, usuario: 'jfasabi', pinReloj: '1014' },
];

// ponytail: patrón semanal desfasado por trabajador; 42 h por semana (unas 180 h al mes) y 4 o 5 guardias al mes.
// La propuesta automática de verdad está en el prototipo (generarUpss) y se portará con el calendario del jefe.
const PATRON: Codigo[] = ['M', 'T', 'M', 'GDO', 'L', 'M', 'T'];

// Pseudoaleatorio estable a partir de un texto (FNV-1a), en [0, 1)
export function azar(semilla: string): number {
  let h = 2166136261;
  for (let i = 0; i < semilla.length; i++) h = Math.imul(h ^ semilla.charCodeAt(i), 16777619);
  return (h >>> 0) / 2 ** 32;
}

export function rolDemo(mes: MesId, trabajadores: readonly TrabajadorRrhh[] = TRABAJADORES_DEMO): Programacion {
  const p: Programacion = { [mes]: {} };
  trabajadores.forEach((w, i) => {
    const rol: Record<number, Codigo> = {};
    for (const dia of diasDelMes(mes)) {
      const codigo = PATRON[(dia.d + i * 3) % PATRON.length];
      rol[dia.d] = !dia.domingo
        ? codigo
        : codigo === 'GDO'
          ? 'GDDF'
          : CODIGOS[codigo].grupo === 'turno'
            ? 'DOM'
            : codigo;
    }
    p[mes][w.upss] = { ...p[mes][w.upss], [w.id]: rol };
  });
  return p;
}

// Marcaciones de los turnos ya terminados: ingreso unos minutos antes, salida unos minutos después.
// Para que la pantalla tenga casos: 1 de cada 14 turnos sin marcaciones y 1 de cada 16 sin salida.
export function marcacionesDemo(
  desde: Date,
  hasta: Date,
  ahora: Date,
  trabajadores: readonly TrabajadorRrhh[] = TRABAJADORES_DEMO,
): Marcacion[] {
  const out: Marcacion[] = [];
  const meses = new Set([mesDe(desde), mesDe(new Date(desde.getFullYear(), desde.getMonth() - 1, 1)), mesDe(hasta)]);
  for (const mes of meses) {
    const p = rolDemo(mes, trabajadores);
    for (const roles of Object.values(p[mes]))
      for (const [workerId, rol] of Object.entries(roles))
        for (const [d, codigo] of Object.entries(rol)) {
          const inicio = inicioTurno(mes, +d, codigo);
          const fin = finTurno(mes, +d, codigo);
          if (!inicio || !fin) continue;
          const r = azar(`${workerId}|${mes}|${d}`);
          if (r < 1 / 14) continue; // inasistencia
          const dispositivo = 'ZK-HSC-01';
          const ingreso = new Date(inicio.getTime() - Math.floor(r * 1000) % 20 * 60_000);
          if (ingreso >= desde && ingreso <= hasta && ingreso <= ahora) out.push({ workerId, fechaHora: ingreso, dispositivo });
          if (r < 1 / 14 + 1 / 16) continue; // sin salida
          const salida = new Date(fin.getTime() + Math.floor(r * 10_000) % 25 * 60_000);
          if (salida >= desde && salida <= hasta && salida <= ahora) out.push({ workerId, fechaHora: salida, dispositivo });
        }
  }
  return out.sort((a, b) => a.fechaHora.getTime() - b.fechaHora.getTime());
}

// Cambios guardados durante la sesión del navegador (la demo no persiste: al recargar vuelve al patrón)
const CAMBIOS = new Map<string, CambioTurno>();
const clave = (mes: MesId, upss: string, workerId: string, dia: number) => `${mes}|${upss}|${workerId}|${dia}`;

export const reiniciarDemo = () => CAMBIOS.clear();

export function crearFuenteDemo(ahora: () => Date = () => new Date()): FuenteDatos {
  return {
    trabajadores: async () => TRABAJADORES_DEMO,
    rolDelMes: async (mes) => {
      const p = rolDemo(mes);
      for (const c of CAMBIOS.values())
        if (c.mes === mes) p[mes][c.upss] = { ...p[mes][c.upss], [c.workerId]: { ...p[mes][c.upss]?.[c.workerId], [c.dia]: c.codigo } };
      return p;
    },
    marcaciones: async (desde, hasta) => marcacionesDemo(desde, hasta, ahora()),
    estadoCronograma: async (mes) => estadoProvisional(mes, ahora()),
    bloques: async (mes, upss, workerId, dia): Promise<Bloque[] | undefined> =>
      CAMBIOS.get(clave(mes, upss, workerId, dia))?.bloques,
    guardarTurno: async (c) => {
      CAMBIOS.set(clave(c.mes, c.upss, c.workerId, c.dia), c);
    },
  };
}
