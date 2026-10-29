import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { TRABAJADORES_DEMO } from '../api/demo';
import type { DatosSusalud } from '../api/fuente-datos';
import type { Programacion } from '../domain/reglas';
import { filasSusalud, llenarPlantilla, observacionesSusalud } from './tuasusalud';

const IPRESS = { codigo: '00000066', nombre: 'HOSPITAL II-1 SANTA CLOTILDE', red: 'MAYNAS PERIFERIE' };
const [panduro, , ahuanari] = TRABAJADORES_DEMO; // médico y enfermera de Hospitalización

const P: Programacion = {
  '2026-11': {
    HOSP: { [panduro.id]: { 2: 'M', 3: 'GNO', 4: 'L' }, [ahuanari.id]: { 2: 'T' } },
    EMG: { [panduro.id]: { 5: 'GDO' } },
  },
};

describe('TuASUSALUD (RF27, RF31)', () => {
  it('arma una fila por trabajador y servicio con el horario de cada día', () => {
    const filas = filasSusalud('2026-11', P, TRABAJADORES_DEMO, {});
    expect(filas.map((f) => `${f.w.id} ${f.servicio}`)).toEqual([
      `${ahuanari.id} HOSP`,
      `${ahuanari.id} REGAT`,
      `${panduro.id} EMG`,
      `${panduro.id} HOSP`,
      `${panduro.id} REGAT`,
      `${panduro.id} RETEN`,
    ]);
    const hosp = filas.find((f) => f.w.id === panduro.id && f.servicio === 'HOSP');
    expect(hosp?.dias).toEqual({ 2: { ingreso: '07:00', salida: '12:00' } });
  });

  it('usa los bloques guardados y une un servicio repetido el mismo día (RF26)', () => {
    const bloques = {
      [`HOSP|${panduro.id}|2`]: [
        { servicio: 'HOSP' as const, ingreso: '07:00', salida: '09:00' },
        { servicio: 'HOSP' as const, ingreso: '10:00', salida: '13:00' },
      ],
    };
    const filas = filasSusalud('2026-11', P, TRABAJADORES_DEMO, bloques, 'HOSP');
    expect(filas.find((f) => f.w.id === panduro.id && f.servicio === 'HOSP')?.dias[2]).toEqual({ ingreso: '07:00', salida: '13:00' });
  });

  it('valida los datos de quienes se exportan', () => {
    const observado = { ...panduro, susalud: { ...(panduro.susalud as DatosSusalud), colegiatura: '' } };
    const filas = filasSusalud('2026-11', P, [observado, ahuanari], {});
    expect(observacionesSusalud(filas)).toEqual([{ workerId: panduro.id, campo: 'Número de colegiatura', problema: 'vacío' }]);
  });

  it('llena la hoja Data de la plantilla oficial desde la fila 4 sin tocar el resto', async () => {
    const plantilla = readFileSync(join(__dirname, 'plantilla-tuasusalud.xlsx'));
    const filas = filasSusalud('2026-11', P, TRABAJADORES_DEMO, {});
    const xlsx = await llenarPlantilla(plantilla, filas, IPRESS);
    const zip = await JSZip.loadAsync(xlsx);
    const hoja = (await zip.file('xl/worksheets/sheet1.xml')?.async('string')) ?? '';
    expect(hoja).toContain('<c r="A4" s="6" t="inlineStr"><is><t>00000066</t></is></c>');
    expect(hoja).toContain(`<t>${ahuanari.susalud?.apellidos}</t>`);
    expect(hoja).toContain('<c r="N4" s="11" t="inlineStr"><is><t>13:00</t></is></c>'); // ingreso del día 2 (columna N)
    const original = await JSZip.loadAsync(plantilla);
    expect(await zip.file('xl/sharedStrings.xml')?.async('string')).toBe(await original.file('xl/sharedStrings.xml')?.async('string'));
  });
});
