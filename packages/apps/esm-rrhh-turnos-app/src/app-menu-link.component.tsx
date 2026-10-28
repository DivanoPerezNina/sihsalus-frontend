import { ConfigurableLink } from '@openmrs/esm-framework';
import { useTranslation } from 'react-i18next';

import { basePath, moduleName } from './constants';
import { usePrivilegios } from './privilegios';

// El menú se muestra con cualquiera de los privilegios de RRHH (un OR que routes.json no puede expresar)
export default function AppMenuLink() {
  const { t } = useTranslation(moduleName);
  const { alguno } = usePrivilegios();
  if (!alguno) return null;

  return (
    <ConfigurableLink to={`${globalThis.spaBase}${basePath}`}>{t('rrhhTurnosAppTitle', 'Staff scheduling')}</ConfigurableLink>
  );
}
