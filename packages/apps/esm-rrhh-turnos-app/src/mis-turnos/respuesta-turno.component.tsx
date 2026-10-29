import { Button, InlineNotification, Modal, Select, SelectItem, Tag, TextArea } from '@carbon/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { moduleName } from '../constants';
import type { Codigo } from '../domain/catalogos';
import { confirmacion, yaInicio, type Confirmacion, type ConfirmacionTurno, type MesId } from '../domain/reglas';
import { MOTIVOS } from '../calendario/modal-turno.component';
import { useResponderTurno } from '../rrhh.resource';
import styles from '../root.scss';

const TAG: Record<Confirmacion, 'green' | 'red' | 'gray' | 'warm-gray'> = {
  confirmado: 'green',
  no_asiste: 'red',
  pendiente: 'gray',
  sin_respuesta: 'warm-gray',
};

interface Props {
  mes: MesId;
  upss: string;
  workerId: string;
  dia: number;
  codigo: Codigo;
  publicado: boolean;
  respuestas: readonly ConfirmacionTurno[];
  ahora: Date;
}

// RF03, RF20: el trabajador confirma su turno publicado o avisa que no podrá asistir (con motivo)
export default function RespuestaTurno({ mes, upss, workerId, dia, codigo, publicado, respuestas, ahora }: Props) {
  const { t } = useTranslation(moduleName);
  const responder = useResponderTurno();
  const [avisando, setAvisando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [detalle, setDetalle] = useState('');
  const [error, setError] = useState(false);
  if (!publicado) return null;

  const estado = confirmacion(respuestas, mes, upss, workerId, dia, codigo, ahora);
  const texto: Record<Confirmacion, string> = {
    confirmado: t('respConfirmado', 'Confirmed'),
    no_asiste: t('respNoAsiste', 'Will not attend'),
    pendiente: t('respPendiente', 'Pending'),
    sin_respuesta: t('respSinRespuesta', 'No answer'),
  };
  const puedeResponder = !yaInicio(mes, dia, codigo, ahora);

  async function enviar(e: 'confirmado' | 'no_asiste', m?: string) {
    setError(false);
    try {
      await responder({ mes, upss, workerId, dia, estado: e, motivo: m });
      setAvisando(false);
    } catch {
      setError(true);
    }
  }

  return (
    <div className={styles.respuesta}>
      <Tag size="sm" type={TAG[estado]}>{texto[estado]}</Tag>
      {puedeResponder && estado !== 'confirmado' && (
        <Button size="sm" kind="ghost" onClick={() => enviar('confirmado')}>{t('confirmar', 'Confirm')}</Button>
      )}
      {puedeResponder && estado !== 'no_asiste' && (
        <Button size="sm" kind="ghost" onClick={() => setAvisando(true)}>{t('noPodreAsistir', "I can't attend")}</Button>
      )}
      {error && <InlineNotification kind="error" lowContrast hideCloseButton title={t('errorRespuesta', 'Your answer could not be saved')} />}
      {avisando && (
        <Modal open modalHeading={t('noPodreAsistir', "I can't attend")} primaryButtonText={t('avisarJefe', 'Notify the head of unit')}
          secondaryButtonText={t('cerrar', 'Close')} primaryButtonDisabled={!motivo}
          onRequestClose={() => setAvisando(false)}
          onRequestSubmit={() => enviar('no_asiste', [t(`motivo_${motivo}`), detalle.trim()].filter(Boolean).join(': '))}>
          <Select id="motivo-respuesta" labelText={t('motivo', 'Reason')} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            <SelectItem value="" text={t('elegir', 'Choose')} />
            {MOTIVOS.map((m) => <SelectItem key={m} value={m} text={t(`motivo_${m}`)} />)}
          </Select>
          <TextArea id="detalle-respuesta" labelText={t('detalleMotivo', 'Details (optional)')} maxCount={200} enableCounter rows={2}
            value={detalle} onChange={(e) => setDetalle(e.target.value)} />
        </Modal>
      )}
    </div>
  );
}
