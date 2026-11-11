import {
  DataTableSkeleton,
  InlineNotification,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Tile,
} from '@carbon/react';
import { useSession } from '@openmrs/esm-framework';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { mesDe } from '../api/fuente-datos';
import { moduleName } from '../constants';
import { finTurno } from '../domain/asistencia';
import { CODIGOS, type Codigo } from '../domain/catalogos';
import { maxGuardiasPorIngreso } from '../domain/parametros';
import { guardiasMes, horasMes, inicioTurno } from '../domain/reglas';
import { fechaCorta, horario } from '../formato';
import { useBitacora, useConfirmaciones, useEstadoCronograma, useParametros, useRolDelMes, useTrabajadorActual } from '../rrhh.resource';
import { guardarTurnos, leerTurnos, proximosTurnos } from './cache';
import RespuestaTurno from './respuesta-turno.component';
import styles from '../root.scss';
import SelectorMes from '../selector-mes.component';

const TIPO_TAG: Record<string, 'blue' | 'purple' | 'gray' | 'green'> = {
  turno: 'blue',
  guardia: 'purple',
  descanso: 'gray',
  licencia: 'green',
};

// ponytail: "visto" vive en el navegador (localStorage); si no está disponible, el aviso simplemente vuelve a salir.
// Cuando el equipo defina el canal de notificaciones (RF13, RF14), el aviso llegará también fuera del componente.
function leerVisto(clave: string) {
  try {
    return localStorage.getItem(clave) === '1';
  } catch {
    return false;
  }
}

function leerMarca(clave: string) {
  try {
    return Number(localStorage.getItem(clave)) || 0;
  } catch {
    return 0;
  }
}

function marcarVisto(clave: string, valor = '1') {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // sin almacenamiento local: no pasa nada
  }
}

// RF04, RF15: rol del mes del trabajador que inició sesión y su próximo turno
export default function MisTurnos({ ahora: ahoraProp }: { ahora?: Date }) {
  const [ahora] = useState(() => ahoraProp ?? new Date());
  const { t, i18n } = useTranslation(moduleName);
  const [mes, setMes] = useState(mesDe(ahora));
  const { trabajador, isLoading: cargandoTrabajador, error: errorTrabajador } = useTrabajadorActual();
  const { data: rol, isLoading: cargandoRol, error: errorRol } = useRolDelMes(mes);
  const estado = useEstadoCronograma(mes, trabajador?.upss ?? '');
  const respuestas = useConfirmaciones(mes);
  const params = useParametros();
  const cambios = useBitacora(trabajador?.id ?? '-');
  const [visto, setVisto] = useState<Set<string>>(new Set());
  const usuario = useSession()?.user?.username ?? '';

  // RNF04: con datos frescos del mes en curso, se guarda la copia de los próximos días
  useEffect(() => {
    const propio = trabajador && rol?.[mes]?.[trabajador.upss]?.[trabajador.id];
    if (trabajador && propio && mes === mesDe(ahora))
      guardarTurnos(usuario, { trabajador: trabajador.nombre, guardado: ahora.toISOString(), turnos: proximosTurnos(mes, propio, ahora, params.cacheDias) });
  }, [trabajador, rol, mes, ahora, usuario, params.cacheDias]);

  const dias = useMemo(() => {
    if (!trabajador || !rol) return [];
    const [y, m] = mes.split('-').map(Number);
    const r = rol[mes]?.[trabajador.upss]?.[trabajador.id] ?? {};
    return Object.entries(r)
      .map(([d, codigo]) => ({ fecha: new Date(y, m - 1, +d), dia: +d, codigo: codigo as Codigo }))
      .sort((a, b) => a.dia - b.dia);
  }, [rol, trabajador, mes]);

  if (errorTrabajador || errorRol) {
    // RNF05: sin conexión se muestran, en solo lectura, los turnos guardados en este equipo
    const copia = leerTurnos(usuario);
    if (copia)
      return (
        <div className={styles.seccion} data-testid="sin-conexion">
          <InlineNotification kind="warning" lowContrast hideCloseButton
            title={t('sinConexion', 'No connection: showing the shifts saved on this device')}
            subtitle={t('sinConexionTexto', 'Saved on {{fecha}}. Read only: connect to confirm shifts or see changes.', {
              fecha: new Date(copia.guardado).toLocaleString(i18n.language),
            })} />
          <p className={styles.trabajador}>{copia.trabajador}</p>
          <Table size="sm" aria-label={t('misTurnos', 'My shifts')}>
            <TableBody>
              {copia.turnos.map((x) => (
                <TableRow key={x.fecha}>
                  <TableCell>{x.fecha}</TableCell>
                  <TableCell>{x.codigo}</TableCell>
                  <TableCell>{CODIGOS[x.codigo].nombre}</TableCell>
                  <TableCell>{horario(x.codigo)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    return (
      <InlineNotification
        kind="error"
        lowContrast
        hideCloseButton
        title={t('errorCarga', 'The shifts could not be loaded')}
        subtitle={t('errorCargaTexto', 'Try again in a few minutes. If it persists, contact the HR unit.')}
      />
    );
  }
  if (cargandoTrabajador || cargandoRol) return <DataTableSkeleton columnCount={4} rowCount={6} showHeader={false} />;
  if (!trabajador)
    return (
      <InlineNotification
        kind="warning"
        lowContrast
        hideCloseButton
        title={t('sinTrabajador', 'Your user is not linked to a worker')}
        subtitle={t('sinTrabajadorTexto', 'Ask the HR unit to link your SIH SALUS user to your record in Frappe HR.')}
      />
    );

  const horas = rol ? horasMes(rol, mes, trabajador.id) : 0;
  const guardias = rol ? guardiasMes(rol, mes, trabajador.id) : 0;
  const tope = maxGuardiasPorIngreso(trabajador.anioIngreso, params);
  const proximo = dias.find((x) => {
    const fin = finTurno(mes, x.dia, x.codigo);
    return fin && fin > ahora;
  });
  const inicioProximo = proximo && inicioTurno(mes, proximo.dia, proximo.codigo);
  // RF15: recordatorio si el próximo turno empieza dentro del plazo configurado
  const pronto =
    inicioProximo && inicioProximo > ahora && inicioProximo.getTime() - ahora.getTime() <= params.recordatorioHoras * 3_600_000;
  // RF13: aviso de rol publicado, hasta que el trabajador lo marque como visto en este equipo
  const clavePublicado = `rrhh-turnos:visto:${trabajador.id}:${mes}`;
  // RF14: cambios a mis turnos de un cronograma publicado hechos desde la última vez que los vi (o en los últimos 7 días)
  const claveCambios = `rrhh-turnos:cambios:${trabajador.id}`;
  const desdeCambios = visto.has(claveCambios) ? ahora.getTime() : leerMarca(claveCambios) || ahora.getTime() - 7 * 86_400_000;
  const modificados = (cambios.data ?? []).filter((b) => b.accion === 'turno' && b.motivo && b.fecha.getTime() > desdeCambios);
  const avisoPublicado = estado.data === 'Publicado' && dias.length > 0 && !visto.has(clavePublicado) && !leerVisto(clavePublicado);

  return (
    <div className={styles.seccion}>
      <p className={styles.trabajador}>
        {trabajador.nombre} · {trabajador.upss}
      </p>
      <SelectorMes mes={mes} onChange={setMes} />

      {pronto && proximo && inicioProximo && (
        <InlineNotification kind="warning" lowContrast hideCloseButton data-testid="recordatorio"
          title={t('recordatorio', 'Your next shift starts soon')}
          subtitle={`${fechaCorta(inicioProximo, i18n.language)} · ${CODIGOS[proximo.codigo].nombre} ${horario(proximo.codigo)}`} />
      )}
      {modificados.length > 0 && (
        <InlineNotification kind="warning" lowContrast data-testid="aviso-cambios"
          title={t('turnosModificados', 'Your shifts changed')}
          subtitle={modificados.slice(0, 3).map((b) => `${b.mes}-${String(b.dia).padStart(2, '0')}: ${b.detalle} (${b.motivo})`).join(' · ')}
          onClose={() => {
            marcarVisto(claveCambios, String(ahora.getTime()));
            setVisto(new Set([...visto, claveCambios]));
          }} />
      )}
      {avisoPublicado && (
        <InlineNotification kind="info" lowContrast data-testid="aviso-publicado"
          title={t('rolPublicado', 'Your schedule for this month has been published')}
          subtitle={t('rolPublicadoTexto', 'Check your shifts and confirm them, or tell your head of unit if you cannot attend.')}
          onClose={() => {
            marcarVisto(clavePublicado);
            setVisto(new Set([...visto, clavePublicado]));
          }} />
      )}

      <div className={styles.resumen}>
        <Tile>
          <p className={styles.etiqueta}>{t('proximoTurno', 'Next shift')}</p>
          <p className={styles.valor} data-testid="proximo-turno">
            {proximo && inicioProximo
              ? `${fechaCorta(inicioProximo, i18n.language)} · ${CODIGOS[proximo.codigo].nombre} ${horario(proximo.codigo)}`
              : t('sinProximoTurno', 'No upcoming shifts this month')}
          </p>
        </Tile>
        <Tile>
          <p className={styles.etiqueta}>{t('horasDelMes', 'Hours this month')}</p>
          <p className={styles.valor}>
            {t('horasDeMinimo', '{{horas}} h of {{minimo}} h', { horas, minimo: params.horasMinimasMes })}
          </p>
        </Tile>
        <Tile>
          <p className={styles.etiqueta}>{t('guardiasDelMes', 'Guard shifts this month')}</p>
          <p className={styles.valor}>{t('guardiasDeTope', '{{guardias}} of {{tope}}', { guardias, tope })}</p>
        </Tile>
      </div>

      {dias.length === 0 ? (
        <p className={styles.vacio}>{t('sinRol', 'There is no published schedule for this month.')}</p>
      ) : (
        <Table size="sm" useZebraStyles aria-label={t('misTurnos', 'My shifts')}>
          <TableHead>
            <TableRow>
              <TableHeader>{t('fecha', 'Date')}</TableHeader>
              <TableHeader>{t('codigo', 'Code')}</TableHeader>
              <TableHeader>{t('turno', 'Shift')}</TableHeader>
              <TableHeader>{t('horario', 'Hours')}</TableHeader>
              <TableHeader>{t('respuesta', 'Your answer')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {dias.map((x) => (
              <TableRow key={x.dia}>
                <TableCell>{fechaCorta(x.fecha, i18n.language)}</TableCell>
                <TableCell>
                  <Tag size="sm" type={TIPO_TAG[CODIGOS[x.codigo].grupo]}>
                    {x.codigo}
                  </Tag>
                </TableCell>
                <TableCell>{CODIGOS[x.codigo].nombre}</TableCell>
                <TableCell>{horario(x.codigo)}</TableCell>
                <TableCell>
                  {CODIGOS[x.codigo].horas > 0 && (
                    <RespuestaTurno mes={mes} upss={trabajador.upss} workerId={trabajador.id} dia={x.dia} codigo={x.codigo}
                      publicado={estado.data === 'Publicado'} respuestas={respuestas.data ?? []} ahora={ahora} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
