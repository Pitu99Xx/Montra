import { toEUR } from '../lib/currency';
import type { Account, Rates } from './model';

/** Total en EUR de las cuentas incluidas; null si falta el tipo de cambio de alguna divisa. */
export function computeTotalEUR(accounts: Account[], rates: Rates | null): number | null {
  let sum = 0;
  for (const a of accounts) {
    if (!a.includeInTotal || a.isGroup) continue;
    const v = toEUR(a.balance, a.currency, rates);
    if (v === null) return null;
    sum += a.kind === 'liability' ? -Math.abs(v) : v;
  }
  return sum;
}
