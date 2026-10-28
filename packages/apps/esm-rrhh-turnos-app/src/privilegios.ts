import { useSession, userHasAccess } from '@openmrs/esm-framework';

// Privilegios declarados en sihsalus-content (roles «SIH SALUS Mis turnos», «… Programación de turnos [editar|aprobar]»
// y «… Gestión de RRHH»). Los nombres no forman jerarquía: `.editar` no concede el base.
export const PRIVILEGIOS = {
  misTurnos: 'app:home.rrhh.misTurnos',
  programacion: 'app:home.rrhh.programacion',
  programacionEditar: 'app:home.rrhh.programacion.editar',
  programacionAprobar: 'app:home.rrhh.programacion.aprobar',
  asistencia: 'app:home.rrhh.asistencia',
  consolidado: 'app:home.rrhh.consolidado',
  reportes: 'app:home.rrhh.reportes',
  cierre: 'app:home.rrhh.cierre',
  sincronizacion: 'app:home.rrhh.sincronizacion',
  configuracion: 'app:home.rrhh.configuracion',
} as const;

export type Capacidad = keyof typeof PRIVILEGIOS;

// La interfaz solo oculta o bloquea; el backend sigue siendo la autoridad de cada lectura y escritura.
export function usePrivilegios(): Record<Capacidad, boolean> & { alguno: boolean } {
  const user = useSession()?.user;
  const r = Object.fromEntries(
    Object.entries(PRIVILEGIOS).map(([k, p]) => [k, Boolean(user && userHasAccess(p, user))]),
  ) as Record<Capacidad, boolean>;
  return { ...r, alguno: Object.values(r).some(Boolean) };
}
