import { useMemo, useState } from 'react';
import { AccountIcon, GroupIcon, Sheet, toast, useSheetExit } from '../components/ui';
import { childrenOf, topLevel } from '../data/groups';
import type { Account } from '../data/model';
import { updateBalances } from '../data/actions';
import { computeTotalEUR, useStore } from '../data/store';
import { convert, currencySymbol, formatAmount, formatMoney, parseAmount } from '../lib/currency';

/** Pantalla para poner al día todos los saldos de una vez (la abre el recordatorio). */
export function UpdateBalances({ onClose, groupId }: { onClose: () => void; groupId?: string }) {
  const { uid, accounts: allActive, rates, user, total, valueIn } = useStore();
  const { closing, close } = useSheetExit(onClose);
  const group = groupId ? allActive.find((a) => a.id === groupId) : undefined;
  // Solo se apuntan cuentas con saldo propio (las cuentas con subcuentas suman las suyas)
  const accounts = useMemo(
    () => (groupId ? childrenOf(allActive, groupId) : allActive.filter((a) => !a.isGroup)),
    [allActive, groupId],
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(accounts.map((a) => [a.id, formatAmount(a.balance, a.currency)])),
  );
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, parseAmount(values[a.id] ?? '')])),
    [accounts, values],
  );
  const invalid = Object.values(parsed).some((v) => v === null);
  const preview = useMemo(() => {
    if (invalid) return null;
    const edited = new Map(accounts.map((a) => [a.id, parsed[a.id] as number]));
    const next = allActive.map((a) => (edited.has(a.id) ? { ...a, balance: edited.get(a.id)! } : a));
    const scope = groupId ? next.filter((a) => a.parentId === groupId) : next;
    const eur = computeTotalEUR(scope, rates);
    return eur === null ? null : convert(eur, 'EUR', user.baseCurrency, rates);
  }, [accounts, allActive, groupId, parsed, invalid, rates, user.baseCurrency]);
  const groupTotal = group
    ? (() => {
        let sum = 0;
        for (const c of childrenOf(allActive, group.id)) {
          if (!c.includeInTotal) continue;
          const v = valueIn(c.balance, c.currency);
          if (v === null) return null;
          sum += v;
        }
        return sum;
      })()
    : null;
  const before = group ? groupTotal : total;

  // Suma en vivo de una cuenta con subcuentas mientras se escriben sus saldos
  const liveGroupSum = (g: Account) => {
    let sum = 0;
    for (const c of childrenOf(allActive, g.id)) {
      if (!c.includeInTotal) continue;
      const v = parsed[c.id];
      if (v === null || v === undefined) return null;
      const b = valueIn(v, c.currency);
      if (b === null) return null;
      sum += b;
    }
    return sum;
  };

  const input = (a: Account, small = false) => (
    <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <input
        inputMode="decimal"
        className="num"
        aria-label={`Saldo de ${a.name}`}
        value={values[a.id] ?? ''}
        onChange={(e) => setValues((v) => ({ ...v, [a.id]: e.target.value }))}
        onFocus={(e) => e.target.select()}
        style={{
          width: small ? 116 : 130,
          textAlign: 'right',
          fontSize: small ? 16 : 18,
          border: 'none',
          borderBottom: `1px solid ${parsed[a.id] === null ? 'var(--danger)' : 'var(--border-strong)'}`,
          background: 'transparent',
          padding: '6px 0',
          outline: 'none',
        }}
      />
      <span className="num muted">{currencySymbol(a.currency)}</span>
    </span>
  );

  const plainRow = (a: Account) => (
    <label key={a.id} className="row" style={{ cursor: 'text' }}>
      <AccountIcon currency={a.currency} color={a.color} size={38} />
      <span className="row-main">
        <span className="row-title">{a.name}</span>
        <span className="row-sub">{a.currency}</span>
      </span>
      {input(a)}
    </label>
  );

  const save = async () => {
    if (invalid) return;
    setBusy(true);
    try {
      await updateBalances(uid, parsed as Record<string, number>, accounts, rates);
      toast('Saldos actualizados');
      close();
    } catch (e) {
      console.error(e);
      toast('No se pudieron guardar los saldos');
      setBusy(false);
    }
  };

  const diff = preview !== null && before !== null ? preview - before : null;

  return (
    <Sheet
      title={group ? group.name : 'Actualizar saldos'}
      onClose={close}
      closing={closing}
      action={
        <button type="button" className="link-btn" onClick={save} disabled={invalid || busy}>
          Guardar
        </button>
      }
    >
      <div className="card total-card" style={{ background: 'var(--bg)' }}>
        <span className="eyebrow">
          {group ? `Nuevo saldo de ${group.name}` : 'Nuevo total'} · {user.baseCurrency}
        </span>
        <span className="num total-value" style={{ fontSize: 34 }}>
          {preview !== null ? formatMoney(preview, user.baseCurrency) : '—'}
        </span>
        {diff !== null && Math.abs(diff) >= 0.005 && (
          <span style={{ color: 'var(--gold-text)', fontWeight: 600, fontSize: 14 }}>
            {diff > 0 ? '+' : ''}
            {formatMoney(diff, user.baseCurrency)} respecto al último registro
          </span>
        )}
      </div>

      <div className="list">
        {groupId
          ? accounts.map(plainRow)
          : topLevel(allActive).map((a) => {
              if (!a.isGroup) return plainRow(a);
              const kids = childrenOf(allActive, a.id);
              if (!kids.length) return null;
              const sum = liveGroupSum(a);
              return (
                <div key={a.id} className="group-block">
                  <div className="row" style={{ borderBottom: 'none', paddingBottom: 4 }}>
                    <GroupIcon name={a.name} color={a.color} back={kids[1]?.color} size={38} />
                    <span className="row-main">
                      <span className="row-title">{a.name}</span>
                    </span>
                    <span className="num muted" style={{ fontSize: 16 }}>
                      {sum !== null ? formatMoney(sum, user.baseCurrency) : '—'}
                    </span>
                  </div>
                  <div className="sub-list">
                    {kids.map((c) => (
                      <label key={c.id} className="row sub-row" style={{ cursor: 'text' }}>
                        <AccountIcon currency={c.currency} color={c.color} size={28} />
                        <span className="row-main">
                          <span style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</span>
                        </span>
                        {input(c, true)}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
      </div>
      <button type="button" className="btn btn-primary" onClick={save} disabled={invalid || busy}>
        Guardar saldos
      </button>
      <p className="hint">Cada vez que guardas se añade un punto nuevo a la gráfica de evolución.</p>
    </Sheet>
  );
}
