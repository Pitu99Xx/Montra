import { useState } from 'react';
import { signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { Logo } from '../components/Logo';
import { IconGoogle } from '../components/Icons';
import { isIOS, isStandalone } from '../lib/platform';

export function authErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '';
    case 'auth/unauthorized-domain':
      return 'Este dominio no está autorizado en Firebase Authentication.';
    case 'auth/network-request-failed':
      return 'Sin conexión. Inténtalo de nuevo.';
    default:
      return 'No se pudo iniciar sesión' + (code ? ` (${code})` : '') + '.';
  }
}

export function LoginScreen({ initialError }: { initialError?: string }) {
  const [error, setError] = useState(initialError ?? '');
  const [busy, setBusy] = useState(false);

  const login = async () => {
    setBusy(true);
    setError('');
    try {
      if (isStandalone() || isIOS()) {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      setError(authErrorMessage(code));
      setBusy(false);
    }
  };

  return (
    <main className="center-screen">
      <div style={{ flex: 1 }} />
      <Logo size={96} />
      <h1 className="brand" style={{ fontSize: 40, margin: '20px 0 0' }}>
        Montra
      </h1>
      <p className="muted" style={{ margin: '10px 0 0', fontSize: 16 }}>
        Todas tus cuentas, en un solo lugar.
      </p>
      <div style={{ flex: 1.2 }} />
      <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={login} disabled={busy}>
        <span style={{ background: '#fff', borderRadius: 6, padding: 3, display: 'flex' }}>
          <IconGoogle size={18} />
        </span>
        Continuar con Google
      </button>
      <p className="error" style={{ marginTop: 14 }} role="alert">
        {error}
      </p>
    </main>
  );
}

export function NotOwnerScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <main className="center-screen">
      <div style={{ flex: 1 }} />
      <Logo size={80} />
      <h1 className="brand">Acceso restringido</h1>
      <p className="muted" style={{ lineHeight: 1.5, maxWidth: 320 }}>
        Montra es una app privada y esta cuenta de Google no tiene acceso.
      </p>
      <div style={{ flex: 1 }} />
      <button type="button" className="btn btn-outline" style={{ width: '100%' }} onClick={onSignOut}>
        Usar otra cuenta
      </button>
    </main>
  );
}
