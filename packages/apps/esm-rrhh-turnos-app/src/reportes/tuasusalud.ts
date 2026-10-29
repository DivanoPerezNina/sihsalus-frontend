/*
 * RF27: llena la plantilla oficial TuASUSALUD (hoja Data, desde la fila 4) sin tocar su formato, listas ni hoja Maestros.
 * Portado del prototipo; la plantilla incluida no tiene datos personales.
 */
import JSZip from 'jszip';

import type { TrabajadorRrhh } from '../api/fuente-datos';
import { CODIGOS, SERVICIOS_SUSALUD, type ServicioSusalud } from '../domain/catalogos';
import { aMin, bloquesPorDefecto, validarSusalud, type Bloque, type MesId, type Observacion, type Programacion } from '../domain/reglas';

export interface Ipress {
  codigo: string;
  nombre: string;
  red: string;
}

export interface FilaSusalud {
  w: TrabajadorRrhh;
  servicio: ServicioSusalud;
  dias: Record<number, { ingreso: string; salida: string }>;
}

// Una fila por persona y servicio; si un servicio se repite el mismo día se une en un solo horario (RF26)
export function filasSusalud(
  mes: MesId,
  p: Programacion,
  trabajadores: readonly TrabajadorRrhh[],
  bloquesGuardados: Record<string, Bloque[]>,
  upss?: string,
): FilaSusalud[] {
  const porId = new Map(trabajadores.map((w) => [w.id, w]));
  const filas = new Map<string, FilaSusalud>();
  for (const [u, roles] of Object.entries(p[mes] ?? {})) {
    if (upss && u !== upss) continue;
    for (const [wid, rol] of Object.entries(roles)) {
      const w = porId.get(wid);
      if (!w) continue;
      for (const [dia, c] of Object.entries(rol)) {
        if (CODIGOS[c].horas === 0) continue;
        for (const b of bloquesGuardados[`${u}|${wid}|${dia}`] ?? bloquesPorDefecto({ profesion: w.profesion ?? '' }, u, c)) {
          const k = `${wid}|${b.servicio}`;
          const f = filas.get(k) ?? { w, servicio: b.servicio, dias: {} };
          filas.set(k, f);
          const prev = f.dias[+dia];
          f.dias[+dia] = prev
            ? {
                ingreso: aMin(prev.ingreso) <= aMin(b.ingreso) ? prev.ingreso : b.ingreso,
                salida: aMin(prev.salida) >= aMin(b.salida) ? prev.salida : b.salida,
              }
            : { ingreso: b.ingreso, salida: b.salida };
        }
      }
    }
  }
  return [...filas.values()].sort(
    (a, b) => (a.w.susalud?.apellidos ?? a.w.nombre).localeCompare(b.w.susalud?.apellidos ?? b.w.nombre) || a.servicio.localeCompare(b.servicio),
  );
}

// RF31: observaciones de los trabajadores que entran en la exportación
export function observacionesSusalud(filas: readonly FilaSusalud[]): Observacion[] {
  const vistos = new Map(filas.map((f) => [f.w.id, f.w]));
  return [...vistos.values()].flatMap((w) =>
    w.susalud
      ? validarSusalud({ ...w.susalud, id: w.id, profesion: w.profesion ?? '', anioIngreso: w.anioIngreso, upss: w.upss })
      : [{ workerId: w.id, campo: 'Datos TuASUSALUD', problema: 'faltan en la ficha del trabajador' }],
  );
}

const col = (n: number) => {
  // 1 → A, 27 → AA
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Estilos de la fila 4 de la plantilla, por columna
const ESTILO: Record<string, number> = { A: 6, B: 14, C: 14, D: 7, E: 6, F: 7, G: 6, H: 7, I: 7, J: 6, K: 8 };
const FORMULA_RED = (r: number) => `IFERROR(INDEX(Maestros!$B$3:$K$300,MATCH($A${r},Maestros!$C$3:$C$300,0),10),"")`;

function filaXml(r: number, f: FilaSusalud, ipress: Ipress): string {
  const txt = (c: string, v: string) => `<c r="${c}${r}" s="${ESTILO[c] ?? 11}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
  const s = f.w.susalud;
  const celdas = [
    txt('A', ipress.codigo),
    txt('B', ipress.nombre),
    `<c r="C${r}" s="14" t="str"><f>${esc(FORMULA_RED(r))}</f><v>${esc(ipress.red)}</v></c>`,
    txt('D', s?.tipoDoc ?? ''),
    txt('E', s?.numDoc ?? ''),
    txt('F', f.w.profesion ?? ''),
    txt('G', s?.colegiatura ?? ''),
    txt('H', s?.apellidos ?? ''),
    txt('I', s?.nombres ?? ''),
    txt('J', s?.especialidad ?? ''),
    txt('K', SERVICIOS_SUSALUD[f.servicio]),
  ];
  for (let d = 1; d <= 31; d++) {
    const x = f.dias[d];
    const ci = col(12 + (d - 1) * 2);
    const cs = col(13 + (d - 1) * 2);
    celdas.push(x ? txt(ci, x.ingreso) : `<c r="${ci}${r}" s="11"/>`, x ? txt(cs, x.salida) : `<c r="${cs}${r}" s="11"/>`);
  }
  return celdas.join('');
}

// Llena la hoja Data de la plantilla y devuelve el .xlsx. Si hay más filas que las preformateadas, se ignoran las sobrantes.
export async function llenarPlantilla(plantilla: ArrayBuffer | Uint8Array, filas: readonly FilaSusalud[], ipress: Ipress) {
  const zip = await JSZip.loadAsync(plantilla);
  const hoja = await zip.file('xl/worksheets/sheet1.xml')?.async('string');
  if (!hoja) throw new Error('La plantilla TuASUSALUD no tiene la hoja Data');
  const nueva = hoja.replace(/<row r="(\d+)"([^>]*)>.*?<\/row>/gs, (row, r, attrs) => {
    const i = +r - 4;
    return i >= 0 && i < filas.length ? `<row r="${r}"${attrs}>${filaXml(+r, filas[i], ipress)}</row>` : row;
  });
  zip.file('xl/worksheets/sheet1.xml', nueva);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

export function descargar(blob: Blob, nombre: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function descargarTuasusalud(mes: MesId, filas: readonly FilaSusalud[], ipress: Ipress) {
  const plantilla = await (await fetch(new URL('./plantilla-tuasusalud.xlsx', import.meta.url))).arrayBuffer();
  const xlsx = await llenarPlantilla(plantilla, filas, ipress);
  const [y, m] = mes.split('-');
  descargar(
    new Blob([new Uint8Array(xlsx)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Plantilla Asistencia TuaSusalud ${m}.${y}.xlsx`,
  );
}
