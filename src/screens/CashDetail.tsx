import { useMemo, useState } from 'react';
import { AccountIcon } from '../components/ui';
import { IconBack, IconPencil, IconScale, IconSearch, IconUpload } from '../components/Icons';
import { cashBalance, expensesByConcept, lastDays, runningBalances, signedAmount, sortCash } from '../data/cash';
import type { Account, CashKind, CashMovement } from '../data/model';
import { useStore } from '../data/store';
import { formatMoney } from '../lib/currency';
import { DESKTOP_QUERY, useMedia } from '../lib/useMedia';
import { useBottomBand } from '../lib/viewport';

const PAGE = 60;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const monthTitle = (t: number) => {
  const s = new Date(t).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const shortDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`;
};
export const cashDateLabel = (m: CashMovement) => (m.date ? shortDate(m.date) : 'Sin fecha');

type Filter = 'all' | 'expense' | 'income';

/** Ficha de la cuenta de efectivo: saldo calculado, movimientos y accesos rápidos. */
export function CashDetail({
  account,
  closing,
  onBack,
  onEditAccount,
  onNew,
  onEdit,
  onCount,
  onImport,
}: {
  account: Account;
  closing: boolean;
  onBack: () => void;
  onEditAccount: () => void;
  onNew: (kind: Exclude<CashKind, 'adjust'>) => void;
  onEdit: (m: CashMovement) => void;
  onCount: () => void;
  onImport: () => void;
}) {
  const { cash, cashLoaded } = useStore();
  useBottomBand('--bg');
  const isDesktop = useMedia(DESKTOP_QUERY);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const code = account.currency;
  const started = cash.length > 0;
  const balance = started ? cashBalance(cash) : account.balance;
  const balances = useMemo(() => runningBalances(cash), [cash]);
  const recent = useMemo(() => lastDays(cash, 30), [cash]);
  const top = useMemo(() => expensesByConcept(cash), [cash]);
  const last = useMemo(() => sortCash(cash).at(-1), [cash]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortCash(cash)
      .reverse()
      .filter((m) => {
        const v = signedAmount(m);
        if (filter === 'income' && v < 0) return false;
        if (filter === 'expense' && v >= 0) return false;
        return !q || m.concept.toLowerCase().includes(q) || (m.note ?? '').toLowerCase().includes(q);
      });
  }, [cash, filter, query]);

  const months = useMemo(() => {
    const out: { key: string; title: string; items: CashMovement[]; net: number }[] = [];
    for (const m of shown.slice(0, limit)) {
      const d = new Date(m.pos);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let g = out[out.length - 1];
      if (g?.key !== key) {
        g = { key, title: monthTitle(m.pos), items: [], net: 0 };
        out.push(g);
      }
      g.items.push(m);
      g.net += signedAmount(m);
    }
    return out;
  }, [shown, limit]);

  const signed = (v: number) => `${v > 0.004 ? '+' : v < -0.004 ? '−' : ''}${formatMoney(Math.abs(v), code)}`;

  const list = (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div className="chips" style={{ flexWrap: 'nowrap' }}>
          {(
            [
              ['all', 'Todos'],
              ['expense', 'Gastos'],
              ['income', 'Ingresos'],
            ] as const
          ).map(([id, label]) => (
            <button
              type="button"
              key={id}
              className="chip round"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              style={{ minHeight: 36 }}
            >
              {label}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="icon-btn"
          aria-label="Buscar"
          aria-pressed={searching}
          onClick={() => {
            setSearching(!searching);
            if (searching) setQuery('');
          }}
        >
          <IconSearch size={19} />
        </button>
      </div>
      {searching && (
        <input
          className="input"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar concepto o nota…"
          aria-label="Buscar"
        />
      )}

      {started && shown.length === 0 && <p className="hint">No hay movimientos con este filtro.</p>}

      {months.map((g) => (
        <section key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="month-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{g.title}</span>
            <span>{signed(g.net)}</span>
          </div>
          <div className="list">
            {g.items.map((m) => {
              const v = signedAmount(m);
              return (
                <button type="button" key={m.id} className="row" onClick={() => onEdit(m)}>
                  <span className={`cash-sign ${v >= 0 ? 'in' : 'out'}`} aria-hidden="true">
                    {m.kind === 'adjust' ? '±' : v >= 0 ? '+' : '−'}
                  </span>
                  <span className="row-main">
                    <span className="row-title" style={{ fontSize: 15 }}>
                      {m.concept}
                    </span>
                    <span
                      className="row-sub"
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {cashDateLabel(m)}
                      {m.note ? ` · ${m.note}` : ''}
                    </span>
                  </span>
                  <span className="row-end">
                    <span className={`num ${v >= 0 ? 'delta-up' : 'delta-down'}`} style={{ fontSize: 16 }}>
                      {signed(v)}
                    </span>
                    <span className="row-sub" style={{ fontSize: 12 }}>
                      saldo {formatMoney(balances.get(m.id) ?? 0, code)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {shown.length > limit && (
        <button type="button" className="btn btn-ghost" onClick={() => setLimit(limit + PAGE)}>
          Ver más movimientos
        </button>
      )}
    </>
  );

  const side = (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="card mini-stat" style={{ background: 'var(--panel)' }}>
          <span className="row-sub">Gastos · 30 días</span>
          <span className="delta-down" style={{ fontWeight: 600, fontSize: 16 }}>
            {formatMoney(recent.expense, code)}
          </span>
        </div>
        <div className="card mini-stat" style={{ background: 'var(--panel)' }}>
          <span className="row-sub">Ingresos · 30 días</span>
          <span className="delta-up" style={{ fontWeight: 600, fontSize: 16 }}>
            {formatMoney(recent.income, code)}
          </span>
        </div>
      </div>
      {isDesktop && top.length > 0 && (
        <section className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>En qué se va</h2>
            <span className="row-sub">Gastos por concepto</span>
          </div>
          {top.map((t) => (
            <div key={t.concept} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ fontWeight: 600 }}>{t.concept}</span>
                <span className="num">{formatMoney(t.total, code)}</span>
              </div>
              <span className="share-track" style={{ flex: 'none', display: 'block' }}>
                <span style={{ width: `${(t.total / top[0].total) * 100}%`, background: 'var(--danger)' }} />
              </span>
            </div>
          ))}
        </section>
      )}
    </>
  );

  return (
    <div
      className={`detail-view${isDesktop ? ' wide' : ''}${closing ? ' closing' : ''}`}
      role="dialog"
      aria-label={account.name}
    >
      <main className="screen">
        <header className="screen-header">
          <button
            type="button"
            className="link-btn"
            onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: 2 }}
          >
            <IconBack size={22} /> Cuentas
          </button>
          <span className="glass-group">
            <button type="button" className="icon-btn" aria-label="Cuadrar la caja" onClick={onCount}>
              <IconScale size={20} />
            </button>
            <span className="sep" aria-hidden="true" />
            <button type="button" className="icon-btn" aria-label="Importar Excel" onClick={onImport}>
              <IconUpload size={20} />
            </button>
            <span className="sep" aria-hidden="true" />
            <button type="button" className="icon-btn" aria-label="Editar cuenta" onClick={onEditAccount}>
              <IconPencil size={18} />
            </button>
          </span>
        </header>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <AccountIcon currency={code} color={account.color} size={56} />
          <div className="row-main">
            <h1 className="serif" style={{ margin: 0, fontSize: 28, fontWeight: 500 }}>
              {account.name}
            </h1>
            <span className="row-sub" style={{ fontSize: 14 }}>
              Saldo calculado con tus movimientos
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="num" style={{ fontSize: 42, fontWeight: 500 }}>
            {formatMoney(balance, code)}
          </span>
          <span className="row-sub" style={{ fontSize: 14 }}>
            {last
              ? `Último movimiento: ${cashDateLabel(last)} · ${last.concept}`
              : cashLoaded
                ? 'Aún no hay movimientos'
                : ' '}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button
            type="button"
            className="btn btn-outline"
            style={{ color: 'var(--danger)' }}
            onClick={() => onNew('expense')}
          >
            − Gasto
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onNew('income')}>
            + Ingreso
          </button>
        </div>

        {cashLoaded && !started && (
          <section className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 16 }}>Empieza con tus movimientos</span>
            <span className="row-sub" style={{ fontSize: 14, lineHeight: 1.5 }}>
              Importa el Excel donde los apuntabas, o apunta un ingreso con el dinero que tienes ahora. Desde el primer
              movimiento, el saldo y la evolución de esta cuenta se calculan solos.
            </span>
            <button type="button" className="btn btn-outline" onClick={onImport}>
              <IconUpload size={18} /> Importar Excel
            </button>
          </section>
        )}

        {started &&
          (isDesktop ? (
            <div className="cash-cols">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>{list}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>{side}</div>
            </div>
          ) : (
            <>
              {side}
              {list}
            </>
          ))}
      </main>
    </div>
  );
}
