import { describe, expect, it } from 'vitest';

import { accionesDisponibles, esEditable, siguienteEstado } from './flujo';

const JEFE = { editar: true, aprobar: false };
const DIRECTOR = { editar: false, aprobar: true };

describe('flujo del cronograma (RF18, RF19)', () => {
  it('con aprobación: el jefe envía, el director aprueba u observa y el jefe publica', () => {
    expect(accionesDisponibles('Borrador', JEFE, true)).toEqual(['enviar']);
    expect(accionesDisponibles('Enviado a aprobación', JEFE, true)).toEqual([]);
    expect(accionesDisponibles('Enviado a aprobación', DIRECTOR, true)).toEqual(['aprobar', 'observar']);
    expect(accionesDisponibles('Aprobado', JEFE, true)).toEqual(['publicar']);
    expect(accionesDisponibles('Aprobado', DIRECTOR, true)).toEqual([]);
    expect(accionesDisponibles('Publicado', JEFE, true)).toEqual([]);
  });

  it('sin aprobación: el jefe publica directamente desde borrador', () => {
    expect(accionesDisponibles('Borrador', JEFE, false)).toEqual(['publicar']);
    expect(accionesDisponibles('Borrador', DIRECTOR, false)).toEqual([]);
  });

  it('calcula el estado siguiente y rechaza transiciones inválidas', () => {
    expect(siguienteEstado('Borrador', 'enviar')).toBe('Enviado a aprobación');
    expect(siguienteEstado('Enviado a aprobación', 'observar')).toBe('Borrador');
    expect(siguienteEstado('Aprobado', 'publicar')).toBe('Publicado');
    expect(() => siguienteEstado('Publicado', 'aprobar')).toThrow();
  });

  it('solo se editan turnos en borrador o en un cronograma publicado', () => {
    expect(['Borrador', 'Enviado a aprobación', 'Aprobado', 'Publicado', 'Cerrado'].filter((e) => esEditable(e as never))).toEqual([
      'Borrador',
      'Publicado',
    ]);
  });
});
