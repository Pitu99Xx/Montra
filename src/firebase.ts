import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from 'firebase/firestore';

// Estos valores son públicos por diseño: identifican el proyecto, no dan acceso.
// La seguridad la ponen las reglas de Firestore (firestore.rules).
export const PROJECT_ID = 'montra-832b1';
export const VAPID_KEY =
  'BI8ikTjopeKN85JeS3TOZjM8d90roUkUPjt9a6kpsFjVvvMZDvVvpvWaVHIjX9NwyXxEdIAYiuEafO-21lIjfhY';

// En los dominios de Firebase Hosting el inicio de sesión se hace en el propio dominio
// (/__/auth/handler), así Safari en iPhone no bloquea las cookies de otro sitio.
const host = typeof location !== 'undefined' ? location.hostname : '';
const servedByFirebase = host.endsWith('.web.app') || host.endsWith('.firebaseapp.com');

export const app = initializeApp({
  apiKey: 'AIzaSyBtXl5kxtU4fadjH6rosxXGtcCYjiHNTqc',
  authDomain: servedByFirebase ? host : `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  storageBucket: `${PROJECT_ID}.firebasestorage.app`,
  messagingSenderId: '329930396311',
  appId: '1:329930396311:web:b62bb96a3ccbab63268fd2',
});

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
});
