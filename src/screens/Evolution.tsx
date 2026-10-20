import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../data/store';
import { formatMoney } from '../lib/currency';
import type { Snapshot } from '../data/model';

const RANGES = [
  { id: '1M', days: 31 },
  { id: '3M', days: 92 },
  { id: '6M', days: 183 },
  { id: '1A', days: 366 },
  { id: 'Todo', days: Infinity },
] as const;
type RangeId = (typeof RANGES)[number]['id'];

const SEL_KEY = 'montra.evolution.lines';
const loadSel = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(SEL_KEY) ?? '["total"]');
  } catch {
    return ['total'];
  }
};

const shortDate = (t: number) => new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const longDate = (t: number) =>
  new Date(t).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const compact = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + 'M';
  if (a >= 1e3) return (v / 1e3).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + 'k';
  return v.toLocaleString('es-ES', { maximumFractionDigits: 0 });
};

function rateFor(s: Snapshot, base: string, fallback: Record<string, number> | undefined): number | null {
  if (base === 'EUR') return 1;
  return s.rates?.[base] ?? fallback?.[base] ?? null;
}

interface TipProps {
  active?: boolean;
  payload?: { dataKey: string; value: number; color: string; name: string }[];
  label?: number;
  base: string;
}

function ChartTooltip({ active, payload, label, base }: TipProps) {
  if (!active || !payload?.length || label === undefined) return null;
  return (
    <div className="chart-tooltip">
      <span style={{ fontWeight: 600, opacity: 0.75 }}>{longDate(label)}</span>
      {payload.map((p) => (
        <span key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="dot" style={{ background: p.color }} />
          <span style={{ fontWeight: p.dataKey === 'total' ? 700 : 500 }}>
            {p.name}: <span className="num" style={{ fontSize: 15 }}>{formatMoney(p.value, base)}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

export function EvolutionScreen() {
  const { snapshots, accounts, user, rates } = useStore();
  const base = user.baseCurrency;
  const [range, setRange] = useState<RangeId>('6M');
  const [sel, setSel] = useState<string[]>(loadSel);

  const toggle = (id: string) => {
    const next = sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id];
    setSel(next);
    try {
      localStorage.setItem(SEL_KEY, JSON.stringify(next));
    } catch {
      /* sin almacenamiento */
    }
  };

  const data = useMemo(() => {
    const days = RANGES.find((r) => r.id === range)!.days;
    const from = days === Infinity ? 0 : Date.now() - days * 86_400_000;
    return snapshots
      .filter((s) => s.at.getTime() >= from)
      .map((s) => {
        const r = rateFor(s, base, rates?.rates);
        const row: Record<string, number | null> = { t: s.at.getTime(), total: r === null ? null : s.totalEUR * r };
        for (const a of accounts) {
          const v = s.accounts?.[a.id]?.valueEUR;
          row[`a_${a.id}`] = v === null || v === undefined || r === null ? null : v * r;
        }
        return row;
      });
  }, [snapshots, accounts, range, base, rates]);

  const first = data[0]?.total ?? null;
  const last = data[data.length - 1]?.total ?? null;
  const change = first !== null && last !== null ? last - first : null;
  const pct = change !== null && first ? (change / Math.abs(first)) * 100 : null;
  const domain: [number, number] | ['dataMin', 'dataMax'] =
    data.length === 1 ? [(data[0].t as number) - 86_400_000, (data[0].t as number) + 86_400_000] : ['dataMin', 'dataMax'];

  return (
    <main className="screen">
      <header className="screen-header">
        <h1 className="screen-title">Evolución</h1>
      </header>

      <div className="segmented" role="group" aria-label="Periodo">
        {RANGES.map((r) => (
          <button type="button" key={r.id} aria-pressed={r.id === range} onClick={() => setRange(r.id)}>
            {r.id}
          </button>
        ))}
      </div>

      {snapshots.length === 0 ? (
        <section className="card empty">
          <span className="serif" style={{ fontSize: 22 }}>
            Aún no hay historial
          </span>
          <span className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>
            Cada vez que añadas una cuenta o actualices los saldos se guardará un punto en esta gráfica.
          </span>
        </section>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="num" style={{ fontSize: 36, fontWeight: 500 }}>
              {last !== null ? formatMoney(last, base) : '—'}
            </span>
            {change !== null && data.length > 1 && (
              <span style={{ color: 'var(--gold-text)', fontWeight: 600, fontSize: 14 }}>
                {change >= 0 ? '+' : ''}
                {formatMoney(change, base)}
                {pct !== null && ` (${pct >= 0 ? '+' : ''}${pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %)`} desde el{' '}
                {shortDate(data[0].t as number)}
              </span>
            )}
          </div>

          <div style={{ width: '100%', height: 250, marginLeft: -4 }}>
            {data.length === 0 ? (
              <p className="hint">No hay puntos en este periodo.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 12, right: 4, left: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={domain}
                    tickFormatter={shortDate}
                    tick={{ fontSize: 11, fill: 'var(--faint)' }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    orientation="right"
                    width={44}
                    tickFormatter={compact}
                    tick={{ fontSize: 11, fill: 'var(--faint)' }}
                    axisLine={false}
                    tickLine={false}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    content={(props) => <ChartTooltip {...(props as unknown as TipProps)} base={base} />}
                    cursor={{ stroke: 'var(--faint)', strokeDasharray: '3 3' }}
                  />
                  {accounts
                    .filter((a) => sel.includes(a.id))
                    .map((a) => (
                      <Line
                        key={a.id}
                        name={a.name}
                        dataKey={`a_${a.id}`}
                        stroke={a.color}
                        strokeWidth={2}
                        dot={{ r: 2.5, fill: a.color, strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                        isAnimationActive={false}
                        connectNulls
                      />
                    ))}
                  {sel.includes('total') && (
                    <Line
                      name="Total"
                      dataKey="total"
                      stroke="var(--gold)"
                      strokeWidth={3}
                      dot={{ r: 3.5, fill: 'var(--gold)', strokeWidth: 0 }}
                      activeDot={{ r: 6, stroke: 'var(--bg)', strokeWidth: 2 }}
                      isAnimationActive={false}
                      connectNulls
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="hint" style={{ marginTop: -6 }}>
            Toca o desliza sobre la gráfica para ver el saldo y la fecha de cada actualización.
          </p>

          <span className="eyebrow">Mostrar en la gráfica</span>
          <div className="chips">
            <button type="button" className="chip round" aria-pressed={sel.includes('total')} onClick={() => toggle('total')}>
              <span className="dot" style={{ background: 'var(--gold)' }} />
              Total
            </button>
            {accounts.map((a) => (
              <button type="button" key={a.id} className="chip round" aria-pressed={sel.includes(a.id)} onClick={() => toggle(a.id)}>
                <span className="dot" style={{ background: a.color }} />
                {a.name}
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
