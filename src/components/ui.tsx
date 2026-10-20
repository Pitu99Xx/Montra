import { useEffect, useState, type ReactNode } from 'react';
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

export function Sheet({
  title,
  onClose,
  action,
  children,
}: {
  title: string;
  onClose: () => void;
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
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
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
