/*
 * Catálogos oficiales del componente. No dependen de datos de la IPRESS.
 * Los códigos del rol son los de la GERESA; los servicios y profesiones son los de la hoja Maestros de la plantilla TuASUSALUD.
 */

export type GrupoCodigo = 'turno' | 'guardia' | 'descanso' | 'licencia';

export interface CodigoInfo {
  nombre: string;
  inicio?: string; // HH:mm
  fin?: string; // HH:mm; si es menor o igual que inicio, termina al día siguiente
  horas: number;
  grupo: GrupoCodigo;
}

export const CODIGOS = {
  M: { nombre: 'Mañana', inicio: '07:00', fin: '13:00', horas: 6, grupo: 'turno' },
  T: { nombre: 'Tarde', inicio: '13:00', fin: '19:00', horas: 6, grupo: 'turno' },
  APS: { nombre: 'Atención primaria de salud', inicio: '07:00', fin: '13:00', horas: 6, grupo: 'turno' },
  GDO: { nombre: 'Guardia diurna ordinaria', inicio: '07:00', fin: '19:00', horas: 12, grupo: 'guardia' },
  GNO: { nombre: 'Guardia nocturna ordinaria', inicio: '19:00', fin: '07:00', horas: 12, grupo: 'guardia' },
  GDDF: { nombre: 'Guardia diurna domingo y feriado', inicio: '07:00', fin: '19:00', horas: 12, grupo: 'guardia' },
  GNDF: { nombre: 'Guardia nocturna domingo y feriado', inicio: '19:00', fin: '07:00', horas: 12, grupo: 'guardia' },
  L: { nombre: 'Libre', horas: 0, grupo: 'descanso' },
  DOM: { nombre: 'Domingo', horas: 0, grupo: 'descanso' },
  FE: { nombre: 'Feriado', horas: 0, grupo: 'descanso' },
  LV: { nombre: 'Licencia por vacaciones', horas: 0, grupo: 'licencia' },
  LE: { nombre: 'Licencia por enfermedad', horas: 0, grupo: 'licencia' },
  LG: { nombre: 'Licencia por gravidez', horas: 0, grupo: 'licencia' },
  LP: { nombre: 'Licencia particular', horas: 0, grupo: 'licencia' },
  LO: { nombre: 'Licencia por onomástico', horas: 0, grupo: 'licencia' },
  LPT: { nombre: 'Licencia por paternidad', horas: 0, grupo: 'licencia' },
  LMT: { nombre: 'Licencia por maternidad', horas: 0, grupo: 'licencia' },
  LF: { nombre: 'Licencia por fallecimiento', horas: 0, grupo: 'licencia' },
} as const satisfies Record<string, CodigoInfo>;

export type Codigo = keyof typeof CODIGOS;

export const SERVICIOS_SUSALUD = {
  HOSP: 'HOSP : HOSPITALIZACIÓN EN DIFERENTES ESPECIALIDADES (MEDICINA INTERNA, PEDIATRÍA, GINECOLOGÍA Y OBSTETRICIA, CIRUGÍA, ETC.) Y SUBESPECIALIDADES.',
  REGAT: 'REGAT : REGISTROS DE ATENCIÓN EN SALUD E INFORMACIÓN',
  CE_MED: 'CE : CONSULTA MÉDICA AMBULATORIA (MÉDICO GENERAL, ESPECIALISTA Y SUBESPECIALISTA)',
  CE_PROF: 'CE : ATENCIÓN AMBULATORIA (PROFESIONAL DE LA SALUD, EXCEPTO MÉDICO)',
  EMG: 'EMG : ATENCIÓN EN SALA DE OBSERVACIÓN DE EMERGENCIA (PROFESIONAL DE LA SALUD)',
  FAR: 'FAR : DISPENSACIÓN DE PRODUCTOS FARMACÉUTICOS, DISPOSITIVOS MÉDICOS Y PRODUCTOS SANITARIOS.',
  PAT: 'PAT : PROCEDIMIENTOS DE LABORATORIO',
  SFAM: 'SFAM : VISITA DOMICILIARIA (MÉDICO GENERAL, ESPECIALISTA EN MEDICINA FAMILIAR Y COMUNITARIA, U OTRO PROFESIONAL DE LA SALUD)',
  SP: 'SP : IDENTIFICACIÓN EPIDEMIOLÓGICA DE BROTES, EPIDEMIAS Y EVENTOS DE IMPORTANCIA EN SALUD PÚBLICA',
  ADM: 'ADM : COORDINACIÓN DE ACTIVIDADES ASISTENCIALES',
  ATASI: 'ATASI : OTRAS ACTIVIDADES AUTORIZADAS POR EL DIRECTOR DE LA IPRESS, DIRECTOR DE LA RED DE SALUD O RIS CORRESPONDA',
  RETEN: 'RETÉN',
} as const;

export type ServicioSusalud = keyof typeof SERVICIOS_SUSALUD;

// Abreviatura del colegio profesional (columna Profesión de TuASUSALUD)
export const PROFESIONES: Record<string, string> = {
  CMP: 'Médico',
  CEP: 'Enfermero',
  COPOBS: 'Obstetra',
  COP: 'Odontólogo',
  CQFP: 'Químico Farmacéutico',
  TE: 'Técnico en Enfermería',
  TF: 'Técnico en Farmacia',
  TL: 'Técnico en Laboratorio',
};
