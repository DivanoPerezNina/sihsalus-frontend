import { useTranslation } from 'react-i18next';

import type { TrabajadorRrhh } from '../api/fuente-datos';
import { moduleName } from '../constants';
import { CODIGOS, type Codigo } from '../domain/catalogos';
import type { Dia, RolMes } from '../domain/reglas';
import styles from './calendario.scss';

const INICIAL_DIA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

interface Props {
  etiqueta: string;
  upss: string;
  dias: Dia[];
  filas: TrabajadorRrhh[];
  rolDe: (w: TrabajadorRrhh) => RolMes;
  resumen: (w: TrabajadorRrhh) => { horas: number; guardias: number; tope: number };
  minimoHoras: number;
  editable?: (w: TrabajadorRrhh, dia: number, codigo?: Codigo) => boolean;
  onCelda?: (w: TrabajadorRrhh, dia: number) => void;
  marca?: (w: TrabajadorRrhh, dia: number) => string | undefined; // aviso de la celda (no asistirá, corregido…)
}

// RF22: matriz mensual persona × día, compartida por el calendario del jefe y el consolidado de la UGRH
export default function Matriz({ etiqueta, upss, dias, filas, rolDe, resumen, minimoHoras, editable, onCelda, marca }: Props) {
  const { t } = useTranslation(moduleName);
  return (
    <div className={styles.contenedor} role="region" aria-label={etiqueta}>
      <table className={styles.matriz}>
        <thead>
          <tr>
            <th scope="col" className={styles.nombre}>{t('trabajador', 'Worker')}</th>
            {dias.map((d) => (
              <th key={d.d} scope="col" className={d.domingo || d.feriado ? styles.festivo : undefined}>
                <span className={styles.inicialDia}>{INICIAL_DIA[d.dow]}</span>
                {d.d}
              </th>
            ))}
            <th scope="col">{t('horas', 'Hours')}</th>
            <th scope="col">{t('guardias', 'Guards')}</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((w) => {
            const rol = rolDe(w);
            const { horas, guardias, tope } = resumen(w);
            return (
              <tr key={w.id}>
                <th scope="row" className={styles.nombre}>
                  {w.nombre}
                  {w.upss !== upss && <span className={styles.apoyo}> · {t('apoyoDe', 'support from {{upss}}', { upss: w.upss })}</span>}
                </th>
                {dias.map((d) => {
                  const c: Codigo | undefined = rol[d.d];
                  const aviso = marca?.(w, d.d);
                  const etiquetaCelda = `${w.nombre}, ${d.d}: ${c ? CODIGOS[c].nombre : t('sinAsignar', 'unassigned')}${aviso ? ` · ${aviso}` : ''}`;
                  const clases = [c && styles[`grupo_${CODIGOS[c].grupo}`], aviso && styles.marcada].filter(Boolean).join(' ');
                  return (
                    <td key={d.d} className={clases || undefined}>
                      {onCelda && editable?.(w, d.d, c) ? (
                        <button type="button" className={styles.celda} aria-label={etiquetaCelda} onClick={() => onCelda(w, d.d)}>
                          {c ?? '·'}
                        </button>
                      ) : (
                        <span className={styles.celda} title={etiquetaCelda}>{c ?? '·'}</span>
                      )}
                    </td>
                  );
                })}
                <td className={horas < minimoHoras ? styles.alerta : undefined} data-testid={`horas-${w.id}`}>{horas}</td>
                <td className={guardias > tope ? styles.alerta : undefined}>{guardias}/{tope}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
