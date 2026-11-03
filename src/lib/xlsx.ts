import { strFromU8, unzipSync } from 'fflate';

/** Una celda leída de la hoja: texto o número (las fechas de Excel son números de serie). */
export type Cell = string | number | null;

const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** Lee la primera hoja de un .xlsx como una tabla de celdas (sin librerías pesadas). */
export function readFirstSheet(data: ArrayBuffer): Cell[][] {
  const files = unzipSync(new Uint8Array(data));
  const xml = (path: string) =>
    files[path] ? new DOMParser().parseFromString(strFromU8(files[path]), 'application/xml') : null;

  // Ruta de la primera hoja según el libro (normalmente xl/worksheets/sheet1.xml)
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = xml('xl/workbook.xml');
  const rels = xml('xl/_rels/workbook.xml.rels');
  const first = wb?.getElementsByTagName('sheet')[0];
  const rid =
    first?.getAttribute('r:id') ??
    first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  if (rid && rels) {
    for (const r of Array.from(rels.getElementsByTagName('Relationship'))) {
      if (r.getAttribute('Id') === rid) {
        const target = r.getAttribute('Target') ?? '';
        sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
      }
    }
  }

  const shared: string[] = [];
  const ss = xml('xl/sharedStrings.xml');
  if (ss) {
    for (const si of Array.from(ss.getElementsByTagName('si'))) {
      shared.push(
        Array.from(si.getElementsByTagName('t'))
          .map((t) => t.textContent ?? '')
          .join(''),
      );
    }
  }

  const sheet = xml(sheetPath);
  if (!sheet) throw new Error('No se encontró ninguna hoja en el archivo');
  const rows: Cell[][] = [];
  for (const row of Array.from(sheet.getElementsByTagName('row'))) {
    const r = Number(row.getAttribute('r') ?? rows.length + 1) - 1;
    const out: Cell[] = [];
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const i = colIndex(c.getAttribute('r') ?? 'A');
      const t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? null;
      let value: Cell = null;
      if (t === 's') value = v !== null ? (shared[Number(v)] ?? '') : null;
      else if (t === 'inlineStr')
        value = Array.from(c.getElementsByTagName('t'))
          .map((x) => x.textContent ?? '')
          .join('');
      else if (t === 'str' || t === 'b' || t === 'e') value = v;
      else value = v !== null && v !== '' ? Number(v) : null;
      out[i] = value;
    }
    rows[r] = out;
  }
  return rows.map((r) => r ?? []);
}
