import { useConfig, useSession, userHasAccess } from '@openmrs/esm-framework';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';

import { crearFuenteDemo, reiniciarDemo, TRABAJADORES_DEMO } from './api/demo';
import { crearFuenteFrappe } from './api/frappe';
import Calendario from './calendario/calendario.component';
import ModalTurno from './calendario/modal-turno.component';
import type { RrhhTurnosConfig } from './config-schema';
import { fueraDeRango } from './configuracion/configuracion.component';
import Consolidado, { conEjecutado } from './consolidado/consolidado.component';
import { accionesDisponibles, siguienteEstado } from './domain/flujo';
import { PARAMS_DEFECTO } from './domain/parametros';
import type { Programacion } from './domain/reglas';
import { proximosTurnos } from './mis-turnos/cache';
import { hojaDiresa } from './reportes/diresa';

const AHORA = new Date(2026, 9, 15, 10, 0);
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: AHORA });
});
afterAll(() => {
  vi.useRealTimers();
});

const CONFIG: RrhhTurnosConfig = {
  fuenteDatos: 'demo',
  frappeUrl: '/rrhh',
  demoTrabajadorId: 'HSC-0004',
  integracionUrl: '/rrhh-integracion',
  demoEnRedHospital: true,
  ipress: { codigo: '00000066', nombre: 'HSC', red: 'RED', microRed: 'MR' },
};
const conSWR = (ui: React.ReactElement) => render(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>);

beforeEach(() => {
  reiniciarDemo();
  vi.mocked(useConfig<RrhhTurnosConfig>).mockReturnValue(CONFIG);
  vi.mocked(useSession).mockReturnValue({ authenticated: true, sessionId: 'x', user: { username: 'jefe' } } as never);
  vi.mocked(userHasAccess).mockReturnValue(true);
});

describe('red del hospital y acceso excepcional (RNF09, RF05)', () => {
  it('fuera de la red no se puede editar; con acceso excepcional y motivo, sí', async () => {
    vi.mocked(useConfig<RrhhTurnosConfig>).mockReturnValue({ ...CONFIG, demoEnRedHospital: false });
    conSWR(<Calendario ahora={AHORA} />);
    expect(await screen.findByTestId('fuera-de-red')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Raúl Panduro Ríos, 16:/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Request exceptional access' }));
    const enviar = screen.getAllByRole('button', { name: 'Request exceptional access' }).at(-1) as HTMLElement;
    expect(enviar).toBeDisabled(); // sin motivo no se concede
    fireEvent.change(screen.getByLabelText(/Why do you need/), { target: { value: 'Cobertura urgente desde casa' } });
    fireEvent.click(enviar);

    expect(await screen.findByTestId('acceso-vigente')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^Raúl Panduro Ríos, 16:/ })).toBeInTheDocument();
    const [entrada] = await crearFuenteDemo().bitacora();
    expect(entrada).toMatchObject({ accion: 'acceso_excepcional', motivo: 'Cobertura urgente desde casa' });
  });

  it('con Frappe HR, si la capa de integración no responde se asume fuera de la red', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('sin red');
    });
    expect(await crearFuenteFrappe('/rrhh', { fetchFn, integracionUrl: '/int' }).enRedHospital()).toBe(false);
    const ok = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ enRed: true }) }) as Response);
    expect(await crearFuenteFrappe('/rrhh', { fetchFn: ok, integracionUrl: '/int' }).enRedHospital()).toBe(true);
    expect(await crearFuenteFrappe('/rrhh', { fetchFn: ok }).enRedHospital()).toBe(false);
  });
});

describe('mover un turno a otra fecha (RF02)', () => {
  const [, sangama] = TRABAJADORES_DEMO;
  const rol: Programacion = { '2026-11': { HOSP: { [sangama.id]: { 10: 'M', 12: 'T' } } } };

  it('avisa si el día de destino ya tiene turno y guarda liberando el día original', async () => {
    conSWR(<ModalTurno mes="2026-11" upss="HOSP" trabajador={sangama} dia={10} rol={rol} estado="Borrador" ahora={AHORA} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Shift date/), { target: { value: '12' } });
    expect(screen.getByText('That day already has a shift')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Shift date/), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      const p = await crearFuenteDemo().rolDelMes('2026-11');
      expect(p['2026-11'].HOSP[sangama.id][10]).toBe('L');
      expect(p['2026-11'].HOSP[sangama.id][14]).toBe('M');
    });
  });
});

describe('cierre del mes y ejecutado (RF28)', () => {
  it('solo la UGRH cierra un cronograma publicado', () => {
    expect(accionesDisponibles('Publicado', { editar: true, aprobar: false }, true)).toEqual([]);
    expect(accionesDisponibles('Publicado', { editar: false, aprobar: false, cerrar: true }, true)).toEqual(['cerrar']);
    expect(siguienteEstado('Publicado', 'cerrar')).toBe('Cerrado');
  });

  it('lo ejecutado son las correcciones sobre lo programado, que no cambia', () => {
    const programado: Programacion = { '2026-10': { HOSP: { A: { 1: 'M', 2: 'T' } } } };
    const correcciones: Programacion = { '2026-10': { HOSP: { A: { 2: 'LE' } } } };
    expect(conEjecutado(programado, correcciones, '2026-10')).toEqual({ '2026-10': { HOSP: { A: { 1: 'M', 2: 'LE' } } } });
    expect(programado['2026-10'].HOSP.A[2]).toBe('T');
  });

  it('la UGRH registra lo ejecutado de un día pasado y la celda queda marcada como corregida', async () => {
    conSWR(<Consolidado ahora={AHORA} />);
    await screen.findByTestId('consolidado-HOSP');
    fireEvent.click(screen.getByRole('tab', { name: 'Executed' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Raúl Panduro Ríos, 14: Mañana$/ }));
    fireEvent.change(screen.getByLabelText('Executed code'), { target: { value: 'LE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('button', { name: /^Raúl Panduro Ríos, 14: Licencia por enfermedad · corrected \(scheduled: M\)$/ })).toBeInTheDocument();
  });
});

describe('parámetros, copia sin conexión y reporte DIRESA', () => {
  it('valida el rango de los parámetros', () => {
    expect(fueraDeRango(PARAMS_DEFECTO)).toEqual([]);
    expect(fueraDeRango({ ...PARAMS_DEFECTO, horasMinimasMes: 0, guardiasMaxNuevos: 40 })).toEqual(['horasMinimasMes', 'guardiasMaxNuevos']);
  });

  it('guardar parámetros deja el cambio y el motivo en la bitácora', async () => {
    const f = crearFuenteDemo({ usuario: 'ugrh' });
    await f.guardarParametros({ ...PARAMS_DEFECTO, guardiasMaxNuevos: 6 }, 'Nueva directiva');
    expect((await f.parametros()).guardiasMaxNuevos).toBe(6);
    expect((await f.bitacora())[0]).toMatchObject({ usuario: 'ugrh', accion: 'parametros', detalle: 'guardiasMaxNuevos: 5 → 6', motivo: 'Nueva directiva' });
  });

  it('lee los parámetros de Frappe HR y usa los valores por defecto si no están configurados', async () => {
    const con = (data: unknown) => vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data }) }) as Response);
    const doc = { horas_minimas_mes: 144, guardias_max_antiguos: 7, guardias_max_nuevos: 6, anio_corte_antiguos: 2014, meses_adelante: 2, recordatorio_horas: 12, acceso_excepcional_min: 45, requiere_aprobacion: 0, cache_dias: 5 };
    expect(await crearFuenteFrappe('/rrhh', { fetchFn: con(doc) }).parametros()).toEqual({
      horasMinimasMes: 144, guardiasMaxAntiguos: 7, guardiasMaxNuevos: 6, anioCorteAntiguos: 2014, mesesAdelante: 2,
      recordatorioHoras: 12, accesoExcepcionalMin: 45, requiereAprobacion: false, cacheDias: 5,
    });
    expect(await crearFuenteFrappe('/rrhh', { fetchFn: con({}) }).parametros()).toEqual(PARAMS_DEFECTO);
  });

  it('la copia sin conexión guarda solo los turnos de los próximos días (RNF04)', () => {
    const rol = { 14: 'M', 15: 'T', 16: 'GDO', 21: 'M', 22: 'T', 30: 'M' } as const;
    expect(proximosTurnos('2026-10', rol, AHORA, 7)).toEqual([
      { fecha: '2026-10-15', codigo: 'T' },
      { fecha: '2026-10-16', codigo: 'GDO' },
      { fecha: '2026-10-21', codigo: 'M' },
    ]);
  });

  it('el rol DIRESA tiene una fila por trabajador con sus datos y un código por día (RF24)', () => {
    const [panduro] = TRABAJADORES_DEMO;
    const p: Programacion = { '2026-10': { HOSP: { [panduro.id]: { 1: 'GDO', 2: 'L' } } } };
    const h = hojaDiresa('Registro', '2026-10', p, TRABAJADORES_DEMO, 'SANTA CLOTILDE');
    expect(h.columnas.slice(0, 7)).toEqual(['N°', 'DNI', 'Apellidos y nombres', 'Área', 'Profesión', 'Condición laboral', 'Micro red']);
    expect(h.columnas).toHaveLength(7 + 31 + 2);
    expect(h.filas).toHaveLength(1);
    expect(h.filas[0].slice(0, 9)).toEqual([1, '41001100', 'PANDURO RÍOS RAÚL', 'HOSP', 'Médico', 'Nombrado', 'SANTA CLOTILDE', 'GDO', 'L']);
    expect(h.filas[0].slice(-2)).toEqual([12, 1]);
  });
});
