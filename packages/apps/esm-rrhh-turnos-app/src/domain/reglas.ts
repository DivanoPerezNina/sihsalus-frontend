/*
 * Reglas de negocio del rol mensual. Funciones puras: reciben los datos (programación, trabajadores, fecha actual,
 * parámetros) y no leen estado global ni la hora del sistema. Portadas del prototipo de alta fidelidad (R2.2).
 */
import { CODIGOS, PROFESIONES, type Codigo, type CodigoInfo, type ServicioSusalud } from './catalogos';

export type MesId = string; // 'AAAA-MM'
export type UpssId = string;
export type WorkerId = string; // código del empleado en Frappe HR (por ejemplo HR-EMP-00001)
export type RolMes = Record<number, Codigo>; // día → código
export type Programacion = Record<MesId, Record<UpssId, Record<WorkerId, RolMes>>>; // mes → UPSS → trabajador → rol

// Datos del trabajador que las reglas necesitan; el resto (FHIR, acceso, etc.) pertenece a otras capas
export interface Trabajador {
  id: WorkerId;
  apellidos: string;
  nombres: string;
  tipoDoc: 'DNI' | 'CE';
  numDoc: string;
  profesion: string; // abreviatura del colegio
  colegiatura: string;
  especialidad: string;
  anioIngreso: number;
  upss: UpssId;
}

export type Confirmacion = 'confirmado' | 'pendiente' | 'no_asiste' | 'sin_respuesta';

export interface ConfirmacionTurno {
  mes: MesId;
  upss: UpssId;
  workerId: WorkerId;
  dia: number;
  estado: Confirmacion;
  motivo?: string;
}

export const esGuardia = (c: Codigo) => CODIGOS[c].grupo === 'guardia';
export const aMin = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);

const partesMes = (mes: MesId) => mes.split('-').map(Number) as [number, number];

/* ─── Calendario ─── */

export interface Dia {
  d: number;
  dow: number;
  domingo: boolean;
  feriado: boolean;
}

// Los feriados vienen del calendario del backend (RF01)
export function diasDelMes(mes: MesId, feriados: readonly number[] = []): Dia[] {
  const [y, m] = partesMes(mes);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => {
    const d = i + 1;
    const dow = new Date(y, m - 1, d).getDay();
    return { d, dow, domingo: dow === 0, feriado: feriados.includes(d) };
  });
}

export const diasHabiles = (mes: MesId, feriados: readonly number[] = []) =>
  diasDelMes(mes, feriados).filter((d) => !d.domingo && !d.feriado);

// RF01: el mes en curso y los `mesesAdelante` siguientes
export function mesesProgramables(meses: readonly MesId[], ahora: Date, mesesAdelante: number): MesId[] {
  const actual = ahora.getFullYear() * 12 + ahora.getMonth();
  return meses.filter((id) => {
    const [y, m] = partesMes(id);
    const n = y * 12 + m - 1;
    return n >= actual && n <= actual + mesesAdelante;
  });
}

// Un cronograma existe cuando la UPSS ya tiene a su propio personal en el rol del mes
export const existeCronograma = (
  p: Programacion,
  mes: MesId,
  upss: UpssId,
  trabajadores: readonly Pick<Trabajador, 'id' | 'upss'>[],
) => Object.keys(p[mes]?.[upss] ?? {}).some((id) => trabajadores.find((w) => w.id === id)?.upss === upss);

/* ─── RF02, RF21: turnos que ya iniciaron ─── */

// Fecha y hora de inicio de un turno (para "ya inició" y "menos de 24 h")
export function inicioTurno(mes: MesId, dia: number, codigo: Codigo): Date | null {
  const c: CodigoInfo = CODIGOS[codigo];
  if (!c.inicio) return null;
  const [y, m] = partesMes(mes);
  return new Date(y, m - 1, dia, +c.inicio.slice(0, 2), +c.inicio.slice(3, 5));
}

// Un turno ya iniciado no se edita. Los días sin turno se bloquean desde el día de hoy.
export function yaInicio(mes: MesId, dia: number, codigo: Codigo, ahora: Date): boolean {
  const ini = inicioTurno(mes, dia, codigo);
  if (ini) return ini <= ahora;
  const [y, m] = partesMes(mes);
  return new Date(y, m - 1, dia + 1) <= ahora;
}

/* ─── RF25, RF29: horas y guardias del mes (sumando todas las UPSS) ─── */

export const rolesDe = (p: Programacion, mes: MesId, workerId: WorkerId): RolMes[] =>
  Object.values(p[mes] ?? {})
    .map((upss) => upss[workerId])
    .filter(Boolean);

export const horasMes = (p: Programacion, mes: MesId, workerId: WorkerId) =>
  rolesDe(p, mes, workerId).reduce((s, r) => s + Object.values(r).reduce((a, c) => a + CODIGOS[c].horas, 0), 0);

export const guardiasMes = (p: Programacion, mes: MesId, workerId: WorkerId) =>
  rolesDe(p, mes, workerId).reduce((s, r) => s + Object.values(r).filter(esGuardia).length, 0);

/* ─── RF23: cruces de horario del mismo trabajador ─── */

export interface Cruce {
  upss: UpssId;
  dia: number;
  codigo: Codigo;
}

// Intervalo en minutos desde el inicio del mes; las nocturnas terminan al día siguiente.
function intervalo(dia: number, codigo: Codigo): [number, number] | null {
  const c: CodigoInfo = CODIGOS[codigo];
  if (!c.inicio || !c.fin) return null;
  const ini = (dia - 1) * 1440 + aMin(c.inicio);
  let fin = (dia - 1) * 1440 + aMin(c.fin);
  if (fin <= ini) fin += 1440;
  return [ini, fin];
}

// Turnos del trabajador que se cruzan si se pone `codigo` en (upss, dia). Revisa el día anterior y el siguiente.
export function cruces(
  p: Programacion,
  mes: MesId,
  workerId: WorkerId,
  upss: UpssId,
  dia: number,
  codigo: Codigo,
): Cruce[] {
  const nuevo = intervalo(dia, codigo);
  if (!nuevo) return [];
  const out: Cruce[] = [];
  for (const [id, roles] of Object.entries(p[mes] ?? {})) {
    const rol = roles[workerId];
    if (!rol) continue;
    for (const d of [dia - 1, dia, dia + 1]) {
      if (id === upss && d === dia) continue; // es la misma celda que se está reemplazando
      const c = rol[d];
      const iv = c && intervalo(d, c);
      if (iv && iv[0] < nuevo[1] && nuevo[0] < iv[1]) out.push({ upss: id, dia: d, codigo: c });
    }
  }
  return out;
}

/* ─── RF26: bloques SUSALUD por turno ─── */

export interface Bloque {
  servicio: ServicioSusalud;
  ingreso: string;
  salida: string;
}

const bloque = (servicio: ServicioSusalud, ingreso: string, salida: string): Bloque => ({ servicio, ingreso, salida });

// Bloques sugeridos según UPSS, profesión y código (patrón de la plantilla real: actividad + 1 h de REGAT).
// Las UPSS 'HOSP', 'EMG' y 'FAR' son las del HSC; el resto se trata como consulta externa.
export function bloquesPorDefecto(w: Pick<Trabajador, 'profesion'>, upss: UpssId, codigo: Codigo): Bloque[] {
  const c: CodigoInfo = CODIGOS[codigo];
  if (!c.inicio || !c.fin) return [];
  const tecnico = w.profesion.startsWith('T');
  const principal: ServicioSusalud = tecnico
    ? upss === 'FAR'
      ? 'FAR'
      : 'ATASI'
    : upss === 'HOSP'
      ? 'HOSP'
      : upss === 'EMG'
        ? 'EMG'
        : upss === 'FAR'
          ? 'FAR'
          : codigo === 'APS'
            ? 'SFAM'
            : w.profesion === 'CMP'
              ? 'CE_MED'
              : 'CE_PROF';
  if (esGuardia(codigo)) {
    const noche = c.inicio === '19:00';
    return [bloque(noche && w.profesion === 'CMP' && upss === 'HOSP' ? 'RETEN' : principal, c.inicio, c.fin)];
  }
  if (tecnico) return [bloque(principal, c.inicio, c.fin)];
  const antesDeFin = `${String(+c.fin.slice(0, 2) - 1).padStart(2, '0')}:00`;
  return [bloque(principal, c.inicio, antesDeFin), bloque('REGAT', antesDeFin, c.fin)];
}

// Índices de bloques que se cruzan entre sí
export function crucesEntreBloques(bloques: readonly Bloque[]): Set<number> {
  const out = new Set<number>();
  const iv = bloques.map((x) => {
    const i = aMin(x.ingreso);
    let f = aMin(x.salida);
    if (f <= i) f += 1440;
    return [i, f];
  });
  for (let i = 0; i < iv.length; i++)
    for (let j = i + 1; j < iv.length; j++) if (iv[i][0] < iv[j][1] && iv[j][0] < iv[i][1]) out.add(j);
  return out;
}

// Índices de bloques que repiten un servicio ya usado ese día (solo advierte)
export function serviciosRepetidos(bloques: readonly Bloque[]): Set<number> {
  const vistos = new Set<ServicioSusalud>();
  const out = new Set<number>();
  bloques.forEach((x, i) => {
    if (vistos.has(x.servicio)) out.add(i);
    else vistos.add(x.servicio);
  });
  return out;
}

export const horasBloques = (bloques: readonly Bloque[]) =>
  bloques.reduce((s, x) => {
    const d = aMin(x.salida) - aMin(x.ingreso);
    return s + (d <= 0 ? d + 1440 : d) / 60;
  }, 0);

/* ─── RF31: validación de datos para TuASUSALUD ─── */

export interface Observacion {
  workerId: WorkerId;
  campo: string;
  problema: string;
}

export function validarSusalud(w: Trabajador): Observacion[] {
  const o: Observacion[] = [];
  const add = (campo: string, problema: string) => o.push({ workerId: w.id, campo, problema });
  if (w.tipoDoc === 'DNI' && !/^\d{8}$/.test(w.numDoc)) add('Número de documento', 'el DNI debe tener 8 dígitos');
  if (w.tipoDoc === 'CE' && !/^\d{1,12}$/.test(w.numDoc))
    add('Número de documento', 'el carné de extranjería admite solo números, hasta 12 dígitos');
  if (!PROFESIONES[w.profesion]) add('Profesión', 'no está en el catálogo de SUSALUD');
  const tecnico = w.profesion.startsWith('T');
  if (tecnico && w.colegiatura !== '000000') add('Número de colegiatura', 'los técnicos van con 000000');
  if (!tecnico && !/^\d{6}$/.test(w.colegiatura))
    add('Número de colegiatura', w.colegiatura ? 'debe tener 6 dígitos' : 'vacío');
  if (!w.especialidad.trim()) add('Especialidad', 'vacío (usar SIN ESPECIALIDAD)');
  if (!w.apellidos.trim() || !w.nombres.trim()) add('Apellidos y nombres', 'vacío');
  return o;
}

/* ─── RF03, RF20: estado de confirmación de un turno publicado ─── */

export function confirmacion(
  lista: readonly ConfirmacionTurno[],
  mes: MesId,
  upss: UpssId,
  workerId: WorkerId,
  dia: number,
  codigo: Codigo,
  ahora: Date,
): Confirmacion {
  const x = lista.find((c) => c.mes === mes && c.upss === upss && c.workerId === workerId && c.dia === dia);
  if (x) return x.estado;
  return yaInicio(mes, dia, codigo, ahora) ? 'confirmado' : 'pendiente';
}
