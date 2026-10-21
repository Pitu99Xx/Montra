import { useState } from 'react';
import { AccountIcon, GroupIcon } from '../components/ui';
import { IconChevron, IconDown, IconPlus, IconRefresh, IconUp } from '../components/Icons';
import { childrenOf, currenciesOf, groupValue, topLevel } from '../data/groups';
import type { Account } from '../data/model';
import { reorderAccounts } from '../data/actions';
import { useStore } from '../data/store';
import { formatMoney, rateLabel } from '../lib/currency';
import { ACCOUNT_TYPES } from '../data/model';

function relativeDay(d: Date | undefined): string {
  if (!d) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}

export function AccountsScreen({
  onOpen,
  onEdit,
  onCreate,
  onUpdateAll,
}: {
  onOpen: (a: Account) => void;
  onEdit: (a: Account) => void;
  onCreate: () => void;
  onUpdateAll: () => void;
}) {
  const { uid, accounts, accountsLoaded, total, user, rates, series, valueIn, missingRates } = useStore();
  const [editing, setEditing] = useState(false);
  const base = user.baseCurrency;

  // Diferencia con el día anterior con registros
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const delta = last?.total != null && prev?.total != null ? last.total - prev.total : null;
  const prevLabel = prev ? new Date(prev.t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '';
  const lastUpdate = accounts.reduce<Date | undefined>(
    (m, a) => (a.updatedAt && (!m || a.updatedAt > m) ? a.updatedAt : m),
    undefined,
  );

  const top = topLevel(accounts);
  const subCount = accounts.length - top.length;
  // Cuentas con subcuentas desplegadas (se recuerda en el dispositivo)
  const [expanded, setExpanded] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('montra.expanded') ?? '[]');
    } catch {
      return [];
    }
  });
  const toggleExpanded = (id: string) => {
    const next = expanded.includes(id) ? expanded.filter((x) => x !== id) : [...expanded, id];
    setExpanded(next);
    try {
      localStorage.setItem('montra.expanded', JSON.stringify(next));
    } catch {
      /* sin almacenamiento */
    }
  };

  const move = (i: number, dir: -1 | 1) => {
    const next = [...top];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    reorderAccounts(uid, next);
  };

  return (
    <main className="screen">
      <header className="screen-header">
        <h1 className="screen-title">Cuentas</h1>
        <span className="glass-group">
          <button type="button" className="icon-btn" aria-label="Actualizar saldos" onClick={onUpdateAll}>
            <IconRefresh size={20} />
          </button>
          <span className="sep" aria-hidden="true" />
          <button type="button" className="icon-btn" aria-label="Añadir cuenta" onClick={onCreate}>
            <IconPlus size={22} />
          </button>
        </span>
      </header>

      <section className="card total-card" aria-label="Total">
        <span className="eyebrow">Total · {base}</span>
        <span className="num total-value">{total !== null ? formatMoney(total, base) : '—'}</span>
        {total === null && missingRates.length > 0 && (
          <span className="notice">
            Obteniendo el tipo de cambio de {missingRates.join(', ')}… El total aparecerá en unos segundos.
          </span>
        )}
        {delta !== null && Number.isFinite(delta) && Math.abs(delta) >= 0.005 && (
          <span style={{ color: 'var(--gold-text)', fontWeight: 600, fontSize: 14 }}>
            {delta > 0 ? '+' : ''}
            {formatMoney(delta, base)} desde el {prevLabel}
          </span>
        )}
        <span className="row-sub">
          {lastUpdate ? `Actualizado ${relativeDay(lastUpdate)}` : 'Sin datos todavía'}
          {rates
            ? ` · Cambio BCE ${new Date(rates.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
            : ''}
        </span>
      </section>

      {accountsLoaded && accounts.length === 0 ? (
        <section className="card empty">
          <span className="serif" style={{ fontSize: 22 }}>
            Empieza añadiendo una cuenta
          </span>
          <span className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>
            Apunta su saldo actual; a partir de hoy Montra irá guardando su evolución.
          </span>
          <button type="button" className="btn btn-primary" onClick={onCreate}>
            <IconPlus size={20} /> Añadir cuenta
          </button>
        </section>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="eyebrow">
              {top.length} {top.length === 1 ? 'cuenta' : 'cuentas'}
              {subCount > 0 && ` · ${subCount} ${subCount === 1 ? 'subcuenta' : 'subcuentas'}`}
            </span>
            <button type="button" className="link-btn" onClick={() => setEditing((e) => !e)}>
              {editing ? 'Listo' : 'Editar'}
            </button>
          </div>

          <section className="list" aria-label="Cuentas">
            {top.map((a, i) => {
              const reorder = editing && (
                <span style={{ display: 'flex' }}>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Subir ${a.name}`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <IconUp size={20} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Bajar ${a.name}`}
                    disabled={i === top.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <IconDown size={20} />
                  </button>
                </span>
              );

              if (a.isGroup) {
                const kids = childrenOf(accounts, a.id);
                const sum = groupValue(kids, valueIn);
                const open = expanded.includes(a.id);
                return (
                  <div key={a.id} className="group-block">
                    <div className="row" style={{ padding: 0, borderBottom: open ? 'none' : undefined }}>
                      <button
                        type="button"
                        className="row"
                        style={{ border: 'none', flex: 1 }}
                        onClick={() => (editing ? onEdit(a) : onOpen(a))}
                      >
                        <GroupIcon name={a.name} color={a.color} back={kids[1]?.color} />
                        <span className="row-main">
                          <span className="row-title">{a.name}</span>
                          <span className="row-sub">
                            {kids.length} {kids.length === 1 ? 'subcuenta' : 'subcuentas'}
                            {kids.length > 0 && ` · ${currenciesOf(kids).join(', ')}`}
                          </span>
                        </span>
                        {!editing && (
                          <span className="row-end">
                            <span className="num" style={{ fontSize: 18 }}>
                              {sum !== null ? formatMoney(sum, base) : '—'}
                            </span>
                          </span>
                        )}
                      </button>
                      {editing ? (
                        reorder
                      ) : (
                        <button
                          type="button"
                          className="icon-btn"
                          aria-expanded={open}
                          aria-label={open ? `Ocultar subcuentas de ${a.name}` : `Ver subcuentas de ${a.name}`}
                          onClick={() => toggleExpanded(a.id)}
                          style={{ marginRight: -10 }}
                        >
                          <IconChevron
                            size={18}
                            style={{ transform: `rotate(${open ? 90 : 0}deg)`, transition: 'transform 0.25s' }}
                          />
                        </button>
                      )}
                    </div>
                    {open && (
                      <div className="sub-list">
                        {kids.map((c) => {
                          const conv = c.currency !== base ? valueIn(c.balance, c.currency) : null;
                          return (
                            <button
                              type="button"
                              key={c.id}
                              className="row sub-row"
                              onClick={() => (editing ? onEdit(c) : onOpen(c))}
                              style={{ opacity: c.includeInTotal ? 1 : 0.6 }}
                            >
                              <AccountIcon currency={c.currency} color={c.color} size={32} />
                              <span className="row-main">
                                <span style={{ fontSize: 15, fontWeight: 600 }}>{c.name}</span>
                                <span className="row-sub" style={{ fontSize: 12 }}>
                                  {c.currency !== base
                                    ? `${c.currency} · ${rateLabel(c.currency, base, rates) ?? 'sin cambio'}`
                                    : (ACCOUNT_TYPES.find((t) => t.id === c.type)?.label ?? '')}
                                </span>
                              </span>
                              <span className="row-end">
                                <span className="num" style={{ fontSize: 16 }}>
                                  {formatMoney(c.balance, c.currency)}
                                </span>
                                {conv !== null && (
                                  <span className="row-sub" style={{ fontSize: 12 }}>
                                    ≈ {formatMoney(conv, base)}
                                  </span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                        {kids.length === 0 && <p className="hint">Aún no tiene subcuentas.</p>}
                      </div>
                    )}
                  </div>
                );
              }

              const foreign = a.currency !== base;
              const conv = foreign ? valueIn(a.balance, a.currency) : null;
              const sub = foreign
                ? `${a.currency} · ${rateLabel(a.currency, base, rates) ?? 'sin cambio'}`
                : (ACCOUNT_TYPES.find((t) => t.id === a.type)?.label ?? '');
              return (
                <div key={a.id} className="row" style={{ padding: 0 }}>
                  <button
                    type="button"
                    className="row"
                    style={{ border: 'none', flex: 1, opacity: a.includeInTotal ? 1 : 0.6 }}
                    onClick={() => (editing ? onEdit(a) : onOpen(a))}
                  >
                    <AccountIcon currency={a.currency} color={a.color} />
                    <span className="row-main">
                      <span className="row-title">{a.name}</span>
                      <span className="row-sub">
                        {sub}
                        {!a.includeInTotal && ' · fuera del total'}
                      </span>
                    </span>
                    {!editing && (
                      <span className="row-end">
                        <span className="num" style={{ fontSize: 18 }}>
                          {formatMoney(a.balance, a.currency)}
                        </span>
                        {conv !== null && <span className="row-sub">≈ {formatMoney(conv, base)}</span>}
                      </span>
                    )}
                  </button>
                  {reorder}
                </div>
              );
            })}
          </section>

          {editing ? (
            <p className="hint">Toca una cuenta para cambiar su nombre, color o divisa, o para eliminarla.</p>
          ) : (
            <button type="button" className="btn btn-outline" onClick={onUpdateAll}>
              Actualizar saldos
            </button>
          )}
        </>
      )}
    </main>
  );
}
