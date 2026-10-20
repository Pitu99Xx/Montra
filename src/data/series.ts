import type { Account, Entry } from './model';

/** Un punto de la evolución: el estado de todas las cuentas al final de un día con registros. */
export interface DayPoint {
  /** Momento del último registro de ese día */
  t: number;
  day: string;
  /** Total en la divisa base (null si falta algún tipo de cambio) */
  total: number | null;
  /** Por cuenta: saldo en su divisa y valor en la divisa base */
  accounts: Record<string, { native: number; base: number | null }>;
}

export const dayKey = (d: Date | number): string => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

function rateOf(code: string, own: Record<string, number> | null | undefined, fallback?: Record<string, number>) {
  if (code === 'EUR') return 1;
  return own?.[code] ?? fallback?.[code] ?? null;
}

/**
 * Serie diaria a partir de los registros: un punto por día con el último valor de cada cuenta.
 * Cada saldo se convierte con los tipos guardados en su registro (o los actuales si no los tiene).
 */
export function buildSeries(
  entries: Entry[],
  accounts: Account[],
  base: string,
  currentRates?: Record<string, number>,
): DayPoint[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const sorted = [...entries].sort(
    (a, b) => a.at.getTime() - b.at.getTime() || a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const state = new Map<string, { native: number; eur: number | null }>();
  let lastRates: Record<string, number> | null | undefined;
  const points: DayPoint[] = [];

  const emit = (t: number, day: string) => {
    const baseRate = rateOf(base, lastRates, currentRates);
    let total: number | null = 0;
    const accs: DayPoint['accounts'] = {};
    for (const [id, v] of state) {
      const acc = byId.get(id);
      const baseVal = v.eur === null || baseRate === null ? null : v.eur * baseRate;
      accs[id] = { native: v.native, base: baseVal };
      if (!acc || !acc.includeInTotal) continue;
      if (baseVal === null) total = null;
      else if (total !== null) total += acc.kind === 'liability' ? -Math.abs(baseVal) : baseVal;
    }
    points.push({ t, day, total, accounts: accs });
  };

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    const r = rateOf(e.currency, e.rates, currentRates);
    state.set(e.accountId, { native: e.balance, eur: r ? e.balance / r : null });
    if (e.rates) lastRates = e.rates;
    const day = dayKey(e.at);
    const next = sorted[i + 1];
    if (!next || dayKey(next.at) !== day) emit(e.at.getTime(), day);
  }
  return points;
}

/** Registro anterior de la misma cuenta (para calcular la diferencia). */
export function previousEntry(entries: Entry[], entry: Entry): Entry | undefined {
  let prev: Entry | undefined;
  for (const e of entries) {
    if (e.accountId !== entry.accountId || e.id === entry.id) continue;
    if (e.at < entry.at || (e.at.getTime() === entry.at.getTime() && e.createdAt < entry.createdAt)) {
      if (!prev || e.at > prev.at) prev = e;
    }
  }
  return prev;
}

export interface EntryGroup {
  id: string;
  at: Date;
  batchId?: string;
  entries: Entry[];
}

/** Agrupa los registros por actualización (mismo batchId) o sueltos; del más reciente al más antiguo. */
export function groupEntries(entries: Entry[]): EntryGroup[] {
  const groups = new Map<string, EntryGroup>();
  for (const e of entries) {
    const key = e.batchId ?? `e:${e.id}`;
    const g = groups.get(key) ?? { id: key, at: e.at, batchId: e.batchId, entries: [] };
    g.entries.push(e);
    if (e.at > g.at) g.at = e.at;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.at.getTime() - a.at.getTime());
}
