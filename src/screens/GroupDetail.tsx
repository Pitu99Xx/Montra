import { useMemo } from 'react';
import { AccountIcon, GroupIcon } from '../components/ui';
import { IconBack, IconChevron, IconPlus } from '../components/Icons';
import { childrenOf, currenciesOf, groupValue } from '../data/groups';
import { SOURCE_LABEL, type Account, type Entry } from '../data/model';
import { previousEntry } from '../data/series';
import { useStore } from '../data/store';
import { formatMoney } from '../lib/currency';
import { useBottomBand } from '../lib/viewport';
import { SourceIcon, deltaOf } from './AccountDetail';

const rowDate = (d: Date) =>
  `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;

/** Ficha de una cuenta con subcuentas: suma, reparto, subcuentas e historial conjunto. */
export function GroupDetail({
  group,
  closing,
  onBack,
  onEditGroup,
  onOpenChild,
  onAddChild,
  onUpdateGroup,
  onEditEntry,
}: {
  group: Account;
  closing: boolean;
  onBack: () => void;
  onEditGroup: () => void;
  onOpenChild: (a: Account) => void;
  onAddChild: () => void;
  onUpdateGroup: () => void;
  onEditEntry: (e: Entry, a: Account) => void;
}) {
  const { accounts, entries, series, user, valueIn } = useStore();
  useBottomBand('--bg');
  const base = user.baseCurrency;
  const kids = childrenOf(accounts, group.id);
  const total = groupValue(kids, valueIn);

  // Diferencia con el día anterior con registros (suma de las subcuentas)
  const delta = useMemo(() => {
    const ids = kids.map((k) => k.id);
    const sumAt = (i: number) => {
      const p = series[i];
      if (!p) return null;
      let s = 0;
      for (const id of ids) {
        const v = p.accounts[id]?.base;
        if (v === null) return null;
        s += v ?? 0;
      }
      return s;
    };
    const last = sumAt(series.length - 1);
    const prev = sumAt(series.length - 2);
    if (last === null || prev === null) return null;
    return { value: last - prev, since: new Date(series[series.length - 2].t) };
  }, [series, kids]);

  const shares = kids
    .map((k) => ({ k, v: k.includeInTotal ? (valueIn(k.balance, k.currency) ?? 0) : 0 }))
    .filter((x) => x.v > 0);
  const shareTotal = shares.reduce((s, x) => s + x.v, 0);

  const history = useMemo(() => {
    const ids = new Set(kids.map((k) => k.id));
    return entries
      .filter((e) => ids.has(e.accountId))
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 15);
  }, [entries, kids]);
  const byId = new Map(kids.map((k) => [k.id, k]));

  return (
    <div className={`detail-view${closing ? ' closing' : ''}`} role="dialog" aria-label={group.name}>
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
          <button type="button" className="link-btn" onClick={onEditGroup}>
            Editar
          </button>
        </header>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <GroupIcon name={group.name} color={group.color} back={kids[1]?.color} size={58} />
          <div className="row-main">
            <h1 className="serif" style={{ margin: 0, fontSize: 28, fontWeight: 500 }}>
              {group.name}
            </h1>
            <span className="row-sub" style={{ fontSize: 14 }}>
              {kids.length} {kids.length === 1 ? 'subcuenta' : 'subcuentas'}
              {kids.length > 0 && ` · ${currenciesOf(kids).join(', ')}`}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="num" style={{ fontSize: 40, fontWeight: 500 }}>
            {total !== null ? formatMoney(total, base) : '—'}
          </span>
          <span className="row-sub" style={{ fontSize: 14 }}>
            Suma de las subcuentas en {base}
            {delta && Math.abs(delta.value) >= 0.005 && (
              <>
                {' · '}
                <span className={delta.value > 0 ? 'delta-up' : 'delta-down'} style={{ fontWeight: 600 }}>
                  {delta.value > 0 ? '+' : '−'}
                  {formatMoney(Math.abs(delta.value), base)}
                </span>{' '}
                desde el {delta.since.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
              </>
            )}
          </span>
        </div>

        {shares.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }}
              role="img"
              aria-label={`Reparto: ${shares.map((x) => `${x.k.name} ${Math.round((x.v / shareTotal) * 100)} %`).join(', ')}`}
            >
              {shares.map((x) => (
                <span key={x.k.id} style={{ width: `${(x.v / shareTotal) * 100}%`, background: x.k.color }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: 'var(--muted)' }}>
              {shares.map((x) => (
                <span key={x.k.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="dot" style={{ background: x.k.color, width: 8, height: 8 }} />
                  {x.k.name} {Math.round((x.v / shareTotal) * 100)} %
                </span>
              ))}
            </div>
          </div>
        )}

        {kids.length > 0 && (
          <button type="button" className="btn btn-primary" onClick={onUpdateGroup}>
            Actualizar saldos de {group.name}
          </button>
        )}

        <span className="eyebrow" style={{ paddingTop: 2 }}>
          Subcuentas
        </span>
        <section className="list">
          {kids.map((k) => {
            const conv = k.currency !== base ? valueIn(k.balance, k.currency) : null;
            return (
              <button type="button" key={k.id} className="row" onClick={() => onOpenChild(k)}>
                <AccountIcon currency={k.currency} color={k.color} size={38} />
                <span className="row-main">
                  <span className="row-title" style={{ fontSize: 15 }}>
                    {k.name}
                  </span>
                  <span className="row-sub">{conv !== null ? `≈ ${formatMoney(conv, base)}` : k.currency}</span>
                </span>
                <span className="num" style={{ fontSize: 17 }}>
                  {formatMoney(k.balance, k.currency)}
                </span>
                <IconChevron size={16} style={{ color: 'var(--faint)' }} />
              </button>
            );
          })}
          <button type="button" className="row" onClick={onAddChild} style={{ color: 'var(--gold-text)' }}>
            <IconPlus size={20} />
            <span className="row-title" style={{ fontSize: 15 }}>
              Añadir subcuenta
            </span>
          </button>
        </section>

        {history.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 2 }}>
              <span className="eyebrow">Historial</span>
              <span className="row-sub">De todas las subcuentas</span>
            </div>
            <section className="list">
              {history.map((e) => {
                const k = byId.get(e.accountId)!;
                const d = deltaOf(e, previousEntry(entries, e));
                return (
                  <button type="button" key={e.id} className="row" onClick={() => onEditEntry(e, k)}>
                    <SourceIcon source={e.source} />
                    <span className="row-main">
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{rowDate(e.at)}</span>
                      <span className="row-sub">
                        {k.name} · {e.note ? e.note : SOURCE_LABEL[e.source]}
                      </span>
                    </span>
                    <span className="row-end">
                      <span className="num" style={{ fontSize: 16 }}>
                        {formatMoney(e.balance, e.currency)}
                      </span>
                      {d.text && (
                        <span className={d.cls} style={{ fontSize: 13, fontWeight: 600 }}>
                          {d.text}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
