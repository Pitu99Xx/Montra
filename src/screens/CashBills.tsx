import { useMemo, useState } from 'react';
import { toast } from '../components/ui';
import { IconBack, IconScale, IconTrash } from '../components/Icons';
import { cashBalance, deleteCashCount, notesTotal, restoreCashCount } from '../data/cash';
import { CASH_NOTES, type Account, type CashCount } from '../data/model';
import { useStore } from '../data/store';
import { formatMoney } from '../lib/currency';
import { DESKTOP_QUERY, useMedia } from '../lib/useMedia';
import { useBottomBand } from '../lib/viewport';

/** Color de cada billete (parecido al de los billetes de euro) */
export const NOTE_COLORS: Record<number, string> = {
  200: '#E8D5A8',
  100: '#7FD1B9',
  50: '#F2A38E',
  20: '#9CC3F5',
  10: '#F0A6CA',
  5: '#A9B6C9',
};
const COINS_COLOR = '#C9A45C';

const when = (t: number) =>
  `${new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })} · ${new Date(
    t,
  ).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;

/** «Cuadraba» o «Ajuste de −25,00 €» */
function resultLabel(c: CashCount, code: string): { text: string; cls: string } {
  const d = Math.round((c.total - c.expected) * 100) / 100;
  if (Math.abs(d) < 0.005) return { text: 'Cuadraba', cls: 'ok-text' };
  return {
    text: `Ajuste de ${d > 0 ? '+' : '−'}${formatMoney(Math.abs(d), code)}`,
    cls: d > 0 ? 'delta-up' : 'delta-down',
  };
}

/** «−3 de 50 €, +4 de 20 €» respecto al recuento anterior con billetes */
function changes(c: CashCount, prev: CashCount | undefined, code: string): string | null {
  if (!c.notes || !prev?.notes) return null;
  const parts = CASH_NOTES.map((n) => {
    const d = (c.notes![n] ?? 0) - (prev.notes![n] ?? 0);
    return d ? `${d > 0 ? '+' : '−'}${Math.abs(d)} de ${formatMoney(n, code).replace(',00', '')}` : null;
  }).filter(Boolean);
  return parts.length ? `Respecto al anterior: ${parts.join(', ')}` : 'Mismos billetes que en el anterior';
}

/** «Tus billetes»: el desglose del último recuento, si cuadra con el saldo, y el historial de recuentos. */
export function CashBills({
  account,
  closing,
  onBack,
  onRecount,
}: {
  account: Account;
  closing: boolean;
  onBack: () => void;
  onRecount: () => void;
}) {
  const { uid, cash, cashCounts } = useStore();
  useBottomBand('--bg');
  const isDesktop = useMedia(DESKTOP_QUERY);
  const [open, setOpen] = useState<string | null>(null);
  const code = account.currency;
  const balance = cashBalance(cash);
  const last = cashCounts.at(-1);
  const lastWithNotes = [...cashCounts].reverse().find((c) => c.notes);
  const history = useMemo(() => [...cashCounts].reverse(), [cashCounts]);

  // El desglose es el del último recuento con billetes; se compara con el saldo de ahora
  const shown = lastWithNotes;
  const shownTotal = shown ? notesTotal(shown.notes, shown.coins) : 0;
  const mismatch = shown ? Math.round((balance - shownTotal) * 100) / 100 : 0;
  const since = shown ? cash.filter((m) => (m.createdAt ?? m.pos) > shown.at).length : 0;
  const tiles = shown
    ? [
        ...CASH_NOTES.map((n) => ({
          key: String(n),
          label: formatMoney(n, code).replace(',00', ''),
          color: NOTE_COLORS[n],
          count: shown.notes![n] ?? 0,
          value: n * (shown.notes![n] ?? 0),
          note: true,
        })),
        { key: 'coins', label: 'Monedas', color: COINS_COLOR, count: 0, value: shown.coins, note: false },
      ]
    : [];
  const noteCount = tiles.reduce((s, t) => s + (t.note ? t.count : 0), 0);

  const remove = async (c: CashCount) => {
    await deleteCashCount(uid, c);
    setOpen(null);
    toast('Recuento eliminado', {
      sub: 'Tus movimientos no cambian',
      action: { label: 'Deshacer', run: () => restoreCashCount(uid, c) },
    });
  };

  const status = shown && (
    <section className="card total-card" style={{ gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <span className="num" style={{ fontSize: 34, fontWeight: 500 }}>
          {formatMoney(shownTotal, code)}
        </span>
        <span className={`status-chip ${Math.abs(mismatch) < 0.005 ? 'ok' : 'warn'}`}>
          {Math.abs(mismatch) < 0.005 ? 'Cuadra' : 'Descuadre'}
        </span>
      </div>
      <span className="row-sub" style={{ fontSize: 13, lineHeight: 1.5 }}>
        {Math.abs(mismatch) < 0.005
          ? `Contado el ${when(shown.at)}. Coincide con tu saldo.`
          : `Tus billetes suman ${formatMoney(shownTotal, code)} y el saldo es ${formatMoney(balance, code)} (${mismatch > 0 ? '+' : '−'}${formatMoney(Math.abs(mismatch), code)}). ${since ? `Desde el recuento del ${when(shown.at)} has apuntado ${since} ${since === 1 ? 'movimiento' : 'movimientos'}: recuenta para ponerlo al día.` : `Recuenta para ponerlo al día.`}`}
      </span>
      {shownTotal > 0 && (
        <div className="bill-bar" aria-hidden="true">
          {tiles
            .filter((t) => t.value > 0)
            .map((t) => (
              <span key={t.key} style={{ width: `${(t.value / shownTotal) * 100}%`, background: t.color }} />
            ))}
        </div>
      )}
    </section>
  );

  const grid = shown && (
    <>
      <div className={`bill-grid${isDesktop ? ' wide' : ''}`}>
        {tiles.map((t) => (
          <div key={t.key} className="bill-tile">
            <span className="bill-face" style={{ background: t.color }}>
              {t.label}
            </span>
            <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className="num" style={{ fontSize: 20 }}>
                {t.note ? `× ${t.count}` : ' '}
              </span>
              <span className="num muted" style={{ fontSize: 15 }}>
                {formatMoney(t.value, code)}
              </span>
            </span>
          </div>
        ))}
      </div>
      <span className="row-sub" style={{ padding: '0 4px' }}>
        {noteCount} {noteCount === 1 ? 'billete' : 'billetes'} · recuento del {when(shown.at)}
        {last && last !== shown ? ' (el último fue solo el total)' : ''}
      </span>
    </>
  );

  const historyList = (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span className="eyebrow" style={{ padding: '0 4px' }}>
        Recuentos
      </span>
      {history.map((c, i) => {
        const r = resultLabel(c, code);
        const isOpen = open === c.id;
        const ch = changes(
          c,
          history.slice(i + 1).find((p) => p.notes),
          code,
        );
        return (
          <div
            key={c.id}
            className="card"
            style={{ overflow: 'hidden', borderColor: isOpen ? 'var(--gold)' : undefined }}
          >
            <button
              type="button"
              className="row"
              style={{ padding: '12px 16px', border: 'none' }}
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : c.id)}
            >
              <span className="row-main">
                <span style={{ fontSize: 15, fontWeight: 600 }}>{when(c.at)}</span>
                <span className={r.cls} style={{ fontSize: 12, fontWeight: 600 }}>
                  {r.text}
                  {c.notes ? '' : ' · solo el total'}
                </span>
              </span>
              <span className="num" style={{ fontSize: 19 }}>
                {formatMoney(c.total, code)}
              </span>
            </button>
            {isOpen && (
              <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {c.notes && (
                  <div className="chips" style={{ gap: 6 }}>
                    {CASH_NOTES.filter((n) => c.notes![n]).map((n) => (
                      <span key={n} className="bill-pill">
                        <span className="dot" style={{ background: NOTE_COLORS[n], width: 8, height: 8 }} />
                        {formatMoney(n, code).replace(',00', '')} × {c.notes![n]}
                      </span>
                    ))}
                    {c.coins > 0 && <span className="bill-pill">Monedas {formatMoney(c.coins, code)}</span>}
                  </div>
                )}
                {ch && <span className="row-sub">{ch}</span>}
                <span className="row-sub">Montra calculaba {formatMoney(c.expected, code)} en ese momento.</span>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ height: 42, fontSize: 14 }}
                  onClick={() => remove(c)}
                >
                  <IconTrash size={16} /> Eliminar recuento
                </button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );

  return (
    <div
      className={`detail-view${isDesktop ? ' wide' : ''}${closing ? ' closing' : ''}`}
      role="dialog"
      aria-label="Tus billetes"
    >
      <main className="screen">
        <header className="screen-header">
          <button
            type="button"
            className="link-btn"
            onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: 2 }}
          >
            <IconBack size={22} /> {account.name}
          </button>
          <span className="glass-group">
            <button type="button" className="icon-btn" aria-label="Recontar" onClick={onRecount}>
              <IconScale size={20} />
            </button>
          </span>
        </header>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h1 className="serif" style={{ margin: 0, fontSize: 30, fontWeight: 500 }}>
            Tus billetes
          </h1>
          <span className="row-sub" style={{ fontSize: 14 }}>
            Lo que tenías en el último recuento, billete a billete
          </span>
        </div>

        {!shown && (
          <section className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 16 }}>Aún no has contado tus billetes</span>
            <span className="row-sub" style={{ fontSize: 14, lineHeight: 1.5 }}>
              Cuenta cuántos tienes de cada tipo: se guarda el desglose y Montra te avisará si deja de cuadrar con tu
              saldo.
            </span>
          </section>
        )}

        {isDesktop ? (
          <div className="cash-cols">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
              {status}
              {grid}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
              {history.length > 0 && historyList}
            </div>
          </div>
        ) : (
          <>
            {status}
            {grid}
          </>
        )}

        <button type="button" className="btn btn-primary" onClick={onRecount}>
          <IconScale size={18} /> {shown ? 'Recontar' : 'Contar billetes'}
        </button>

        {!isDesktop && history.length > 0 && historyList}
      </main>
    </div>
  );
}
