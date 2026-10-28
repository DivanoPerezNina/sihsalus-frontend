import { Button } from '@carbon/react';
import { ChevronLeft, ChevronRight } from '@carbon/react/icons';
import { useTranslation } from 'react-i18next';

import { mesVecino } from './api/fuente-datos';
import { moduleName } from './constants';
import type { MesId } from './domain/reglas';
import { nombreMes } from './formato';
import styles from './root.scss';

export default function SelectorMes({ mes, onChange }: { mes: MesId; onChange: (mes: MesId) => void }) {
  const { t, i18n } = useTranslation(moduleName);
  return (
    <div className={styles.selectorMes}>
      <Button
        kind="ghost"
        size="sm"
        hasIconOnly
        renderIcon={ChevronLeft}
        iconDescription={t('mesAnterior', 'Previous month')}
        onClick={() => onChange(mesVecino(mes, -1))}
      />
      <h2 aria-live="polite">{nombreMes(mes, i18n.language)}</h2>
      <Button
        kind="ghost"
        size="sm"
        hasIconOnly
        renderIcon={ChevronRight}
        iconDescription={t('mesSiguiente', 'Next month')}
        onClick={() => onChange(mesVecino(mes, 1))}
      />
    </div>
  );
}
