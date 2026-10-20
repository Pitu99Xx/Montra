import { useEffect, useState } from 'react';
import { IconBackspace, IconFaceId } from '../components/Icons';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Teclado de 4 dígitos. Llama a onComplete al completar; devuelve false para indicar error. */
export function PinPad({
  onComplete,
  onBiometric,
  busy,
}: {
  onComplete: (pin: string) => Promise<boolean> | boolean;
  onBiometric?: () => void;
  busy?: boolean;
}) {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (pin.length !== 4) return;
    let alive = true;
    Promise.resolve(onComplete(pin)).then((ok) => {
      if (!alive) return;
      if (!ok) {
        setShake(true);
        window.setTimeout(() => setShake(false), 450);
      }
      setPin('');
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const press = (d: string) => {
    if (busy) return;
    setPin((p) => (p.length < 4 ? p + d : p));
  };

  return (
    <>
      <div
        className={`pin-dots${shake ? ' shake' : ''}`}
        aria-label={`${pin.length} de 4 dígitos introducidos`}
        role="status"
      >
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <div className="keypad">
        {KEYS.map((k) => (
          <button type="button" key={k} className="key" onClick={() => press(k)}>
            {k}
          </button>
        ))}
        {onBiometric ? (
          <button type="button" className="key plain" aria-label="Usar Face ID" onClick={onBiometric}>
            <IconFaceId size={34} />
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="key" onClick={() => press('0')}>
          0
        </button>
        <button
          type="button"
          className="key plain"
          aria-label="Borrar"
          style={{ color: 'var(--muted)' }}
          onClick={() => setPin((p) => p.slice(0, -1))}
        >
          <IconBackspace size={28} />
        </button>
      </div>
    </>
  );
}
