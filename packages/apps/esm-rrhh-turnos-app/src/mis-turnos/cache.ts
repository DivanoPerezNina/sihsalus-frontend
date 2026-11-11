/*
 * RNF04, RNF05: copia local de los turnos propios de los próximos días, para consultarlos sin conexión (solo lectura).
 * Vive en localStorage; si el navegador no lo permite, la consulta sin conexión simplemente no está disponible.
 */
import type { Codigo } from '../domain/catalogos';
import type { MesId, RolMes } from '../domain/reglas';

export interface TurnosGuardados {
  trabajador: string;
  guardado: string; // fecha y hora ISO de la copia
  turnos: { fecha: string; codigo: Codigo }[]; // fecha AAAA-MM-DD
}

const clave = (usuario: string) => `rrhh-turnos:cache:${usuario}`;

// ponytail: solo guarda días del mes consultado; si la ventana cruza al mes siguiente, esos días no entran en la copia
export function proximosTurnos(mes: MesId, rol: RolMes, ahora: Date, dias: number): TurnosGuardados['turnos'] {
  const [y, m] = mes.split('-').map(Number);
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const limite = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias);
  return Object.entries(rol)
    .map(([d, codigo]) => ({ dia: new Date(y, m - 1, +d), d: +d, codigo }))
    .filter((x) => x.dia >= hoy && x.dia < limite)
    .sort((a, b) => a.d - b.d)
    .map((x) => ({ fecha: `${mes}-${String(x.d).padStart(2, '0')}`, codigo: x.codigo }));
}

export function guardarTurnos(usuario: string, datos: TurnosGuardados) {
  try {
    localStorage.setItem(clave(usuario), JSON.stringify(datos));
  } catch {
    // sin almacenamiento local: no hay copia
  }
}

export function leerTurnos(usuario: string): TurnosGuardados | undefined {
  try {
    const texto = localStorage.getItem(clave(usuario));
    return texto ? (JSON.parse(texto) as TurnosGuardados) : undefined;
  } catch {
    return undefined;
  }
}
