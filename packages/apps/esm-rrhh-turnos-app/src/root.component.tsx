import { InlineNotification, Tab, TabList, TabPanel, TabPanels, Tabs } from '@carbon/react';
import { useConfig } from '@openmrs/esm-framework';
import { AppErrorBoundary, UnauthorizedState } from '@sihsalus/esm-rbac';
import { useTranslation } from 'react-i18next';

import Asistencia from './asistencia/asistencia.component';
import Calendario from './calendario/calendario.component';
import type { RrhhTurnosConfig } from './config-schema';
import { appName, moduleName } from './constants';
import MisTurnos from './mis-turnos/mis-turnos.component';
import Reportes from './reportes/reportes.component';
import Sincronizacion from './sincronizacion/sincronizacion.component';
import { PRIVILEGIOS, usePrivilegios } from './privilegios';
import styles from './root.scss';

export default function Root() {
  const { fuenteDatos } = useConfig<RrhhTurnosConfig>();
  const { t } = useTranslation(moduleName);
  const p = usePrivilegios();

  // Cada pestaña exige su privilegio; sin ninguno, la página queda cerrada
  const pestanas = [
    p.misTurnos && { id: 'mis-turnos', texto: t('misTurnos', 'My shifts'), contenido: <MisTurnos /> },
    p.programacion && { id: 'calendario', texto: t('calendario', 'Schedule'), contenido: <Calendario /> },
    p.asistencia && { id: 'asistencia', texto: t('asistencia', 'Attendance'), contenido: <Asistencia /> },
    p.reportes && { id: 'reportes', texto: t('reportes', 'Reports'), contenido: <Reportes /> },
    p.sincronizacion && { id: 'sincronizacion', texto: t('sincronizacion', 'Synchronization'), contenido: <Sincronizacion /> },
  ].filter((x): x is { id: string; texto: string; contenido: JSX.Element } => Boolean(x));

  return (
    <AppErrorBoundary appName={appName}>
      <main className={styles.root}>
        <section className={styles.header}>
          <h1>{t('rrhhTurnosTitle', 'Staff scheduling')}</h1>
          <p>{t('rrhhTurnosDescription', 'Shift management for clinical staff (HR).')}</p>
        </section>

        {pestanas.length === 0 ? (
          <UnauthorizedState privilege={[PRIVILEGIOS.misTurnos, PRIVILEGIOS.programacion, PRIVILEGIOS.asistencia]} />
        ) : (
          <>
            {fuenteDatos === 'demo' && (
              <InlineNotification
                className={styles.aviso}
                kind="info"
                lowContrast
                hideCloseButton
                title={t('datosDemoTitulo', 'Demo data')}
                subtitle={t(
                  'datosDemoTexto',
                  'Workers, shifts and clock-in records are synthetic. Set fuenteDatos to "frappe" to read Frappe HR.',
                )}
              />
            )}
            <Tabs>
              <TabList aria-label={t('secciones', 'Sections')}>
                {pestanas.map((x) => (
                  <Tab key={x.id}>{x.texto}</Tab>
                ))}
              </TabList>
              <TabPanels>
                {pestanas.map((x) => (
                  <TabPanel key={x.id} className={styles.panel}>
                    {x.contenido}
                  </TabPanel>
                ))}
              </TabPanels>
            </Tabs>
          </>
        )}
      </main>
    </AppErrorBoundary>
  );
}
