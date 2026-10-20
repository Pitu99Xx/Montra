import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../data/store';
import { formatMoney } from '../lib/currency';
import type { Account, Entry } from '../data/model';
import { RecordsList } from './RecordsList';
import { childrenOf, topLevel } from '../data/groups';

const RANGES = [
  { id: '1S', days: 7 },
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

const DAY = 86_400_000;
const weekdayLabel = (t: number) => {
  const d = new Date(t);
  return `${d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')} ${d.getDate()}`;
};
const monthLabel = (t: number) => new Date(t).toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
const monthYearLabel = (t: number) => {
  const d = new Date(t);
  return `${monthLabel(t)} ${String(d.getFullYear()).slice(2)}`;
};

/** Marcas del eje X que cubren todo el periodo elegido, haya o no registros. */
function axisFor(start: number, end: number): { ticks: number[]; format: (t: number) => string } {
  const span = end - start;
  if (span <= 8 * DAY) {
    // Una semana: una marca por día («mar 14»)
    const ticks: number[] = [];
    const d = new Date(start);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    for (; d.getTime() <= end; d.setDate(d.getDate() + 1)) ticks.push(d.getTime());
    return { ticks, format: weekdayLabel };
  }
  if (span <= 45 * DAY) {
    // Hasta ~1 mes: 5 marcas repartidas con día y mes
    return { ticks: [0, 1, 2, 3, 4].map((i) => start + (span * i) / 4), format: shortDate };
  }
  if (span <= 100 * DAY) {
    // ~3 meses: días 1 y 15 de cada mes
    const ticks: number[] = [];
    const d = new Date(start);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() <= 15 ? 15 : 1);
    if (d.getDate() === 1) d.setMonth(d.getMonth() + 1);
    while (d.getTime() <= end) {
      ticks.push(d.getTime());
      if (d.getDate() === 1) d.setDate(15);
      else {
        d.setDate(1);
        d.setMonth(d.getMonth() + 1);
      }
    }
    return { ticks, format: shortDate };
  }
  // Más largo: el día 1 de cada mes (cada 2 meses a partir de ~7 meses)
  const step = span > 220 * DAY ? 2 : 1;
  const ticks: number[] = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  for (; d.getTime() <= end; d.setMonth(d.getMonth() + step)) ticks.push(d.getTime());
  return { ticks, format: span > 366 * DAY ? monthYearLabel : monthLabel };
}

const shortDate = (t: number) => new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const longDate = (t: number) =>
  new Date(t).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
const compact = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + 'M';
  if (a >= 1e3) return (v / 1e3).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + 'k';
  return v.toLocaleString('es-ES', { maximumFractionDigits: 0 });
};

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
            {p.name}:{' '}
            <span className="num" style={{ fontSize: 15 }}>
              {formatMoney(p.value, base)}
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}

export function EvolutionScreen({
  onEditEntry,
  embedded = false,
}: {
  onEditEntry: (entry: Entry, account: Account) => void;
  /** Panel dentro del Resumen de ordenador: sin título grande ni lista de registros */
  embedded?: boolean;
}) {
  const { series, accounts, user } = useStore();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
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

  // Si solo se eligen cuentas de una misma divisa extranjera (sin el total), se ven en su propia divisa
  const selectedAccounts = accounts.filter((a) => sel.includes(a.id));
  const showTotal = sel.includes('total');
  // Divisas de cada línea elegida (una cuenta con subcuentas aporta las de sus subcuentas)
  const lineCurrencies = (a: Account) => (a.isGroup ? childrenOf(accounts, a.id).map((c) => c.currency) : [a.currency]);
  const currencies = [...new Set(selectedAccounts.flatMap(lineCurrencies))];
  const native = !showTotal && currencies.length === 1 && currencies[0] !== base;
  const unit = native ? currencies[0] : base;
  const mixesCurrencies = !native && selectedAccounts.some((a) => lineCurrencies(a).some((c) => c !== base));

  // El eje X abarca siempre el periodo completo; «Todo» va del primer registro a hoy (mínimo un mes)
  const [start, end] = useMemo(() => {
    const now = Date.now();
    const days = RANGES.find((r) => r.id === range)!.days;
    if (days !== Infinity) return [now - days * DAY, now];
    const firstAt = series[0]?.t ?? now;
    return [Math.min(firstAt, now - 30 * DAY), now];
  }, [range, series]);
  const axis = useMemo(() => axisFor(start, end), [start, end]);

  // Un punto por día (el último valor de cada cuenta ese día)
  const data = useMemo(() => {
    return series
      .filter((p) => p.t >= start)
      .map((p) => {
        const row: Record<string, number | null | string> = { t: p.t, day: p.day, total: p.total };
        let sum: number | null = null;
        for (const a of selectedAccounts) {
          let value: number | null = null;
          if (a.isGroup) {
            // Línea de la cuenta con subcuentas: suma de sus subcuentas ese día
            for (const c of childrenOf(accounts, a.id)) {
              const v = p.accounts[c.id];
              const x = v ? (native ? v.native : v.base) : null;
              if (x !== null) value = (value ?? 0) + x;
            }
          } else {
            const v = p.accounts[a.id];
            value = v ? (native ? v.native : v.base) : null;
          }
          row[`a_${a.id}`] = value;
          // Si también está elegida su cuenta, la subcuenta ya va dentro de esa suma
          const inSelectedGroup = !!a.parentId && sel.includes(a.parentId);
          if (value !== null && !inSelectedGroup) sum = (sum ?? 0) + value;
        }
        // Lo que muestra la cifra grande: el total o, sin él, la suma de las cuentas elegidas
        row.headline = showTotal || selectedAccounts.length === 0 ? p.total : sum;
        return row;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, sel.join(), accounts, start, native]);
  const selectedPoint = selectedDay ? data.find((d) => d.day === selectedDay) : undefined;

  const withValue = data.filter((d) => d.headline !== null && d.headline !== undefined);
  const first = (withValue[0]?.headline as number | undefined) ?? null;
  const last = (withValue[withValue.length - 1]?.headline as number | undefined) ?? null;
  const change = first !== null && last !== null ? last - first : null;
  const pct = change !== null && first ? (change / Math.abs(first)) * 100 : null;

  return (
    <main className={embedded ? 'evo-embedded' : 'screen'}>
      {embedded ? (
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Evolución</h2>
      ) : (
        <header className="screen-header">
          <h1 className="screen-title">Evolución</h1>
        </header>
      )}

      <div className="segmented" role="group" aria-label="Periodo">
        {RANGES.map((r) => (
          <button type="button" key={r.id} aria-pressed={r.id === range} onClick={() => setRange(r.id)}>
            {r.id}
          </button>
        ))}
      </div>

      {series.length === 0 ? (
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
              {last !== null ? formatMoney(last, unit) : '—'}
            </span>
            {change !== null && withValue.length > 1 && (
              <span style={{ color: 'var(--gold-text)', fontWeight: 600, fontSize: 14 }}>
                {change >= 0 ? '+' : ''}
                {formatMoney(change, unit)}
                {pct !== null &&
                  ` (${pct >= 0 ? '+' : ''}${pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %)`}{' '}
                desde el {shortDate(withValue[0].t as number)}
              </span>
            )}
          </div>

          {/* Al cambiar de periodo o de divisa la gráfica se vuelve a dibujar con animación */}
          <div
            key={`${range}-${unit}`}
            className="chart-anim"
            style={{ width: '100%', height: 250, marginLeft: -4, position: 'relative' }}
          >
            {data.length === 0 && (
              <p className="hint" style={{ position: 'absolute', inset: '40% 0 auto', textAlign: 'center' }}>
                No hay registros en este periodo.
              </p>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 12, right: 4, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={[start, end]}
                  ticks={axis.ticks}
                  interval={0}
                  allowDataOverflow
                  tickFormatter={axis.format}
                  tick={{ fontSize: 11, fill: 'var(--faint)' }}
                  axisLine={false}
                  tickLine={false}
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
                {selectedPoint && (
                  <ReferenceLine
                    x={selectedPoint.t as number}
                    stroke="var(--gold)"
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                  />
                )}
                <Tooltip
                  content={(props) => <ChartTooltip {...(props as unknown as TipProps)} base={unit} />}
                  cursor={{ stroke: 'var(--faint)', strokeDasharray: '3 3' }}
                />
                {selectedAccounts.map((a) => (
                  <Line
                    key={a.id}
                    name={a.name}
                    dataKey={`a_${a.id}`}
                    stroke={a.color}
                    strokeWidth={2}
                    dot={{ r: 2.5, fill: a.color, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    animationDuration={700}
                    animationEasing="ease-out"
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
                    animationDuration={700}
                    animationEasing="ease-out"
                    connectNulls
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="hint" style={{ marginTop: -6 }}>
            Toca o desliza sobre la gráfica para ver el saldo y la fecha de cada actualización.
            {native && ` Importes en ${unit}.`}
            {mixesCurrencies &&
              ` Las cuentas en otra divisa se muestran convertidas a ${base}; selecciónalas solas (sin el total) para verlas en su divisa.`}
          </p>

          <span className="eyebrow">Mostrar en la gráfica</span>
          <div className={embedded ? 'chips scroll-x' : 'chips'}>
            <button
              type="button"
              className="chip round"
              aria-pressed={sel.includes('total')}
              onClick={() => toggle('total')}
            >
              <span className="dot" style={{ background: 'var(--gold)' }} />
              Total
            </button>
            {topLevel(accounts).flatMap((a) => {
              const chip = (x: Account, sub = false) => (
                <button
                  type="button"
                  key={x.id}
                  className="chip round"
                  aria-pressed={sel.includes(x.id)}
                  onClick={() => toggle(x.id)}
                  style={sub ? { minHeight: 34, fontSize: 13, paddingLeft: 10 } : undefined}
                >
                  <span className="dot" style={{ background: x.color }} />
                  {sub ? `↳ ${x.name}` : x.name}
                </button>
              );
              // Al elegir una cuenta con subcuentas aparecen sus subcuentas para verlas por separado
              // (y siempre las que ya estén elegidas, para poder quitarlas)
              if (!a.isGroup) return [chip(a)];
              const kids = childrenOf(accounts, a.id).filter((c) => sel.includes(a.id) || sel.includes(c.id));
              return [chip(a), ...kids.map((c) => chip(c, true))];
            })}
          </div>

          {!embedded && <RecordsList onSelectDay={setSelectedDay} onEditEntry={onEditEntry} />}
        </>
      )}
    </main>
  );
}
