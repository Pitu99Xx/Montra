import { useEffect, useState } from 'react';
import { Logo } from '../components/Logo';
import { biometricAvailable, enableBiometric } from '../lib/biometric';
import { withoutLock } from '../lib/lockGuard';
import { hashPin, verifyPin, type PinRecord } from '../lib/pin';
import { saveUser } from '../data/actions';
import { PinPad } from './PinPad';

type Step = 'current' | 'new' | 'confirm' | 'biometric';

/** Crea el código la primera vez o lo cambia (pidiendo antes el actual). */
export function PinSetup({
  uid,
  label,
  current,
  onDone,
  onCancel,
}: {
  uid: string;
  label: string;
  current?: PinRecord;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState<Step>(current ? 'current' : 'new');
  const [first, setFirst] = useState('');
  const [msg, setMsg] = useState('');
  const [canBio, setCanBio] = useState(false);

  useEffect(() => {
    biometricAvailable().then(setCanBio);
  }, []);

  const titles: Record<Step, string> = {
    current: 'Introduce tu código actual',
    new: current ? 'Elige el nuevo código' : 'Crea un código de 4 dígitos',
    confirm: 'Repite el código',
    biometric: '',
  };

  const handle = async (pin: string) => {
    if (step === 'current') {
      if (current && (await verifyPin(pin, current))) {
        setMsg('');
        setStep('new');
        return true;
      }
      setMsg('Código incorrecto');
      return false;
    }
    if (step === 'new') {
      setFirst(pin);
      setMsg('');
      setStep('confirm');
      return true;
    }
    if (pin !== first) {
      setMsg('Los códigos no coinciden. Vuelve a empezar.');
      setStep('new');
      return false;
    }
    await saveUser(uid, { pin: await hashPin(pin) });
    if (!current && canBio) setStep('biometric');
    else onDone();
    return true;
  };

  if (step === 'biometric') {
    return (
      <main className="center-screen">
        <div style={{ flex: 1 }} />
        <Logo size={72} />
        <h1 className="brand">¿Usar Face ID?</h1>
        <p className="muted" style={{ lineHeight: 1.5, maxWidth: 320 }}>
          Desbloquea Montra con la cara en lugar del código. Podrás cambiarlo en Ajustes.
        </p>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              try {
                await withoutLock(() => enableBiometric(uid, label));
              } catch {
                /* el usuario canceló: seguimos con el código */
              }
              onDone();
            }}
          >
            Activar Face ID
          </button>
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            Ahora no
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="center-screen">
      <Logo size={64} />
      <div className="brand" style={{ fontSize: 24 }}>
        Montra
      </div>
      <p style={{ margin: '28px 0 0', fontWeight: 600 }}>{titles[step]}</p>
      {!current && step === 'new' && (
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
          Lo pediremos cada vez que abras la app.
        </p>
      )}
      <PinPad key={step} onComplete={handle} />
      <p className="error" style={{ marginTop: 20 }} role="alert">
        {msg}
      </p>
      <div style={{ flex: 1 }} />
      {onCancel && (
        <button type="button" className="link-btn" onClick={onCancel}>
          Cancelar
        </button>
      )}
    </main>
  );
}
