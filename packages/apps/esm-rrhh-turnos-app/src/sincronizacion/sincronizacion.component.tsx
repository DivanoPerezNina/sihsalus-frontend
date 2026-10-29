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
} from '@carbon/react';
import { useTranslation } from 'react-i18next';

import { estadoGlobal, type EventoSync } from '../api/fuente-datos';
import { moduleName } from '../constants';
import { fechaCorta, hora } from '../formato';
import { useEventosSync } from '../rrhh.resource';
import styles from '../root.scss';

const TAG: Record<EventoSync['estado'], 'green' | 'gray' | 'red'> = { ok: 'green', pendiente: 'gray', error: 'red' };

// RF11, RF12: estado de la sincronización entre SIH SALUS (OpenMRS) y Frappe HR
export default function Sincronizacion() {
  const { t, i18n } = useTranslation(moduleName);
  const { data, isLoading, error } = useEventosSync();

  if (error)
    return (
      <InlineNotification kind="error" lowContrast hideCloseButton title={t('errorSync', 'The synchronization status could not be loaded')}
        subtitle={t('errorCargaTexto', 'Try again in a few minutes. If it persists, contact the HR unit.')} />
    );
  if (isLoading || !data) return <DataTableSkeleton columnCount={5} rowCount={5} showHeader={false} />;

  const global = estadoGlobal(data);
  const texto = {
    ok: t('syncOk', 'Up to date'),
    pendiente: t('syncPendiente', 'Pending'),
    error: t('syncError', 'Failed'),
  };
  return (
    <div className={styles.seccion}>
      <InlineNotification
        kind={global === 'ok' ? 'success' : global === 'error' ? 'error' : 'info'}
        lowContrast
        hideCloseButton
        title={global === 'ok' ? t('syncTodoOk', 'Everything is up to date') : global === 'error' ? t('syncHayErrores', 'Some changes could not be synchronized') : t('syncHayPendientes', 'There are changes waiting to be synchronized')}
        subtitle={t('syncTexto', 'Staff data moves between SIH SALUS and the HR system automatically; failed events are retried 3 times.')}
      />
      {data.length === 0 ? (
        <p className={styles.vacio}>{t('syncSinEventos', 'No synchronization events yet.')}</p>
      ) : (
        <Table size="sm" useZebraStyles aria-label={t('sincronizacion', 'Synchronization')}>
          <TableHead>
            <TableRow>
              <TableHeader>{t('fecha', 'Date')}</TableHeader>
              <TableHeader>{t('evento', 'Event')}</TableHeader>
              <TableHeader>{t('reintentos', 'Retries')}</TableHeader>
              <TableHeader>{t('estado', 'Status')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((e) => (
              <TableRow key={`${e.fecha.getTime()}-${e.flujo}-${e.referencia ?? ''}-${e.estado}`}>
                <TableCell>{`${fechaCorta(e.fecha, i18n.language)} ${hora(e.fecha)}`}</TableCell>
                <TableCell>{e.descripcion}</TableCell>
                <TableCell>{e.intentos ? t('deTres', '{{n}} of 3', { n: e.intentos }) : ''}</TableCell>
                <TableCell>
                  <Tag size="sm" type={TAG[e.estado]}>{texto[e.estado]}</Tag>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
