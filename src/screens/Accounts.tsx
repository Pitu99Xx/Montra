import { useState } from 'react';
import { AccountIcon } from '../components/ui';
import { IconDown, IconPlus, IconUp } from '../components/Icons';
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
  onEdit,
  onCreate,
  onUpdateAll,
}: {
  onEdit: (a: Account) => void;
  onCreate: () => void;
  onUpdateAll: () => void;
}) {
  const { uid, accounts, accountsLoaded, total, user, rates, snapshots, valueIn, missingRates } = useStore();
  const [editing, setEditing] = useState(false);
  const base = user.baseCurrency;

  const last = snapshots[snapshots.length - 1];
  const prev = snapshots[snapshots.length - 2];
  const delta =
    last && prev ? (last.totalEUR - prev.totalEUR) * (base === 'EUR' ? 1 : (rates?.rates[base] ?? NaN)) : null;
  const lastUpdate = accounts.reduce<Date | undefined>(
    (m, a) => (a.updatedAt && (!m || a.updatedAt > m) ? a.updatedAt : m),
    undefined
  );

  const move = (i: number, dir: -1 | 1) => {
    const next = [...accounts];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    reorderAccounts(uid, next);
  };

  return (
    <main className="screen">
      <header className="screen-header">
        <h1 className="screen-title">Cuentas</h1>
        <button type="button" className="icon-btn filled" aria-label="Añadir cuenta" onClick={onCreate}>
          <IconPlus size={22} />
        </button>
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
            {formatMoney(delta, base)} desde la última actualización
          </span>
        )}
        <span className="row-sub">
          {lastUpdate ? `Actualizado ${relativeDay(lastUpdate)}` : 'Sin datos todavía'}
          {rates ? ` · Cambio BCE ${new Date(rates.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : ''}
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
              {accounts.length} {accounts.length === 1 ? 'cuenta' : 'cuentas'}
            </span>
            <button type="button" className="link-btn" onClick={() => setEditing((e) => !e)}>
              {editing ? 'Listo' : 'Editar'}
            </button>
          </div>

          <section className="list" aria-label="Cuentas">
            {accounts.map((a, i) => {
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
                    onClick={() => onEdit(a)}
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
                  {editing && (
                    <span style={{ display: 'flex' }}>
                      <button type="button" className="icon-btn" aria-label={`Subir ${a.name}`} disabled={i === 0} onClick={() => move(i, -1)}>
                        <IconUp size={20} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Bajar ${a.name}`}
                        disabled={i === accounts.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <IconDown size={20} />
                      </button>
                    </span>
                  )}
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
