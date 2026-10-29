import { DataTableSkeleton, InlineNotification, Select, SelectItem, Tag } from '@carbon/react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { mesDe, type TrabajadorRrhh } from '../api/fuente-datos';
import { moduleName } from '../constants';
import { CODIGOS, type Codigo } from '../domain/catalogos';
import { PARAMS_DEFECTO, maxGuardiasPorIngreso } from '../domain/parametros';
import { diasDelMes, guardiasMes, horasMes, yaInicio } from '../domain/reglas';
import { usePrivilegios } from '../privilegios';
import { esEditable } from '../domain/flujo';
import { useConfirmaciones, useEstadoCronograma, useRolDelMes, useTrabajadorActual, useTrabajadores } from '../rrhh.resource';
import AccionesCronograma from './acciones-cronograma.component';
import SelectorMes from '../selector-mes.component';
import styles from './calendario.scss';
import ModalTurno from './modal-turno.component';

const INICIAL_DIA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

// RF22, RF25, RF29: matriz mensual persona × día de una UPSS. RF01, RF02, RF21: al pulsar una celda se abre el turno.
export default function Calendario({ ahora: ahoraProp }: { ahora?: Date }) {
  const { t } = useTranslation(moduleName);
  const [ahora] = useState(() => ahoraProp ?? new Date());
  const [mes, setMes] = useState(mesDe(ahora));
  const [upssElegida, setUpss] = useState('');
  const [abierto, setAbierto] = useState<{ trabajador: TrabajadorRrhh; dia: number }>();
  const { programacionEditar } = usePrivilegios();
  const trabajadores = useTrabajadores();
  const rol = useRolDelMes(mes);
  const { trabajador: actual } = useTrabajadorActual();
  const confirmaciones = useConfirmaciones(mes);

  const listaUpss = useMemo(() => [...new Set((trabajadores.data ?? []).map((w) => w.upss))].sort(), [trabajadores.data]);
  // Por defecto, la UPSS del jefe que inició sesión
  const upss = upssElegida || actual?.upss || listaUpss[0] || '';
  const estado = useEstadoCronograma(mes, upss);

  // Personal propio de la UPSS más quienes vienen de apoyo desde otra UPSS
  const filas = useMemo(() => {
    const ids = new Set(Object.keys(rol.data?.[mes]?.[upss] ?? {}));
    return (trabajadores.data ?? [])
      .filter((w) => w.upss === upss || ids.has(w.id))
      .sort((a, b) => Number(b.upss === upss) - Number(a.upss === upss) || a.nombre.localeCompare(b.nombre));
  }, [trabajadores.data, rol.data, mes, upss]);

  if (trabajadores.error || rol.error || estado.error)
    return (
      <InlineNotification kind="error" lowContrast hideCloseButton title={t('errorCarga', 'The shifts could not be loaded')}
        subtitle={t('errorCargaTexto', 'Try again in a few minutes. If it persists, contact the HR unit.')} />
    );

  const dias = diasDelMes(mes);
  const editable = programacionEditar && estado.data !== undefined && esEditable(estado.data);
  // RF20: turnos a los que el trabajador respondió que no asistirá
  const noAsiste = new Map(
    (confirmaciones.data ?? []).filter((c) => c.upss === upss && c.estado === 'no_asiste').map((c) => [`${c.workerId}|${c.dia}`, c.motivo ?? '']),
  );
  // Personal propio bajo las horas mínimas o sobre el tope de guardias (se avisa antes de enviar o publicar)
  const alertas = rol.data
    ? filas.filter(
        (w) => w.upss === upss && (horasMes(rol.data, mes, w.id) < PARAMS_DEFECTO.horasMinimasMes || guardiasMes(rol.data, mes, w.id) > maxGuardiasPorIngreso(w.anioIngreso)),
      ).length
    : 0;

  return (
    <div className={styles.calendario}>
      <div className={styles.barra}>
        <SelectorMes mes={mes} onChange={setMes} />
        <Select id="calendario-upss" size="sm" inline labelText={t('upss', 'Service unit (UPSS)')} value={upss} onChange={(e) => setUpss(e.target.value)}>
          {listaUpss.map((u) => <SelectItem key={u} value={u} text={u} />)}
        </Select>
        {estado.data && (
          <Tag type={estado.data === 'Publicado' ? 'green' : 'gray'} data-testid="estado-cronograma">
            {t(`estado_${estado.data}`, estado.data)}
          </Tag>
        )}
        {estado.data && <AccionesCronograma mes={mes} upss={upss} estado={estado.data} alertas={alertas} />}
      </div>

      {trabajadores.isLoading || rol.isLoading ? (
        <DataTableSkeleton columnCount={8} rowCount={6} showHeader={false} />
      ) : (
        <div className={styles.contenedor} role="region" aria-label={t('calendario', 'Schedule')}>
          <table className={styles.matriz}>
            <thead>
              <tr>
                <th scope="col" className={styles.nombre}>{t('trabajador', 'Worker')}</th>
                {dias.map((d) => (
                  <th key={d.d} scope="col" className={d.domingo || d.feriado ? styles.festivo : undefined}>
                    <span className={styles.inicialDia}>{INICIAL_DIA[d.dow]}</span>
                    {d.d}
                  </th>
                ))}
                <th scope="col">{t('horas', 'Hours')}</th>
                <th scope="col">{t('guardias', 'Guards')}</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((w) => {
                const r = rol.data?.[mes]?.[upss]?.[w.id] ?? {};
                const horas = rol.data ? horasMes(rol.data, mes, w.id) : 0;
                const guardias = rol.data ? guardiasMes(rol.data, mes, w.id) : 0;
                const tope = maxGuardiasPorIngreso(w.anioIngreso);
                return (
                  <tr key={w.id}>
                    <th scope="row" className={styles.nombre}>
                      {w.nombre}
                      {w.upss !== upss && <span className={styles.apoyo}> · {t('apoyoDe', 'support from {{upss}}', { upss: w.upss })}</span>}
                    </th>
                    {dias.map((d) => {
                      const c: Codigo | undefined = r[d.d];
                      const sePuede = editable && !yaInicio(mes, d.d, c ?? 'L', ahora);
                      const texto = c ?? '·';
                      const motivoNoAsiste = noAsiste.get(`${w.id}|${d.d}`);
                      const etiqueta =
                        `${w.nombre}, ${d.d}: ${c ? CODIGOS[c].nombre : t('sinAsignar', 'unassigned')}` +
                        (motivoNoAsiste !== undefined ? ` · ${t('noAsistira', 'will not attend')}${motivoNoAsiste ? `: ${motivoNoAsiste}` : ''}` : '');
                      const clases = [c && styles[`grupo_${CODIGOS[c].grupo}`], motivoNoAsiste !== undefined && styles.noAsiste].filter(Boolean).join(' ');
                      return (
                        <td key={d.d} className={clases || undefined}>
                          {sePuede ? (
                            <button type="button" className={styles.celda} aria-label={etiqueta} onClick={() => setAbierto({ trabajador: w, dia: d.d })}>
                              {texto}
                            </button>
                          ) : (
                            <span className={styles.celda} title={etiqueta}>{texto}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className={horas < PARAMS_DEFECTO.horasMinimasMes ? styles.alerta : undefined} data-testid={`horas-${w.id}`}>
                      {horas}
                    </td>
                    <td className={guardias > tope ? styles.alerta : undefined}>
                      {guardias}/{tope}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.leyenda}>
        {t('leyendaCalendario', 'Hours below {{minimo}} and guard shifts above the limit are highlighted. Shifts that already started cannot be edited.', {
          minimo: PARAMS_DEFECTO.horasMinimasMes,
        })}
        {!programacionEditar && ` ${t('soloLectura', 'You can view this schedule but not edit it.')}`}
      </p>

      {abierto && rol.data && estado.data && (
        <ModalTurno mes={mes} upss={upss} trabajador={abierto.trabajador} dia={abierto.dia} rol={rol.data}
          estado={estado.data} onClose={() => setAbierto(undefined)} />
      )}
    </div>
  );
}
