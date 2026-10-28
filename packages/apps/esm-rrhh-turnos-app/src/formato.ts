import { CODIGOS, type Codigo } from './domain/catalogos';
import type { MesId } from './domain/reglas';

// Formatos de fecha según el idioma de la sesión (es-PE o en); si el idioma no es un locale válido, el del navegador
const locale = (idioma: string) => {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(idioma)[0];
  } catch {
    return undefined;
  }
};

export const nombreMes = (mes: MesId, idioma: string) => {
  const [y, m] = mes.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString(locale(idioma), { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const fechaCorta = (d: Date, idioma: string) =>
  d.toLocaleDateString(locale(idioma), { weekday: 'short', day: 'numeric', month: 'short' });

export const hora = (d?: Date) =>
  d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';

export const horario = (codigo: Codigo) => {
  const c = CODIGOS[codigo];
  return 'inicio' in c ? `${c.inicio}–${c.fin}` : '';
};
