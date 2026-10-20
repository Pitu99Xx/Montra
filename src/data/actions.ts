import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { toEUR } from '../lib/currency';
import type { Account, Rates, SnapshotAccount, UserDoc } from './model';
import { computeTotalEUR } from './store';

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

/** Guarda un punto de la evolución con el estado de todas las cuentas. */
export async function recordSnapshot(uid: string, accounts: Account[], rates: Rates | null): Promise<void> {
  const map: Record<string, SnapshotAccount> = {};
  for (const a of accounts) {
    map[a.id] = {
      name: a.name,
      color: a.color,
      currency: a.currency,
      balance: a.balance,
      valueEUR: toEUR(a.balance, a.currency, rates),
      included: a.includeInTotal,
      kind: a.kind,
    };
  }
  const totalEUR = computeTotalEUR(accounts, rates);
  if (totalEUR === null) return; // sin tipo de cambio no se puede calcular el total
  await addDoc(collection(db, 'users', uid, 'snapshots'), {
    at: serverTimestamp(),
    totalEUR,
    rates: rates?.rates ?? { EUR: 1 },
    accounts: map,
  });
}

function accountData(a: Account) {
  const { id: _id, updatedAt: _u, ...rest } = a;
  return { ...rest, updatedAt: serverTimestamp() };
}

export async function saveAccount(
  uid: string,
  account: Account,
  all: Account[],
  rates: Rates | null
): Promise<void> {
  const isNew = !account.id;
  const ref = isNew ? doc(collection(db, 'users', uid, 'accounts')) : doc(db, 'users', uid, 'accounts', account.id);
  const saved = { ...account, id: ref.id };
  await setDoc(ref, accountData(saved));
  const prev = all.find((a) => a.id === saved.id);
  const changed =
    isNew ||
    !prev ||
    prev.balance !== saved.balance ||
    prev.currency !== saved.currency ||
    prev.includeInTotal !== saved.includeInTotal;
  if (changed) {
    const next = isNew ? [...all, saved] : all.map((a) => (a.id === saved.id ? saved : a));
    await recordSnapshot(uid, next, rates);
  }
}

export async function deleteAccount(uid: string, id: string, all: Account[], rates: Rates | null) {
  await deleteDoc(doc(db, 'users', uid, 'accounts', id));
  await recordSnapshot(
    uid,
    all.filter((a) => a.id !== id),
    rates
  );
}

export async function reorderAccounts(uid: string, ordered: Account[]) {
  const batch = writeBatch(db);
  ordered.forEach((a, i) => batch.update(doc(db, 'users', uid, 'accounts', a.id), { order: i }));
  await batch.commit();
}

export async function updateBalances(
  uid: string,
  balances: Record<string, number>,
  all: Account[],
  rates: Rates | null
) {
  const batch = writeBatch(db);
  for (const [id, balance] of Object.entries(balances)) {
    batch.update(doc(db, 'users', uid, 'accounts', id), { balance, updatedAt: serverTimestamp() });
  }
  await batch.commit();
  await recordSnapshot(
    uid,
    all.map((a) => (hasKey(balances, a.id) ? { ...a, balance: balances[a.id] } : a)),
    rates
  );
}

const hasKey = (o: Record<string, number>, id: string) => Object.prototype.hasOwnProperty.call(o, id);

export function requestTestPush(uid: string) {
  return addDoc(collection(db, 'users', uid, 'requests'), { type: 'testPush', createdAt: serverTimestamp() });
}
