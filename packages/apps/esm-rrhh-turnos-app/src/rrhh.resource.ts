import { useConfig, useSession } from '@openmrs/esm-framework';
import { useMemo } from 'react';
import useSWR, { useSWRConfig } from 'swr';

import { crearFuenteDemo } from './api/demo';
import { crearFuenteFrappe } from './api/frappe';
import { rangoMarcaciones, type CambioTurno, type EstadoCronograma, type FuenteDatos, type TrabajadorRrhh } from './api/fuente-datos';
import type { RrhhTurnosConfig } from './config-schema';
import type { ConfirmacionTurno, MesId } from './domain/reglas';

export function useFuenteDatos(): { fuente: FuenteDatos; clave: string } {
  const { fuenteDatos, frappeUrl } = useConfig<RrhhTurnosConfig>();
  return useMemo(
    () =>
      fuenteDatos === 'frappe'
        ? { fuente: crearFuenteFrappe(frappeUrl), clave: `frappe:${frappeUrl}` }
        : { fuente: crearFuenteDemo(), clave: 'demo' },
    [fuenteDatos, frappeUrl],
  );
}

export function useTrabajadores() {
  const { fuente, clave } = useFuenteDatos();
  return useSWR(['rrhh', clave, 'trabajadores'], () => fuente.trabajadores());
}

export function useRolDelMes(mes: MesId) {
  const { fuente, clave } = useFuenteDatos();
  return useSWR(['rrhh', clave, 'rol', mes], () => fuente.rolDelMes(mes));
}

export function useEstadoCronograma(mes: MesId, upss: string) {
  const { fuente, clave } = useFuenteDatos();
  return useSWR(upss ? ['rrhh', clave, 'estado', mes, upss] : null, () => fuente.estadoCronograma(mes, upss));
}

// Guarda un turno y vuelve a leer el rol del mes
export function useGuardarTurno() {
  const { fuente, clave } = useFuenteDatos();
  const { mutate } = useSWRConfig();
  return async (cambio: CambioTurno) => {
    await fuente.guardarTurno(cambio);
    await mutate(['rrhh', clave, 'rol', cambio.mes]);
  };
}

export function useCambiarEstado() {
  const { fuente, clave } = useFuenteDatos();
  const { mutate } = useSWRConfig();
  return async (mes: MesId, upss: string, estado: EstadoCronograma, observacion?: string) => {
    await fuente.cambiarEstado(mes, upss, estado, observacion);
    await mutate(['rrhh', clave, 'estado', mes, upss]);
  };
}

export function useConfirmaciones(mes: MesId) {
  const { fuente, clave } = useFuenteDatos();
  return useSWR(['rrhh', clave, 'confirmaciones', mes], () => fuente.confirmaciones(mes));
}

export function useResponderTurno() {
  const { fuente, clave } = useFuenteDatos();
  const { mutate } = useSWRConfig();
  return async (r: ConfirmacionTurno) => {
    await fuente.responderTurno(r);
    await mutate(['rrhh', clave, 'confirmaciones', r.mes]);
  };
}

export function useEventosSync() {
  const { fuente, clave } = useFuenteDatos();
  return useSWR(['rrhh', clave, 'eventos'], () => fuente.eventosSync(), { refreshInterval: 30_000 });
}

export function useBloquesDelMes(mes: MesId) {
  const { fuente, clave } = useFuenteDatos();
  return useSWR(['rrhh', clave, 'bloquesMes', mes], () => fuente.bloquesDelMes(mes));
}

export function useMarcaciones(mes: MesId) {
  const { fuente, clave } = useFuenteDatos();
  return useSWR(['rrhh', clave, 'marcaciones', mes], () => fuente.marcaciones(...rangoMarcaciones(mes)));
}

// El usuario de SIH SALUS se vincula con su ficha de Frappe HR (Employee.user_id). En la demo, si no hay vínculo,
// se muestra el trabajador configurado.
export function useTrabajadorActual(): { trabajador?: TrabajadorRrhh; isLoading: boolean; error?: unknown } {
  const { fuenteDatos, demoTrabajadorId } = useConfig<RrhhTurnosConfig>();
  const usuario = useSession()?.user?.username;
  const { data, isLoading, error } = useTrabajadores();
  const trabajador =
    data?.find((w) => usuario && w.usuario === usuario) ??
    (fuenteDatos === 'demo' ? data?.find((w) => w.id === demoTrabajadorId) : undefined);
  return { trabajador, isLoading, error };
}
