import { describe, expect, it } from 'vitest';
import { PARAMS_DEFECTO, maxGuardiasPorIngreso } from './parametros';
import {
  bloquesPorDefecto,
  confirmacion,
  cruces,
  crucesEntreBloques,
  diasDelMes,
  diasHabiles,
  existeCronograma,
  guardiasMes,
  horasBloques,
  horasMes,
  mesesProgramables,
  serviciosRepetidos,
  validarSusalud,
  yaInicio,
  type Programacion,
  type Trabajador,
} from './reglas';

// Jueves 10 de setiembre de 2026, 08:00 (el "hoy" de la demo)
const AHORA = new Date(2026, 8, 10, 8, 0);

const worker = (x: Partial<Trabajador> = {}): Trabajador => ({
  id: '1',
  apellidos: 'PANDURO RÍOS',
  nombres: 'RAÚL ERNESTO',
  tipoDoc: 'DNI',
  numDoc: '40218836',
  profesion: 'CMP',
  colegiatura: '045872',
  especialidad: 'MEDICINA INTERNA',
  anioIngreso: 2011,
  upss: 'HOSP',
  ...x,
});

// Trabajador 3: M los lunes (día 5) en CE; trabajador 1: guardias en HOSP
const P: Programacion = {
  '2026-10': {
    HOSP: { '1': { 1: 'GDO', 2: 'GNO', 5: 'M' }, '3': { 7: 'T' } },
    CE: { '3': { 5: 'M' } },
  },
};

describe('horas y guardias (RF25, RF29)', () => {
  it('suma horas y guardias de todas las UPSS', () => {
    expect(horasMes(P, '2026-10', '1')).toBe(12 + 12 + 6);
    expect(guardiasMes(P, '2026-10', '1')).toBe(2);
    expect(horasMes(P, '2026-10', '3')).toBe(6 + 6);
    expect(horasMes(P, '2026-10', '99')).toBe(0);
    expect(horasMes(P, '2030-01', '1')).toBe(0);
  });

  it('el tope de guardias depende del año de ingreso y de los parámetros', () => {
    expect(maxGuardiasPorIngreso(2014)).toBe(7);
    expect(maxGuardiasPorIngreso(2015)).toBe(5);
    expect(maxGuardiasPorIngreso(2015, { ...PARAMS_DEFECTO, guardiasMaxNuevos: 6 })).toBe(6);
    expect(maxGuardiasPorIngreso(2014, { ...PARAMS_DEFECTO, anioCorteAntiguos: 2010 })).toBe(5);
  });
});

describe('cruces de horario (RF23)', () => {
  it('detecta una guardia que se cruza con una mañana en otra UPSS', () => {
    expect(cruces(P, '2026-10', '3', 'HOSP', 5, 'GDO')).toEqual([{ upss: 'CE', dia: 5, codigo: 'M' }]);
  });

  it('no cuenta la celda que se está reemplazando', () => {
    expect(cruces(P, '2026-10', '3', 'CE', 5, 'GDO')).toEqual([]);
  });

  it('una guardia nocturna que termina a las 07:00 no choca con una mañana que empieza a las 07:00', () => {
    expect(cruces(P, '2026-10', '1', 'HOSP', 4, 'GNO')).toEqual([]);
  });

  it('dos guardias nocturnas el mismo día en distinta UPSS se cruzan', () => {
    expect(cruces(P, '2026-10', '1', 'CE', 2, 'GNO')).toEqual([{ upss: 'HOSP', dia: 2, codigo: 'GNO' }]);
  });

  it('los códigos sin horario (libre, licencia) no se cruzan', () => {
    expect(cruces(P, '2026-10', '1', 'HOSP', 1, 'L')).toEqual([]);
  });
});

describe('turnos que ya iniciaron (RF02, RF21)', () => {
  it('la mañana de hoy ya inició y la de mañana no', () => {
    expect(yaInicio('2026-09', 10, 'M', AHORA)).toBe(true);
    expect(yaInicio('2026-09', 11, 'M', AHORA)).toBe(false);
  });

  it('un día sin turno se bloquea desde hoy', () => {
    expect(yaInicio('2026-09', 9, 'L', AHORA)).toBe(true);
    expect(yaInicio('2026-09', 10, 'L', AHORA)).toBe(false);
  });
});

describe('bloques SUSALUD (RF26)', () => {
  it('un enfermero en Hospitalización: actividad más una hora de REGAT', () => {
    expect(bloquesPorDefecto(worker({ profesion: 'CEP' }), 'HOSP', 'M')).toEqual([
      { servicio: 'HOSP', ingreso: '07:00', salida: '12:00' },
      { servicio: 'REGAT', ingreso: '12:00', salida: '13:00' },
    ]);
  });

  it('un técnico de farmacia tiene un solo bloque', () => {
    expect(bloquesPorDefecto(worker({ profesion: 'TF' }), 'FAR', 'M')).toEqual([
      { servicio: 'FAR', ingreso: '07:00', salida: '13:00' },
    ]);
  });

  it('la guardia nocturna de un médico en Hospitalización va como retén', () => {
    expect(bloquesPorDefecto(worker(), 'HOSP', 'GNO')).toEqual([
      { servicio: 'RETEN', ingreso: '19:00', salida: '07:00' },
    ]);
  });

  it('los códigos sin horario no generan bloques', () => {
    expect(bloquesPorDefecto(worker(), 'HOSP', 'LV')).toEqual([]);
  });

  it('detecta bloques cruzados y servicios repetidos', () => {
    const bl = [
      { servicio: 'HOSP', ingreso: '07:00', salida: '12:00' },
      { servicio: 'HOSP', ingreso: '11:00', salida: '13:00' },
    ] as const;
    expect([...crucesEntreBloques(bl)]).toEqual([1]);
    expect([...serviciosRepetidos(bl)]).toEqual([1]);
  });

  it('las horas de los bloques de una nocturna son 12', () => {
    expect(horasBloques(bloquesPorDefecto(worker(), 'HOSP', 'GNO'))).toBe(12);
  });
});

describe('validación TuASUSALUD (RF31)', () => {
  it('un registro correcto no tiene observaciones', () => {
    expect(validarSusalud(worker())).toEqual([]);
  });

  it('un técnico con colegiatura distinta de 000000 se observa', () => {
    const o = validarSusalud(worker({ profesion: 'TE', colegiatura: 'T-4512' }));
    expect(o).toEqual([{ workerId: '1', campo: 'Número de colegiatura', problema: 'los técnicos van con 000000' }]);
  });

  it('una colegiatura vacía se observa', () => {
    const o = validarSusalud(worker({ profesion: 'CEP', colegiatura: '' }));
    expect(o).toEqual([{ workerId: '1', campo: 'Número de colegiatura', problema: 'vacío' }]);
  });

  it('el DNI debe tener 8 dígitos y la profesión debe estar en el catálogo', () => {
    const o = validarSusalud(worker({ numDoc: '123', profesion: 'XYZ' }));
    expect(o.map((x) => x.campo).sort()).toEqual(['Número de documento', 'Profesión']);
  });
});

describe('confirmación de turnos (RF03, RF20)', () => {
  const lista = [{ mes: '2026-09', upss: 'HOSP', workerId: '5', dia: 14, estado: 'no_asiste' as const }];

  it('usa la respuesta registrada si existe', () => {
    expect(confirmacion(lista, '2026-09', 'HOSP', '5', 14, 'M', AHORA)).toBe('no_asiste');
  });

  it('sin respuesta: confirmado si ya inició, pendiente si no', () => {
    expect(confirmacion(lista, '2026-09', 'HOSP', '5', 9, 'M', AHORA)).toBe('confirmado');
    expect(confirmacion(lista, '2026-09', 'HOSP', '5', 20, 'M', AHORA)).toBe('pendiente');
  });
});

describe('calendario (RF01)', () => {
  it('marca domingos y feriados', () => {
    const dias = diasDelMes('2026-09', [8]);
    expect(dias).toHaveLength(30);
    expect(dias[5]).toMatchObject({ d: 6, domingo: true, feriado: false });
    expect(dias[7]).toMatchObject({ d: 8, domingo: false, feriado: true });
    expect(diasHabiles('2026-09', [8])).toHaveLength(30 - 4 - 1); // 4 domingos y 1 feriado
  });

  it('se puede programar el mes en curso y los siguientes según el parámetro', () => {
    const meses = ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];
    expect(mesesProgramables(meses, AHORA, 3)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
    expect(mesesProgramables(meses, AHORA, 1)).toEqual(['2026-09', '2026-10']);
    expect(mesesProgramables(meses, AHORA, 0)).toEqual(['2026-09']);
  });

  it('un cronograma existe cuando la UPSS tiene a su propio personal', () => {
    const w = [worker({ id: '1', upss: 'HOSP' }), worker({ id: '3', upss: 'HOSP' })];
    expect(existeCronograma(P, '2026-10', 'HOSP', w)).toBe(true);
    // CE solo tiene personal de apoyo de Hospitalización, no propio
    expect(existeCronograma(P, '2026-10', 'CE', w)).toBe(false);
    expect(existeCronograma(P, '2026-11', 'HOSP', w)).toBe(false);
  });
});
