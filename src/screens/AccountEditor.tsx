import { useState } from 'react';
import { AccountIcon, Sheet, Switch, toast } from '../components/ui';
import { ACCOUNT_COLORS, ACCOUNT_TYPES, type Account } from '../data/model';
import { deleteAccount, saveAccount } from '../data/actions';
import { useStore } from '../data/store';
import { FEATURED, currencySymbol, formatAmount, formatMoney, parseAmount } from '../lib/currency';
import { CurrencyPicker } from './CurrencyPicker';

export function AccountEditor({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { uid, accounts, rates, user, valueIn } = useStore();
  const isNew = !account;
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState(account?.type ?? 'corriente');
  const [currency, setCurrency] = useState(account?.currency ?? user.baseCurrency);
  const [color, setColor] = useState(account?.color ?? ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length].hex);
  const [amountText, setAmountText] = useState(account ? formatAmount(account.balance, account.currency) : '');
  const [include, setInclude] = useState(account?.includeInTotal ?? true);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const amount = parseAmount(amountText);
  const converted = amount !== null && currency !== user.baseCurrency ? valueIn(amount, currency) : null;
  const valid = name.trim().length > 0 && amount !== null;
  const currencyChips = FEATURED.includes(currency) ? FEATURED : [...FEATURED.slice(0, 3), currency];

  const save = async () => {
    if (!valid || amount === null) return;
    setBusy(true);
    try {
      await saveAccount(
        uid,
        {
          id: account?.id ?? '',
          name: name.trim(),
          type,
          kind: account?.kind ?? 'asset',
          currency,
          color,
          balance: amount,
          includeInTotal: include,
          order: account?.order ?? accounts.length,
        },
        accounts,
        rates
      );
      onClose();
    } catch (e) {
      toast('No se pudo guardar la cuenta');
      console.error(e);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!account || !confirm(`¿Eliminar «${account.name}»? Su historial dejará de verse en la evolución.`)) return;
    setBusy(true);
    await deleteAccount(uid, account.id, accounts, rates);
    onClose();
  };

  if (picker) {
    return <CurrencyPicker value={currency} onPick={setCurrency} onClose={() => setPicker(false)} />;
  }

  return (
    <Sheet
      title={isNew ? 'Nueva cuenta' : 'Editar cuenta'}
      onClose={onClose}
      action={
        <button type="button" className="link-btn" onClick={save} disabled={!valid || busy}>
          Guardar
        </button>
      }
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
        <AccountIcon currency={currency} color={color} size={56} />
        <label className="field" style={{ flex: 1 }}>
          <span className="label">Nombre</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cuenta nómina"
            autoFocus={isNew}
            maxLength={40}
          />
        </label>
      </div>

      <div className="field">
        <span className="label">Color</span>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
          {ACCOUNT_COLORS.map((c) => (
            <button
              type="button"
              key={c.hex}
              aria-label={c.label}
              aria-pressed={c.hex === color}
              onClick={() => setColor(c.hex)}
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                border: 'none',
                padding: 0,
                background: c.hex,
                boxShadow: c.hex === color ? '0 0 0 3px var(--surface), 0 0 0 5px var(--text)' : 'none',
              }}
            />
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label">Divisa</span>
        <div className="chips" style={{ flexWrap: 'nowrap' }}>
          {currencyChips.map((c) => (
            <button
              type="button"
              key={c}
              className="chip"
              style={{ flex: '1 1 0', justifyContent: 'center', padding: 0 }}
              aria-pressed={c === currency}
              onClick={() => setCurrency(c)}
            >
              {c} {currencySymbol(c)}
            </button>
          ))}
          <button
            type="button"
            className="chip"
            style={{ flex: '1 1 0', justifyContent: 'center', padding: 0 }}
            onClick={() => setPicker(true)}
          >
            Otra…
          </button>
        </div>
      </div>

      <div className="field">
        <span className="label">Tipo</span>
        <div className="chips">
          {ACCOUNT_TYPES.map((t) => (
            <button type="button" key={t.id} className="chip" aria-pressed={t.id === type} onClick={() => setType(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span className="label">Saldo actual</span>
        <span className="amount-input">
          <input
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="0,00"
            aria-label="Saldo actual"
          />
          <span>{currencySymbol(currency)}</span>
        </span>
        <span className="hint" style={{ padding: 0 }}>
          {currency === user.baseCurrency
            ? ' '
            : converted !== null
              ? `≈ ${formatMoney(converted, user.baseCurrency)} al cambio de hoy`
              : rates
                ? 'Sin tipo de cambio para esta divisa'
                : 'Cargando tipo de cambio…'}
        </span>
      </label>

      <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg)' }}>
        <div className="row-main">
          <span style={{ fontWeight: 600, fontSize: 15 }}>Incluir en el total</span>
          <span className="row-sub">Suma en «Cuentas» y «Evolución»</span>
        </div>
        <Switch checked={include} onChange={setInclude} label="Incluir en el total" />
      </div>

      <button type="button" className="btn btn-primary" onClick={save} disabled={!valid || busy}>
        {isNew ? 'Crear cuenta' : 'Guardar cambios'}
      </button>
      {!isNew && (
        <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
          Eliminar cuenta
        </button>
      )}
    </Sheet>
  );
}
