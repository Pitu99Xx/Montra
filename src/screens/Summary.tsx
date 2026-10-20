import { useMemo } from 'react';
import { AccountIcon, GroupIcon } from '../components/ui';
import { IconPlus } from '../components/Icons';
import { childrenOf, groupValue, topLevel } from '../data/groups';
import type { Account, Entry } from '../data/model';
import { useStore } from '../data/store';
import { formatMoney } from '../lib/currency';
import { EvolutionScreen } from './Evolution';
import { RecordsList } from './RecordsList';

const DAY = 86_400_000;
const shortDate = (t: number) => new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

/** Pantalla «Resumen» de la versión de ordenador. */
export function SummaryScreen({
  onOpen,
  onCreate,
  onUpdateAll,
  onEditEntry,
}: {
  onOpen: (a: Account) => void;
  onCreate: () => void;
  onUpdateAll: () => void;
  onEditEntry: (e: Entry, a: Account) => void;
}) {
  const { accounts, series, total, user, valueIn } = useStore();
  const base = user.baseCurrency;

  const kpis = useMemo(() => {
    const last = series[series.length - 1];
    const prev = series[series.length - 2];
    const delta = last?.total != null && prev?.total != null ? { v: last.total - prev.total, t: prev.t } : null;
    const from = Date.now() - 183 * DAY;
    const first6 = series.find((p) => p.t >= from && p.total !== null);
    const six =
      first6 && last?.total != null && first6 !== last
        ? {
            v: last.total - first6.total!,
            pct: first6.total ? ((last.total - first6.total!) / Math.abs(first6.total!)) * 100 : null,
            t: first6.t,
          }
        : null;
    let foreign = 0;
    const codes = new Set<string>();
    for (const a of accounts) {
      if (a.isGroup || !a.includeInTotal || a.currency === base) continue;
      const v = valueIn(a.balance, a.currency);
      if (v !== null) {
        foreign += v;
        codes.add(a.currency);
      }
    }
    return { delta, six, foreign, codes: [...codes] };
  }, [series, accounts, base, valueIn]);

  // Peso de cada cuenta (o cuenta con subcuentas) en el total
  const rows = topLevel(accounts).map((a) => {
    const kids = a.isGroup ? childrenOf(accounts, a.id) : [];
    const value = a.isGroup ? groupValue(kids, valueIn) : a.includeInTotal ? valueIn(a.balance, a.currency) : null;
    return { a, kids, value };
  });
  const shareBase = total && total > 0 ? total : null;
  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <main className="desk-page">
      <header
        style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', justifyContent: 'space-between' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="row-sub" style={{ fontSize: 14 }}>
            {today.charAt(0).toUpperCase() + today.slice(1)}
          </span>
          <h1 className="screen-title" style={{ fontSize: 40 }}>
            Resumen
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-outline" style={{ height: 44 }} onClick={onCreate}>
            <IconPlus size={18} /> Nueva cuenta
          </button>
          <button type="button" className="btn btn-primary" style={{ height: 44 }} onClick={onUpdateAll}>
            Actualizar saldos
          </button>
        </div>
      </header>

      <section className="desk-kpis" aria-label="Indicadores">
        <div className="card total-card">
          <span className="eyebrow">Total · {base}</span>
          <span className="num" style={{ fontSize: 36, fontWeight: 500 }}>
            {total !== null ? formatMoney(total, base) : '—'}
          </span>
          {kpis.delta && Math.abs(kpis.delta.v) >= 0.005 ? (
            <span className={kpis.delta.v > 0 ? 'delta-up' : 'delta-down'} style={{ fontSize: 14, fontWeight: 600 }}>
              {kpis.delta.v > 0 ? '+' : '−'}
              {formatMoney(Math.abs(kpis.delta.v), base)} desde el {shortDate(kpis.delta.t)}
            </span>
          ) : (
            <span className="row-sub">Sin cambios recientes</span>
          )}
        </div>
        <div className="card total-card">
          <span className="eyebrow">Últimos 6 meses</span>
          <span className="num" style={{ fontSize: 36, fontWeight: 500 }}>
            {kpis.six ? `${kpis.six.v >= 0 ? '+' : '−'}${formatMoney(Math.abs(kpis.six.v), base)}` : '—'}
          </span>
          <span className="row-sub" style={{ fontSize: 14 }}>
            {kpis.six
              ? `${kpis.six.pct !== null ? `${kpis.six.pct >= 0 ? '+' : ''}${kpis.six.pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })} % ` : ''}desde el ${shortDate(kpis.six.t)}`
              : 'Aún no hay historial suficiente'}
          </span>
        </div>
        <div className="card total-card">
          <span className="eyebrow">En otras divisas</span>
          <span className="num" style={{ fontSize: 36, fontWeight: 500 }}>
            {shareBase
              ? `${((kpis.foreign / shareBase) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`
              : '—'}
          </span>
          <span className="row-sub" style={{ fontSize: 14 }}>
            {kpis.codes.length ? `${formatMoney(kpis.foreign, base)} en ${kpis.codes.join(' y ')}` : `Todo en ${base}`}
          </span>
        </div>
      </section>

      <section className="desk-grid">
        <div className="card desk-panel">
          <EvolutionScreen embedded onEditEntry={onEditEntry} />
        </div>

        <div className="card desk-panel desk-fit" style={{ gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 6 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Cuentas</h2>
            <span className="row-sub">Peso en el total</span>
          </div>
          <div className="desk-fit-body">
            {rows.map(({ a, kids, value }) => {
              const share = shareBase && value !== null ? Math.max(0, (value / shareBase) * 100) : 0;
              return (
                <div key={a.id}>
                  <button type="button" className="share-row" onClick={() => onOpen(a)}>
                    {a.isGroup ? (
                      <GroupIcon name={a.name} color={a.color} back={kids[1]?.color} size={38} />
                    ) : (
                      <AccountIcon currency={a.currency} color={a.color} size={38} />
                    )}
                    <span className="row-main" style={{ gap: 6 }}>
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span className="row-title" style={{ fontSize: 15 }}>
                          {a.name}
                        </span>
                        <span className="num" style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
                          {a.isGroup
                            ? value !== null
                              ? formatMoney(value, base)
                              : '—'
                            : formatMoney(a.balance, a.currency)}
                        </span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="share-track">
                          <span style={{ width: `${share}%`, background: a.color }} />
                        </span>
                        <span className="row-sub" style={{ fontSize: 12, minWidth: 92, textAlign: 'right' }}>
                          {!a.isGroup && a.currency !== base && value !== null && `≈ ${formatMoney(value, base)} · `}
                          {share.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %
                        </span>
                      </span>
                    </span>
                  </button>
                  {kids.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', padding: '0 0 6px 56px', gap: 2 }}>
                      {kids.map((k) => (
                        <button type="button" key={k.id} className="share-sub" onClick={() => onOpen(k)}>
                          <span className="dot" style={{ background: k.color, width: 8, height: 8 }} />
                          <span style={{ flex: 1, textAlign: 'left' }}>{k.name}</span>
                          <span className="num">{formatMoney(k.balance, k.currency)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card desk-panel">
        <RecordsList onSelectDay={() => undefined} onEditEntry={onEditEntry} />
      </section>
    </main>
  );
}
