import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Account, Entry, EntrySource, Rates, Snapshot, UserDoc } from './model';

export type OwnerState = 'owner' | 'other';

/** La primera cuenta que entra se convierte en la propietaria única de la app. */
export async function claimOrCheckOwner(uid: string): Promise<OwnerState> {
  const ref = doc(db, 'meta', 'owner');
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data().uid === uid ? 'owner' : 'other';
  try {
    await setDoc(ref, { uid, claimedAt: serverTimestamp() });
    return 'owner';
  } catch {
    const again = await getDoc(ref);
    return again.exists() && again.data().uid === uid ? 'owner' : 'other';
  }
}

export function saveUser(uid: string, patch: Partial<UserDoc>): Promise<void> {
  return setDoc(doc(db, 'users', uid), patch, { merge: true });
}

const accountsCol = (uid: string) => collection(db, 'users', uid, 'accounts');
const entriesCol = (uid: string) => collection(db, 'users', uid, 'entries');

function accountData(a: Account) {
  const { id: _id, updatedAt: _u, ...rest } = a;
  return { ...rest, updatedAt: serverTimestamp() };
}

interface NewEntry {
  accountId: string;
  balance: number;
  currency: string;
  source: EntrySource;
  at?: Date;
  batchId?: string;
  note?: string;
}

function addEntry(batch: WriteBatch, uid: string, e: NewEntry, rates: Rates | null) {
  const ref = doc(entriesCol(uid));
  batch.set(ref, {
    accountId: e.accountId,
    balance: e.balance,
    currency: e.currency,
    source: e.source,
    at: e.at ? Timestamp.fromDate(e.at) : serverTimestamp(),
    createdAt: serverTimestamp(),
    rates: rates?.rates ?? null,
    ...(e.batchId ? { batchId: e.batchId } : {}),
    ...(e.note ? { note: e.note } : {}),
  });
  return ref;
}

/** Crea o edita una cuenta; si cambia el saldo se añade un registro. */
export async function saveAccount(uid: string, account: Account, all: Account[], rates: Rates | null): Promise<void> {
  const isNew = !account.id;
  const ref = isNew ? doc(accountsCol(uid)) : doc(db, 'users', uid, 'accounts', account.id);
  const saved = { ...account, id: ref.id };
  const prev = all.find((a) => a.id === saved.id);
  const batch = writeBatch(db);
  batch.set(ref, accountData(saved));
  if (isNew || !prev || prev.balance !== saved.balance || prev.currency !== saved.currency) {
    addEntry(
      batch,
      uid,
      { accountId: ref.id, balance: saved.balance, currency: saved.currency, source: isNew ? 'initial' : 'edit' },
      rates,
    );
  }
  await batch.commit();
}

/**
 * Elimina una cuenta sin reescribir el pasado: queda archivada con un registro final a 0,
 * así la evolución anterior no cambia y el total deja de contarla desde hoy.
 */
export async function deleteAccount(uid: string, account: Account, rates: Rates | null) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid, 'accounts', account.id), { archived: true, updatedAt: serverTimestamp() });
  addEntry(batch, uid, { accountId: account.id, balance: 0, currency: account.currency, source: 'closed' }, rates);
  await batch.commit();
}

export async function reorderAccounts(uid: string, ordered: Account[]) {
  const batch = writeBatch(db);
  ordered.forEach((a, i) => batch.update(doc(db, 'users', uid, 'accounts', a.id), { order: i }));
  await batch.commit();
}

/** «Actualizar saldos»: un registro por cuenta, todos agrupados en la misma actualización. */
export async function updateBalances(
  uid: string,
  balances: Record<string, number>,
  all: Account[],
  rates: Rates | null,
) {
  const batch = writeBatch(db);
  const batchId = crypto.randomUUID();
  for (const a of all) {
    if (!(a.id in balances)) continue;
    const balance = balances[a.id];
    batch.update(doc(db, 'users', uid, 'accounts', a.id), { balance, updatedAt: serverTimestamp() });
    addEntry(batch, uid, { accountId: a.id, balance, currency: a.currency, source: 'update', batchId }, rates);
  }
  await batch.commit();
}

/** Apunta un saldo nuevo (o de una fecha pasada) para una cuenta. */
export async function addManualEntry(
  uid: string,
  account: Account,
  values: { balance: number; at: Date; note?: string },
  entries: Entry[],
  rates: Rates | null,
) {
  const batch = writeBatch(db);
  const ref = addEntry(
    batch,
    uid,
    {
      accountId: account.id,
      balance: values.balance,
      currency: account.currency,
      source: 'edit',
      at: values.at,
      note: values.note,
    },
    rates,
  );
  const virtual: Entry = {
    id: ref.id,
    accountId: account.id,
    balance: values.balance,
    currency: account.currency,
    at: values.at,
    createdAt: new Date(),
    source: 'edit',
  };
  syncAccountBalance(batch, uid, account.id, [...entries, virtual]);
  await batch.commit();
}

/** El saldo actual de una cuenta es siempre su registro más reciente. */
function syncAccountBalance(batch: WriteBatch, uid: string, accountId: string, entries: Entry[]) {
  const latest = entries
    .filter((e) => e.accountId === accountId)
    .sort((a, b) => b.at.getTime() - a.at.getTime() || b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (latest) batch.update(doc(db, 'users', uid, 'accounts', accountId), { balance: latest.balance });
}

export async function updateEntry(
  uid: string,
  entry: Entry,
  patch: { balance: number; at: Date; note?: string },
  entries: Entry[],
) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid, 'entries', entry.id), {
    balance: patch.balance,
    at: Timestamp.fromDate(patch.at),
    note: patch.note ?? '',
  });
  syncAccountBalance(
    batch,
    uid,
    entry.accountId,
    entries.map((e) => (e.id === entry.id ? { ...e, ...patch } : e)),
  );
  await batch.commit();
}

/** Borra registros y devuelve una función para deshacerlo. */
export async function deleteEntries(uid: string, toDelete: Entry[], entries: Entry[]): Promise<() => Promise<void>> {
  const ids = new Set(toDelete.map((e) => e.id));
  const remaining = entries.filter((e) => !ids.has(e.id));
  const batch = writeBatch(db);
  for (const e of toDelete) batch.delete(doc(db, 'users', uid, 'entries', e.id));
  for (const accountId of new Set(toDelete.map((e) => e.accountId)))
    syncAccountBalance(batch, uid, accountId, remaining);
  await batch.commit();
  return async () => {
    const undo = writeBatch(db);
    for (const e of toDelete) undo.set(doc(db, 'users', uid, 'entries', e.id), entryData(e));
    for (const accountId of new Set(toDelete.map((e) => e.accountId)))
      syncAccountBalance(undo, uid, accountId, entries);
    await undo.commit();
  };
}

function entryData(e: Entry) {
  return {
    accountId: e.accountId,
    balance: e.balance,
    currency: e.currency,
    source: e.source,
    at: Timestamp.fromDate(e.at),
    createdAt: Timestamp.fromDate(e.createdAt),
    rates: e.rates ?? null,
    ...(e.batchId ? { batchId: e.batchId } : {}),
    ...(e.note ? { note: e.note } : {}),
  };
}

/**
 * Convierte los puntos antiguos (snapshots) en registros individuales.
 * Por cada cuenta se guarda un registro en cada punto en el que cambió su saldo; las cuentas
 * que ya no existen se recrean archivadas para que el total histórico no cambie.
 */
export async function migrateSnapshots(uid: string, accounts: Account[], rates: Rates | null): Promise<void> {
  const snaps = await getDocs(query(collection(db, 'users', uid, 'snapshots'), orderBy('at')));
  const ops: ((b: WriteBatch) => void)[] = [];
  const known = new Map(accounts.map((a) => [a.id, a]));
  const last = new Map<string, number>();
  const covered = new Set<string>();

  for (const d of snaps.docs) {
    const s = { ...d.data(), id: d.id } as unknown as Snapshot & { at: Timestamp };
    const at = s.at?.toDate?.() ?? new Date();
    const present = new Set(Object.keys(s.accounts ?? {}));
    for (const [id, acc] of Object.entries(s.accounts ?? {})) {
      covered.add(id);
      if (!known.has(id)) {
        // Cuenta borrada en una versión anterior: se recrea archivada con su nombre y color
        const ghost: Account = {
          id,
          name: acc.name,
          color: acc.color,
          currency: acc.currency,
          balance: acc.balance,
          type: 'otra',
          kind: acc.kind ?? 'asset',
          includeInTotal: acc.included ?? true,
          order: 999,
          archived: true,
        };
        known.set(id, ghost);
        ops.push((b) => b.set(doc(db, 'users', uid, 'accounts', id), accountData(ghost)));
      }
      if (last.get(id) === acc.balance) continue;
      last.set(id, acc.balance);
      const entry = {
        accountId: id,
        balance: acc.balance,
        currency: acc.currency,
        source: 'migrated' as const,
        at,
        batchId: `snap-${s.id}`,
      };
      ops.push((b) => addEntry(b, uid, entry, { base: 'EUR', date: '', rates: s.rates ?? {} }));
    }
    // Cuentas que desaparecen de un punto al siguiente: se cerraron ahí
    for (const id of [...last.keys()]) {
      if (!present.has(id) && last.get(id) !== 0) {
        const acc = known.get(id)!;
        last.set(id, 0);
        ops.push((b) =>
          addEntry(
            b,
            uid,
            { accountId: id, balance: 0, currency: acc.currency, source: 'closed', at },
            { base: 'EUR', date: '', rates: s.rates ?? {} },
          ),
        );
      }
    }
  }

  // Cuentas sin ningún punto (por ejemplo, creadas cuando faltaban los tipos de cambio)
  for (const a of accounts) {
    if (covered.has(a.id) || a.archived) continue;
    ops.push((b) =>
      addEntry(
        b,
        uid,
        { accountId: a.id, balance: a.balance, currency: a.currency, source: 'initial', at: a.updatedAt ?? new Date() },
        rates,
      ),
    );
  }

  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => op(b));
    await b.commit();
  }
  await saveUser(uid, { entriesMigrated: true });
}

export function requestTestPush(uid: string) {
  return addDoc(collection(db, 'users', uid, 'requests'), { type: 'testPush', createdAt: serverTimestamp() });
}

export function requestRatesRefresh(uid: string) {
  return addDoc(collection(db, 'users', uid, 'requests'), { type: 'refreshRates', createdAt: serverTimestamp() });
}
