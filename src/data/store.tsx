import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { collection, doc, onSnapshot, orderBy, query, type Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { convert } from '../lib/currency';
import { computeTotalEUR } from './totals';
import { isSnapshotPending, recordSnapshot, requestRatesRefresh } from './actions';
export { computeTotalEUR } from './totals';
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
  /** Divisas de las cuentas para las que todavía no hay tipo de cambio */
  missingRates: string[];
  valueIn: (amount: number, from: string) => number | null;
}

const Ctx = createContext<Store | null>(null);

const tsToDate = (v: unknown): Date | undefined =>
  v && typeof (v as Timestamp).toDate === 'function' ? (v as Timestamp).toDate() : undefined;

// Respaldo si aún no hay tipos guardados en Firestore (la base es EUR por defecto)
const FRANKFURTER = ['https://api.frankfurter.dev/v1/latest', 'https://api.frankfurter.app/latest'];

function daysOld(date: string): number {
  return (Date.now() - new Date(date + 'T16:00:00Z').getTime()) / 86_400_000;
}

export function StoreProvider({ uid, children }: { uid: string; children: ReactNode }) {
  const [user, setUser] = useState<UserDoc>(DEFAULT_USER);
  const [userLoaded, setUserLoaded] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotsLoaded, setSnapshotsLoaded] = useState(false);
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
          }),
        );
        setAccountsLoaded(true);
      }),
      onSnapshot(query(collection(db, 'users', uid, 'snapshots'), orderBy('at')), (s) => {
        setSnapshots(
          s.docs.map((d) => {
            const data = d.data();
            return { ...data, id: d.id, at: tsToDate(data.at) ?? new Date() } as Snapshot;
          }),
        );
        setSnapshotsLoaded(true);
      }),
      onSnapshot(
        doc(db, 'rates', 'latest'),
        (s) => {
          setServerRates(s.exists() ? (s.data() as Rates) : null);
          setServerRatesLoaded(true);
        },
        () => setServerRatesLoaded(true),
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [uid]);

  // Si aún no hay tipos guardados (o son de hace días) se le pide al servidor que los descargue
  // del BCE en ese momento y, mientras tanto, se intentan obtener directamente.
  const asked = useRef(false);
  const [serverRatesLoaded, setServerRatesLoaded] = useState(false);
  useEffect(() => {
    if (!serverRatesLoaded || (serverRates && daysOld(serverRates.date) < 4)) return;
    if (!asked.current) {
      asked.current = true;
      requestRatesRefresh(uid).catch(() => undefined);
    }
    let cancelled = false;
    (async () => {
      for (const url of FRANKFURTER) {
        try {
          const r = await fetch(url);
          if (!r.ok) continue;
          const j = (await r.json()) as { date: string; rates: Record<string, number> };
          if (!cancelled) setLiveRates({ base: 'EUR', date: j.date, rates: { ...j.rates, EUR: 1 } });
          return;
        } catch {
          /* siguiente */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serverRates, serverRatesLoaded, uid]);

  const rates = useMemo(() => {
    if (serverRates && liveRates) return serverRates.date >= liveRates.date ? serverRates : liveRates;
    return serverRates ?? liveRates;
  }, [serverRates, liveRates]);

  // Guardar el punto de la evolución que quedó pendiente por falta de tipo de cambio
  const recording = useRef(false);
  useEffect(() => {
    if (!rates || !accountsLoaded || !snapshotsLoaded || !accounts.length || recording.current) return;
    if (!isSnapshotPending() && snapshots.length > 0) return;
    if (computeTotalEUR(accounts, rates) === null) return;
    recording.current = true;
    recordSnapshot(uid, accounts, rates).finally(() => {
      recording.current = false;
    });
  }, [rates, accounts, accountsLoaded, snapshots.length, snapshotsLoaded, uid]);

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
      missingRates: [
        ...new Set(accounts.filter((a) => a.currency !== 'EUR' && !rates?.rates[a.currency]).map((a) => a.currency)),
      ],
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
