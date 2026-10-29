import {
  Button,
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
  Tile,
} from '@carbon/react';
import { Download } from '@carbon/react/icons';
import { useConfig } from '@openmrs/esm-framework';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { mesDe } from '../api/fuente-datos';
import type { RrhhTurnosConfig } from '../config-schema';
import { moduleName } from '../constants';
import { CODIGOS } from '../domain/catalogos';
import { diasDelMes } from '../domain/reglas';
import { horario } from '../formato';
import { useBloquesDelMes, useRolDelMes, useTrabajadores } from '../rrhh.resource';
import styles from '../root.scss';
import SelectorMes from '../selector-mes.component';
import { descargarExcel } from './excel';
import { descargarTuasusalud, filasSusalud, observacionesSusalud } from './tuasusalud';

// RF06, RF07, RF27, RF31
export default function Reportes({ ahora: ahoraProp }: { ahora?: Date }) {
  const { t } = useTranslation(moduleName);
  const { ipress } = useConfig<RrhhTurnosConfig>();
  const [ahora] = useState(() => ahoraProp ?? new Date());
  const [mes, setMes] = useState(mesDe(ahora));
  const [upss, setUpss] = useState('');
  const [desde, setDesde] = useState(1);
  const [hasta, setHasta] = useState(31);
  const [error, setError] = useState(false);
  const trabajadores = useTrabajadores();
  const rol = useRolDelMes(mes);
  const bloques = useBloquesDelMes(mes);

  const filas = useMemo(
    () => (rol.data && trabajadores.data && bloques.data ? filasSusalud(mes, rol.data, trabajadores.data, bloques.data, upss || undefined) : []),
    [rol.data, trabajadores.data, bloques.data, mes, upss],
  );
  const observaciones = useMemo(() => observacionesSusalud(filas), [filas]);

  if (trabajadores.error || rol.error || bloques.error)
    return (
      <InlineNotification kind="error" lowContrast hideCloseButton title={t('errorCarga', 'The shifts could not be loaded')}
        subtitle={t('errorCargaTexto', 'Try again in a few minutes. If it persists, contact the HR unit.')} />
    );
  if (trabajadores.isLoading || rol.isLoading || bloques.isLoading) return <DataTableSkeleton columnCount={4} rowCount={4} showHeader={false} />;

  const nombre = new Map((trabajadores.data ?? []).map((w) => [w.id, w.nombre]));
  const listaUpss = Object.keys(rol.data?.[mes] ?? {}).sort();
  const dias = diasDelMes(mes);
  const sufijo = upss ? ` ${upss}` : '';

  async function exportar(accion: () => Promise<void>) {
    setError(false);
    try {
      await accion();
    } catch {
      setError(true);
    }
  }

  // RF06: turnos por servicio y rango de fechas
  const turnosRango = () =>
    Object.entries(rol.data?.[mes] ?? {})
      .filter(([u]) => !upss || u === upss)
      .flatMap(([u, roles]) =>
        Object.entries(roles).flatMap(([wid, r]) =>
          Object.entries(r)
            .filter(([d, c]) => +d >= desde && +d <= hasta && CODIGOS[c].horas > 0)
            .map(([d, c]) => [`${mes}-${d.padStart(2, '0')}`, u, nombre.get(wid) ?? wid, c, CODIGOS[c].nombre, horario(c), CODIGOS[c].horas]),
        ),
      )
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));

  return (
    <div className={styles.seccion}>
      <SelectorMes mes={mes} onChange={setMes} />
      <div className={styles.filtros}>
        <Select id="reportes-upss" size="sm" labelText={t('upss', 'Service unit (UPSS)')} value={upss} onChange={(e) => setUpss(e.target.value)}>
          <SelectItem value="" text={t('todas', 'All')} />
          {listaUpss.map((u) => <SelectItem key={u} value={u} text={u} />)}
        </Select>
      </div>
      {error && (
        <InlineNotification kind="error" lowContrast hideCloseButton title={t('errorExportar', 'The file could not be generated')}
          subtitle={t('errorCargaTexto', 'Try again in a few minutes. If it persists, contact the HR unit.')} />
      )}

      <Tile>
        <h3 className={styles.subtitulo}>{t('reporteTuasusalud', 'TuASUSALUD template')}</h3>
        <p className={styles.nota}>
          {t('reporteTuasusaludTexto', 'Fills the official SUSALUD template: one row per worker and service, {{n}} rows this month.', { n: filas.length })}
        </p>
        {observaciones.length > 0 && (
          <>
            <InlineNotification kind="warning" lowContrast hideCloseButton title={t('observados', '{{n}} records with observations', { n: observaciones.length })}
              subtitle={t('observadosTexto', 'SUSALUD may reject them. Fix them in the worker record in Frappe HR before uploading the file.')} />
            <Table size="sm" aria-label={t('observados', '{{n}} records with observations', { n: observaciones.length })}>
              <TableHead>
                <TableRow>
                  <TableHeader>{t('trabajador', 'Worker')}</TableHeader>
                  <TableHeader>{t('campo', 'Field')}</TableHeader>
                  <TableHeader>{t('problema', 'Problem')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {observaciones.map((o) => (
                  <TableRow key={`${o.workerId}-${o.campo}`}>
                    <TableCell>{nombre.get(o.workerId) ?? o.workerId}</TableCell>
                    <TableCell>{o.campo}</TableCell>
                    <TableCell>{o.problema}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
        <Button className={styles.boton} size="md" renderIcon={Download} disabled={filas.length === 0}
          onClick={() => exportar(() => descargarTuasusalud(mes, filas, ipress))}>
          {t('descargarTuasusalud', 'Download TuASUSALUD')}
        </Button>
      </Tile>

      <Tile>
        <h3 className={styles.subtitulo}>{t('reporteServicio', 'Shifts by service and dates')}</h3>
        <div className={styles.rango}>
          <Select id="desde" size="sm" labelText={t('desde', 'From')} value={desde} onChange={(e) => setDesde(+e.target.value)}>
            {dias.map((d) => <SelectItem key={d.d} value={d.d} text={String(d.d)} />)}
          </Select>
          <Select id="hasta" size="sm" labelText={t('hasta', 'To')} value={Math.min(hasta, dias.length)} onChange={(e) => setHasta(+e.target.value)}>
            {dias.map((d) => <SelectItem key={d.d} value={d.d} text={String(d.d)} />)}
          </Select>
        </div>
        <Button className={styles.boton} size="md" kind="tertiary" renderIcon={Download}
          onClick={() =>
            exportar(() =>
              descargarExcel(`Turnos por servicio ${mes}${sufijo}.xlsx`, ipress.nombre, [
                {
                  nombre: 'Turnos',
                  titulo: t('reporteServicio', 'Shifts by service and dates'),
                  columnas: [t('fecha', 'Date'), 'UPSS', t('trabajador', 'Worker'), t('codigo', 'Code'), t('turno', 'Shift'), t('horario', 'Hours'), t('horas', 'Hours')],
                  filas: turnosRango(),
                },
              ]),
            )
          }>
          {t('descargarExcel', 'Download Excel')}
        </Button>
      </Tile>
    </div>
  );
}
