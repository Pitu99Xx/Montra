import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { collection, doc, onSnapshot, orderBy, query, type Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { convert, toEUR } from '../lib/currency';
import { DEFAULT_USER, type Account, type Rates, type Snapshot, type UserDoc } from './model';

interface Store {
  uid: string;
  user: UserDoc;
  userLoaded: boolean;
  accounts: Account[];
  accountsLoaded: boolean;
  snapshots: Snapshot[];
  rates: Rates | null;
  /** Total actual en la divisa base (null si falta algún tipo de cambio) */
  total: number | null;
  totalEUR: number | null;
  valueIn: (amount: number, from: string) => number | null;
}

const Ctx = createContext<Store | null>(null);

const tsToDate = (v: unknown): Date | undefined =>
  v && typeof (v as Timestamp).toDate === 'function' ? (v as Timestamp).toDate() : undefined;

const FRANKFURTER = 'https://api.frankfurter.app/latest?from=EUR';

function daysOld(date: string): number {
  return (Date.now() - new Date(date + 'T16:00:00Z').getTime()) / 86_400_000;
}

export function computeTotalEUR(accounts: Account[], rates: Rates | null): number | null {
  let sum = 0;
  for (const a of accounts) {
    if (!a.includeInTotal) continue;
    const v = toEUR(a.balance, a.currency, rates);
    if (v === null) return null;
    sum += a.kind === 'liability' ? -Math.abs(v) : v;
  }
  return sum;
}

export function StoreProvider({ uid, children }: { uid: string; children: ReactNode }) {
  const [user, setUser] = useState<UserDoc>(DEFAULT_USER);
  const [userLoaded, setUserLoaded] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [serverRates, setServerRates] = useState<Rates | null>(null);
  const [liveRates, setLiveRates] = useState<Rates | null>(null);

  useEffect(() => {
    const unsubs = [
      onSnapshot(doc(db, 'users', uid), (s) => {
        setUser({ ...DEFAULT_USER, ...(s.data() as Partial<UserDoc> | undefined) });
        setUserLoaded(true);
      }),
      onSnapshot(query(collection(db, 'users', uid, 'accounts'), orderBy('order')), (s) => {
        setAccounts(
          s.docs.map((d) => {
            const data = d.data();
            return {
              kind: 'asset',
              includeInTotal: true,
              type: 'corriente',
              ...data,
              id: d.id,
              updatedAt: tsToDate(data.updatedAt),
            } as Account;
          })
        );
        setAccountsLoaded(true);
      }),
      onSnapshot(query(collection(db, 'users', uid, 'snapshots'), orderBy('at')), (s) => {
        setSnapshots(
          s.docs.map((d) => {
            const data = d.data();
            return { ...data, id: d.id, at: tsToDate(data.at) ?? new Date() } as Snapshot;
          })
        );
      }),
      onSnapshot(
        doc(db, 'rates', 'latest'),
        (s) => setServerRates(s.exists() ? (s.data() as Rates) : null),
        () => setServerRates(null)
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [uid]);

  // Si la función programada aún no ha guardado tipos (o están viejos), se piden al BCE directamente.
  useEffect(() => {
    if (serverRates && daysOld(serverRates.date) < 4) return;
    let cancelled = false;
    fetch(FRANKFURTER)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: { date: string; rates: Record<string, number> }) => {
        if (!cancelled) setLiveRates({ base: 'EUR', date: j.date, rates: { ...j.rates, EUR: 1 } });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [serverRates]);

  const rates = useMemo(() => {
    if (serverRates && liveRates) return serverRates.date >= liveRates.date ? serverRates : liveRates;
    return serverRates ?? liveRates;
  }, [serverRates, liveRates]);

  const value = useMemo<Store>(() => {
    const totalEUR = computeTotalEUR(accounts, rates);
    const base = user.baseCurrency;
    return {
      uid,
      user,
      userLoaded,
      accounts,
      accountsLoaded,
      snapshots,
      rates,
      totalEUR,
      total: totalEUR === null ? null : convert(totalEUR, 'EUR', base, rates),
      valueIn: (amount, from) => convert(amount, from, base, rates),
    };
  }, [uid, user, userLoaded, accounts, accountsLoaded, snapshots, rates]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fuera de StoreProvider');
  return s;
}
