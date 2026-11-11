import { useConfig, useSession } from '@openmrs/esm-framework';
import { useMemo } from 'react';
import useSWR, { useSWRConfig } from 'swr';

import { crearFuenteDemo } from './api/demo';
import { crearFuenteFrappe } from './api/frappe';
import {
  rangoMarcaciones,
  type CambioEjecutado,
  type CambioTurno,
  type EstadoCronograma,
  type FuenteDatos,
  type TrabajadorRrhh,
} from './api/fuente-datos';
import type { RrhhTurnosConfig } from './config-schema';
import { PARAMS_DEFECTO, type Parametros } from './domain/parametros';
import type { ConfirmacionTurno, MesId } from './domain/reglas';

export function useFuenteDatos(): { fuente: FuenteDatos; clave: string } {
  const { fuenteDatos, frappeUrl, integracionUrl, demoEnRedHospital } = useConfig<RrhhTurnosConfig>();
  const usuario = useSession()?.user?.username;
  return useMemo(
    () =>
      fuenteDatos === 'frappe'
        ? { fuente: crearFuenteFrappe(frappeUrl, { usuario, integracionUrl }), clave: `frappe:${frappeUrl}:${usuario}` }
        : { fuente: crearFuenteDemo({ usuario, enRed: demoEnRedHospital }), clave: `demo:${usuario}:${demoEnRedHospital}` },
    [fuenteDatos, frappeUrl, integracionUrl, demoEnRedHospital, usuario],
  );
}

// Parámetros configurables; mientras cargan (o si fallan) rigen los valores por defecto de la normativa
export function useParametros(): Parametros {
  const { fuente, clave } = useFuenteDatos();
  return useSWR(['rrhh', clave, 'parametros'], () => fuente.parametros()).data ?? PARAMS_DEFECTO;
}

export function useGuardarParametros() {
  const { fuente, clave } = useFuenteDatos();
  const { mutate } = useSWRConfig();
  return async (p: Parametros, motivo: string) => {
    await fuente.guardarParametros(p, motivo);
    await Promise.all([mutate(['rrhh', clave, 'parametros']), mutate(['rrhh', clave, 'bitacora', ''])]);
  };
}

export function useBitacora(workerId = '') {
  const { fuente, clave } = useFuenteDatos();
  return useSWR(['rrhh', clave, 'bitacora', workerId], () => fuente.bitacora(workerId ? { workerId } : {}));
}

export function useEjecutado(mes: MesId) {
  const { fuente, clave } = useFuenteDatos();
  return useSWR(['rrhh', clave, 'ejecutado', mes], () => fuente.ejecutado(mes));
}

export function useGuardarEjecutado() {
  const { fuente, clave } = useFuenteDatos();
  const { mutate } = useSWRConfig();
  return async (c: CambioEjecutado) => {
    await fuente.guardarEjecutado(c);
    await mutate(['rrhh', clave, 'ejecutado', c.mes]);
  };
}

// RNF09, RF05: se puede programar desde la red del hospital o con un acceso excepcional vigente
export function useAccesoProgramacion() {
  const { fuente, clave } = useFuenteDatos();
  const red = useSWR(['rrhh', clave, 'red'], () => fuente.enRedHospital());
  const acceso = useSWR(['rrhh', clave, 'acceso'], () => fuente.accesoExcepcionalHasta(), { refreshInterval: 60_000 });
  const vigente = acceso.data !== undefined && acceso.data > new Date();
  return {
    cargando: red.isLoading || acceso.isLoading,
    enRed: red.data === true,
    hasta: vigente ? acceso.data : undefined,
    permitido: red.data === true || vigente,
    solicitar: async (motivo: string, minutos: number) => {
      await fuente.solicitarAcceso(motivo, minutos);
      await acceso.mutate();
    },
  };
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

export function useEstadosCronograma(mes: MesId, listaUpss: string[]) {
  const { fuente, clave } = useFuenteDatos();
  return useSWR(['rrhh', clave, 'estados', mes, listaUpss.join('|')], async () =>
    Object.fromEntries(await Promise.all(listaUpss.map(async (u) => [u, await fuente.estadoCronograma(mes, u)] as const))),
  );
}

// Guarda un turno y vuelve a leer el rol del mes
export function useGuardarTurno() {
  const { fuente, clave } = useFuenteDatos();
  const { mutate } = useSWRConfig();
  return async (cambio: CambioTurno) => {
    await fuente.guardarTurno(cambio);
    await Promise.all([mutate(['rrhh', clave, 'rol', cambio.mes]), mutate(['rrhh', clave, 'bloquesMes', cambio.mes])]);
  };
}

export function useCambiarEstado() {
  const { fuente, clave } = useFuenteDatos();
  const { mutate } = useSWRConfig();
  return async (mes: MesId, upss: string, estado: EstadoCronograma, observacion?: string) => {
    await fuente.cambiarEstado(mes, upss, estado, observacion);
    // el estado de esa UPSS y los resúmenes de estados del mes
    await mutate((k) => Array.isArray(k) && k[0] === 'rrhh' && k[1] === clave && (k[2] === 'estado' || k[2] === 'estados') && k[3] === mes);
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
