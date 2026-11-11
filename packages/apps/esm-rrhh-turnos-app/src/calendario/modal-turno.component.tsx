import {
  Button,
  ComposedModal,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  SelectItemGroup,
  TextArea,
} from '@carbon/react';
import { Add, TrashCan } from '@carbon/react/icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import type { EstadoCronograma, TrabajadorRrhh } from '../api/fuente-datos';
import { moduleName } from '../constants';
import { CODIGOS, SERVICIOS_SUSALUD, type Codigo, type ServicioSusalud } from '../domain/catalogos';
import { maxGuardiasPorIngreso } from '../domain/parametros';
import {
  bloquesPorDefecto,
  cruces,
  crucesEntreBloques,
  esGuardia,
  guardiasMes,
  horasBloques,
  horasMes,
  serviciosRepetidos,
  yaInicio,
  diasDelMes,
  type Bloque,
  type MesId,
  type Programacion,
} from '../domain/reglas';
import { fechaCorta } from '../formato';
import { useFuenteDatos, useGuardarTurno, useParametros } from '../rrhh.resource';
import styles from './calendario.scss';

export const GRUPOS_CODIGOS: { clave: string; texto: string; codigos: Codigo[] }[] = [
  { clave: 'grupoTurnos', texto: 'Shifts', codigos: ['M', 'T', 'APS'] },
  { clave: 'grupoGuardias', texto: 'Guard shifts', codigos: ['GDO', 'GNO', 'GDDF', 'GNDF'] },
  { clave: 'grupoDescanso', texto: 'Rest', codigos: ['L', 'DOM', 'FE'] },
  { clave: 'grupoLicencias', texto: 'Leave', codigos: ['LV', 'LE', 'LG', 'LP', 'LO', 'LPT', 'LMT', 'LF'] },
];

export const MOTIVOS = ['licencia', 'descansoMedico', 'reemplazo', 'necesidadServicio', 'permuta', 'errorProgramacion', 'otro'] as const;

// Horas cada 30 minutos para los bloques
const HORAS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

interface Props {
  mes: MesId;
  upss: string;
  trabajador: TrabajadorRrhh;
  dia: number;
  rol: Programacion;
  estado: EstadoCronograma;
  ahora: Date;
  onClose: () => void;
}

// RF01, RF02, RF21, RF23, RF25, RF26, RF29, RF30
export default function ModalTurno({ mes, upss, trabajador: w, dia, rol, estado, ahora, onClose }: Props) {
  const { t, i18n } = useTranslation(moduleName);
  const { fuente, clave } = useFuenteDatos();
  const guardarTurno = useGuardarTurno();
  const params = useParametros();
  const actual: Codigo | undefined = rol[mes]?.[upss]?.[w.id]?.[dia];
  const tieneTurno = Boolean(actual && CODIGOS[actual].horas > 0);
  const publicado = estado === 'Publicado';
  const prof = { profesion: w.profesion ?? '' };

  const [codigo, setCodigo] = useState<Codigo>(actual && tieneTurno ? actual : 'M');
  const [destino, setDestino] = useState(dia); // RF02: mover el turno a otra fecha
  const [bloques, setBloques] = useState<Bloque[]>(() => bloquesPorDefecto(prof, upss, codigo));
  const [motivo, setMotivo] = useState('');
  const [detalle, setDetalle] = useState('');
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState(false);

  // Bloques ya guardados de este turno, si los hay
  useSWR(['rrhh', clave, 'bloques', mes, upss, w.id, dia], () => fuente.bloques(mes, upss, w.id, dia), {
    onSuccess: (b) => b?.length && setBloques(b),
  });

  const trabaja = CODIGOS[codigo].horas > 0;
  // Al mover, se valida contra el rol sin el turno original
  const moviendo = destino !== dia;
  const { [dia]: _original, ...restoDelRol } = rol[mes]?.[upss]?.[w.id] ?? {};
  const base: Programacion = moviendo ? { ...rol, [mes]: { ...rol[mes], [upss]: { ...rol[mes]?.[upss], [w.id]: restoDelRol } } } : rol;
  const enDestino: Codigo | undefined = base[mes]?.[upss]?.[w.id]?.[destino];
  const ocupado = moviendo && Boolean(enDestino && CODIGOS[enDestino].horas > 0);
  const listaCruces = trabaja ? cruces(base, mes, w.id, upss, destino, codigo) : [];
  const tope = maxGuardiasPorIngreso(w.anioIngreso, params);
  const guardiasSinEste = guardiasMes(base, mes, w.id) - (enDestino && esGuardia(enDestino) ? 1 : 0);
  const excedeTope = esGuardia(codigo) && guardiasSinEste >= tope;
  const horasResultantes = horasMes(base, mes, w.id) - (enDestino ? CODIGOS[enDestino].horas : 0) + CODIGOS[codigo].horas;
  const diasDisponibles = diasDelMes(mes).filter((d) => d.d === dia || !yaInicio(mes, d.d, 'L', ahora));
  const bloquesCruzados = crucesEntreBloques(bloques);
  const repetidos = serviciosRepetidos(bloques);
  const sumaBloques = horasBloques(bloques);
  const bloqueado = ocupado || listaCruces.length > 0 || excedeTope || (trabaja && (bloques.length === 0 || bloquesCruzados.size > 0));
  const faltaMotivo = publicado && !motivo;
  const fecha = fechaCorta(new Date(+mes.slice(0, 4), +mes.slice(5) - 1, dia), i18n.language);

  const elegir = (c: Codigo) => {
    setCodigo(c);
    setBloques(bloquesPorDefecto(prof, upss, c));
  };
  const cambiarBloque = (i: number, campo: keyof Bloque, v: string) =>
    setBloques((b) => b.map((x, j) => (j === i ? { ...x, [campo]: v } : x)));

  async function guardar(c: Codigo) {
    setIntento(true);
    if (faltaMotivo || (c === codigo && bloqueado)) return;
    setGuardando(true);
    setErrorGuardar(false);
    try {
      const textoMotivo = motivo ? [t(`motivo_${motivo}`), detalle.trim()].filter(Boolean).join(': ') : undefined;
      // Mover = liberar el día original y crear el turno en la fecha nueva
      if (moviendo && c === codigo) await guardarTurno({ mes, upss, workerId: w.id, dia, codigo: 'L', bloques: [], motivo: textoMotivo });
      const diaFinal = c === codigo ? destino : dia;
      await guardarTurno({ mes, upss, workerId: w.id, dia: diaFinal, codigo: c, bloques: CODIGOS[c].horas > 0 ? bloques : [], motivo: textoMotivo });
      onClose();
    } catch {
      setErrorGuardar(true);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ComposedModal open onClose={onClose} size="md" preventCloseOnClickOutside>
      <ModalHeader
        label={`${upss} · ${t(`estado_${estado}`, estado)}`}
        title={t('asignarTurnoTitulo', 'Shift for {{nombre}}, {{fecha}}', { nombre: w.nombre, fecha })}
        iconDescription={t('cerrar', 'Close')}
      />
      <ModalBody hasForm>
        <div className={styles.validaciones} aria-live="polite">
          {excedeTope && (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title={t('errorTope', 'Guard shift limit')}
              subtitle={t('errorTopeTexto', 'Already has {{n}} guard shifts this month; the limit for workers who joined in {{anio}} is {{tope}}.', {
                n: guardiasSinEste,
                anio: w.anioIngreso,
                tope,
              })}
            />
          )}
          {ocupado && enDestino && (
            <InlineNotification kind="error" lowContrast hideCloseButton title={t('errorDiaOcupado', 'That day already has a shift')}
              subtitle={t('errorDiaOcupadoTexto', 'Day {{dia}} already has {{codigo}}. Edit that shift directly.', { dia: destino, codigo: enDestino })} />
          )}
          {listaCruces.length > 0 && (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title={t('errorCruce', 'Schedule overlap')}
              subtitle={t('errorCruceTexto', '{{codigo}} overlaps with {{otros}}. A worker cannot have two shifts at the same time.', {
                codigo,
                otros: listaCruces.map((c) => `${c.codigo} (${c.upss}, ${c.dia})`).join(', '),
              })}
            />
          )}
          {trabaja && bloquesCruzados.size > 0 && (
            <InlineNotification kind="error" lowContrast hideCloseButton title={t('errorBloques', 'Two blocks of this shift overlap')} />
          )}
          {trabaja && repetidos.size > 0 && (
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title={t('avisoServicioRepetido', 'Same service twice on one day')}
              subtitle={t('avisoServicioRepetidoTexto', 'TuASUSALUD accepts one schedule per service and day; they will be merged on export.')}
            />
          )}
          {trabaja && bloques.length > 0 && sumaBloques !== CODIGOS[codigo].horas && (
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title={t('avisoHorasBloques', 'Blocks add up to {{suma}} h and the shift lasts {{horas}} h', {
                suma: sumaBloques,
                horas: CODIGOS[codigo].horas,
              })}
            />
          )}
          {errorGuardar && (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title={t('errorGuardar', 'The shift could not be saved')}
              subtitle={t('errorCargaTexto', 'Try again in a few minutes. If it persists, contact the HR unit.')}
            />
          )}
        </div>

        {w.practitionerId && (
          <p className={styles.ficha} data-testid="practitioner">
            FHIR: Practitioner/{w.practitionerId}
          </p>
        )}
        {tieneTurno && (
          <Select id="fecha" labelText={t('fechaDelTurno', 'Shift date (change it to move the shift)')} value={destino} onChange={(e) => setDestino(+e.target.value)}>
            {diasDisponibles.map((d) => (
              <SelectItem key={d.d} value={d.d} text={fechaCorta(new Date(+mes.slice(0, 4), +mes.slice(5) - 1, d.d), i18n.language)} />
            ))}
          </Select>
        )}
        <Select id="codigo" labelText={t('codigoDelRol', 'Roster code')} value={codigo} onChange={(e) => elegir(e.target.value as Codigo)}
          helperText={`${CODIGOS[codigo].nombre} · ${CODIGOS[codigo].horas} h`}>
          {GRUPOS_CODIGOS.map((g) => (
            <SelectItemGroup key={g.clave} label={t(g.clave, g.texto)}>
              {g.codigos.map((c) => (
                <SelectItem key={c} value={c} text={`${c} · ${CODIGOS[c].nombre}`} />
              ))}
            </SelectItemGroup>
          ))}
        </Select>

        {trabaja && (
          <fieldset className={styles.bloques}>
            <legend className="cds--label">{t('bloquesSusalud', 'TuASUSALUD blocks (service and time)')}</legend>
            {bloques.map((b, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: los bloques no tienen identidad propia; se editan por posición
              <div key={i} className={styles.bloque}>
                <Select id={`servicio-${i}`} size="sm" labelText={t('servicio', 'Service')} value={b.servicio}
                  invalid={bloquesCruzados.has(i)} onChange={(e) => cambiarBloque(i, 'servicio', e.target.value as ServicioSusalud)}>
                  {Object.entries(SERVICIOS_SUSALUD).map(([k, v]) => (
                    <SelectItem key={k} value={k} text={v.length > 60 ? `${v.slice(0, 58)}…` : v} />
                  ))}
                </Select>
                <Select id={`ingreso-${i}`} size="sm" labelText={t('ingreso', 'Clock-in')} value={b.ingreso} onChange={(e) => cambiarBloque(i, 'ingreso', e.target.value)}>
                  {HORAS.map((h) => <SelectItem key={h} value={h} text={h} />)}
                </Select>
                <Select id={`salida-${i}`} size="sm" labelText={t('salida', 'Clock-out')} value={b.salida} onChange={(e) => cambiarBloque(i, 'salida', e.target.value)}>
                  {HORAS.map((h) => <SelectItem key={h} value={h} text={h} />)}
                </Select>
                <Button kind="ghost" size="sm" hasIconOnly renderIcon={TrashCan} iconDescription={t('quitarBloque', 'Remove block')}
                  onClick={() => setBloques((x) => x.filter((_, j) => j !== i))} />
              </div>
            ))}
            <Button kind="ghost" size="sm" renderIcon={Add} onClick={() => setBloques((x) => [...x, { servicio: 'REGAT', ingreso: '12:00', salida: '13:00' }])}>
              {t('agregarBloque', 'Add block')}
            </Button>
          </fieldset>
        )}

        <p className={horasResultantes < params.horasMinimasMes ? styles.horasBajas : styles.horas} data-testid="horas-resultantes">
          {t('horasResultantes', 'With this change: {{horas}} h this month', { horas: horasResultantes })}
          {horasResultantes < params.horasMinimasMes && ` (${t('menosDelMinimo', 'below {{minimo}} h', { minimo: params.horasMinimasMes })})`}
        </p>

        {publicado && (
          <>
            <Select id="motivo" labelText={t('motivoCambio', 'Reason for the change (required: the schedule is published)')} value={motivo}
              invalid={intento && faltaMotivo} invalidText={t('faltaMotivo', 'Choose the reason for the change')} onChange={(e) => setMotivo(e.target.value)}>
              <SelectItem value="" text={t('elegir', 'Choose')} />
              {MOTIVOS.map((m) => <SelectItem key={m} value={m} text={t(`motivo_${m}`)} />)}
            </Select>
            <TextArea id="detalle" labelText={t('detalleMotivo', 'Details (optional)')} maxCount={200} enableCounter rows={2}
              value={detalle} onChange={(e) => setDetalle(e.target.value)} />
          </>
        )}
      </ModalBody>
      <ModalFooter>
        {tieneTurno && (
          <Button kind="danger--tertiary" disabled={guardando} onClick={() => guardar('L')}>
            {t('cancelarTurno', 'Cancel shift')}
          </Button>
        )}
        <Button kind="secondary" onClick={onClose}>{t('cerrar', 'Close')}</Button>
        <Button kind="primary" disabled={guardando || bloqueado} onClick={() => guardar(codigo)}>
          {t('guardar', 'Save')}
        </Button>
      </ModalFooter>
    </ComposedModal>
  );
}
