import { Button, InlineNotification, Modal, TextArea } from '@carbon/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { moduleName } from '../constants';
import { accionesDisponibles, siguienteEstado, type Accion, type EstadoCronograma } from '../domain/flujo';
import type { MesId } from '../domain/reglas';
import { usePrivilegios } from '../privilegios';
import { useCambiarEstado, useParametros } from '../rrhh.resource';
import styles from './calendario.scss';

const TEXTO: Record<Accion, [string, string]> = {
  enviar: ['accionEnviar', 'Send for approval'],
  aprobar: ['accionAprobar', 'Approve'],
  observar: ['accionObservar', 'Return with observations'],
  publicar: ['accionPublicar', 'Publish'],
  cerrar: ['accionCerrar', 'Close month'],
};

// RF18, RF19: botones del flujo según el estado y el rol de quien mira
interface Props {
  mes: MesId;
  upss: string;
  estado: EstadoCronograma;
  alertas: number;
  puedeProgramar?: boolean; // RNF09: dentro de la red del hospital o con acceso excepcional
  soloCierre?: boolean; // consolidado de la UGRH: solo la acción de cerrar el mes (RF28)
}

export default function AccionesCronograma({ mes, upss, estado, alertas, puedeProgramar = true, soloCierre = false }: Props) {
  const { t } = useTranslation(moduleName);
  const p = usePrivilegios();
  const cambiarEstado = useCambiarEstado();
  const params = useParametros();
  const [observando, setObservando] = useState(false);
  const [observacion, setObservacion] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(false);
  const acciones = accionesDisponibles(estado, { editar: p.programacionEditar && puedeProgramar, aprobar: p.programacionAprobar, cerrar: p.cierre }, params.requiereAprobacion).filter((a) => (a === 'cerrar') === soloCierre);

  async function ejecutar(accion: Accion, texto?: string) {
    setOcupado(true);
    setError(false);
    try {
      await cambiarEstado(mes, upss, siguienteEstado(estado, accion), texto);
      setObservando(false);
      setObservacion('');
    } catch {
      setError(true);
    } finally {
      setOcupado(false);
    }
  }

  if (acciones.length === 0) return null;
  return (
    <div className={styles.acciones}>
      {alertas > 0 && (acciones.includes('enviar') || acciones.includes('publicar')) && (
        <span className={styles.aviso}>{t('avisoAntesDeEnviar', '{{n}} workers below the monthly hours or above the guard limit', { n: alertas })}</span>
      )}
      {acciones.map((a) => (
        <Button key={a} size="sm" kind={a === 'observar' ? 'secondary' : 'primary'} disabled={ocupado}
          onClick={() => (a === 'observar' ? setObservando(true) : ejecutar(a))}>
          {t(...TEXTO[a])}
        </Button>
      ))}
      {error && (
        <InlineNotification kind="error" lowContrast hideCloseButton title={t('errorEstado', 'The schedule status could not be changed')} />
      )}
      {observando && (
        <Modal open modalHeading={t('accionObservar', 'Return with observations')} primaryButtonText={t('accionObservar', 'Return with observations')}
          secondaryButtonText={t('cerrar', 'Close')} primaryButtonDisabled={!observacion.trim() || ocupado}
          onRequestClose={() => setObservando(false)} onRequestSubmit={() => ejecutar('observar', observacion.trim())}>
          <TextArea id="observacion" labelText={t('observacion', 'What should the head of unit change?')} maxCount={500} enableCounter
            value={observacion} onChange={(e) => setObservacion(e.target.value)} />
        </Modal>
      )}
    </div>
  );
}
