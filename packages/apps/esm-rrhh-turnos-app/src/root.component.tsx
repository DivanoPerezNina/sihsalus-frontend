import { InlineNotification, Tab, TabList, TabPanel, TabPanels, Tabs } from '@carbon/react';
import { useConfig } from '@openmrs/esm-framework';
import { AppErrorBoundary } from '@sihsalus/esm-rbac';
import { useTranslation } from 'react-i18next';

import Asistencia from './asistencia/asistencia.component';
import type { RrhhTurnosConfig } from './config-schema';
import { appName, moduleName } from './constants';
import MisTurnos from './mis-turnos/mis-turnos.component';
import styles from './root.scss';

export default function Root() {
  const { fuenteDatos } = useConfig<RrhhTurnosConfig>();
  const { t } = useTranslation(moduleName);

  return (
    <AppErrorBoundary appName={appName}>
      <main className={styles.root}>
        <section className={styles.header}>
          <h1>{t('rrhhTurnosTitle', 'Staff scheduling')}</h1>
          <p>{t('rrhhTurnosDescription', 'Shift management for clinical staff (HR).')}</p>
        </section>

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
            <Tab>{t('misTurnos', 'My shifts')}</Tab>
            <Tab>{t('asistencia', 'Attendance')}</Tab>
          </TabList>
          <TabPanels>
            <TabPanel className={styles.panel}>
              <MisTurnos />
            </TabPanel>
            <TabPanel className={styles.panel}>
              <Asistencia />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </main>
    </AppErrorBoundary>
  );
}
