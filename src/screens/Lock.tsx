import { useCallback, useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { Logo } from '../components/Logo';
import { biometricEnabled, verifyBiometric } from '../lib/biometric';
import { withoutLock } from '../lib/lockGuard';
import { verifyPin, type PinRecord } from '../lib/pin';
import { PinPad } from './PinPad';

const MAX_ATTEMPTS = 5;
export const RESET_PIN_FLAG = 'montra.resetPin';

export function LockScreen({ uid, pin, onUnlock }: { uid: string; pin: PinRecord; onUnlock: () => void }) {
  const [attempts, setAttempts] = useState(0);
  const [msg, setMsg] = useState('');
  const bio = biometricEnabled(uid);
  const inFlight = useRef(false);

  // `manual`: lo ha pedido el usuario con el botón. Los intentos automáticos fallan en
  // silencio, porque iOS los rechaza a veces si no vienen de un toque.
  const tryBiometric = useCallback(
    async (manual: boolean) => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const ok = await withoutLock(() => verifyBiometric(uid));
        if (ok) onUnlock();
      } catch {
        if (manual) setMsg('No se pudo usar Face ID. Inténtalo de nuevo o usa tu código.');
      } finally {
        inFlight.current = false;
      }
    },
    [uid, onUnlock],
  );

  // La pantalla de bloqueo se monta al pasar a segundo plano: se lanza Face ID solo
  // cuando la app vuelve a estar visible, que es cuando iOS lo permite.
  useEffect(() => {
    if (!bio) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') tryBiometric(false);
    };
    onVisible();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [bio, tryBiometric]);

  const check = async (value: string) => {
    if (await verifyPin(value, pin)) {
      onUnlock();
      return true;
    }
    const n = attempts + 1;
    setAttempts(n);
    if (n >= MAX_ATTEMPTS) {
      await signOut(auth);
      return false;
    }
    setMsg(`Código incorrecto. Te quedan ${MAX_ATTEMPTS - n} intentos.`);
    return false;
  };

  const forgot = async () => {
    if (!confirm('Para crear un código nuevo tendrás que volver a iniciar sesión con Google. ¿Continuar?')) return;
    try {
      localStorage.setItem(RESET_PIN_FLAG, '1');
    } catch {
      /* sin almacenamiento */
    }
    await signOut(auth);
  };

  return (
    <main className="center-screen">
      <Logo size={64} />
      <div className="brand" style={{ fontSize: 24, letterSpacing: '0.02em' }}>
        Montra
      </div>
      <p className="muted" style={{ margin: '28px 0 0' }}>
        Introduce tu código
      </p>
      <PinPad onComplete={check} onBiometric={bio ? () => tryBiometric(true) : undefined} />
      <p className="error" style={{ marginTop: 20 }} role="alert">
        {msg}
      </p>
      <div style={{ flex: 1 }} />
      <button type="button" className="link-btn" onClick={forgot}>
        ¿Has olvidado el código?
      </button>
    </main>
  );
}
