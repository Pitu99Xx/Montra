import { useMemo, useState } from 'react';
import { AccountIcon, toast } from '../components/ui';
import { SwipeRow } from '../components/SwipeRow';
import { IconBack, IconClose, IconPencil, IconPlus, IconRefresh } from '../components/Icons';
import { deleteEntries } from '../data/actions';
import { ACCOUNT_TYPES, SOURCE_LABEL, type Account, type Entry, type EntrySource } from '../data/model';
import { useStore } from '../data/store';
import { formatMoney } from '../lib/currency';
import { useBottomBand } from '../lib/viewport';

const monthLabel = (d: Date) => {
  const s = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const rowDate = (d: Date) =>
  `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;

export function SourceIcon({ source }: { source: EntrySource }) {
  const map: Record<EntrySource, { icon: React.ReactNode; color: string }> = {
    update: { icon: <IconRefresh size={18} />, color: 'var(--gold-text)' },
    migrated: { icon: <IconRefresh size={18} />, color: 'var(--gold-text)' },
    edit: { icon: <IconPencil size={18} />, color: '#9CC3F5' },
    initial: { icon: <IconPlus size={18} />, color: '#7FD1B9' },
    closed: { icon: <IconClose size={18} />, color: 'var(--danger)' },
  };
  const { icon, color } = map[source];
  return (
    <span
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        background: 'var(--surface-2)',
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {icon}
    </span>
  );
}

/** Diferencia con el registro anterior de la misma cuenta, ya formateada. */
export function deltaOf(entry: Entry, prev: Entry | undefined): { text: string; cls: string } {
  if (!prev) return { text: '', cls: 'delta-same' };
  const d = entry.balance - prev.balance;
  if (Math.abs(d) < 0.005) return { text: 'sin cambios', cls: 'delta-same' };
  return {
    text: `${d > 0 ? '+' : '−'}${formatMoney(Math.abs(d), entry.currency)}`,
    cls: d > 0 ? 'delta-up' : 'delta-down',
  };
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const w = 340;
  const h = 72;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [6 + (i * (w - 12)) / (values.length - 1), 6 + (h - 12) * (1 - (v - min) / span)]);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label="Evolución del saldo de la cuenta">
      <polyline
        points={pts.map((p) => p.join(',')).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="spark-line"
      />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 4.5 : 3} fill={color} />
      ))}
    </svg>
  );
}

export function AccountDetail({
  account,
  closing,
  backLabel,
  onBack,
  onEditAccount,
  onEditEntry,
  onAddEntry,
}: {
  account: Account;
  closing: boolean;
  /** Texto del botón de volver (por defecto «Cuentas»; en una subcuenta, su cuenta) */
  backLabel?: string;
  onBack: () => void;
  onEditAccount: () => void;
  onEditEntry: (e: Entry) => void;
  onAddEntry: () => void;
}) {
  const { uid, entries, series, user, valueIn } = useStore();
  useBottomBand('--bg');
  const [open, setOpen] = useState<string | null>(null);
  const base = user.baseCurrency;

  // Historial de la cuenta, del más reciente al más antiguo, con la diferencia respecto al anterior
  const rows = useMemo(() => {
    const own = entries
      .filter((e) => e.accountId === account.id)
      .sort((a, b) => a.at.getTime() - b.at.getTime() || a.createdAt.getTime() - b.createdAt.getTime());
    return own.map((e, i) => ({ entry: e, delta: deltaOf(e, own[i - 1]) })).reverse();
  }, [entries, account.id]);

  const months = useMemo(() => {
    const out: { label: string; rows: typeof rows }[] = [];
    for (const r of rows) {
      const label = monthLabel(r.entry.at);
      const g = out[out.length - 1];
      if (g?.label === label) g.rows.push(r);
      else out.push({ label, rows: [r] });
    }
    return out;
  }, [rows]);

  const spark = useMemo(
    () => series.filter((p) => p.accounts[account.id]).map((p) => p.accounts[account.id].native),
    [series, account.id],
  );

  const conv = account.currency !== base ? valueIn(account.balance, account.currency) : null;
  const latest = rows[0]?.entry;
  const typeLabel = ACCOUNT_TYPES.find((t) => t.id === account.type)?.label ?? '';

  const remove = async (e: Entry) => {
    setOpen(null);
    if (rows.length <= 1) {
      toast('Es el único registro de la cuenta', { sub: 'Para quitarlo, elimina la cuenta desde «Editar».' });
      return;
    }
    const undo = await deleteEntries(uid, [e], entries);
    toast('Registro eliminado', {
      sub: 'La gráfica ya no lo tiene en cuenta',
      action: { label: 'Deshacer', run: undo },
    });
  };

  return (
    <div className={`detail-view${closing ? ' closing' : ''}`} role="dialog" aria-label={account.name}>
      <main className="screen">
        <header className="screen-header">
          <button
            type="button"
            className="link-btn"
            onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: 2 }}
          >
            <IconBack size={22} /> {backLabel ?? 'Cuentas'}
          </button>
          <button type="button" className="link-btn" onClick={onEditAccount}>
            Editar
          </button>
        </header>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <AccountIcon currency={account.currency} color={account.color} size={56} />
          <div className="row-main">
            <h1 className="serif" style={{ margin: 0, fontSize: 28, fontWeight: 500 }}>
              {account.name}
            </h1>
            <span className="row-sub" style={{ fontSize: 14 }}>
              {account.currency} · {typeLabel}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="num" style={{ fontSize: 40, fontWeight: 500 }}>
            {formatMoney(account.balance, account.currency)}
          </span>
          <span className="row-sub" style={{ fontSize: 14 }}>
            {conv !== null && `≈ ${formatMoney(conv, base)} · `}
            {latest ? `actualizado ${rowDate(latest.at).replace(' · ', ', ')}` : 'sin registros'}
          </span>
        </div>

        <Sparkline values={spark} color={account.color} />

        <button type="button" className="btn btn-primary" onClick={onAddEntry}>
          <IconPlus size={20} /> Apuntar saldo nuevo
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 4 }}>
          <span className="eyebrow">Historial</span>
          <span className="row-sub">
            {rows.length} {rows.length === 1 ? 'registro' : 'registros'} · desliza para editar o borrar
          </span>
        </div>

        {months.map((m) => (
          <section key={m.label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="month-label">{m.label}</span>
            <div className="list flush">
              {m.rows.map(({ entry, delta }) => (
                <SwipeRow
                  key={entry.id}
                  open={open === entry.id}
                  onOpenChange={(o) => setOpen(o ? entry.id : null)}
                  onTap={() => onEditEntry(entry)}
                  onEdit={() => {
                    setOpen(null);
                    onEditEntry(entry);
                  }}
                  onDelete={() => remove(entry)}
                  label={`${rowDate(entry.at)}, ${formatMoney(entry.balance, entry.currency)}`}
                >
                  <SourceIcon source={entry.source} />
                  <span className="row-main">
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{rowDate(entry.at)}</span>
                    <span className="row-sub">{entry.note ? entry.note : SOURCE_LABEL[entry.source]}</span>
                  </span>
                  <span className="row-end">
                    <span className="num" style={{ fontSize: 17 }}>
                      {formatMoney(entry.balance, entry.currency)}
                    </span>
                    {delta.text && (
                      <span className={delta.cls} style={{ fontSize: 13, fontWeight: 600 }}>
                        {delta.text}
                      </span>
                    )}
                  </span>
                </SwipeRow>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
