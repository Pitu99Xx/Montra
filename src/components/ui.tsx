import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { currencySymbol } from '../lib/currency';

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

export function AccountIcon({ currency, color, size = 42 }: { currency: string; color: string; size?: number }) {
  const sym = currencySymbol(currency);
  return (
    <span
      className="acc-icon"
      style={{
        background: color,
        width: size,
        height: size,
        borderRadius: size * 0.3,
        fontSize: sym.length > 1 ? size * 0.32 : size * 0.45,
      }}
      aria-hidden="true"
    >
      {sym}
    </span>
  );
}

const SHEET_EXIT_MS = 220;

/** Cierra una hoja con animación: primero baja y se desvanece, después se desmonta. */
export function useSheetExit(onClose: () => void) {
  const [closing, setClosing] = useState(false);
  const started = useRef(false);
  const close = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setClosing(true);
    window.setTimeout(onClose, SHEET_EXIT_MS);
  }, [onClose]);
  return { closing, close };
}

export function Sheet({
  title,
  onClose,
  closing = false,
  action,
  children,
}: {
  title: string;
  onClose: () => void;
  closing?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div
      className={`sheet-backdrop${closing ? ' closing' : ''}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`sheet${closing ? ' closing' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <div>
            <button type="button" className="link-btn" onClick={onClose}>
              Cancelar
            </button>
          </div>
          <h2>{title}</h2>
          <div className="end">{action}</div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

let toastListener: ((msg: string) => void) | null = null;
export function toast(msg: string) {
  toastListener?.(msg);
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    toastListener = (m) => {
      setMsg(m);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(null), 3500);
    };
    return () => {
      toastListener = null;
      window.clearTimeout(timer);
    };
  }, []);
  return msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null;
}

export function Spinner() {
  return <div className="spinner" role="progressbar" aria-label="Cargando" />;
}
