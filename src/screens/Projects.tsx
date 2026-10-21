import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { IconCheck, IconPlus } from '../components/Icons';
import { toast } from '../components/ui';
import type { Project, Scenario } from '../data/model';
import { buildProjection, effectiveDate, movementDateLabel, projectTotals, saveProject } from '../data/projects';
import { ProjectIcon, monthYear, projectMeta, signed } from './projectUi';
import { useStore } from '../data/store';
import { formatMoney } from '../lib/currency';
import { DESKTOP_QUERY, useMedia } from '../lib/useMedia';

const DAY = 86_400_000;
const SCENARIO_KEY = 'montra.projects.scenario';
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

export function loadScenario(): Scenario {
  try {
    const v = localStorage.getItem(SCENARIO_KEY);
    return v === 'pessimistic' || v === 'optimistic' ? v : 'expected';
  } catch {
    return 'expected';
  }
}

function monthTicks(start: number, end: number): number[] {
  const span = end - start;
  const step = span > 400 * DAY ? 3 : span > 200 * DAY ? 2 : 1;
  const ticks: number[] = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  for (; d.getTime() <= end; d.setMonth(d.getMonth() + step)) ticks.push(d.getTime());
  return ticks;
}

const compact = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + 'M';
  if (a >= 1e3) return (v / 1e3).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + 'k';
  return v.toLocaleString('es-ES', { maximumFractionDigits: 0 });
};

interface TipProps {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: number;
  base: string;
}

function ProjTooltip({ active, payload, label, base }: TipProps) {
  const p = payload?.find((x) => x.value !== null && x.value !== undefined);
  if (!active || !p || label === undefined) return null;
  const future = p.dataKey === 'proj' && label > Date.now() + 60_000;
  return (
    <div className="chart-tooltip">
      <span style={{ fontWeight: 600, opacity: 0.75 }}>
        {future
          ? `Previsto · ${monthYear(label)}`
          : new Date(label).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
      </span>
      <span className="num" style={{ fontSize: 16 }}>
        {formatMoney(p.value, base)}
      </span>
    </div>
  );
}

export function ProjectsScreen({
  onOpen,
  onCreate,
  onEditMin,
}: {
  onOpen: (p: Project) => void;
  onCreate: () => void;
  onEditMin: () => void;
}) {
  const { uid, projects, total, series, user, valueIn } = useStore();
  const isDesktop = useMedia(DESKTOP_QUERY);
  const base = user.baseCurrency;
  const [scenario, setScenarioState] = useState<Scenario>(loadScenario);
  const setScenario = (s: Scenario) => {
    setScenarioState(s);
    try {
      localStorage.setItem(SCENARIO_KEY, s);
    } catch {
      /* sin almacenamiento */
    }
  };

  const selected = projects.filter((p) => p.selected);
  const hasMargin = projects.some((p) => p.margin > 0);
  const effScenario: Scenario = hasMargin ? scenario : 'expected';
  const now = total ?? 0;

  const projection = useMemo(
    () => buildProjection(selected, now, effScenario, valueIn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, now, effScenario, valueIn],
  );
  const net = projection.final - now;
  const minWanted = user.projectMin ?? null;
  const below = minWanted !== null && projection.min.balance < minWanted - 0.004 ? projection.min : null;
  const lastDated = [...projection.steps].reverse().find((s) => !s.undated);

  const toggle = async (p: Project) => {
    try {
      await saveProject(uid, { ...p, selected: !p.selected });
    } catch {
      toast('No se pudo guardar el proyecto');
    }
  };

  // Gráfica: historial real de los últimos 6 meses + previsión escalonada
  const chart = useMemo(() => {
    const t0 = Date.now();
    const from = t0 - 183 * DAY;
    const rows: { t: number; real: number | null; proj: number | null }[] = series
      .filter((p) => p.t >= from && p.total !== null)
      .map((p) => ({ t: p.t, real: p.total, proj: null }));
    rows.push({ t: t0, real: now, proj: now });
    for (const pt of projection.points) rows.push({ t: pt.t, real: null, proj: pt.balance });
    const start = Math.min(rows[0]?.t ?? t0, t0 - 30 * DAY);
    const end = Math.max(projection.end + 20 * DAY, t0 + 60 * DAY);
    rows.push({ t: end, real: null, proj: projection.final });
    return { rows, start, end, ticks: monthTicks(start, end) };
  }, [series, projection, now]);

  const kpis = [
    { label: 'Hoy', value: total !== null ? formatMoney(now, base) : '—', sub: 'Total real de tus cuentas' },
    {
      label: `Proyectos · ${selected.length} ${selected.length === 1 ? 'marcado' : 'marcados'}`,
      value: signed(net, base),
      sub: 'Resultado neto de los marcados',
      cls: net >= 0 ? 'delta-up' : 'delta-down',
    },
    {
      label: 'Saldo final',
      value: total !== null ? formatMoney(projection.final, base) : '—',
      sub: lastDated ? `Si se cumplen · ${monthYear(lastDated.t)}` : 'Si se cumplen',
      strong: true,
    },
  ];

  const scenarioSwitch = hasMargin && (
    <div className="segmented" role="group" aria-label="Escenario">
      {(
        [
          ['pessimistic', 'Pesimista'],
          ['expected', 'Previsto'],
          ['optimistic', 'Optimista'],
        ] as const
      ).map(([id, label]) => (
        <button type="button" key={id} aria-pressed={scenario === id} onClick={() => setScenario(id)}>
          {label}
        </button>
      ))}
    </div>
  );

  const list = (
    <div className={isDesktop ? 'card desk-panel' : ''} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 4px' }}>
        {isDesktop ? (
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Tus proyectos</h2>
        ) : (
          <span className="eyebrow">Tus proyectos</span>
        )}
        <span className="row-sub">Marca los que quieras simular</span>
      </div>
      {projects.map((p) => {
        const t = projectTotals(p, effScenario, valueIn);
        return (
          <div key={p.id} className={`proj-row${p.selected ? ' on' : ''}`}>
            <button
              type="button"
              className="proj-check"
              role="checkbox"
              aria-checked={p.selected}
              aria-label={`Incluir ${p.name} en la simulación`}
              onClick={() => toggle(p)}
            >
              <span>{p.selected && <IconCheck size={14} />}</span>
            </button>
            <button type="button" className="proj-open" onClick={() => onOpen(p)}>
              <ProjectIcon project={p} size={40} />
              <span className="row-main">
                <span className="row-title" style={{ fontSize: 16 }}>
                  {p.name}
                </span>
                <span className="row-sub">{projectMeta(p)}</span>
              </span>
              <span
                className={`num ${t.net >= 0 ? 'delta-up' : 'delta-down'}`}
                style={{ fontSize: 17, whiteSpace: 'nowrap' }}
              >
                {signed(t.net, base)}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );

  const projectionCard = (
    <div
      className={`card ${isDesktop ? 'desk-panel' : ''}`}
      style={{ padding: isDesktop ? 20 : '16px 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '0 4px' }}
      >
        <h2 style={{ margin: 0, fontSize: isDesktop ? 18 : 16, fontWeight: 700 }}>Proyección en el tiempo</h2>
        <button type="button" className="link-btn" style={{ fontSize: 14 }} onClick={onEditMin}>
          {minWanted !== null ? `Mínimo ${formatMoney(minWanted, base)}` : 'Fijar mínimo'}
        </button>
      </div>
      <div key={effScenario} className="chart-anim" style={{ width: '100%', height: isDesktop ? 280 : 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart.rows} margin={{ top: 12, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[chart.start, chart.end]}
              ticks={chart.ticks}
              interval="preserveStartEnd"
              tickFormatter={(t: number) => MONTHS[new Date(t).getMonth()]}
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
            <ReferenceLine
              x={Date.now()}
              stroke="var(--faint)"
              strokeWidth={1}
              label={{ value: 'Hoy', position: 'insideTopRight', fill: 'var(--muted)', fontSize: 11 }}
            />
            {minWanted !== null && (
              <ReferenceLine
                y={minWanted}
                stroke="var(--danger)"
                strokeDasharray="2 4"
                strokeWidth={1.5}
                ifOverflow="extendDomain"
              />
            )}
            <Tooltip
              content={(props) => <ProjTooltip {...(props as unknown as TipProps)} base={base} />}
              cursor={{ stroke: 'var(--faint)', strokeDasharray: '3 3' }}
            />
            <Line
              dataKey="real"
              stroke="var(--gold)"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 5 }}
              connectNulls
              animationDuration={600}
            />
            <Line
              dataKey="proj"
              type="stepAfter"
              stroke="var(--gold)"
              strokeWidth={2.5}
              strokeDasharray="6 5"
              dot={{ r: 3, fill: 'var(--bg)', stroke: 'var(--gold)', strokeWidth: 2 }}
              activeDot={{ r: 5 }}
              connectNulls
              animationDuration={700}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        Continua: tu historial real. Discontinua: aplicando cada movimiento en su fecha, con el cambio de hoy. Los «sin
        fecha» se suman al final.
      </p>
      {below && (
        <div className="proj-alert" role="status">
          <span style={{ fontWeight: 700 }}>!</span>
          <span>
            {Math.abs(below.t - Date.now()) < DAY ? 'Hoy' : `En ${monthYear(below.t)}`} bajarías a{' '}
            <b className="num">{formatMoney(below.balance, base)}</b>, por debajo de tu mínimo de{' '}
            {formatMoney(minWanted!, base)}.
          </span>
        </div>
      )}
    </div>
  );

  const upcoming = projection.steps.length > 0 && (
    <div
      className={isDesktop ? 'card desk-panel' : ''}
      style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: isDesktop ? 'hidden' : undefined }}
    >
      {isDesktop ? (
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Movimientos previstos</h2>
      ) : (
        <span className="eyebrow" style={{ padding: '0 4px' }}>
          Movimientos previstos
        </span>
      )}
      <div className={isDesktop ? 'list flat' : 'list'}>
        {projection.steps.map((s) => (
          <button
            type="button"
            key={`${s.project.id}-${s.movement.id}`}
            className="row"
            onClick={() => onOpen(s.project)}
          >
            <span className="dot" style={{ background: s.project.color }} />
            <span className="row-main">
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {s.movement.concept}
              </span>
              <span className="row-sub">
                {movementDateLabel(effectiveDate(s.movement, s.project))} · {s.project.name}
                {s.movement.currency !== base && ` · ${formatMoney(s.movement.amount, s.movement.currency)}`}
              </span>
            </span>
            <span className="row-end">
              <span className={`num ${s.value >= 0 ? 'delta-up' : 'delta-down'}`} style={{ fontSize: 15 }}>
                {signed(s.value, base)}
              </span>
              <span className="row-sub" style={{ fontSize: 12 }}>
                {formatMoney(s.balance, base)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  const empty = (
    <section className="card empty">
      <span className="serif" style={{ fontSize: 22 }}>
        Aún no tienes proyectos
      </span>
      <span className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>
        Crea un proyecto (un viaje, un coche, un bonus…) con sus gastos e ingresos previstos, en cualquier divisa y con
        fechas aproximadas. Marca los que quieras para ver cómo quedaría tu saldo si se cumplen.
      </span>
      <button type="button" className="btn btn-primary" onClick={onCreate}>
        <IconPlus size={20} /> Nuevo proyecto
      </button>
    </section>
  );

  const note = (
    <p className="hint">
      Los proyectos son previsiones: no cambian tus cuentas, el total ni la evolución real.
      {hasMargin &&
        ' El escenario pesimista encarece los gastos y recorta los ingresos según el margen de cada proyecto; el optimista, al revés.'}
    </p>
  );

  if (isDesktop) {
    return (
      <main className="desk-page">
        <header
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            alignItems: 'flex-end',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="row-sub" style={{ fontSize: 14 }}>
              Previsiones que aún no han ocurrido
            </span>
            <h1 className="screen-title" style={{ fontSize: 40 }}>
              Proyectos
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {scenarioSwitch && <div style={{ width: 320 }}>{scenarioSwitch}</div>}
            <button type="button" className="btn btn-primary" style={{ height: 44 }} onClick={onCreate}>
              <IconPlus size={18} /> Nuevo proyecto
            </button>
          </div>
        </header>
        {projects.length === 0 ? (
          empty
        ) : (
          <>
            <section className="desk-kpis" aria-label="Simulación">
              {kpis.map((k) => (
                <div
                  key={k.label}
                  className="card total-card"
                  style={k.strong ? { borderColor: 'var(--gold)' } : undefined}
                >
                  <span className="eyebrow" style={k.strong ? { color: 'var(--gold-text)' } : undefined}>
                    {k.label}
                  </span>
                  <span className={`num ${k.cls ?? ''}`} style={{ fontSize: 34, fontWeight: 500 }}>
                    {k.value}
                  </span>
                  <span className="row-sub" style={{ fontSize: 14 }}>
                    {k.sub}
                  </span>
                </div>
              ))}
            </section>
            <section className="proj-grid">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                {list}
                {note}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                {projectionCard}
                {upcoming}
              </div>
            </section>
          </>
        )}
      </main>
    );
  }

  return (
    <main className="screen">
      <header className="screen-header">
        <h1 className="screen-title">Proyectos</h1>
        <span className="glass-group">
          <button type="button" className="icon-btn" aria-label="Nuevo proyecto" onClick={onCreate}>
            <IconPlus size={22} />
          </button>
        </span>
      </header>
      {projects.length === 0 ? (
        empty
      ) : (
        <>
          <section className="card sim-card">
            <span className="eyebrow">
              Simulación · {selected.length} {selected.length === 1 ? 'proyecto' : 'proyectos'}
            </span>
            <div className="sim-line">
              <span className="muted">Hoy</span>
              <span className="num" style={{ fontSize: 18 }}>
                {total !== null ? formatMoney(now, base) : '—'}
              </span>
            </div>
            <div className="sim-line">
              <span className="muted">Resultado de los proyectos</span>
              <span className={net >= 0 ? 'delta-up' : 'delta-down'} style={{ fontSize: 16, fontWeight: 700 }}>
                {signed(net, base)}
              </span>
            </div>
            <div style={{ borderTop: '1px solid var(--border)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="row-sub">Saldo final si se cumplen</span>
              <span className="num" style={{ fontSize: 38, fontWeight: 500 }}>
                {total !== null ? formatMoney(projection.final, base) : '—'}
              </span>
              {lastDated && <span className="row-sub">Último movimiento previsto: {monthYear(lastDated.t)}</span>}
            </div>
            {scenarioSwitch}
          </section>
          {list}
          {projectionCard}
          {upcoming}
          {note}
        </>
      )}
    </main>
  );
}
