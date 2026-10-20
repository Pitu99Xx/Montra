import type { Account } from './model';

/** Cuentas que se muestran en primer nivel: las independientes y las que tienen subcuentas. */
export function topLevel(accounts: Account[]): Account[] {
  const groups = new Set(accounts.filter((a) => a.isGroup).map((a) => a.id));
  return accounts.filter((a) => !a.parentId || !groups.has(a.parentId));
}

export function childrenOf(accounts: Account[], groupId: string): Account[] {
  return accounts.filter((a) => a.parentId === groupId && !a.isGroup);
}

/** Saldo de una cuenta con subcuentas en la divisa base (null si falta algún tipo de cambio). */
export function groupValue(
  children: Account[],
  valueIn: (amount: number, from: string) => number | null,
): number | null {
  let sum = 0;
  for (const c of children) {
    if (!c.includeInTotal) continue;
    const v = valueIn(c.balance, c.currency);
    if (v === null) return null;
    sum += c.kind === 'liability' ? -Math.abs(v) : v;
  }
  return sum;
}

/** Ids que abarca una cuenta: ella misma o, si tiene subcuentas, todas ellas. */
export function accountIdsFor(accounts: Account[], id: string): string[] {
  const acc = accounts.find((a) => a.id === id);
  return acc?.isGroup ? childrenOf(accounts, id).map((c) => c.id) : [id];
}

/** «€, USD…» de las subcuentas, sin repetir. */
export function currenciesOf(children: Account[]): string[] {
  return [...new Set(children.map((c) => c.currency))];
}
