import { useMemo, useState } from 'react';
import { AccountIcon, Sheet, toast } from '../components/ui';
import { updateBalances } from '../data/actions';
import { computeTotalEUR, useStore } from '../data/store';
import { convert, currencySymbol, formatAmount, formatMoney, parseAmount } from '../lib/currency';

/** Pantalla para poner al día todos los saldos de una vez (la abre el recordatorio). */
export function UpdateBalances({ onClose }: { onClose: () => void }) {
  const { uid, accounts, rates, user, total } = useStore();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(accounts.map((a) => [a.id, formatAmount(a.balance, a.currency)]))
  );
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, parseAmount(values[a.id] ?? '')])),
    [accounts, values]
  );
  const invalid = Object.values(parsed).some((v) => v === null);
  const preview = useMemo(() => {
    if (invalid) return null;
    const next = accounts.map((a) => ({ ...a, balance: parsed[a.id] as number }));
    const eur = computeTotalEUR(next, rates);
    return eur === null ? null : convert(eur, 'EUR', user.baseCurrency, rates);
  }, [accounts, parsed, invalid, rates, user.baseCurrency]);

  const save = async () => {
    if (invalid) return;
    setBusy(true);
    try {
      await updateBalances(uid, parsed as Record<string, number>, accounts, rates);
      toast('Saldos actualizados');
      onClose();
    } catch (e) {
      console.error(e);
      toast('No se pudieron guardar los saldos');
      setBusy(false);
    }
  };

  const diff = preview !== null && total !== null ? preview - total : null;

  return (
    <Sheet
      title="Actualizar saldos"
      onClose={onClose}
      action={
        <button type="button" className="link-btn" onClick={save} disabled={invalid || busy}>
          Guardar
        </button>
      }
    >
      <div className="card total-card" style={{ background: 'var(--bg)' }}>
        <span className="eyebrow">Nuevo total · {user.baseCurrency}</span>
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
        {accounts.map((a) => (
          <label key={a.id} className="row" style={{ cursor: 'text' }}>
            <AccountIcon currency={a.currency} color={a.color} size={38} />
            <span className="row-main">
              <span className="row-title">{a.name}</span>
              <span className="row-sub">{a.currency}</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <input
                inputMode="decimal"
                className="num"
                aria-label={`Saldo de ${a.name}`}
                value={values[a.id] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [a.id]: e.target.value }))}
                onFocus={(e) => e.target.select()}
                style={{
                  width: 130,
                  textAlign: 'right',
                  fontSize: 18,
                  border: 'none',
                  borderBottom: `1px solid ${parsed[a.id] === null ? 'var(--danger)' : 'var(--border-strong)'}`,
                  background: 'transparent',
                  padding: '6px 0',
                  outline: 'none',
                }}
              />
              <span className="num muted">{currencySymbol(a.currency)}</span>
            </span>
          </label>
        ))}
      </div>
      <button type="button" className="btn btn-primary" onClick={save} disabled={invalid || busy}>
        Guardar saldos
      </button>
      <p className="hint">Cada vez que guardas se añade un punto nuevo a la gráfica de evolución.</p>
    </Sheet>
  );
}
