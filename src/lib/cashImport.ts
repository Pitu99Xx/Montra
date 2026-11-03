import type { CashMovement } from '../data/model';
import { posForDate } from '../data/cash';
import type { Cell } from './xlsx';

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Número de serie de Excel (días desde 1899-12-30) a «AAAA-MM-DD». */
function serialToDate(n: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * DAY);
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

const validDate = (y: number, m: number, d: number) => {
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
};

/** Saca la fecha escrita dentro del concepto («Paqui 30/10/2025», «Consum 2024-07-06»). */
export function splitConcept(text: string): { concept: string; date: string | null } {
  const patterns: [RegExp, (m: RegExpMatchArray) => [number, number, number]][] = [
    [/(\d{4})-(\d{1,2})-(\d{1,2})/, (m) => [+m[1], +m[2], +m[3]]],
    [/(\d{1,2})\/(\d{1,2})\/(\d{4})/, (m) => [+m[3], +m[2], +m[1]]],
  ];
  for (const [re, get] of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const [y, mo, d] = get(m);
    if (!validDate(y, mo, d)) continue;
    const concept = text
      .replace(m[0], ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s\-·,]+|[\s\-·,]+$/g, '');
    return { concept, date: iso(y, mo, d) };
  }
  return { concept: text.trim(), date: null };
}

const toAmount = (v: Cell): number | null => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[\s€]/g, '').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export interface ImportResult {
  movements: CashMovement[];
  income: { count: number; total: number };
  expense: { count: number; total: number };
  undated: number;
}

/**
 * Convierte la hoja en movimientos. Busca las columnas «Cantidad»: la de su izquierda es el
 * concepto, y es un gasto si ese encabezado dice «gasto» (si no, un ingreso). Las filas sin fecha
 * se colocan según su orden en la columna, repartidas entre las fechas de alrededor.
 */
export function parseCashSheet(rows: Cell[][], now = Date.now()): ImportResult {
  const headerRow = rows.findIndex((r) => r.some((c) => typeof c === 'string' && /cantidad|importe/i.test(c)));
  if (headerRow < 0) throw new Error('No encuentro columnas de «Cantidad» o «Importe»');
  const header = rows[headerRow];
  const blocks = header
    .map((c, i) => (typeof c === 'string' && /cantidad|importe/i.test(c) && i > 0 ? i : -1))
    .filter((i) => i > 0)
    .map((amountCol) => ({
      amountCol,
      conceptCol: amountCol - 1,
      kind: /gasto/i.test(String(header[amountCol - 1] ?? '')) ? ('expense' as const) : ('income' as const),
    }));
  if (!blocks.length) throw new Error('No encuentro columnas de «Cantidad» o «Importe»');

  const movements: CashMovement[] = [];
  let seq = 0;
  for (const block of blocks) {
    const items: { concept: string; date: string | null; amount: number; row: number }[] = [];
    for (let r = headerRow + 1; r < rows.length; r++) {
      const amount = toAmount(rows[r][block.amountCol] ?? null);
      if (amount === null || amount === 0) continue;
      const raw = rows[r][block.conceptCol] ?? null;
      let concept = '';
      let date: string | null = null;
      if (typeof raw === 'number' && raw > 20_000 && raw < 80_000) date = serialToDate(raw);
      else if (raw !== null) ({ concept, date } = splitConcept(String(raw)));
      if (!concept) concept = block.kind === 'expense' ? 'Gasto' : 'Ingreso';
      items.push({ concept, date, amount: Math.abs(amount), row: r });
    }
    // Posición de cada fila: su fecha o, si no tiene, un hueco entre las fechas vecinas
    const pos: (number | null)[] = items.map((it) => (it.date ? posForDate(it.date) : null));
    for (let i = 0; i < items.length; i++) {
      if (pos[i] !== null) continue;
      let j = i;
      while (j < items.length && pos[j] === null) j++;
      const prev = i > 0 ? (pos[i - 1] as number) : null;
      const next = j < items.length ? (pos[j] as number) : null;
      const n = j - i;
      for (let k = 0; k < n; k++) {
        if (prev !== null && next !== null) pos[i + k] = prev + ((next - prev) * (k + 1)) / (n + 1);
        else if (next !== null) pos[i + k] = next - (n - k) * DAY;
        else if (prev !== null) pos[i + k] = prev + ((Math.max(now, prev + n * DAY) - prev) * (k + 1)) / (n + 1);
        else pos[i + k] = now - (n - k) * DAY;
      }
      i = j - 1;
    }
    items.forEach((it, i) =>
      movements.push({
        id: '',
        kind: block.kind,
        amount: it.amount,
        concept: it.concept,
        date: it.date,
        pos: Math.round(pos[i] as number),
        createdAt: now + seq++,
      }),
    );
  }

  const sum = (k: 'income' | 'expense') => {
    const l = movements.filter((m) => m.kind === k);
    return { count: l.length, total: Math.round(l.reduce((s, m) => s + m.amount, 0) * 100) / 100 };
  };
  return {
    movements,
    income: sum('income'),
    expense: sum('expense'),
    undated: movements.filter((m) => !m.date).length,
  };
}
