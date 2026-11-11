import { ContentSwitcher, DataTableSkeleton, InlineNotification, Modal, Select, SelectItem, SelectItemGroup, Switch, Tag, TextArea } from '@carbon/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { mesDe, type TrabajadorRrhh } from '../api/fuente-datos';
import AccionesCronograma from '../calendario/acciones-cronograma.component';
import estilosCalendario from '../calendario/calendario.scss';
import Matriz from '../calendario/matriz.component';
import { GRUPOS_CODIGOS } from '../calendario/modal-turno.component';
import { moduleName } from '../constants';
import { CODIGOS, type Codigo } from '../domain/catalogos';
import { maxGuardiasPorIngreso } from '../domain/parametros';
import { diasDelMes, guardiasMes, horasMes, yaInicio, type MesId, type Programacion } from '../domain/reglas';
import { usePrivilegios } from '../privilegios';
import { useEjecutado, useEstadoCronograma, useGuardarEjecutado, useParametros, useRolDelMes, useTrabajadores } from '../rrhh.resource';
import styles from '../root.scss';
import SelectorMes from '../selector-mes.component';

// Lo ejecutado = lo programado con las correcciones registradas al cierre encima
export function conEjecutado(programado: Programacion, correcciones: Programacion, mes: MesId): Programacion {
  const out: Programacion = { [mes]: {} };
  for (const upss of new Set([...Object.keys(programado[mes] ?? {}), ...Object.keys(correcciones[mes] ?? {})])) {
    out[mes][upss] = {};
    for (const w of new Set([...Object.keys(programado[mes]?.[upss] ?? {}), ...Object.keys(correcciones[mes]?.[upss] ?? {})]))
      out[mes][upss][w] = { ...programado[mes]?.[upss]?.[w], ...correcciones[mes]?.[upss]?.[w] };
  }
  return out;
}

interface PropsUpss {
  mes: MesId;
  upss: string;
  vista: 'programado' | 'ejecutado';
  trabajadores: TrabajadorRrhh[];
  programado: Programacion;
  correcciones: Programacion;
  ahora: Date;
}

function SeccionUpss({ mes, upss, vista, trabajadores, programado, correcciones, ahora }: PropsUpss) {
  const { t } = useTranslation(moduleName);
  const { cierre } = usePrivilegios();
  const params = useParametros();
  const estado = useEstadoCronograma(mes, upss);
  const guardar = useGuardarEjecutado();
  const [abierto, setAbierto] = useState<{ w: TrabajadorRrhh; dia: number }>();
  const [codigo, setCodigo] = useState<Codigo>('L');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState(false);

  const datos = vista === 'ejecutado' ? conEjecutado(programado, correcciones, mes) : programado;
  const ids = new Set(Object.keys(datos[mes]?.[upss] ?? {}));
  const filas = trabajadores.filter((w) => ids.has(w.id)).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const cerrado = estado.data === 'Cerrado';
  // RF28: lo ejecutado se registra sobre cronogramas publicados o cerrados, en días que ya pasaron
  const corregible = cierre && vista === 'ejecutado' && (estado.data === 'Publicado' || cerrado);
  const programadoDe = (w: TrabajadorRrhh, dia: number): Codigo | undefined => programado[mes]?.[upss]?.[w.id]?.[dia];

  async function guardarCorreccion() {
    if (!abierto) return;
    setError(false);
    try {
      await guardar({ mes, upss, workerId: abierto.w.id, dia: abierto.dia, codigo, motivo: motivo.trim() || undefined });
      setAbierto(undefined);
      setMotivo('');
    } catch {
      setError(true);
    }
  }

  return (
    <section className={styles.ancha} data-testid={`consolidado-${upss}`}>
      <div className={estilosCalendario.barra}>
        <h3 className={styles.subtitulo}>{upss}</h3>
        {estado.data && <Tag type={estado.data === 'Publicado' ? 'green' : 'gray'}>{t(`estado_${estado.data}`, estado.data)}</Tag>}
        {estado.data && <AccionesCronograma mes={mes} upss={upss} estado={estado.data} alertas={0} soloCierre />}
      </div>
      <Matriz
        etiqueta={`${upss} · ${vista === 'ejecutado' ? t('ejecutado', 'Executed') : t('programado', 'Scheduled')}`}
        upss={upss}
        dias={diasDelMes(mes)}
        filas={filas}
        rolDe={(w) => datos[mes]?.[upss]?.[w.id] ?? {}}
        resumen={(w) => ({ horas: horasMes(datos, mes, w.id), guardias: guardiasMes(datos, mes, w.id), tope: maxGuardiasPorIngreso(w.anioIngreso, params) })}
        minimoHoras={params.horasMinimasMes}
        editable={(_w, d, c) => corregible && yaInicio(mes, d, c ?? 'L', ahora)}
        onCelda={(w, d) => {
          setCodigo(datos[mes]?.[upss]?.[w.id]?.[d] ?? 'L');
          setAbierto({ w, dia: d });
        }}
        marca={(w, d) => {
          const c = correcciones[mes]?.[upss]?.[w.id]?.[d];
          return vista === 'ejecutado' && c && c !== programadoDe(w, d)
            ? t('corregido', 'corrected (scheduled: {{codigo}})', { codigo: programadoDe(w, d) ?? 'L' })
            : undefined;
        }}
      />
      {abierto && (
        <Modal open modalHeading={t('registrarEjecutado', 'Executed shift: {{nombre}}, day {{dia}}', { nombre: abierto.w.nombre, dia: abierto.dia })}
          primaryButtonText={t('guardar', 'Save')} secondaryButtonText={t('cerrar', 'Close')}
          primaryButtonDisabled={cerrado && !motivo.trim()} onRequestClose={() => setAbierto(undefined)} onRequestSubmit={guardarCorreccion}>
          <p className={estilosCalendario.leyenda}>
            {t('programadoEra', 'Scheduled: {{codigo}}. The schedule is kept; only what was executed changes.', { codigo: programadoDe(abierto.w, abierto.dia) ?? 'L' })}
          </p>
          <Select id="codigo-ejecutado" labelText={t('codigoEjecutado', 'Executed code')} value={codigo} onChange={(e) => setCodigo(e.target.value as Codigo)}>
            {GRUPOS_CODIGOS.map((g) => (
              <SelectItemGroup key={g.clave} label={t(g.clave, g.texto)}>
                {g.codigos.map((c) => <SelectItem key={c} value={c} text={`${c} · ${CODIGOS[c].nombre}`} />)}
              </SelectItemGroup>
            ))}
          </Select>
          <TextArea id="motivo-ejecutado" maxCount={200} enableCounter rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
            labelText={cerrado ? t('motivoCorreccionCerrado', 'Reason (required: the month is closed)') : t('motivoCorreccion', 'Reason (optional)')} />
          {error && <InlineNotification kind="error" lowContrast hideCloseButton title={t('errorGuardar', 'The shift could not be saved')} />}
        </Modal>
      )}
    </section>
  );
}

// RF04: turnos del mes de todas las UPSS, agrupados por servicio. RF28: registro de lo ejecutado y cierre del mes.
export default function Consolidado({ ahora: ahoraProp }: { ahora?: Date }) {
  const { t } = useTranslation(moduleName);
  const [ahora] = useState(() => ahoraProp ?? new Date());
  const [mes, setMes] = useState(mesDe(ahora));
  const [vista, setVista] = useState<'programado' | 'ejecutado'>('programado');
  const trabajadores = useTrabajadores();
  const rol = useRolDelMes(mes);
  const ejecutado = useEjecutado(mes);

  if (trabajadores.error || rol.error || ejecutado.error)
    return (
      <InlineNotification kind="error" lowContrast hideCloseButton title={t('errorCarga', 'The shifts could not be loaded')}
        subtitle={t('errorCargaTexto', 'Try again in a few minutes. If it persists, contact the HR unit.')} />
    );

  const listaUpss = Object.keys(rol.data?.[mes] ?? {}).filter(Boolean).sort();
  return (
    <div className={styles.ancha}>
      <div className={estilosCalendario.barra}>
        <SelectorMes mes={mes} onChange={setMes} />
        <ContentSwitcher size="sm" className={styles.switcher} selectedIndex={vista === 'programado' ? 0 : 1}
          onChange={({ name }) => setVista(name as 'programado' | 'ejecutado')}>
          <Switch name="programado" text={t('programado', 'Scheduled')} />
          <Switch name="ejecutado" text={t('ejecutado', 'Executed')} />
        </ContentSwitcher>
      </div>
      {trabajadores.isLoading || rol.isLoading || ejecutado.isLoading || !rol.data || !ejecutado.data ? (
        <DataTableSkeleton columnCount={8} rowCount={6} showHeader={false} />
      ) : listaUpss.length === 0 ? (
        <p className={styles.vacio}>{t('sinRol', 'There is no published schedule for this month.')}</p>
      ) : (
        listaUpss.map((u) => (
          <SeccionUpss key={u} mes={mes} upss={u} vista={vista} trabajadores={trabajadores.data ?? []}
            programado={rol.data} correcciones={ejecutado.data} ahora={ahora} />
        ))
      )}
    </div>
  );
}
