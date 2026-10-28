import { useConfig, useSession, userHasAccess } from '@openmrs/esm-framework';
import { render, screen, within } from '@testing-library/react';
import { SWRConfig } from 'swr';

import Asistencia from './asistencia/asistencia.component';
import type { RrhhTurnosConfig } from './config-schema';
import MisTurnos from './mis-turnos/mis-turnos.component';
import Root from './root.component';

const mockUseConfig = vi.mocked(useConfig<RrhhTurnosConfig>);
const mockUseSession = vi.mocked(useSession);

vi.mock('@sihsalus/esm-rbac', () => ({
  AppErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  UnauthorizedState: () => <p>Unauthorized</p>,
}));

// Caché de SWR nueva en cada prueba
const conSWR = (ui: React.ReactElement) => render(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>);

// Jueves 15 de octubre de 2026, 10:00
const AHORA = new Date(2026, 9, 15, 10, 0);

describe('Gestión de turnos con la fuente demo', () => {
  beforeEach(() => {
    mockUseConfig.mockReturnValue({ fuenteDatos: 'demo', frappeUrl: '/rrhh', demoTrabajadorId: 'HSC-0004' });
    mockUseSession.mockReturnValue({ authenticated: true, sessionId: 'x', user: { username: 'admin.local' } } as never);
    vi.mocked(userHasAccess).mockReturnValue(true);
  });

  it('muestra el título, el aviso de datos de demostración y las dos pestañas', async () => {
    conSWR(<Root />);
    await screen.findAllByText(/Carmen Ahuanari Vela/); // espera la carga de ambas pestañas
    expect(screen.getByRole('heading', { name: 'Staff scheduling' })).toBeInTheDocument();
    expect(screen.getByText('Demo data')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'My shifts' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Attendance' })).toBeInTheDocument();
  });

  it('cada pestaña exige su privilegio: un trabajador solo ve Mis turnos', async () => {
    vi.mocked(userHasAccess).mockImplementation((p) => p === 'app:home.rrhh.misTurnos');
    conSWR(<Root />);
    await screen.findByText(/Carmen Ahuanari Vela/);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['My shifts']);
  });

  it('sin ningún privilegio de RRHH la página queda cerrada', () => {
    vi.mocked(userHasAccess).mockReturnValue(false);
    conSWR(<Root />);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText('Demo data')).not.toBeInTheDocument();
  });

  it('Mis turnos: usa el trabajador de demostración si el usuario no está vinculado', async () => {
    conSWR(<MisTurnos ahora={AHORA} />);
    expect(await screen.findByText(/Carmen Ahuanari Vela/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'My shifts' })).toBeInTheDocument();
    expect(screen.getByTestId('proximo-turno')).not.toHaveTextContent('No upcoming shifts');
  });

  it('Mis turnos: reconoce al usuario vinculado', async () => {
    mockUseSession.mockReturnValue({ authenticated: true, sessionId: 'x', user: { username: 'prengifo' } } as never);
    conSWR(<MisTurnos ahora={AHORA} />);
    expect(await screen.findByText(/Paola Rengifo Tello/)).toBeInTheDocument();
  });

  it('Mis turnos: con Frappe HR no inventa un trabajador si el usuario no está vinculado', async () => {
    mockUseConfig.mockReturnValue({ fuenteDatos: 'frappe', frappeUrl: '/rrhh', demoTrabajadorId: 'HSC-0004' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) } as Response);
    conSWR(<MisTurnos ahora={AHORA} />);
    expect(await screen.findByText('Your user is not linked to a worker')).toBeInTheDocument();
  });

  it('Asistencia: lista los turnos terminados con su estado y el resumen cuadra con la tabla', async () => {
    conSWR(<Asistencia ahora={AHORA} />);
    const tabla = await screen.findByRole('table', { name: 'Attendance' });
    const filas = within(tabla).getAllByRole('row').slice(1);
    const inasistencias = filas.filter((f) => within(f).queryByText('Absent')).length;
    expect(filas.length).toBeGreaterThan(0);
    expect(screen.getByTestId('resumen-inasistencia')).toHaveTextContent(String(inasistencias));
  });

  it('muestra un mensaje sin detalles técnicos si Frappe HR falla', async () => {
    mockUseConfig.mockReturnValue({ fuenteDatos: 'frappe', frappeUrl: '/rrhh', demoTrabajadorId: 'HSC-0004' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    conSWR(<Asistencia ahora={AHORA} />);
    expect(await screen.findByText('Attendance could not be loaded')).toBeInTheDocument();
    expect(screen.queryByText(/500/)).not.toBeInTheDocument();
  });
});
