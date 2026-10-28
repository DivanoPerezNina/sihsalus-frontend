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
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { mesDe } from '../api/fuente-datos';
import { moduleName } from '../constants';
import { finTurno } from '../domain/asistencia';
import { CODIGOS, type Codigo } from '../domain/catalogos';
import { PARAMS_DEFECTO, maxGuardiasPorIngreso } from '../domain/parametros';
import { guardiasMes, horasMes, inicioTurno } from '../domain/reglas';
import { fechaCorta, horario } from '../formato';
import { useRolDelMes, useTrabajadorActual } from '../rrhh.resource';
import styles from '../root.scss';
import SelectorMes from '../selector-mes.component';

const TIPO_TAG: Record<string, 'blue' | 'purple' | 'gray' | 'green'> = {
  turno: 'blue',
  guardia: 'purple',
  descanso: 'gray',
  licencia: 'green',
};

// RF04, RF15: rol del mes del trabajador que inició sesión y su próximo turno
export default function MisTurnos({ ahora: ahoraProp }: { ahora?: Date }) {
  const [ahora] = useState(() => ahoraProp ?? new Date());
  const { t, i18n } = useTranslation(moduleName);
  const [mes, setMes] = useState(mesDe(ahora));
  const { trabajador, isLoading: cargandoTrabajador, error: errorTrabajador } = useTrabajadorActual();
  const { data: rol, isLoading: cargandoRol, error: errorRol } = useRolDelMes(mes);

  const dias = useMemo(() => {
    if (!trabajador || !rol) return [];
    const [y, m] = mes.split('-').map(Number);
    const r = rol[mes]?.[trabajador.upss]?.[trabajador.id] ?? {};
    return Object.entries(r)
      .map(([d, codigo]) => ({ fecha: new Date(y, m - 1, +d), dia: +d, codigo: codigo as Codigo }))
      .sort((a, b) => a.dia - b.dia);
  }, [rol, trabajador, mes]);

  if (errorTrabajador || errorRol)
    return (
      <InlineNotification
        kind="error"
        lowContrast
        hideCloseButton
        title={t('errorCarga', 'The shifts could not be loaded')}
        subtitle={t('errorCargaTexto', 'Try again in a few minutes. If it persists, contact the HR unit.')}
      />
    );
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
  const tope = maxGuardiasPorIngreso(trabajador.anioIngreso);
  const proximo = dias.find((x) => {
    const fin = finTurno(mes, x.dia, x.codigo);
    return fin && fin > ahora;
  });
  const inicioProximo = proximo && inicioTurno(mes, proximo.dia, proximo.codigo);

  return (
    <div className={styles.seccion}>
      <p className={styles.trabajador}>
        {trabajador.nombre} · {trabajador.upss}
      </p>
      <SelectorMes mes={mes} onChange={setMes} />

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
            {t('horasDeMinimo', '{{horas}} h of {{minimo}} h', { horas, minimo: PARAMS_DEFECTO.horasMinimasMes })}
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
