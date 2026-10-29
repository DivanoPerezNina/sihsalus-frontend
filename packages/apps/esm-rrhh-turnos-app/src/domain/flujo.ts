/*
 * RF18, RF19: ciclo de vida del cronograma de una UPSS en un mes.
 * Borrador → Enviado a aprobación → Aprobado → Publicado → Cerrado. El director puede devolverlo a Borrador con una
 * observación. Si el parámetro requiereAprobacion está apagado, el jefe publica directamente desde Borrador.
 */
export type EstadoCronograma = 'Borrador' | 'Enviado a aprobación' | 'Aprobado' | 'Publicado' | 'Cerrado';

export type Accion = 'enviar' | 'aprobar' | 'observar' | 'publicar';

export interface Permisos {
  editar: boolean; // jefe de la UPSS
  aprobar: boolean; // director
}

const TRANSICIONES: Record<Accion, { desde: EstadoCronograma; hacia: EstadoCronograma; quien: keyof Permisos }[]> = {
  enviar: [{ desde: 'Borrador', hacia: 'Enviado a aprobación', quien: 'editar' }],
  aprobar: [{ desde: 'Enviado a aprobación', hacia: 'Aprobado', quien: 'aprobar' }],
  observar: [{ desde: 'Enviado a aprobación', hacia: 'Borrador', quien: 'aprobar' }],
  publicar: [
    { desde: 'Aprobado', hacia: 'Publicado', quien: 'editar' },
    { desde: 'Borrador', hacia: 'Publicado', quien: 'editar' }, // solo sin aprobación (ver accionesDisponibles)
  ],
};

export function accionesDisponibles(estado: EstadoCronograma, permisos: Permisos, requiereAprobacion: boolean): Accion[] {
  return (Object.keys(TRANSICIONES) as Accion[]).filter((a) => {
    if (requiereAprobacion ? a === 'publicar' && estado === 'Borrador' : a === 'enviar') return false;
    return TRANSICIONES[a].some((t) => t.desde === estado && permisos[t.quien]);
  });
}

export function siguienteEstado(estado: EstadoCronograma, accion: Accion): EstadoCronograma {
  const t = TRANSICIONES[accion].find((x) => x.desde === estado);
  if (!t) throw new Error(`No se puede ${accion} un cronograma en estado ${estado}`);
  return t.hacia;
}

// Los turnos de un cronograma solo se editan en borrador o ya publicado (con motivo, RF30)
export const esEditable = (estado: EstadoCronograma) => estado === 'Borrador' || estado === 'Publicado';
