import { useState } from 'react';
import { Sheet, toast, useSheetExit } from '../components/ui';
import { IconTrash } from '../components/Icons';
import { ACCOUNT_COLORS, type Movement, type MovementDateMode, type MovementKind, type Project } from '../data/model';
import { deleteMovement, deleteProject, newId, saveMovement, saveProject } from '../data/projects';
import { saveUser } from '../data/actions';
import { useStore } from '../data/store';
import { FEATURED, currencySymbol, formatAmount, formatMoney, parseAmount } from '../lib/currency';
import { CurrencyPicker } from './CurrencyPicker';
import { ProjectIcon } from './projectUi';

const MARGINS = [0, 5, 10, 20, 30];

/** Crear o editar un proyecto (nombre, color y margen de imprevistos). */
export function ProjectEditor({
  project,
  onClose,
  onCreated,
}: {
  project: Project | null;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const { uid, projects } = useStore();
  const { closing, close } = useSheetExit(onClose);
  const [name, setName] = useState(project?.name ?? '');
  const [color, setColor] = useState(
    project?.color ?? ACCOUNT_COLORS[(projects.length + 4) % ACCOUNT_COLORS.length].hex,
  );
  const [margin, setMargin] = useState(project?.margin ?? 0);
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length > 0;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const id = await saveProject(uid, {
        id: project?.id ?? '',
        name: name.trim(),
        color,
        margin,
        selected: project?.selected ?? true,
        order: project?.order ?? (projects.length ? Math.max(...projects.map((p) => p.order)) + 1 : 0),
        movements: project?.movements ?? [],
      });
      close();
      if (!project) onCreated?.(id);
    } catch (e) {
      console.error(e);
      toast('No se pudo guardar el proyecto');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!project || !confirm(`¿Eliminar el proyecto «${project.name}» y sus movimientos previstos?`)) return;
    setBusy(true);
    await deleteProject(uid, project);
    toast('Proyecto eliminado', {
      action: { label: 'Deshacer', run: () => saveProject(uid, project).then(() => undefined) },
    });
    close();
  };

  return (
    <Sheet
      title={project ? 'Editar proyecto' : 'Nuevo proyecto'}
      onClose={close}
      closing={closing}
      action={
        <button type="button" className="link-btn" onClick={save} disabled={!valid || busy}>
          Guardar
        </button>
      }
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
        <ProjectIcon project={{ name: name || 'P', color }} size={56} />
        <label className="field" style={{ flex: 1 }}>
          <span className="label">Nombre</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Viaje a Japón"
            autoFocus={!project}
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
        <span className="label">Margen de imprevistos</span>
        <div className="chips" style={{ flexWrap: 'nowrap' }}>
          {MARGINS.map((m) => (
            <button
              type="button"
              key={m}
              className="chip"
              style={{ flex: '1 1 0', justifyContent: 'center', padding: 0 }}
              aria-pressed={m === margin}
              onClick={() => setMargin(m)}
            >
              {m === 0 ? 'Ninguno' : `±${m} %`}
            </button>
          ))}
        </div>
        <span className="hint" style={{ padding: 0 }}>
          {margin === 0
            ? 'Sin margen, el proyecto vale lo mismo en todos los escenarios.'
            : `En el escenario pesimista los gastos suben un ${margin} % y los ingresos bajan un ${margin} %; en el optimista, al revés.`}
        </span>
      </div>

      <button type="button" className="btn btn-primary" onClick={save} disabled={!valid || busy}>
        {project ? 'Guardar cambios' : 'Crear proyecto'}
      </button>
      {project && (
        <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
          <IconTrash size={18} /> Eliminar proyecto
        </button>
      )}
    </Sheet>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const nextMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

/** Crear o editar un gasto o ingreso previsto de un proyecto. */
export function MovementEditor({
  project,
  movement,
  onClose,
}: {
  project: Project;
  movement: Movement | null;
  onClose: () => void;
}) {
  const { uid, accounts, user, rates, valueIn } = useStore();
  const { closing, close } = useSheetExit(onClose);
  const base = user.baseCurrency;
  const [kind, setKind] = useState<MovementKind>(movement?.kind ?? 'expense');
  const [concept, setConcept] = useState(movement?.concept ?? '');
  const [currency, setCurrency] = useState(movement?.currency ?? base);
  const [amountText, setAmountText] = useState(movement ? formatAmount(movement.amount, movement.currency) : '');
  const [dateMode, setDateMode] = useState<MovementDateMode>(movement?.dateMode ?? 'month');
  const [exact, setExact] = useState(
    movement?.dateMode === 'exact' && movement.date ? movement.date : `${nextMonth()}-01`,
  );
  const [month, setMonth] = useState(movement?.date ? movement.date.slice(0, 7) : nextMonth());
  const [note, setNote] = useState(movement?.note ?? '');
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  // Primero las divisas de tus cuentas, después las habituales
  const own = [...new Set([base, ...accounts.filter((a) => !a.isGroup).map((a) => a.currency)])];
  const chips = [...new Set([...own, ...FEATURED])].slice(0, 4);
  if (!chips.includes(currency)) chips[3] = currency;

  const parsed = parseAmount(amountText);
  const amount = parsed === null ? null : Math.abs(parsed);
  const converted = amount !== null && currency !== base ? valueIn(amount, currency) : null;
  const date = dateMode === 'exact' ? exact : dateMode === 'month' ? month : null;
  const valid = concept.trim().length > 0 && amount !== null && amount > 0 && (dateMode === 'none' || !!date);

  const save = async () => {
    if (!valid || amount === null) return;
    setBusy(true);
    try {
      await saveMovement(uid, project, {
        id: movement?.id ?? newId(),
        kind,
        concept: concept.trim(),
        amount,
        currency,
        dateMode,
        date,
        ...(note.trim() ? { note: note.trim() } : {}),
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
    await deleteMovement(uid, project, movement);
    toast('Movimiento eliminado', {
      action: { label: 'Deshacer', run: () => saveProject(uid, project).then(() => undefined) },
    });
    close();
  };

  if (picker) return <CurrencyPicker value={currency} onPick={setCurrency} onClose={() => setPicker(false)} />;

  return (
    <Sheet
      title={movement ? 'Editar movimiento' : 'Nuevo movimiento'}
      onClose={close}
      closing={closing}
      action={
        <button type="button" className="link-btn" onClick={save} disabled={!valid || busy}>
          Guardar
        </button>
      }
    >
      <div className="segmented" role="group" aria-label="Tipo" style={{ background: 'var(--bg)' }}>
        <button type="button" aria-pressed={kind === 'expense'} onClick={() => setKind('expense')}>
          Gasto
        </button>
        <button type="button" aria-pressed={kind === 'income'} onClick={() => setKind('income')}>
          Ingreso
        </button>
      </div>

      <label className="field">
        <span className="label">Concepto</span>
        <input
          className="input"
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder={kind === 'expense' ? 'Vuelos' : 'Bonus anual'}
          autoFocus={!movement}
          maxLength={60}
        />
      </label>

      <label className="field">
        <span className="label">Importe</span>
        <span className="amount-input">
          <input
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="0,00"
            aria-label="Importe"
          />
          <span>{currencySymbol(currency)}</span>
        </span>
      </label>
      <div className="field">
        <div className="chips" style={{ flexWrap: 'nowrap' }}>
          {chips.map((c) => (
            <button
              type="button"
              key={c}
              className="chip"
              style={{ flex: '1 1 0', justifyContent: 'center', padding: 0 }}
              aria-pressed={c === currency}
              onClick={() => setCurrency(c)}
            >
              {c}
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
        <span className="hint" style={{ padding: 0 }}>
          {currency === base
            ? ' '
            : converted !== null
              ? `≈ ${formatMoney(converted, base)} al cambio de hoy (se actualiza cada día)`
              : rates
                ? 'Sin tipo de cambio para esta divisa'
                : 'Cargando tipo de cambio…'}
        </span>
      </div>

      <div className="field">
        <span className="label">Fecha</span>
        <div className="segmented" role="group" aria-label="Fecha" style={{ background: 'var(--bg)' }}>
          <button type="button" aria-pressed={dateMode === 'exact'} onClick={() => setDateMode('exact')}>
            Exacta
          </button>
          <button type="button" aria-pressed={dateMode === 'month'} onClick={() => setDateMode('month')}>
            Aproximada
          </button>
          <button type="button" aria-pressed={dateMode === 'none'} onClick={() => setDateMode('none')}>
            Sin fecha
          </button>
        </div>
        {dateMode === 'exact' && (
          <input
            className="input"
            type="date"
            value={exact}
            onChange={(e) => setExact(e.target.value)}
            aria-label="Fecha"
          />
        )}
        {dateMode === 'month' && (
          <input
            className="input"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            aria-label="Mes"
          />
        )}
        <span className="hint" style={{ padding: 0 }}>
          {dateMode === 'month'
            ? 'Solo mes y año: se muestra como «≈ mes» y en la proyección se aplica a mitad de mes.'
            : dateMode === 'none'
              ? 'En la proyección se suma al final, después del último movimiento con fecha.'
              : ' '}
        </span>
      </div>

      <label className="field">
        <span className="label">Nota (opcional)</span>
        <input
          className="input"
          value={note}
          maxLength={120}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reservado con cancelación gratuita"
        />
      </label>

      <button type="button" className="btn btn-primary" onClick={save} disabled={!valid || busy}>
        {movement ? 'Guardar cambios' : 'Añadir movimiento'}
      </button>
      {movement && (
        <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
          <IconTrash size={18} /> Eliminar movimiento
        </button>
      )}
    </Sheet>
  );
}

/** Saldo mínimo deseado: la proyección avisa si en algún momento bajarías de él. */
export function ProjectMinEditor({ onClose }: { onClose: () => void }) {
  const { uid, user } = useStore();
  const { closing, close } = useSheetExit(onClose);
  const base = user.baseCurrency;
  const [text, setText] = useState(user.projectMin != null ? formatAmount(user.projectMin, base) : '');
  const value = parseAmount(text);

  const save = async (v: number | null) => {
    await saveUser(uid, { projectMin: v });
    close();
  };

  return (
    <Sheet title="Saldo mínimo" onClose={close} closing={closing}>
      <label className="field">
        <span className="label">No quiero bajar de</span>
        <span className="amount-input">
          <input
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="0,00"
            aria-label="Saldo mínimo"
            autoFocus
          />
          <span>{currencySymbol(base)}</span>
        </span>
        <span className="hint" style={{ padding: 0 }}>
          Se dibuja en la proyección y te avisa si, con los proyectos marcados, algún mes tu total quedaría por debajo.
        </span>
      </label>
      <button type="button" className="btn btn-primary" disabled={value === null} onClick={() => save(value)}>
        Guardar
      </button>
      {user.projectMin != null && (
        <button type="button" className="btn btn-ghost" onClick={() => save(null)}>
          Quitar mínimo
        </button>
      )}
    </Sheet>
  );
}
