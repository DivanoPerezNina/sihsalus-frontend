import { ActionableNotification, DataTableSkeleton, InlineNotification, Modal, Select, SelectItem, Tag, TextArea } from '@carbon/react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { mesDe, mesVecino, type TrabajadorRrhh } from '../api/fuente-datos';
import { moduleName } from '../constants';
import { esEditable } from '../domain/flujo';
import { maxGuardiasPorIngreso } from '../domain/parametros';
import { diasDelMes, guardiasMes, horasMes, mesesProgramables, yaInicio } from '../domain/reglas';
import { hora } from '../formato';
import { usePrivilegios } from '../privilegios';
import {
  useAccesoProgramacion,
  useConfirmaciones,
  useEstadoCronograma,
  useEstadosCronograma,
  useParametros,
  useRolDelMes,
  useTrabajadorActual,
  useTrabajadores,
} from '../rrhh.resource';
import SelectorMes from '../selector-mes.component';
import AccionesCronograma from './acciones-cronograma.component';
import styles from './calendario.scss';
import Matriz from './matriz.component';
import ModalTurno from './modal-turno.component';

// RF22, RF25, RF29: matriz mensual persona × día de una UPSS. RF01, RF02, RF21: al pulsar una celda se abre el turno.
export default function Calendario({ ahora: ahoraProp }: { ahora?: Date }) {
  const { t } = useTranslation(moduleName);
  const [ahora] = useState(() => ahoraProp ?? new Date());
  const [mes, setMes] = useState(mesDe(ahora));
  const [upssElegida, setUpss] = useState('');
  const [abierto, setAbierto] = useState<{ trabajador: TrabajadorRrhh; dia: number }>();
  const [pidiendoAcceso, setPidiendoAcceso] = useState(false);
  const [motivoAcceso, setMotivoAcceso] = useState('');
  const [errorAcceso, setErrorAcceso] = useState(false);
  const { programacionEditar, programacionAprobar } = usePrivilegios();
  const params = useParametros();
  const acceso = useAccesoProgramacion();
  const trabajadores = useTrabajadores();
  const rol = useRolDelMes(mes);
  const { trabajador: actual } = useTrabajadorActual();
  const confirmaciones = useConfirmaciones(mes);

  const listaUpss = useMemo(() => [...new Set((trabajadores.data ?? []).map((w) => w.upss).filter(Boolean))].sort(), [trabajadores.data]);
  // RF18: quien aprueba ve primero lo que tiene pendiente; el jefe, su propia UPSS
  const estados = useEstadosCronograma(mes, listaUpss);
  const porAprobar = programacionAprobar ? listaUpss.filter((u) => estados.data?.[u] === 'Enviado a aprobación') : [];
  const propuesta = porAprobar[0] || actual?.upss || listaUpss[0] || '';
  const upss = upssElegida || propuesta;
  useEffect(() => {
    if (!upssElegida && propuesta && !estados.isLoading) setUpss(propuesta);
  }, [upssElegida, propuesta, estados.isLoading]);
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

  // RF01: solo se programa el mes en curso y los siguientes que permita el parámetro
  const programable = mesesProgramables([mes], ahora, params.mesesAdelante).length > 0;
  const fueraDeRed = programacionEditar && !acceso.cargando && !acceso.permitido;
  const editable = programacionEditar && acceso.permitido && programable && estado.data !== undefined && esEditable(estado.data);
  // RF20: turnos a los que el trabajador respondió que no asistirá
  const noAsiste = new Map(
    (confirmaciones.data ?? []).filter((c) => c.upss === upss && c.estado === 'no_asiste').map((c) => [`${c.workerId}|${c.dia}`, c.motivo ?? '']),
  );
  const resumen = (w: TrabajadorRrhh) => ({
    horas: rol.data ? horasMes(rol.data, mes, w.id) : 0,
    guardias: rol.data ? guardiasMes(rol.data, mes, w.id) : 0,
    tope: maxGuardiasPorIngreso(w.anioIngreso, params),
  });
  // Personal propio bajo las horas mínimas o sobre el tope de guardias (se avisa antes de enviar o publicar)
  const alertas = filas.filter((w) => {
    const r = resumen(w);
    return w.upss === upss && (r.horas < params.horasMinimasMes || r.guardias > r.tope);
  }).length;

  async function pedirAcceso() {
    setErrorAcceso(false);
    try {
      await acceso.solicitar(motivoAcceso.trim(), params.accesoExcepcionalMin);
      setPidiendoAcceso(false);
      setMotivoAcceso('');
    } catch {
      setErrorAcceso(true);
    }
  }

  return (
    <div className={styles.calendario}>
      {fueraDeRed && (
        <ActionableNotification inline kind="warning" lowContrast hideCloseButton data-testid="fuera-de-red"
          title={t('fueraDeRed', 'Scheduling is only available inside the hospital network')}
          subtitle={t('fueraDeRedTexto', 'You can view the schedule. To change it from outside, request exceptional access and state the reason.')}
          actionButtonLabel={t('solicitarAcceso', 'Request exceptional access')} onActionButtonClick={() => setPidiendoAcceso(true)} />
      )}
      {acceso.hasta && !acceso.enRed && (
        <InlineNotification kind="info" lowContrast hideCloseButton data-testid="acceso-vigente"
          title={t('accesoVigente', 'Exceptional access active until {{hora}}', { hora: hora(acceso.hasta) })} />
      )}

      {porAprobar.length > 0 && (
        <InlineNotification kind="info" lowContrast hideCloseButton data-testid="por-aprobar"
          title={t('porAprobar', 'Schedules waiting for your approval: {{upss}}', { upss: porAprobar.join(', ') })} />
      )}

      <div className={styles.barra}>
        <SelectorMes mes={mes} onChange={(m) => {
          setMes(m);
          setUpss(''); // al cambiar de mes se vuelve a proponer lo pendiente
        }} />
        <Select id="calendario-upss" size="sm" inline labelText={t('upss', 'Service unit (UPSS)')} value={upss} onChange={(e) => setUpss(e.target.value)}>
          {listaUpss.map((u) => <SelectItem key={u} value={u} text={u} />)}
        </Select>
        {estado.data && (
          <Tag type={estado.data === 'Publicado' ? 'green' : 'gray'} data-testid="estado-cronograma">
            {t(`estado_${estado.data}`, estado.data)}
          </Tag>
        )}
        {estado.data && <AccionesCronograma mes={mes} upss={upss} estado={estado.data} alertas={alertas} puedeProgramar={acceso.permitido} />}
      </div>

      {trabajadores.isLoading || rol.isLoading ? (
        <DataTableSkeleton columnCount={8} rowCount={6} showHeader={false} />
      ) : (
        <Matriz
          etiqueta={t('calendario', 'Schedule')}
          upss={upss}
          dias={diasDelMes(mes)}
          filas={filas}
          rolDe={(w) => rol.data?.[mes]?.[upss]?.[w.id] ?? {}}
          resumen={resumen}
          minimoHoras={params.horasMinimasMes}
          editable={(_w, d, c) => editable && !yaInicio(mes, d, c ?? 'L', ahora)}
          onCelda={(w, d) => setAbierto({ trabajador: w, dia: d })}
          marca={(w, d) => {
            const motivo = noAsiste.get(`${w.id}|${d}`);
            return motivo === undefined ? undefined : `${t('noAsistira', 'will not attend')}${motivo ? `: ${motivo}` : ''}`;
          }}
        />
      )}

      <p className={styles.leyenda}>
        {t('leyendaCalendario', 'Hours below {{minimo}} and guard shifts above the limit are highlighted. Shifts that already started cannot be edited.', {
          minimo: params.horasMinimasMes,
        })}
        {!programacionEditar && ` ${t('soloLectura', 'You can view this schedule but not edit it.')}`}
        {programacionEditar && !programable && mes > mesDe(ahora) &&
          ` ${t('fueraDeHorizonte', 'This month cannot be scheduled yet: the limit is {{n}} months ahead ({{hasta}}).', {
            n: params.mesesAdelante,
            hasta: mesVecino(mesDe(ahora), params.mesesAdelante),
          })}`}
      </p>

      {abierto && rol.data && estado.data && (
        <ModalTurno mes={mes} upss={upss} trabajador={abierto.trabajador} dia={abierto.dia} rol={rol.data}
          estado={estado.data} ahora={ahora} onClose={() => setAbierto(undefined)} />
      )}

      {pidiendoAcceso && (
        // RF05: el motivo es obligatorio y queda en la bitácora
        <Modal open modalHeading={t('solicitarAcceso', 'Request exceptional access')}
          primaryButtonText={t('solicitarAcceso', 'Request exceptional access')} secondaryButtonText={t('cerrar', 'Close')}
          primaryButtonDisabled={!motivoAcceso.trim()} onRequestClose={() => setPidiendoAcceso(false)} onRequestSubmit={pedirAcceso}>
          <p className={styles.leyenda}>
            {t('accesoTexto', 'Access lasts {{min}} minutes, applies only to shift scheduling and is recorded with your user.', { min: params.accesoExcepcionalMin })}
          </p>
          <TextArea id="motivo-acceso" labelText={t('motivoAcceso', 'Why do you need to schedule from outside the hospital?')} maxCount={300} enableCounter
            value={motivoAcceso} onChange={(e) => setMotivoAcceso(e.target.value)} />
          {errorAcceso && <InlineNotification kind="error" lowContrast hideCloseButton title={t('errorAcceso', 'The access could not be registered')} />}
        </Modal>
      )}
    </div>
  );
}
