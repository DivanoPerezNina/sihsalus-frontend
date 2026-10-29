/* RF06, RF07: Excel de reportes con exceljs (carga diferida: solo se descarga al exportar). */
import { descargar } from './tuasusalud';

export interface Hoja {
  nombre: string;
  titulo: string;
  columnas: string[];
  filas: (string | number)[][];
}

export async function descargarExcel(archivo: string, institucion: string, hojas: Hoja[]) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIH SALUS · Gestión de turnos';
  for (const h of hojas) {
    const ws = wb.addWorksheet(h.nombre.slice(0, 31));
    ws.addRow([`${institucion} · ${h.titulo}`]).font = { bold: true, size: 12 };
    ws.addRow([`Generado por SIH SALUS el ${new Date().toLocaleString('es-PE')}`]).font = { italic: true, size: 9 };
    const cabecera = ws.addRow(h.columnas);
    cabecera.eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B3990' } };
    });
    for (const f of h.filas) ws.addRow(f);
    ws.columns.forEach((c, i) => {
      c.width = Math.min(40, Math.max(6, ...[h.columnas[i], ...h.filas.map((f) => f[i])].map((v) => String(v ?? '').length + 2)));
    });
    ws.views = [{ state: 'frozen', ySplit: 3 }];
  }
  descargar(new Blob([await wb.xlsx.writeBuffer()]), archivo);
}
