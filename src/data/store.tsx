import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { collection, doc, onSnapshot, orderBy, query, type Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { convert } from '../lib/currency';
import { computeTotalEUR } from './totals';
import { migrateSnapshots, requestRatesRefresh } from './actions';
import { buildSeries, type DayPoint } from './series';
export { computeTotalEUR } from './totals';
import { DEFAULT_USER, type Account, type Entry, type Rates, type UserDoc } from './model';

interface Store {
  uid: string;
  user: UserDoc;
  userLoaded: boolean;
  /** Cuentas activas (sin las archivadas) */
  accounts: Account[];
  /** Todas, incluidas las archivadas (para nombres y colores del historial) */
  allAccounts: Account[];
  accountsLoaded: boolean;
  entries: Entry[];
  entriesLoaded: boolean;
  /** Evolución diaria: un punto por día con el último valor de cada cuenta */
  series: DayPoint[];
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
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entriesLoaded, setEntriesLoaded] = useState(false);
  const [serverRates, setServerRates] = useState<Rates | null>(null);
  const [liveRates, setLiveRates] = useState<Rates | null>(null);

  useEffect(() => {
    const unsubs = [
      onSnapshot(doc(db, 'users', uid), (s) => {
        setUser({ ...DEFAULT_USER, ...(s.data() as Partial<UserDoc> | undefined) });
        setUserLoaded(true);
      }),
      onSnapshot(query(collection(db, 'users', uid, 'accounts'), orderBy('order')), (s) => {
        setAllAccounts(
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
      onSnapshot(query(collection(db, 'users', uid, 'entries'), orderBy('at')), (s) => {
        setEntries(
          s.docs.map((d) => {
            const data = d.data({ serverTimestamps: 'estimate' });
            return {
              ...data,
              id: d.id,
              at: tsToDate(data.at) ?? new Date(),
              createdAt: tsToDate(data.createdAt) ?? new Date(),
            } as Entry;
          }),
        );
        setEntriesLoaded(true);
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

  const accounts = useMemo(() => allAccounts.filter((a) => !a.archived), [allAccounts]);

  // Una sola vez: convertir los puntos antiguos (snapshots) en registros individuales
  const migrating = useRef(false);
  useEffect(() => {
    if (!userLoaded || !accountsLoaded || !entriesLoaded || user.entriesMigrated || migrating.current) return;
    migrating.current = true;
    migrateSnapshots(uid, allAccounts, rates).catch((e) => {
      console.error('Migración de registros', e);
      migrating.current = false;
    });
  }, [userLoaded, accountsLoaded, entriesLoaded, user.entriesMigrated, uid, allAccounts, rates]);

  const series = useMemo(
    () => buildSeries(entries, allAccounts, user.baseCurrency, rates?.rates),
    [entries, allAccounts, user.baseCurrency, rates],
  );

  const value = useMemo<Store>(() => {
    const totalEUR = computeTotalEUR(accounts, rates);
    const base = user.baseCurrency;
    return {
      uid,
      user,
      userLoaded,
      accounts,
      allAccounts,
      accountsLoaded,
      entries,
      entriesLoaded,
      series,
      rates,
      totalEUR,
      missingRates: [
        ...new Set(accounts.filter((a) => a.currency !== 'EUR' && !rates?.rates[a.currency]).map((a) => a.currency)),
      ],
      total: totalEUR === null ? null : convert(totalEUR, 'EUR', base, rates),
      valueIn: (amount, from) => convert(amount, from, base, rates),
    };
  }, [uid, user, userLoaded, accounts, allAccounts, accountsLoaded, entries, entriesLoaded, series, rates]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fuera de StoreProvider');
  return s;
}
