import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
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
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  if (!token) throw new PushError('No se pudo obtener el identificador de notificaciones.');
  await setDoc(doc(db, 'users', uid, 'devices', await tokenId(token)), {
    token,
    userAgent: navigator.userAgent,
    updatedAt: serverTimestamp(),
  });
}
