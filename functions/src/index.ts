import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger, setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

initializeApp();
const db = getFirestore();

// La región la decide el despliegue (functions/.env) según dónde esté Firestore.
setGlobalOptions({ region: process.env.FUNCTIONS_REGION || 'europe-west1', maxInstances: 2 });

interface Reminder {
  id: string;
  days: number[];
  time: string;
  enabled: boolean;
}

const DEFAULT_BODY = 'Es momento de actualizar el estado de tus cuentas';

/** Tipos de cambio del BCE (vía Frankfurter), una vez al día tras su publicación. */
export const updateRates = onSchedule(
  { schedule: 'every day 16:45', timeZone: 'Europe/Madrid', retryCount: 3 },
  async () => {
    const res = await fetch('https://api.frankfurter.app/latest?from=EUR');
    if (!res.ok) throw new Error(`Frankfurter respondió ${res.status}`);
    const json = (await res.json()) as { date: string; rates: Record<string, number> };
    await db.doc('rates/latest').set({
      base: 'EUR',
      date: json.date,
      rates: { ...json.rates, EUR: 1 },
      fetchedAt: FieldValue.serverTimestamp(),
    });
    logger.info('Tipos actualizados', { date: json.date, count: Object.keys(json.rates).length });
  }
);

function nowIn(tz: string): { date: string; weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

async function sendToUser(uid: string, data: Record<string, string>): Promise<number> {
  const devices = await db.collection(`users/${uid}/devices`).get();
  const tokens = devices.docs.map((d) => d.get('token') as string).filter(Boolean);
  if (!tokens.length) return 0;
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    data,
    webpush: { headers: { Urgency: 'high', TTL: '86400' } },
  });
  // Limpiar dispositivos que ya no existen
  await Promise.all(
    res.responses.map((r, i) => {
      const code = r.error?.code ?? '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
        return devices.docs[i].ref.delete();
      }
      return null;
    })
  );
  return res.successCount;
}

/** Revisa cada 5 minutos si toca algún recordatorio «Actualizar el estado de las cuentas». */
export const sendReminders = onSchedule({ schedule: 'every 5 minutes', timeZone: 'Europe/Madrid' }, async () => {
  const users = await db.collection('users').where('notifications', '==', true).get();
  for (const doc of users.docs) {
    const reminders = (doc.get('reminders') as Reminder[] | undefined) ?? [];
    if (!reminders.length) continue;
    const tz = (doc.get('timezone') as string | undefined) || 'Europe/Madrid';
    const state = (doc.get('reminderState') as Record<string, string> | undefined) ?? {};
    const now = nowIn(tz);
    const due = reminders.filter((r) => {
      if (!r.enabled || !r.days?.includes(now.weekday)) return false;
      const [h, m] = r.time.split(':').map(Number);
      const diff = now.minutes - (h * 60 + m);
      return diff >= 0 && diff < 60 && state[r.id] !== now.date;
    });
    if (!due.length) continue;
    const sent = await sendToUser(doc.id, {
      title: 'Montra',
      body: DEFAULT_BODY,
      url: '/actualizar',
      tag: 'montra-reminder',
    });
    const patch: Record<string, string> = {};
    for (const r of due) patch[`reminderState.${r.id}`] = now.date;
    await doc.ref.update(patch);
    logger.info('Recordatorio enviado', { uid: doc.id, sent });
  }
});

/** Notificación de prueba pedida desde Ajustes. */
export const onUserRequest = onDocumentCreated('users/{uid}/requests/{reqId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  if (snap.get('type') === 'testPush') {
    const sent = await sendToUser(event.params.uid, {
      title: 'Montra',
      body: 'Las notificaciones funcionan correctamente ✓',
      url: '/',
      tag: 'montra-test',
    });
    logger.info('Prueba enviada', { uid: event.params.uid, sent });
  }
  await snap.ref.delete();
});
