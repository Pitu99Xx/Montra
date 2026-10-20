import { useMemo, useState } from 'react';
import { AccountIcon, Sheet, toast, useSheetExit } from '../components/ui';
import { IconChart, IconTrash } from '../components/Icons';
import { addManualEntry, deleteEntries, updateEntry } from '../data/actions';
import { SOURCE_LABEL, type Account, type Entry } from '../data/model';
import { buildSeries, dayKey, previousEntry } from '../data/series';
import { useStore } from '../data/store';
import { currencySymbol, formatAmount, formatMoney, parseAmount } from '../lib/currency';

const pad = (n: number) => String(n).padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayLabel = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const dateTimeLabel = (d: Date) =>
  d.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Edita un registro existente o apunta uno nuevo (también de una fecha pasada). */
export function EntryEditor({
  entry,
  account,
  onClose,
}: {
  entry: Entry | null;
  account: Account;
  onClose: () => void;
}) {
  const { uid, entries, allAccounts, user, rates, series } = useStore();
  const { closing, close } = useSheetExit(onClose);
  const initialAt = entry?.at ?? new Date();
  // Un registro antiguo conserva la divisa con la que se introdujo
  const currency = entry?.currency ?? account.currency;
  const [amountText, setAmountText] = useState(formatAmount(entry?.balance ?? account.balance, currency));
  const [date, setDate] = useState(toDateInput(initialAt));
  const [time, setTime] = useState(toTimeInput(initialAt));
  const [note, setNote] = useState(entry?.note ?? '');
  const [busy, setBusy] = useState(false);

  const amount = parseAmount(amountText);
  const at = new Date(`${date}T${time || '00:00'}`);
  const future = at.getTime() > Date.now() + 5 * 60_000;
  const valid = amount !== null && !Number.isNaN(at.getTime()) && !future;
  const base = user.baseCurrency;
  const accountEntries = entries.filter((e) => e.accountId === account.id);
  // Registro anterior de la cuenta respecto a la fecha elegida, para ver la diferencia
  const prev = Number.isNaN(at.getTime())
    ? undefined
    : previousEntry(accountEntries, {
        id: entry?.id ?? '__nuevo__',
        accountId: account.id,
        balance: 0,
        currency,
        at,
        createdAt: entry?.createdAt ?? new Date(),
        source: 'edit',
      });
  const diff = prev && amount !== null && prev.currency === currency ? amount - prev.balance : null;
  const onlyOne = !!entry && accountEntries.length <= 1;

  // Vista previa: cómo queda el total de ese día en la gráfica
  const preview = useMemo(() => {
    if (!valid || amount === null) return null;
    const changed: Entry = {
      id: entry?.id ?? '__nuevo__',
      accountId: account.id,
      balance: amount,
      currency,
      at,
      createdAt: entry?.createdAt ?? new Date(),
      source: entry?.source ?? 'edit',
      rates: entry?.rates ?? rates?.rates ?? null,
    };
    const next = entry ? entries.map((e) => (e.id === entry.id ? changed : e)) : [...entries, changed];
    const after = buildSeries(next, allAccounts, base, rates?.rates);
    const day = dayKey(at);
    const before = series.find((p) => p.day === day)?.total ?? null;
    const now = after.find((p) => p.day === day)?.total ?? null;
    if (now === null || (before !== null && Math.abs(now - before) < 0.005)) return null;
    return { before, now };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, date, time, valid]);

  const save = async () => {
    if (!valid || amount === null) return;
    setBusy(true);
    try {
      if (entry) await updateEntry(uid, entry, { balance: amount, at, note: note.trim() }, entries);
      else await addManualEntry(uid, account, { balance: amount, at, note: note.trim() || undefined }, entries, rates);
      toast(entry ? 'Registro actualizado' : 'Saldo apuntado');
      close();
    } catch (e) {
      console.error(e);
      toast('No se pudo guardar el registro');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!entry) return;
    if (onlyOne) {
      toast('Es el único registro de la cuenta', { sub: 'Para quitarlo, elimina la cuenta desde «Editar».' });
      return;
    }
    setBusy(true);
    const undo = await deleteEntries(uid, [entry], entries);
    toast('Registro eliminado', {
      sub: 'La gráfica ya no lo tiene en cuenta',
      action: { label: 'Deshacer', run: undo },
    });
    close();
  };

  return (
    <Sheet
      title={entry ? 'Editar registro' : 'Apuntar saldo'}
      onClose={close}
      closing={closing}
      action={
        <button type="button" className="link-btn" onClick={save} disabled={!valid || busy}>
          Guardar
        </button>
      }
    >
      <div
        className="card"
        style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg)' }}
      >
        <AccountIcon currency={currency} color={account.color} size={40} />
        <span className="row-main">
          <span className="row-title">{account.name}</span>
          <span className="row-sub">
            {entry
              ? `Introducido el ${dateTimeLabel(entry.source === 'migrated' ? entry.at : entry.createdAt)} · ${SOURCE_LABEL[entry.source]}`
              : 'Nuevo registro de saldo'}
          </span>
        </span>
      </div>

      <label className="field">
        <span className="label">{entry ? 'Saldo en ese momento' : 'Saldo'}</span>
        <span className="amount-input">
          <input
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            onFocus={(e) => e.target.select()}
            aria-label="Saldo"
            autoFocus={!entry}
          />
          <span>{currencySymbol(currency)}</span>
        </span>
        <span className="hint" style={{ padding: 0 }}>
          {prev
            ? `Registro anterior (${dayLabel(prev.at)}): ${formatMoney(prev.balance, prev.currency)}${
                diff !== null && Math.abs(diff) >= 0.005
                  ? ` · ${diff > 0 ? '+' : '−'}${formatMoney(Math.abs(diff), currency)}`
                  : ' · sin cambios'
              }`
            : 'Es el primer registro de esta cuenta'}
        </span>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <label className="field">
          <span className="label">Fecha</span>
          <input
            className="input"
            type="date"
            value={date}
            max={toDateInput(new Date())}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="label">Hora</span>
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      {future && <p className="error">La fecha no puede ser futura.</p>}

      <label className="field">
        <span className="label">Nota (opcional)</span>
        <input
          className="input"
          value={note}
          maxLength={120}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Por ejemplo: incluye la transferencia del alquiler"
        />
      </label>

      {preview && (
        <div
          className="card"
          style={{
            padding: '12px 14px',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
            borderColor: 'var(--gold)',
            background: 'var(--surface-2)',
          }}
        >
          <IconChart size={20} style={{ color: 'var(--gold-text)', flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 14, lineHeight: 1.45 }}>
            {preview.before === null ? (
              <>
                La gráfica tendrá un punto nuevo el <b>{dayLabel(at)}</b>:{' '}
                <span className="num">{formatMoney(preview.now, base)}</span>.
              </>
            ) : (
              <>
                La gráfica se recalcula: el total del <b>{dayLabel(at)}</b> pasa de{' '}
                <span className="num">{formatMoney(preview.before, base)}</span> a{' '}
                <span className="num">{formatMoney(preview.now, base)}</span>.
              </>
            )}
          </span>
        </div>
      )}

      <button type="button" className="btn btn-primary" onClick={save} disabled={!valid || busy}>
        {entry ? 'Guardar cambios' : 'Apuntar saldo'}
      </button>
      {entry && (
        <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
          <IconTrash size={18} /> Eliminar registro
        </button>
      )}
    </Sheet>
  );
}
