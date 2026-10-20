import { useMemo, useState } from 'react';
import { CURRENCIES, currencyName, currencySymbol } from '../lib/currency';
import { Sheet } from '../components/ui';
import { IconSearch } from '../components/Icons';

export function CurrencyPicker({
  title = 'Divisa',
  value,
  onPick,
  onClose,
}: {
  title?: string;
  value: string;
  onPick: (code: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return CURRENCIES.filter((c) => !s || c.toLowerCase().includes(s) || currencyName(c).toLowerCase().includes(s));
  }, [q]);
  return (
    <Sheet title={title} onClose={onClose}>
      <label className="field">
        <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconSearch size={16} /> Buscar
        </span>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Dólar, JPY, yuan…" />
      </label>
      <div className="list">
        {list.map((c) => (
          <button
            type="button"
            key={c}
            className="row"
            aria-pressed={c === value}
            onClick={() => {
              onPick(c);
              onClose();
            }}
          >
            <span className="acc-icon" style={{ background: 'var(--surface-2)', color: 'var(--gold-text)', width: 38, height: 38 }}>
              {currencySymbol(c)}
            </span>
            <span className="row-main">
              <span className="row-title">{currencyName(c)}</span>
              <span className="row-sub">{c}</span>
            </span>
            {c === value && <span style={{ color: 'var(--gold-text)', fontWeight: 700 }}>✓</span>}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
