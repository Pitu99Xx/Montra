import { useMemo, useState } from 'react';
import { Sheet, toast, useSheetExit } from '../components/ui';
import { IconTrash, IconUpload } from '../components/Icons';
import { DateSelect } from '../components/DateSelect';
import {
  cashBalance,
  deleteCashMovement,
  frequentConcepts,
  newCashId,
  posForDate,
  replaceCashMovements,
  saveCashMovement,
  signedAmount,
  sortCash,
} from '../data/cash';
import type { Account, CashMovement } from '../data/model';
import { useStore } from '../data/store';
import { currencySymbol, formatAmount, formatMoney, parseAmount } from '../lib/currency';
import { parseCashSheet, type ImportResult } from '../lib/cashImport';
import { readFirstSheet } from '../lib/xlsx';
import { cashDateLabel } from './CashDetail';

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDay(new Date());
const yesterday = () => isoDay(new Date(Date.now() - 86_400_000));

type DateChoice = 'today' | 'yesterday' | 'other' | 'none';

/** Nuevo gasto o ingreso en efectivo (o editar uno). */
export function CashMovementEditor({
  account,
  movement,
  initialKind,
  onClose,
}: {
  account: Account;
  movement: CashMovement | null;
  initialKind: 'income' | 'expense';
  onClose: () => void;
}) {
  const { uid, cash, rates } = useStore();
  const { closing, close } = useSheetExit(onClose);
  const code = account.currency;
  const isAdjust = movement?.kind === 'adjust';
  const [kind, setKind] = useState<'income' | 'expense'>(
    movement ? (signedAmount(movement) >= 0 ? 'income' : 'expense') : initialKind,
  );
  const [amountText, setAmountText] = useState(movement ? formatAmount(Math.abs(movement.amount), code) : '');
  const [concept, setConcept] = useState(movement?.concept ?? '');
  const [note, setNote] = useState(movement?.note ?? '');
  const initialChoice: DateChoice = !movement
    ? 'today'
    : !movement.date
      ? 'none'
      : movement.date === today()
        ? 'today'
        : movement.date === yesterday()
          ? 'yesterday'
          : 'other';
  const [choice, setChoice] = useState<DateChoice>(initialChoice);
  const [other, setOther] = useState(movement?.date ?? today());
  const [busy, setBusy] = useState(false);

  const parsed = parseAmount(amountText);
  const amount = parsed === null ? null : Math.abs(parsed);
  const date = choice === 'today' ? today() : choice === 'yesterday' ? yesterday() : choice === 'other' ? other : null;
  const valid = amount !== null && amount > 0 && concept.trim().length > 0;
  const signedValue = amount === null ? 0 : kind === 'income' ? amount : -amount;
  const others = cash.filter((m) => m.id !== movement?.id);
  const after = cashBalance(others) + signedValue;
  const suggestions = useMemo(() => frequentConcepts(others, kind), [others, kind]);

  const save = async () => {
    if (!valid || amount === null) return;
    setBusy(true);
    // Posición: su fecha; sin fecha, la que ya tenía (o ahora, si es nuevo)
    const pos = date ? posForDate(date) : (movement?.pos ?? Date.now());
    const next: CashMovement = {
      id: movement?.id ?? newCashId(),
      kind: isAdjust ? 'adjust' : kind,
      amount: isAdjust ? signedValue : amount,
      concept: concept.trim(),
      date,
      pos,
      createdAt: movement?.createdAt ?? Date.now(),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    try {
      await saveCashMovement(uid, account, next, cash, rates);
      toast(movement ? 'Movimiento actualizado' : kind === 'income' ? 'Ingreso apuntado' : 'Gasto apuntado', {
        sub: `Te quedan ${formatMoney(after, code)} en efectivo`,
      });
      close();
    } catch (e) {
      console.error(e);
      toast('No se pudo guardar el movimiento');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!movement) return;
    setBusy(true);
    try {
      await deleteCashMovement(uid, account, movement, cash, rates);
      toast('Movimiento eliminado', {
        action: {
          label: 'Deshacer',
          run: () =>
            saveCashMovement(
              uid,
              account,
              movement,
              cash.filter((m) => m.id !== movement.id),
              rates,
            ),
        },
      });
      close();
    } catch (e) {
      console.error(e);
      toast('No se pudo eliminar');
      setBusy(false);
    }
  };

  const title = isAdjust
    ? 'Ajuste de caja'
    : movement
      ? 'Editar movimiento'
      : kind === 'income'
        ? 'Ingreso en efectivo'
        : 'Gasto en efectivo';

  return (
    <Sheet
      title={title}
      onClose={close}
      closing={closing}
      action={
        <button type="button" className="link-btn" onClick={save} disabled={!valid || busy}>
          Guardar
        </button>
      }
    >
      <div className="segmented" role="group" aria-label="Tipo">
        <button type="button" aria-pressed={kind === 'expense'} onClick={() => setKind('expense')}>
          Gasto
        </button>
        <button type="button" aria-pressed={kind === 'income'} onClick={() => setKind('income')}>
          Ingreso
        </button>
      </div>

      <label className="field">
        <span className="label">Importe</span>
        <span className="amount-input">
          <input
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="0,00"
            aria-label="Importe"
            autoFocus={!movement}
          />
          <span>{currencySymbol(code)}</span>
        </span>
        <span className="hint" style={{ padding: 0 }}>
          Te quedarán <b>{formatMoney(after, code)}</b> en efectivo
        </span>
      </label>

      <div className="field">
        <span className="label">Concepto</span>
        <input
          className="input"
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder={kind === 'expense' ? 'Consum' : 'Boda'}
          maxLength={60}
          aria-label="Concepto"
        />
        {suggestions.length > 0 && (
          <div className="chips">
            {suggestions.map((s) => (
              <button
                type="button"
                key={s.concept}
                className="chip round"
                aria-pressed={concept.trim().toLowerCase() === s.concept.toLowerCase()}
                onClick={() => {
                  setConcept(s.concept);
                  setAmountText(formatAmount(s.amount, code));
                }}
                style={{ minHeight: 34, fontSize: 13 }}
              >
                {s.concept} <span className="muted">{formatMoney(s.amount, code)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="field">
        <span className="label">Fecha</span>
        <div className="segmented" role="group" aria-label="Fecha">
          <button type="button" aria-pressed={choice === 'today'} onClick={() => setChoice('today')}>
            Hoy
          </button>
          <button type="button" aria-pressed={choice === 'yesterday'} onClick={() => setChoice('yesterday')}>
            Ayer
          </button>
          <button type="button" aria-pressed={choice === 'other'} onClick={() => setChoice('other')}>
            Otra
          </button>
          <button type="button" aria-pressed={choice === 'none'} onClick={() => setChoice('none')}>
            Sin fecha
          </button>
        </div>
        {choice === 'other' && <DateSelect exact value={other} onChange={setOther} label="Fecha" />}
        {choice === 'none' && (
          <span className="hint" style={{ padding: 0 }}>
            {movement ? 'Se queda en el mismo lugar de la lista.' : 'Se coloca como el movimiento más reciente.'}
          </span>
        )}
      </div>

      <label className="field">
        <span className="label">Nota (opcional)</span>
        <input className="input" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} />
      </label>

      <button type="button" className="btn btn-primary" onClick={save} disabled={!valid || busy}>
        {movement ? 'Guardar cambios' : kind === 'income' ? 'Guardar ingreso' : 'Guardar gasto'}
      </button>
      {movement && (
        <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
          <IconTrash size={18} /> Eliminar movimiento
        </button>
      )}
    </Sheet>
  );
}

const NOTES = [500, 200, 100, 50, 20, 10, 5];

/** Cuadrar la caja: cuentas billetes y monedas; la diferencia se apunta como ajuste. */
export function CashCountSheet({ account, onClose }: { account: Account; onClose: () => void }) {
  const { uid, cash, rates } = useStore();
  const { closing, close } = useSheetExit(onClose);
  const code = account.currency;
  const [mode, setMode] = useState<'count' | 'total'>('count');
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [coinsText, setCoinsText] = useState('');
  const [totalText, setTotalText] = useState('');
  const [busy, setBusy] = useState(false);

  const coins = parseAmount(coinsText) ?? 0;
  const counted =
    mode === 'count' ? NOTES.reduce((s, n) => s + n * (counts[n] ?? 0), 0) + coins : (parseAmount(totalText) ?? null);
  const expected = cashBalance(cash);
  const diff = counted === null ? null : Math.round((counted - expected) * 100) / 100;

  const step = (n: number, d: number) => setCounts((c) => ({ ...c, [n]: Math.max(0, (c[n] ?? 0) + d) }));

  const apply = async () => {
    if (diff === null) return;
    if (Math.abs(diff) < 0.005) {
      toast('La caja cuadra', { sub: 'No hace falta ningún ajuste' });
      close();
      return;
    }
    setBusy(true);
    const d = today();
    try {
      await saveCashMovement(
        uid,
        account,
        {
          id: newCashId(),
          kind: 'adjust',
          amount: diff,
          concept: 'Ajuste de caja',
          date: d,
          pos: Date.now(),
          createdAt: Date.now(),
        },
        cash,
        rates,
      );
      toast('Ajuste apuntado', { sub: `Ahora tienes ${formatMoney(counted!, code)} en efectivo` });
      close();
    } catch (e) {
      console.error(e);
      toast('No se pudo apuntar el ajuste');
      setBusy(false);
    }
  };

  return (
    <Sheet title="Cuadrar la caja" onClose={close} closing={closing}>
      <p className="hint" style={{ textAlign: 'center' }}>
        Cuenta lo que tienes. Si no coincide con lo que calcula Montra, se apunta un ajuste por la diferencia.
      </p>
      <div className="segmented" role="group" aria-label="Cómo contar">
        <button type="button" aria-pressed={mode === 'count'} onClick={() => setMode('count')}>
          Contar billetes
        </button>
        <button type="button" aria-pressed={mode === 'total'} onClick={() => setMode('total')}>
          Escribir el total
        </button>
      </div>

      {mode === 'count' ? (
        <div className="list">
          <span className="row-sub" style={{ padding: '10px 0 2px' }}>
            Billetes
          </span>
          {NOTES.map((n) => (
            <div key={n} className="denom">
              <span className="row-main" style={{ fontSize: 15, fontWeight: 600 }}>
                {n} {currencySymbol(code)}
              </span>
              <button
                type="button"
                className="step"
                aria-label={`Quitar un billete de ${n}`}
                onClick={() => step(n, -1)}
              >
                −
              </button>
              <span className="num" style={{ width: 30, textAlign: 'center', fontSize: 18 }}>
                {counts[n] ?? 0}
              </span>
              <button
                type="button"
                className="step"
                aria-label={`Añadir un billete de ${n}`}
                onClick={() => step(n, 1)}
              >
                +
              </button>
              <span className="num" style={{ width: 82, textAlign: 'right', fontSize: 16 }}>
                {formatMoney(n * (counts[n] ?? 0), code)}
              </span>
            </div>
          ))}
          <label className="denom">
            <span className="row-main" style={{ fontSize: 15, fontWeight: 600 }}>
              Monedas
            </span>
            <input
              className="num"
              inputMode="decimal"
              value={coinsText}
              onChange={(e) => setCoinsText(e.target.value)}
              placeholder="0,00"
              aria-label="Monedas"
              style={{
                width: 110,
                textAlign: 'right',
                fontSize: 16,
                border: 'none',
                borderBottom: '1px solid var(--border-strong)',
                background: 'transparent',
                padding: '6px 0',
                outline: 'none',
              }}
            />
          </label>
        </div>
      ) : (
        <label className="field">
          <span className="label">Tienes en total</span>
          <span className="amount-input">
            <input
              inputMode="decimal"
              value={totalText}
              onChange={(e) => setTotalText(e.target.value)}
              placeholder="0,00"
              aria-label="Total"
              autoFocus
            />
            <span>{currencySymbol(code)}</span>
          </span>
        </label>
      )}

      <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="muted">Has contado</span>
          <span className="num" style={{ fontSize: 19 }}>
            {counted !== null ? formatMoney(counted, code) : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="muted">Según Montra</span>
          <span className="num" style={{ fontSize: 19 }}>
            {formatMoney(expected, code)}
          </span>
        </div>
        <div style={{ borderTop: '1px solid var(--border)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
          <span>Diferencia</span>
          <span className={diff === null || Math.abs(diff) < 0.005 ? '' : diff > 0 ? 'delta-up' : 'delta-down'}>
            {diff === null
              ? '—'
              : Math.abs(diff) < 0.005
                ? 'Cuadra'
                : `${diff > 0 ? '+' : '−'}${formatMoney(Math.abs(diff), code)}`}
          </span>
        </div>
      </div>

      <button type="button" className="btn btn-primary" disabled={diff === null || busy} onClick={apply}>
        {diff !== null && Math.abs(diff) >= 0.005
          ? `Apuntar ajuste de ${diff > 0 ? '+' : '−'}${formatMoney(Math.abs(diff), code)}`
          : 'Listo'}
      </button>
    </Sheet>
  );
}

/** Importar el Excel de efectivo: sustituye los movimientos y rehace el historial de la cuenta. */
export function CashImportSheet({ account, onClose }: { account: Account; onClose: () => void }) {
  const { uid, cash, rates } = useStore();
  const { closing, close } = useSheetExit(onClose);
  const code = account.currency;
  const [file, setFile] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    setResult(null);
    setFile(f.name);
    try {
      setResult(parseCashSheet(readFirstSheet(await f.arrayBuffer())));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo');
    }
  };

  const balance = result ? Math.round((result.income.total - result.expense.total) * 100) / 100 : null;
  const sample = result
    ? sortCash(result.movements.map((m, i) => ({ ...m, id: String(i) })))
        .reverse()
        .slice(0, 6)
    : [];

  const doImport = async () => {
    if (!result) return;
    if (cash.length && !confirm(`Se sustituirán los ${cash.length} movimientos que ya tienes. ¿Continuar?`)) return;
    setBusy(true);
    try {
      const movements = result.movements.map((m) => ({ ...m, id: newCashId() }));
      await replaceCashMovements(uid, account, movements, cash, rates);
      toast(`${movements.length} movimientos importados`, { sub: `Saldo en efectivo: ${formatMoney(balance!, code)}` });
      close();
    } catch (e) {
      console.error(e);
      toast('No se pudo importar');
      setBusy(false);
    }
  };

  return (
    <Sheet title="Importar Excel" onClose={close} closing={closing}>
      <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
        <IconUpload size={18} /> {file ? 'Elegir otro archivo' : 'Elegir archivo .xlsx'}
        <input type="file" accept=".xlsx" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      {!result && !error && (
        <p className="hint">
          Columnas de concepto con su «Cantidad» a la derecha: las que se titulan «Gastos» se importan como gastos y el
          resto como ingresos. Las fechas pueden ir en la celda o dentro del concepto («Paqui 30/10/2025»).
        </p>
      )}
      {error && <p className="error">{error}</p>}

      {result && (
        <>
          <div
            className="card"
            style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="row-sub">{result.income.count} ingresos</span>
              <span className="num delta-up" style={{ fontSize: 20 }}>
                +{formatMoney(result.income.total, code)}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="row-sub">{result.expense.count} gastos</span>
              <span className="num delta-down" style={{ fontSize: 20 }}>
                −{formatMoney(result.expense.total, code)}
              </span>
            </div>
            <div
              style={{
                gridColumn: 'span 2',
                borderTop: '1px solid var(--border)',
                paddingTop: 10,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <span style={{ fontWeight: 600 }}>Saldo resultante</span>
              <span className="num" style={{ fontSize: 24 }}>
                {formatMoney(balance!, code)}
              </span>
            </div>
          </div>
          <p className="hint">
            {result.movements.length - result.undated} movimientos tienen fecha (la del concepto se separa y el concepto
            queda limpio). {result.undated} no la tienen: se quedan sin fecha, colocados según su orden en el Excel.
          </p>
          <div className="list">
            {sample.map((m) => (
              <div key={m.id} className="row" style={{ minHeight: 0, padding: '9px 0' }}>
                <span className="row-sub" style={{ width: 86 }}>
                  {cashDateLabel(m)}
                </span>
                <span className="row-main" style={{ fontWeight: 600, fontSize: 14 }}>
                  {m.concept}
                </span>
                <span className={`num ${m.kind === 'income' ? 'delta-up' : 'delta-down'}`}>
                  {m.kind === 'income' ? '+' : '−'}
                  {formatMoney(m.amount, code)}
                </span>
              </div>
            ))}
          </div>
          {Math.abs(account.balance - balance!) >= 0.005 && (
            <p className="hint">
              Tu cuenta «{account.name}» marca ahora {formatMoney(account.balance, code)}. Al importar pasará a{' '}
              {formatMoney(balance!, code)} y su historial se rehará con estos movimientos.
            </p>
          )}
          <button type="button" className="btn btn-primary" disabled={busy} onClick={doImport}>
            Importar {result.movements.length} movimientos
          </button>
        </>
      )}
    </Sheet>
  );
}
