import {
  DataTableSkeleton,
  InlineNotification,
  Select,
  SelectItem,
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
import { resumenAsistencia, turnosConAsistencia, type EstadoAsistencia } from '../domain/asistencia';
import { CODIGOS } from '../domain/catalogos';
import { fechaCorta, hora, horario } from '../formato';
import { useMarcaciones, useRolDelMes, useTrabajadores } from '../rrhh.resource';
import styles from '../root.scss';
import SelectorMes from '../selector-mes.component';

const TAG: Record<EstadoAsistencia, 'green' | 'red' | 'magenta' | 'blue' | 'gray'> = {
  asistio: 'green',
  inasistencia: 'red',
  sin_salida: 'magenta',
  sin_ingreso: 'magenta',
  en_curso: 'blue',
  por_venir: 'gray',
};

// RF08: turnos ya ocurridos frente a las marcaciones del reloj ZKTeco (registradas en Frappe HR)
export default function Asistencia({ ahora: ahoraProp }: { ahora?: Date }) {
  const [ahora] = useState(() => ahoraProp ?? new Date());
  const { t, i18n } = useTranslation(moduleName);
  const [mes, setMes] = useState(mesDe(ahora));
  const [upss, setUpss] = useState('');
  const trabajadores = useTrabajadores();
  const rol = useRolDelMes(mes);
  const marcaciones = useMarcaciones(mes);

  const textoEstado: Record<EstadoAsistencia, string> = {
    asistio: t('estadoAsistio', 'Attended'),
    inasistencia: t('estadoInasistencia', 'Absent'),
    sin_salida: t('estadoSinSalida', 'No clock-out'),
    sin_ingreso: t('estadoSinIngreso', 'No clock-in'),
    en_curso: t('estadoEnCurso', 'In progress'),
    por_venir: t('estadoPorVenir', 'Upcoming'),
  };

  const turnos = useMemo(
    () =>
      rol.data && marcaciones.data
        ? turnosConAsistencia(rol.data, mes, marcaciones.data, ahora)
            .filter((x) => x.estado !== 'por_venir' && (!upss || x.upss === upss))
            .reverse()
        : [],
    [rol.data, marcaciones.data, mes, upss, ahora],
  );

  if (trabajadores.error || rol.error || marcaciones.error)
    return (
      <InlineNotification
        kind="error"
        lowContrast
        hideCloseButton
        title={t('errorAsistencia', 'Attendance could not be loaded')}
        subtitle={t('errorCargaTexto', 'Try again in a few minutes. If it persists, contact the HR unit.')}
      />
    );

  const cargando = trabajadores.isLoading || rol.isLoading || marcaciones.isLoading;
  const nombre = new Map((trabajadores.data ?? []).map((w) => [w.id, w.nombre]));
  const upssDisponibles = Object.keys(rol.data?.[mes] ?? {}).sort();
  const resumen = resumenAsistencia(turnos);

  return (
    <div className={styles.seccion}>
      <SelectorMes mes={mes} onChange={setMes} />
      <div className={styles.filtros}>
        <Select
          id="filtro-upss"
          size="sm"
          labelText={t('upss', 'Service unit (UPSS)')}
          value={upss}
          onChange={(e) => setUpss(e.target.value)}
        >
          <SelectItem value="" text={t('todas', 'All')} />
          {upssDisponibles.map((u) => (
            <SelectItem key={u} value={u} text={u} />
          ))}
        </Select>
      </div>

      {cargando ? (
        <DataTableSkeleton columnCount={6} rowCount={8} showHeader={false} />
      ) : (
        <>
          <div className={styles.resumen}>
            {(['asistio', 'inasistencia', 'sin_salida', 'sin_ingreso'] as const).map((e) => (
              <Tile key={e}>
                <p className={styles.etiqueta}>{textoEstado[e]}</p>
                <p className={styles.valor} data-testid={`resumen-${e}`}>
                  {resumen[e]}
                </p>
              </Tile>
            ))}
          </div>
          <p className={styles.nota}>
            {t(
              'notaAsistencia',
              'Clock-in records come from the ZKTeco time clock through Frappe HR. A record counts for a shift from 2 hours before it starts until 4 hours after it ends. Late arrivals and deductions are not calculated here.',
            )}
          </p>
          {turnos.length === 0 ? (
            <p className={styles.vacio}>{t('sinTurnosPasados', 'There are no completed shifts this month yet.')}</p>
          ) : (
            <Table size="sm" useZebraStyles aria-label={t('asistencia', 'Attendance')}>
              <TableHead>
                <TableRow>
                  <TableHeader>{t('fecha', 'Date')}</TableHeader>
                  <TableHeader>{t('trabajador', 'Worker')}</TableHeader>
                  <TableHeader>{t('turno', 'Shift')}</TableHeader>
                  <TableHeader>{t('ingreso', 'Clock-in')}</TableHeader>
                  <TableHeader>{t('salida', 'Clock-out')}</TableHeader>
                  <TableHeader>{t('estado', 'Status')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {turnos.map((x) => (
                  <TableRow key={`${x.workerId}-${x.upss}-${x.dia}`}>
                    <TableCell>{fechaCorta(x.inicio, i18n.language)}</TableCell>
                    <TableCell>
                      {nombre.get(x.workerId) ?? x.workerId}
                      <span className={styles.secundario}> · {x.upss}</span>
                    </TableCell>
                    <TableCell>
                      {x.codigo} <span className={styles.secundario}>{horario(x.codigo)}</span>
                      <span className="cds--visually-hidden">{CODIGOS[x.codigo].nombre}</span>
                    </TableCell>
                    <TableCell>{hora(x.ingreso)}</TableCell>
                    <TableCell>{hora(x.salida)}</TableCell>
                    <TableCell>
                      <Tag size="sm" type={TAG[x.estado]}>
                        {textoEstado[x.estado]}
                      </Tag>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}
