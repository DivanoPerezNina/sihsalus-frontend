import { useConfig, useSession, userHasAccess } from '@openmrs/esm-framework';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';

import { reiniciarDemo, TRABAJADORES_DEMO } from '../api/demo';
import type { RrhhTurnosConfig } from '../config-schema';
import type { Programacion } from '../domain/reglas';
import Calendario from './calendario.component';
import ModalTurno from './modal-turno.component';

const conSWR = (ui: React.ReactElement) => render(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>);

const AHORA = new Date(2026, 9, 15, 10, 0); // 15 oct 2026: octubre publicado, noviembre en borrador
const sangama = TRABAJADORES_DEMO[1]; // HSC-0002, ingresó en 2018: tope de 5 guardias

describe('Calendario del jefe de UPSS', () => {
  beforeEach(() => {
    reiniciarDemo();
    vi.mocked(useConfig<RrhhTurnosConfig>).mockReturnValue({ fuenteDatos: 'demo', frappeUrl: '/rrhh', demoTrabajadorId: 'HSC-0004' });
    vi.mocked(useSession).mockReturnValue({ authenticated: true, sessionId: 'x', user: { username: 'jefe' } } as never);
    vi.mocked(userHasAccess).mockReturnValue(true);
  });

  it('muestra la matriz de la UPSS con horas y guardias por trabajador', async () => {
    conSWR(<Calendario ahora={AHORA} />);
    const tabla = await screen.findByRole('region', { name: 'Schedule' });
    expect(within(tabla).getByText('Raúl Panduro Ríos')).toBeInTheDocument();
    expect(within(tabla).queryByText('Víctor del Águila Soria')).not.toBeInTheDocument(); // es de Emergencia
    expect(await screen.findByTestId('estado-cronograma')).toHaveTextContent('Publicado'); // en pruebas, t() devuelve el texto por defecto
    expect(Number(screen.getByTestId('horas-HSC-0001').textContent)).toBeGreaterThan(0);
  });

  it('no permite editar los turnos que ya iniciaron y sí los siguientes', async () => {
    conSWR(<Calendario ahora={AHORA} />);
    await screen.findByRole('region', { name: 'Schedule' });
    expect(screen.queryByRole('button', { name: /^Raúl Panduro Ríos, 14:/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Raúl Panduro Ríos, 16:/ })).toBeInTheDocument();
  });

  it('sin el privilegio de edición, la matriz es de solo lectura', async () => {
    vi.mocked(userHasAccess).mockImplementation((p) => p !== 'app:home.rrhh.programacion.editar');
    conSWR(<Calendario ahora={AHORA} />);
    await screen.findByRole('region', { name: 'Schedule' });
    expect(screen.queryByRole('button', { name: /^Raúl Panduro Ríos, 16:/ })).not.toBeInTheDocument();
    expect(screen.getByText(/but not edit it/)).toBeInTheDocument();
  });

  it('guarda un turno y la matriz se actualiza', async () => {
    conSWR(<Calendario ahora={AHORA} />);
    await screen.findByRole('region', { name: 'Schedule' });
    fireEvent.click(screen.getByRole('button', { name: /^Raúl Panduro Ríos, 16:/ }));
    fireEvent.change(screen.getByLabelText('Roster code'), { target: { value: 'LV' } });
    fireEvent.change(screen.getByLabelText(/Reason for the change/), { target: { value: 'licencia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Raúl Panduro Ríos, 16: Licencia por vacaciones' })).toBeInTheDocument());
  });
});

describe('Modal del turno: validaciones', () => {
  beforeEach(() => {
    reiniciarDemo();
    vi.mocked(useConfig<RrhhTurnosConfig>).mockReturnValue({ fuenteDatos: 'demo', frappeUrl: '/rrhh', demoTrabajadorId: 'HSC-0004' });
  });

  // Cinco guardias en noviembre (el tope de quien ingresó en 2018) y una mañana en Consulta externa el día 20
  const rol: Programacion = {
    '2026-11': {
      HOSP: { 'HSC-0002': { 2: 'GDO', 6: 'GDO', 10: 'GDO', 14: 'GDO', 18: 'GDO', 20: 'L' } },
      CE: { 'HSC-0002': { 20: 'M' } },
    },
  };
  const abrir = (estado: 'Borrador' | 'Publicado' = 'Borrador') =>
    conSWR(<ModalTurno mes="2026-11" upss="HOSP" trabajador={sangama} dia={20} rol={rol} estado={estado} onClose={vi.fn()} />);

  it('RF29: impide superar el tope de guardias', () => {
    abrir();
    fireEvent.change(screen.getByLabelText('Roster code'), { target: { value: 'GNO' } });
    expect(screen.getByText('Guard shift limit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('RF23: impide un turno que se cruza con otro de la misma persona en otra UPSS', () => {
    abrir();
    fireEvent.change(screen.getByLabelText('Roster code'), { target: { value: 'T' } });
    expect(screen.queryByText('Schedule overlap')).not.toBeInTheDocument(); // T (13–19) no choca con M (7–13)
    fireEvent.change(screen.getByLabelText('Roster code'), { target: { value: 'M' } });
    expect(screen.getByText('Schedule overlap')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('RF26: sugiere los bloques SUSALUD según la profesión', () => {
    abrir();
    expect(screen.getByLabelText('Service', { selector: '#servicio-0' })).toHaveValue('HOSP');
    expect(screen.getByLabelText('Service', { selector: '#servicio-1' })).toHaveValue('REGAT');
  });

  it('RF25: muestra las horas resultantes y advierte si quedan bajo el mínimo', () => {
    abrir();
    expect(screen.getByTestId('horas-resultantes')).toHaveTextContent('With this change: 72 h this month (below 150 h)');
  });

  it('RF30: en un cronograma publicado exige el motivo', () => {
    abrir('Publicado');
    fireEvent.change(screen.getByLabelText('Roster code'), { target: { value: 'T' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Choose the reason for the change')).toBeInTheDocument();
  });
});
