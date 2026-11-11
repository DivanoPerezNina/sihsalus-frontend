import {
  Button,
  DataTableSkeleton,
  InlineNotification,
  NumberInput,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextArea,
  Toggle,
} from '@carbon/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { moduleName } from '../constants';
import type { Parametros } from '../domain/parametros';
import { fechaCorta, hora } from '../formato';
import { useBitacora, useGuardarParametros, useParametros, useTrabajadores } from '../rrhh.resource';
import styles from '../root.scss';

// Rango válido de cada parámetro numérico y el requisito que lo origina
export const LIMITES: Record<Exclude<keyof Parametros, 'requiereAprobacion'>, { min: number; max: number; texto: [string, string] }> = {
  horasMinimasMes: { min: 1, max: 300, texto: ['paramHoras', 'Minimum hours per month (RF25)'] },
  guardiasMaxAntiguos: { min: 0, max: 31, texto: ['paramGuardiasAntiguos', 'Guard shifts per month: senior staff (RF29)'] },
  guardiasMaxNuevos: { min: 0, max: 31, texto: ['paramGuardiasNuevos', 'Guard shifts per month: newer staff (RF29)'] },
  anioCorteAntiguos: { min: 1980, max: 2100, texto: ['paramAnioCorte', 'Last joining year counted as senior staff (RF29)'] },
  mesesAdelante: { min: 0, max: 12, texto: ['paramMesesAdelante', 'Months that can be scheduled ahead (RF01)'] },
  recordatorioHoras: { min: 1, max: 72, texto: ['paramRecordatorio', 'Next-shift reminder, hours before (RF15)'] },
  accesoExcepcionalMin: { min: 5, max: 480, texto: ['paramAcceso', 'Exceptional access duration, minutes (RF05)'] },
  cacheDias: { min: 1, max: 31, texto: ['paramCache', 'Days of own shifts kept for offline use (RNF04)'] },
};

export const fueraDeRango = (p: Parametros) =>
  (Object.keys(LIMITES) as (keyof typeof LIMITES)[]).filter((k) => !Number.isInteger(p[k]) || p[k] < LIMITES[k].min || p[k] > LIMITES[k].max);

// Reglas de negocio configurables (cada cambio exige motivo) y bitácora de cambios (RNF03)
export default function Configuracion() {
  const { t, i18n } = useTranslation(moduleName);
  const actuales = useParametros();
  const guardar = useGuardarParametros();
  const bitacora = useBitacora();
  const trabajadores = useTrabajadores();
  const [p, setP] = useState<Parametros>(actuales);
  const [motivo, setMotivo] = useState('');
  const [estado, setEstado] = useState<'guardado' | 'error'>();
  useEffect(() => setP(actuales), [actuales]);

  const cambiado = (Object.keys(p) as (keyof Parametros)[]).some((k) => p[k] !== actuales[k]);
  const invalidos = fueraDeRango(p);
  const nombre = new Map((trabajadores.data ?? []).map((w) => [w.id, w.nombre]));

  async function enviar() {
    setEstado(undefined);
    try {
      await guardar(p, motivo.trim());
      setMotivo('');
      setEstado('guardado');
    } catch {
      setEstado('error');
    }
  }

  return (
    <div className={styles.seccion}>
      <h3 className={styles.subtitulo}>{t('reglasParametros', 'Rules and parameters')}</h3>
      <div className={styles.parametros}>
        {(Object.keys(LIMITES) as (keyof typeof LIMITES)[]).map((k) => (
          <NumberInput key={k} id={`param-${k}`} label={t(...LIMITES[k].texto)} min={LIMITES[k].min} max={LIMITES[k].max} value={p[k]}
            invalid={invalidos.includes(k)} invalidText={t('fueraDeRango', 'Between {{min}} and {{max}}', LIMITES[k])}
            onChange={(_e, { value }) => setP({ ...p, [k]: Number(value) })} />
        ))}
        <Toggle id="param-requiereAprobacion" labelText={t('paramAprobacion', 'Director approval before publishing (RF18)')}
          labelA={t('no', 'No')} labelB={t('si', 'Yes')} toggled={p.requiereAprobacion} onToggle={(v) => setP({ ...p, requiereAprobacion: v })} />
      </div>
      {cambiado && (
        <TextArea id="motivo-parametros" labelText={t('motivoParametros', 'Reason for the change (required)')} maxCount={300} enableCounter rows={2}
          value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      )}
      {estado === 'guardado' && <InlineNotification kind="success" lowContrast title={t('parametrosGuardados', 'Parameters saved')} onClose={() => setEstado(undefined)} />}
      {estado === 'error' && <InlineNotification kind="error" lowContrast hideCloseButton title={t('errorParametros', 'The parameters could not be saved')} />}
      <div>
        <Button size="md" disabled={!cambiado || invalidos.length > 0 || !motivo.trim()} onClick={enviar}>
          {t('guardarParametros', 'Save parameters')}
        </Button>
      </div>

      <h3 className={styles.subtitulo}>{t('bitacora', 'Change log')}</h3>
      {bitacora.error ? (
        <InlineNotification kind="error" lowContrast hideCloseButton title={t('errorBitacora', 'The change log could not be loaded')} />
      ) : bitacora.isLoading || !bitacora.data ? (
        <DataTableSkeleton columnCount={5} rowCount={4} showHeader={false} />
      ) : bitacora.data.length === 0 ? (
        <p className={styles.vacio}>{t('bitacoraVacia', 'No changes recorded yet.')}</p>
      ) : (
        <Table size="sm" useZebraStyles aria-label={t('bitacora', 'Change log')}>
          <TableHead>
            <TableRow>
              <TableHeader>{t('fecha', 'Date')}</TableHeader>
              <TableHeader>{t('usuario', 'User')}</TableHeader>
              <TableHeader>{t('cambio', 'Change')}</TableHeader>
              <TableHeader>{t('motivo', 'Reason')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {bitacora.data.map((b, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: entradas de solo anexado, sin identificador propio en el contrato
              <TableRow key={i}>
                <TableCell>{`${fechaCorta(b.fecha, i18n.language)} ${hora(b.fecha)}`}</TableCell>
                <TableCell>{b.usuario}</TableCell>
                <TableCell>
                  {t(`accion_${b.accion}`, b.accion)}
                  {[b.upss, b.mes && b.dia ? `${b.mes}-${String(b.dia).padStart(2, '0')}` : b.mes, b.workerId && (nombre.get(b.workerId) ?? b.workerId), b.detalle]
                    .filter(Boolean)
                    .map((x) => ` · ${x}`)
                    .join('')}
                </TableCell>
                <TableCell>{b.motivo ?? ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
