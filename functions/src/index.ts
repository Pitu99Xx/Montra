import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger, setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

initializeApp();
const db = getFirestore();

// Bélgica: la región europea de referencia de Cloud Functions. Firestore está en Madrid
// (europe-southwest1) y el disparador de Firestore funciona igual entre ambas.
setGlobalOptions({ region: 'europe-west1', maxInstances: 2 });

interface Reminder {
  id: string;
  days: number[];
  time: string;
  enabled: boolean;
}

const DEFAULT_BODY = 'Es momento de actualizar el estado de tus cuentas';

const ECB_DAILY = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const FRANKFURTER = ['https://api.frankfurter.dev/v1/latest', 'https://api.frankfurter.app/latest'];

/** Tipos del día publicados por el BCE (unidades de cada divisa por 1 EUR). */
async function fetchRates(): Promise<{ date: string; rates: Record<string, number>; source: string }> {
  try {
    const res = await fetch(ECB_DAILY);
    if (!res.ok) throw new Error(`BCE respondió ${res.status}`);
    const xml = await res.text();
    const date = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
    const rates: Record<string, number> = {};
    for (const m of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) rates[m[1]] = Number(m[2]);
    if (!date || Object.keys(rates).length < 10) throw new Error('Respuesta del BCE incompleta');
    return { date, rates, source: 'ecb' };
  } catch (err) {
    logger.warn('BCE no disponible, se usa Frankfurter', { err: String(err) });
  }
  for (const url of FRANKFURTER) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = (await res.json()) as { date: string; rates: Record<string, number> };
      return { date: json.date, rates: json.rates, source: 'frankfurter' };
    } catch {
      /* siguiente */
    }
  }
  throw new Error('No se pudieron obtener los tipos de cambio');
}

async function refreshRates(): Promise<void> {
  const { date, rates, source } = await fetchRates();
  await db.doc('rates/latest').set({
    base: 'EUR',
    date,
    rates: { ...rates, EUR: 1 },
    source,
    fetchedAt: FieldValue.serverTimestamp(),
  });
  logger.info('Tipos actualizados', { date, source, count: Object.keys(rates).length });
}

/** Una vez al día, después de que el BCE publique (hacia las 16:00 CET). */
export const updateRates = onSchedule(
  { schedule: 'every day 16:45', timeZone: 'Europe/Madrid', retryCount: 3 },
  refreshRates
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

/** Peticiones de la app: notificación de prueba y descarga inmediata de tipos de cambio. */
export const onUserRequest = onDocumentCreated('users/{uid}/requests/{reqId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  if (snap.get('type') === 'refreshRates') {
    // La app lo pide si aún no hay tipos guardados o están viejos; como mucho una descarga cada hora
    const current = await db.doc('rates/latest').get();
    const fetchedAt = current.get('fetchedAt')?.toMillis?.() ?? 0;
    if (Date.now() - fetchedAt > 60 * 60 * 1000) await refreshRates();
  }
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
