/*
 * Reglas de negocio configurables (RF25, RF29, RF01, RF18, RF15, RF05, RNF04).
 * Los valores por defecto salen de la normativa del HSC; en el sistema real los entrega la configuración del backend.
 */

export interface Parametros {
  horasMinimasMes: number; // RF25
  guardiasMaxAntiguos: number; // RF29
  guardiasMaxNuevos: number; // RF29
  anioCorteAntiguos: number; // RF29
  mesesAdelante: number; // RF01
  recordatorioHoras: number; // RF15
  accesoExcepcionalMin: number; // RF05
  requiereAprobacion: boolean; // RF18
  cacheDias: number; // RNF04
}

export const PARAMS_DEFECTO: Readonly<Parametros> = {
  horasMinimasMes: 150,
  guardiasMaxAntiguos: 7,
  guardiasMaxNuevos: 5,
  anioCorteAntiguos: 2014,
  mesesAdelante: 3,
  recordatorioHoras: 24,
  accesoExcepcionalMin: 30,
  requiereAprobacion: true,
  cacheDias: 7,
};

// RF29 · Directiva N.° 002-2016-GRL-DRSL-DESI-DSS-30.10.02: el tope depende del año de ingreso
export const maxGuardiasPorIngreso = (anioIngreso: number, p: Readonly<Parametros> = PARAMS_DEFECTO) =>
  anioIngreso <= p.anioCorteAntiguos ? p.guardiasMaxAntiguos : p.guardiasMaxNuevos;
