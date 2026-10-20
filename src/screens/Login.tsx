import { useState } from 'react';
import { signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { Logo } from '../components/Logo';
import { IconBell, IconChart, IconGoogle, IconWallet } from '../components/Icons';
import { DESKTOP_QUERY, useMedia } from '../lib/useMedia';
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

  const isDesktop = useMedia(DESKTOP_QUERY);

  const googleButton = (
    <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={login} disabled={busy}>
      <span style={{ background: '#fff', borderRadius: 6, padding: 3, display: 'flex' }}>
        <IconGoogle size={18} />
      </span>
      Continuar con Google
    </button>
  );

  if (isDesktop) {
    // Ordenador: marca a la izquierda y tarjeta de acceso a la derecha
    return (
      <main className="login-desk">
        <section className="login-brand" aria-label="Montra">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Logo size={64} />
            <span className="serif" style={{ fontSize: 34, fontWeight: 500 }}>
              Montra
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 460 }}>
            <h1 className="serif" style={{ margin: 0, fontSize: 52, fontWeight: 500, lineHeight: 1.08 }}>
              Todas tus cuentas, en un solo lugar.
            </h1>
            <ul className="login-points">
              <li>
                <IconWallet size={20} />
                Cuentas y subcuentas en varias divisas, con el cambio oficial del BCE cada día.
              </li>
              <li>
                <IconChart size={20} />
                La evolución de tu patrimonio día a día, con cada registro editable.
              </li>
              <li>
                <IconBell size={20} />
                Recordatorios para mantener los saldos al día.
              </li>
            </ul>
          </div>
          <svg className="login-line" viewBox="0 0 600 160" preserveAspectRatio="none" aria-hidden="true">
            <polyline
              points="0,140 70,128 140,132 210,104 280,110 350,80 420,86 490,52 560,40 600,22"
              fill="none"
              stroke="var(--gold)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </section>

        <section className="login-panel">
          <div className="card login-card">
            <h2 className="serif" style={{ margin: 0, fontSize: 32, fontWeight: 500 }}>
              Bienvenido
            </h2>
            <p className="muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
              Entra con tu cuenta de Google para continuar.
            </p>
            {googleButton}
            {error && (
              <p className="error" role="alert" style={{ margin: 0 }}>
                {error}
              </p>
            )}
            <p className="hint" style={{ padding: 0, margin: 0 }}>
              Montra es privada: solo tiene acceso la cuenta propietaria. Después de entrar te pediremos tu código.
            </p>
          </div>
        </section>
      </main>
    );
  }

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
      {googleButton}
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
