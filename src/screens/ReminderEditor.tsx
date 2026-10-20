import { useState } from 'react';
import { Sheet, Switch, useSheetExit } from '../components/ui';
import type { Reminder } from '../data/model';
import { saveUser } from '../data/actions';
import { useStore } from '../data/store';

// Orden visual lunes → domingo; valores de Date.getDay()
const DAYS = [
  { v: 1, short: 'L', long: 'lunes' },
  { v: 2, short: 'M', long: 'martes' },
  { v: 3, short: 'X', long: 'miércoles' },
  { v: 4, short: 'J', long: 'jueves' },
  { v: 5, short: 'V', long: 'viernes' },
  { v: 6, short: 'S', long: 'sábado' },
  { v: 0, short: 'D', long: 'domingo' },
];

export function describeDays(days: number[]): string {
  const set = new Set(days);
  if (set.size === 7) return 'Todos los días';
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Entre semana';
  if (set.size === 2 && set.has(0) && set.has(6)) return 'Fines de semana';
  const names = DAYS.filter((d) => set.has(d.v)).map((d) => d.long);
  const s = names.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function todayIn(tz: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

export function ReminderEditor({ reminder, onClose }: { reminder: Reminder | null; onClose: () => void }) {
  const { uid, user } = useStore();
  const { closing, close } = useSheetExit(onClose);
  const [days, setDays] = useState<number[]>(reminder?.days ?? [1]);
  const [time, setTime] = useState(reminder?.time ?? '09:00');
  const [enabled, setEnabled] = useState(reminder?.enabled ?? true);
  const valid = days.length > 0 && /^\d{2}:\d{2}$/.test(time);

  const save = async () => {
    if (!valid) return;
    const id = reminder?.id ?? crypto.randomUUID().slice(0, 8);
    const next: Reminder = { id, days: [...days].sort(), time, enabled };
    const reminders = reminder ? user.reminders.map((r) => (r.id === id ? next : r)) : [...user.reminders, next];
    // Si la hora de hoy ya ha pasado, que no salte nada más guardarlo
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || user.timezone;
    const now = todayIn(tz);
    const [h, m] = time.split(':').map(Number);
    const reminderState = { ...(user.reminderState ?? {}) };
    if (h * 60 + m <= now.minutes) reminderState[id] = now.date;
    else delete reminderState[id];
    await saveUser(uid, { reminders, reminderState, timezone: tz });
    close();
  };

  const remove = async () => {
    if (!reminder) return;
    await saveUser(uid, { reminders: user.reminders.filter((r) => r.id !== reminder.id) });
    close();
  };

  return (
    <Sheet
      title={reminder ? 'Recordatorio' : 'Nuevo recordatorio'}
      onClose={close}
      closing={closing}
      action={
        <button type="button" className="link-btn" onClick={save} disabled={!valid}>
          Guardar
        </button>
      }
    >
      <div className="field">
        <span className="label">Días</span>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
          {DAYS.map((d) => {
            const on = days.includes(d.v);
            return (
              <button
                type="button"
                key={d.v}
                aria-label={d.long}
                aria-pressed={on}
                onClick={() => setDays(on ? days.filter((x) => x !== d.v) : [...days, d.v])}
                className="chip"
                style={{ width: 44, height: 44, padding: 0, justifyContent: 'center', borderRadius: '50%' }}
              >
                {d.short}
              </button>
            );
          })}
        </div>
        <span className="hint" style={{ padding: 0 }}>
          {days.length ? describeDays(days) : 'Elige al menos un día'}
        </span>
      </div>

      <label className="field">
        <span className="label">Hora</span>
        <input
          className="input num"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          style={{ fontSize: 24 }}
        />
      </label>

      <div
        className="card"
        style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg)' }}
      >
        <div className="row-main">
          <span style={{ fontWeight: 600, fontSize: 15 }}>Activo</span>
          <span className="row-sub">«Actualizar el estado de las cuentas»</span>
        </div>
        <Switch checked={enabled} onChange={setEnabled} label="Recordatorio activo" />
      </div>

      <button type="button" className="btn btn-primary" onClick={save} disabled={!valid}>
        Guardar recordatorio
      </button>
      {reminder && (
        <button type="button" className="btn btn-danger" onClick={remove}>
          Eliminar recordatorio
        </button>
      )}
    </Sheet>
  );
}
