import { useMemo, useState } from 'react';
import { AccountIcon, toast } from '../components/ui';
import { deleteEntries } from '../data/actions';
import { SOURCE_LABEL, type Account, type Entry } from '../data/model';
import { dayKey, groupEntries, previousEntry } from '../data/series';
import { accountIdsFor, topLevel } from '../data/groups';
import { useStore } from '../data/store';
import { formatMoney } from '../lib/currency';
import { SourceIcon, deltaOf } from './AccountDetail';

const PAGE = 8;
const groupDate = (d: Date) =>
  `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;

/** Registros agrupados por actualización, debajo de la gráfica de evolución. */
export function RecordsList({
  onSelectDay,
  onEditEntry,
}: {
  onSelectDay: (day: string | null) => void;
  onEditEntry: (entry: Entry, account: Account) => void;
}) {
  const { uid, entries, allAccounts, accounts, series, user } = useStore();
  const [filter, setFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const byId = useMemo(() => new Map(allAccounts.map((a) => [a.id, a])), [allAccounts]);
  const base = user.baseCurrency;

  // «Todas las cuentas»: solo las actualizaciones de saldos (ya incluyen todas las cuentas).
  // Con una cuenta elegida: todos sus registros, también los sueltos (saldo inicial, ediciones…).
  const groups = useMemo(
    () =>
      filter
        ? groupEntries(entries.filter((e) => accountIdsFor(accounts, filter).includes(e.accountId)))
        : groupEntries(entries.filter((e) => e.batchId)),
    [entries, filter, accounts],
  );
  // Con una cuenta elegida: sus registros uno a uno (sin agruparlos por actualización)
  const flat = useMemo(() => {
    if (!filter) return [];
    const ids = new Set(accountIdsFor(accounts, filter));
    return entries
      .filter((e) => ids.has(e.accountId))
      .sort((a, b) => b.at.getTime() - a.at.getTime() || b.createdAt.getTime() - a.createdAt.getTime());
  }, [entries, filter, accounts]);
  const filteredIsGroup = !!filter && !!accounts.find((a) => a.id === filter)?.isGroup;
  const shownCount = filter ? flat.length : groups.length;

  const totalsByDay = useMemo(() => new Map(series.map((p) => [p.day, p.total])), [series]);

  const toggle = (id: string, at: Date) => {
    const next = open === id ? null : id;
    setOpen(next);
    onSelectDay(next ? dayKey(at) : null);
  };

  const removeGroup = async (group: Entry[]) => {
    const ids = new Set(group.map((e) => e.id));
    const orphan = group.find((e) => !entries.some((x) => x.accountId === e.accountId && !ids.has(x.id)));
    if (orphan) {
      toast('No se puede eliminar', {
        sub: `Es el único registro de «${byId.get(orphan.accountId)?.name ?? 'una cuenta'}».`,
      });
      return;
    }
    const undo = await deleteEntries(uid, group, entries);
    setOpen(null);
    onSelectDay(null);
    toast(group.length > 1 ? 'Actualización eliminada' : 'Registro eliminado', {
      sub: 'La gráfica ya no la tiene en cuenta',
      action: { label: 'Deshacer', run: undo },
    });
  };

  if (!entries.length) return null;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="eyebrow">Registros</span>
        <span className="row-sub">{filter ? 'Toca un registro para corregirlo' : 'Toca una actualización'}</span>
      </div>
      <div className="chips" style={{ flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 2 }}>
        <button
          type="button"
          className="chip round"
          aria-pressed={filter === null}
          onClick={() => setFilter(null)}
          style={{ flexShrink: 0 }}
        >
          Todas las cuentas
        </button>
        {topLevel(accounts).map((a) => (
          <button
            type="button"
            key={a.id}
            className="chip round"
            aria-pressed={filter === a.id}
            onClick={() => setFilter(filter === a.id ? null : a.id)}
            style={{ flexShrink: 0 }}
          >
            <span className="dot" style={{ background: a.color }} />
            {a.name}
          </button>
        ))}
      </div>

      {shownCount === 0 && (
        <p className="hint">
          {filter
            ? 'Esta cuenta aún no tiene registros.'
            : 'Aún no hay actualizaciones de saldos. Se crean con «Actualizar saldos» en la pestaña Cuentas.'}
        </p>
      )}

      {filter && flat.length > 0 && (
        <div className="list flush">
          {flat.slice(0, limit * 2).map((e) => {
            const acc = byId.get(e.accountId);
            return (
              <button
                type="button"
                key={e.id}
                className="row flush-row"
                onClick={() => {
                  onSelectDay(dayKey(e.at));
                  if (acc) onEditEntry(e, acc);
                }}
              >
                {acc ? (
                  <AccountIcon currency={e.currency} color={acc.color} size={38} />
                ) : (
                  <SourceIcon source={e.source} />
                )}
                <span className="row-main">
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{groupDate(e.at)}</span>
                  <span
                    className="row-sub"
                    style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {filteredIsGroup && acc ? `${acc.name} · ` : ''}
                    {e.note ? e.note : SOURCE_LABEL[e.source]}
                  </span>
                </span>
                <span className="row-end">
                  <span className="num" style={{ fontSize: 17 }}>
                    {formatMoney(e.balance, e.currency)}
                  </span>
                  <DeltaText entry={e} entries={entries} />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!filter &&
        groups.slice(0, limit).map((g) => {
          const isOpen = open === g.id;
          const first = g.entries[0];
          const single = g.entries.length === 1;
          const account = byId.get(first.accountId);
          const title = single
            ? `${account?.name ?? 'Cuenta'} · ${SOURCE_LABEL[first.source]}`
            : `Actualización de saldos · ${g.entries.length} ${g.entries.length === 1 ? 'cuenta' : 'cuentas'}`;
          const dayTotal = totalsByDay.get(dayKey(g.at));
          return (
            <div
              key={g.id}
              className="card"
              style={{ overflow: 'hidden', borderColor: isOpen ? 'var(--gold)' : undefined }}
            >
              <button
                type="button"
                className="row"
                aria-expanded={isOpen}
                onClick={() => toggle(g.id, g.at)}
                style={{ padding: '14px 16px', border: 'none' }}
              >
                <SourceIcon source={single ? first.source : 'update'} />
                <span className="row-main">
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{groupDate(g.at)}</span>
                  <span
                    className="row-sub"
                    style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {title}
                  </span>
                </span>
                {single ? (
                  <span className="row-end">
                    <span className="num" style={{ fontSize: 17 }}>
                      {formatMoney(first.balance, first.currency)}
                    </span>
                    <DeltaText entry={first} entries={entries} />
                  </span>
                ) : (
                  dayTotal !== undefined &&
                  dayTotal !== null && (
                    <span className="row-end">
                      <span className="num" style={{ fontSize: 17 }}>
                        {formatMoney(dayTotal, base)}
                      </span>
                      <span className="row-sub">total del día</span>
                    </span>
                  )
                )}
              </button>

              {isOpen && (
                <div
                  style={{
                    borderTop: '1px solid var(--border)',
                    padding: '4px 16px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {g.entries.map((e) => {
                    const acc = byId.get(e.accountId);
                    return (
                      <button
                        type="button"
                        key={e.id}
                        className="row"
                        style={{ padding: '9px 0', gap: 10 }}
                        onClick={() => acc && onEditEntry(e, acc)}
                      >
                        {acc && <AccountIcon currency={e.currency} color={acc.color} size={30} />}
                        <span className="row-main">
                          <span style={{ fontSize: 14, fontWeight: 500 }}>{acc?.name ?? 'Cuenta eliminada'}</span>
                          {e.note && <span className="row-sub">{e.note}</span>}
                        </span>
                        <span className="row-end">
                          <span className="num" style={{ fontSize: 15 }}>
                            {formatMoney(e.balance, e.currency)}
                          </span>
                          <DeltaText entry={e} entries={entries} small />
                        </span>
                      </button>
                    );
                  })}
                  <div style={{ display: 'flex', gap: 8, paddingTop: 12 }}>
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ flex: 1, height: 42, fontSize: 14 }}
                      onClick={() => removeGroup(g.entries)}
                    >
                      {single ? 'Eliminar registro' : 'Eliminar actualización'}
                    </button>
                  </div>
                  <p className="hint" style={{ padding: '10px 0 0' }}>
                    Toca un valor para corregirlo.
                  </p>
                </div>
              )}
            </div>
          );
        })}

      {(filter ? flat.length > limit * 2 : groups.length > limit) && (
        <button type="button" className="btn btn-ghost" onClick={() => setLimit(limit + PAGE)}>
          Ver más registros
        </button>
      )}
    </section>
  );
}

function DeltaText({ entry, entries, small }: { entry: Entry; entries: Entry[]; small?: boolean }) {
  const d = deltaOf(entry, previousEntry(entries, entry));
  if (!d.text) return null;
  return (
    <span className={d.cls} style={{ fontSize: small ? 12 : 13, fontWeight: 600 }}>
      {d.text}
    </span>
  );
}
