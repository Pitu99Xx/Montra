import type { Reminder } from '../data/model';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Próximo recordatorio activo a partir de ahora (hora local). */
export function nextReminder(reminders: Reminder[], now = new Date()): { at: Date; label: string } | null {
  let best: Date | null = null;
  for (const r of reminders) {
    if (!r.enabled || !r.days.length) continue;
    const [h, m] = r.time.split(':').map(Number);
    for (let add = 0; add <= 7; add++) {
      const d = new Date(now);
      d.setDate(now.getDate() + add);
      d.setHours(h, m, 0, 0);
      if (d > now && r.days.includes(d.getDay())) {
        if (!best || d < best) best = d;
        break;
      }
    }
  }
  if (!best) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(best).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000);
  const day = diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : DAY_NAMES[best.getDay()];
  const time = best.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return { at: best, label: `${day} · ${time}` };
}
