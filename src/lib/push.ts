import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { app, db, VAPID_KEY } from '../firebase';
import { isIOS, isStandalone } from './platform';

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

export class PushError extends Error {}

async function tokenId(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function saveToken(uid: string, reg: ServiceWorkerRegistration | undefined): Promise<void> {
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  if (!token) throw new PushError('No se pudo obtener el identificador de notificaciones.');
  await setDoc(doc(db, 'users', uid, 'devices', await tokenId(token)), {
    token,
    userAgent: navigator.userAgent,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Envía una notificación de prueba y devuelve qué ha pasado, contado por el servidor.
 * Antes vuelve a registrar este dispositivo (sin preguntar) por si su identificador cambió.
 */
export async function runTestPush(uid: string): Promise<string> {
  if ('Notification' in window && Notification.permission === 'granted' && (await isSupported())) {
    try {
      await saveToken(uid, (await registerServiceWorker()) ?? undefined);
    } catch {
      /* seguimos con los dispositivos que ya hubiera */
    }
  } else if ('Notification' in window && Notification.permission !== 'granted') {
    return 'Este dispositivo no tiene permiso para notificaciones. Desactiva y vuelve a activar «Permitir notificaciones».';
  }
  const ref = await addDoc(collection(db, 'users', uid, 'requests'), { type: 'testPush', createdAt: serverTimestamp() });
  const result = await new Promise<{ devices: number; sent: number; errors: string[] } | null>((resolve) => {
    const timer = window.setTimeout(() => {
      unsub();
      resolve(null);
    }, 20_000);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.data();
      if (d?.status === 'done') {
        window.clearTimeout(timer);
        unsub();
        resolve({ devices: d.devices ?? 0, sent: d.sent ?? 0, errors: d.errors ?? [] });
      }
    });
  });
  deleteDoc(ref).catch(() => undefined);
  if (!result) return 'El servidor no ha respondido. Inténtalo de nuevo en un momento.';
  if (!result.devices) return 'No hay ningún dispositivo registrado. Desactiva y vuelve a activar «Permitir notificaciones».';
  if (result.sent && !result.errors.length) {
    return `Enviada a ${result.sent} ${result.sent === 1 ? 'dispositivo' : 'dispositivos'}. Debería llegar en unos segundos.`;
  }
  return `Enviada a ${result.sent} de ${result.devices}. Errores: ${[...new Set(result.errors)].join(', ')}`;
}

/** Pide permiso, obtiene el token de FCM y lo guarda en users/{uid}/devices. */
export async function enablePush(uid: string): Promise<void> {
  if (isIOS() && !isStandalone()) {
    throw new PushError(
      'En iPhone las notificaciones solo funcionan con Montra instalada: Safari → Compartir → «Añadir a pantalla de inicio».'
    );
  }
  if (!('Notification' in window) || !(await isSupported())) {
    throw new PushError('Este navegador no admite notificaciones push.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new PushError('Has denegado el permiso. Actívalo en Ajustes del iPhone → Notificaciones → Montra.');
  }
  const reg = (await registerServiceWorker()) ?? undefined;
  await saveToken(uid, reg);
}
