import {
  Timestamp,
  collection,
  doc,
  deleteDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { dayKey } from './series';
import { saveUser } from './actions';
import { ACCOUNT_COLORS, CASH_NOTES, type Account, type CashCount, type CashMovement, type Rates } from './model';

const cashCol = (uid: string) => collection(db, 'users', uid, 'cash');
const DAY = 86_400_000;

/** Importe con signo: los ingresos suman, los gastos restan, los ajustes llevan su signo. */
export const signedAmount = (m: Pick<CashMovement, 'kind' | 'amount'>) => (m.kind === 'expense' ? -m.amount : m.amount);

/** Posición de un movimiento con fecha: el mediodía de ese día. */
export const posForDate = (date: string) => new Date(`${date}T12:00`).getTime();

/** Orden en el tiempo (del más antiguo al más reciente). */
export function sortCash(list: CashMovement[]): CashMovement[] {
  return [...list].sort((a, b) => a.pos - b.pos || (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id));
}

export const cashBalance = (list: CashMovement[]) =>
  Math.round(list.reduce((s, m) => s + signedAmount(m), 0) * 100) / 100;

/** Saldo tras cada movimiento (por id). */
export function runningBalances(list: CashMovement[]): Map<string, number> {
  let b = 0;
  const out = new Map<string, number>();
  for (const m of sortCash(list)) {
    b = Math.round((b + signedAmount(m)) * 100) / 100;
    out.set(m.id, b);
  }
  return out;
}

export const newCashId = () => doc(cashCol('_')).id;

function movementData(m: CashMovement) {
  const { id: _id, ...rest } = m;
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
}

/** Firestore admite 500 operaciones por lote: se reparten en varios si hace falta. */
class Batches {
  private list: WriteBatch[] = [writeBatch(db)];
  private n = 0;
  get(): WriteBatch {
    if (this.n >= 450) {
      this.list.push(writeBatch(db));
      this.n = 0;
    }
    this.n++;
    return this.list[this.list.length - 1];
  }
  async commit() {
    for (const b of this.list) await b.commit();
  }
}

/**
 * Guarda los cambios de movimientos y rehace el historial de la cuenta de efectivo: un registro
 * por día con el saldo al final de ese día (así la evolución y el total salen de los movimientos).
 */
async function applyCash(
  uid: string,
  account: Account,
  next: CashMovement[],
  changes: { set?: CashMovement[]; remove?: string[] },
  rates: Rates | null,
) {
  const b = new Batches();
  for (const m of changes.set ?? []) b.get().set(doc(cashCol(uid), m.id), movementData(m));
  for (const id of changes.remove ?? []) b.get().delete(doc(cashCol(uid), id));

  // Los registros actuales de la cuenta se leen en el momento (así «Deshacer» no usa datos viejos)
  const old = await getDocs(query(collection(db, 'users', uid, 'entries'), where('accountId', '==', account.id)));
  for (const d of old.docs) b.get().delete(d.ref);
  let balance = 0;
  const sorted = sortCash(next);
  sorted.forEach((m, i) => {
    balance = Math.round((balance + signedAmount(m)) * 100) / 100;
    const nextM = sorted[i + 1];
    if (nextM && dayKey(nextM.pos) === dayKey(m.pos)) return;
    b.get().set(doc(collection(db, 'users', uid, 'entries')), {
      accountId: account.id,
      balance,
      currency: account.currency,
      source: 'cash',
      at: Timestamp.fromMillis(m.pos),
      createdAt: serverTimestamp(),
      rates: rates?.rates ?? null,
    });
  });
  b.get().update(doc(db, 'users', uid, 'accounts', account.id), { balance, updatedAt: serverTimestamp() });
  await b.commit();
}

export function saveCashMovement(
  uid: string,
  account: Account,
  movement: CashMovement,
  all: CashMovement[],
  rates: Rates | null,
) {
  const next = [...all.filter((m) => m.id !== movement.id), movement];
  return applyCash(uid, account, next, { set: [movement] }, rates);
}

export function deleteCashMovement(
  uid: string,
  account: Account,
  movement: CashMovement,
  all: CashMovement[],
  rates: Rates | null,
) {
  const next = all.filter((m) => m.id !== movement.id);
  return applyCash(uid, account, next, { remove: [movement.id] }, rates);
}

/** Sustituye todos los movimientos por los importados. */
export function replaceCashMovements(
  uid: string,
  account: Account,
  imported: CashMovement[],
  all: CashMovement[],
  rates: Rates | null,
) {
  return applyCash(uid, account, imported, { set: imported, remove: all.map((m) => m.id) }, rates);
}

/**
 * Una sola vez (1.17.0): la cuenta «Efectivo» pasa a ser la cuenta fija de efectivo. Si no
 * existe, se crea (sin saldo hasta que apuntes o importes movimientos).
 */
export async function setupCashAccount(uid: string, accounts: Account[]) {
  if (!accounts.some((a) => a.cash)) {
    const existing = accounts.find((a) => !a.isGroup && /^efectivo$/i.test(a.name.trim()));
    if (existing) {
      await setDoc(doc(db, 'users', uid, 'accounts', existing.id), { cash: true, type: 'efectivo' }, { merge: true });
    } else {
      await setDoc(doc(collection(db, 'users', uid, 'accounts')), {
        name: 'Efectivo',
        type: 'efectivo',
        kind: 'asset',
        currency: 'EUR',
        color: ACCOUNT_COLORS[0].hex,
        balance: 0,
        includeInTotal: true,
        order: accounts.length,
        parentId: null,
        cash: true,
        updatedAt: serverTimestamp(),
      });
    }
  }
  await saveUser(uid, { cashSetupDone: true });
}

/** Conceptos habituales de un tipo, del más reciente al más antiguo, con su último importe. */
export function frequentConcepts(list: CashMovement[], kind: 'income' | 'expense', max = 8) {
  const seen = new Map<string, { concept: string; amount: number; count: number; last: number }>();
  for (const m of sortCash(list).reverse()) {
    if (m.kind !== kind) continue;
    const key = m.concept.trim().toLowerCase();
    const s = seen.get(key);
    if (s) s.count++;
    else seen.set(key, { concept: m.concept.trim(), amount: m.amount, count: 1, last: m.pos });
  }
  return [...seen.values()].sort((a, b) => b.count - a.count || b.last - a.last).slice(0, max);
}

/** Gastos por concepto (todo el historial), de mayor a menor. */
export function expensesByConcept(list: CashMovement[], max = 5) {
  const sums = new Map<string, { concept: string; total: number }>();
  for (const m of list) {
    if (m.kind !== 'expense') continue;
    const key = m.concept.trim().toLowerCase();
    const s = sums.get(key) ?? { concept: m.concept.trim(), total: 0 };
    s.total += m.amount;
    sums.set(key, s);
  }
  return [...sums.values()].sort((a, b) => b.total - a.total).slice(0, max);
}

export const lastDays = (list: CashMovement[], days: number) => {
  const from = Date.now() - days * DAY;
  let income = 0;
  let expense = 0;
  for (const m of list) {
    // Los «sin fecha» cuentan según el lugar que ocupan en la lista
    if (m.pos < from || m.pos > Date.now() + DAY) continue;
    const v = signedAmount(m);
    if (v >= 0) income += v;
    else expense -= v;
  }
  return { income, expense };
};

// ── Recuentos de billetes ────────────────────────────────────────────────

const countsCol = (uid: string) => collection(db, 'users', uid, 'cashCounts');

export const notesTotal = (notes: Record<string, number> | null, coins: number) =>
  Math.round(((notes ? CASH_NOTES.reduce((s, n) => s + n * (notes[n] ?? 0), 0) : 0) + coins) * 100) / 100;

export async function saveCashCount(uid: string, count: Omit<CashCount, 'id'>) {
  await setDoc(doc(countsCol(uid)), count);
}

export function deleteCashCount(uid: string, count: CashCount) {
  return deleteDoc(doc(countsCol(uid), count.id));
}

export function restoreCashCount(uid: string, count: CashCount) {
  const { id, ...data } = count;
  return setDoc(doc(countsCol(uid), id), data);
}
