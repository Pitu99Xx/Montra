import type { Rates } from '../data/model';

// Divisas publicadas por el Banco Central Europeo (fuente de los tipos de cambio)
export const CURRENCIES = [
  'EUR', 'USD', 'JPY', 'GBP', 'CNY', 'CHF', 'AUD', 'CAD', 'HKD', 'SGD', 'SEK', 'NOK', 'DKK',
  'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'ISK', 'TRY', 'ILS', 'INR', 'IDR', 'KRW', 'MYR', 'PHP',
  'THB', 'NZD', 'MXN', 'BRL', 'ZAR',
] as const;

export const FEATURED = ['EUR', 'USD', 'JPY', 'GBP'];

const names = new Intl.DisplayNames(['es'], { type: 'currency' });
export function currencyName(code: string): string {
  const n = names.of(code) ?? code;
  return n.charAt(0).toUpperCase() + n.slice(1);
}

const symbolCache = new Map<string, string>();
export function currencySymbol(code: string): string {
  let s = symbolCache.get(code);
  if (!s) {
    const parts = new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    s = parts.find((p) => p.type === 'currency')?.value ?? code;
    symbolCache.set(code, s);
  }
  return s;
}

const fmtCache = new Map<string, Intl.NumberFormat>();
export function formatMoney(amount: number, code: string): string {
  let f = fmtCache.get(code);
  if (!f) {
    f = new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
      useGrouping: 'always',
    } as Intl.NumberFormatOptions);
    fmtCache.set(code, f);
  }
  return f.format(amount);
}

export function formatAmount(amount: number, code: string): string {
  const digits = new Intl.NumberFormat('es-ES', { style: 'currency', currency: code }).resolvedOptions()
    .maximumFractionDigits ?? 2;
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: 'always',
  } as Intl.NumberFormatOptions).format(amount);
}

/** Interpreta «1.234,56», «1234,56» o «1234.56». */
export function parseAmount(text: string): number | null {
  let t = text.replace(/[\s€$£¥]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Tipos expresados como unidades de cada divisa por 1 EUR. */
export function toEUR(amount: number, code: string, rates: Rates | null): number | null {
  if (code === 'EUR') return amount;
  const r = rates?.rates[code];
  return r ? amount / r : null;
}

export function fromEUR(amountEUR: number, code: string, rates: Rates | null): number | null {
  if (code === 'EUR') return amountEUR;
  const r = rates?.rates[code];
  return r ? amountEUR * r : null;
}

export function convert(amount: number, from: string, to: string, rates: Rates | null): number | null {
  const eur = toEUR(amount, from, rates);
  return eur === null ? null : fromEUR(eur, to, rates);
}

/** «1 $ = 0,9205 €» */
export function rateLabel(from: string, to: string, rates: Rates | null): string | null {
  const v = convert(1, from, to, rates);
  if (v === null) return null;
  const digits = v < 0.01 ? 6 : v < 1 ? 4 : 4;
  return `1 ${currencySymbol(from)} = ${new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits }).format(v)} ${currencySymbol(to)}`;
}
