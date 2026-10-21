import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { currencySymbol } from '../lib/currency';
import { useBottomBand } from '../lib/viewport';

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

/** Icono de una cuenta con subcuentas: dos tarjetas apiladas con la inicial. */
export function GroupIcon({ name, color, back, size = 42 }: { name: string; color: string; back?: string; size?: number }) {
  const tile = size * 0.86;
  const off = size - tile;
  return (
    <span style={{ position: 'relative', width: size, height: size, flexShrink: 0 }} aria-hidden="true">
      <span
        style={{
          position: 'absolute',
          left: off,
          top: 0,
          width: tile,
          height: tile,
          borderRadius: tile * 0.3,
          background: back ?? color,
          opacity: 0.5,
        }}
      />
      <span
        className="acc-icon"
        style={{
          position: 'absolute',
          left: 0,
          top: off,
          width: tile,
          height: tile,
          borderRadius: tile * 0.3,
          background: color,
          fontSize: tile * 0.42,
        }}
      >
        {name.trim().charAt(0).toUpperCase()}
      </span>
    </span>
  );
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
  useBottomBand('--bg');
  const backdropRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

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

  // Arrastrar hacia abajo para cerrar, como en iOS: desde la cabecera o desde el contenido
  // cuando ya está arriba del todo. Si se suelta poco, vuelve a su sitio.
  useEffect(() => {
    const sheet = sheetRef.current;
    const body = bodyRef.current;
    const backdrop = backdropRef.current;
    if (!sheet || !body || !backdrop) return;
    let startY = 0;
    let startT = 0;
    let dy = 0;
    let tracking = false;
    let dragging = false;

    const setPos = (y: number, animate: boolean) => {
      sheet.style.transition = animate ? 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
      backdrop.style.transition = animate ? 'background-color 0.3s ease' : 'none';
      sheet.style.transform = y > 0 ? `translateY(${y}px)` : '';
      const fade = Math.min(y / sheet.offsetHeight, 1);
      backdrop.style.backgroundColor = y > 0 ? `rgba(3, 8, 18, ${0.72 * (1 - fade)})` : '';
    };

    const onStart = (e: TouchEvent) => {
      const inBody = body.contains(e.target as Node);
      tracking = !inBody || body.scrollTop <= 0;
      dragging = false;
      dy = 0;
      startY = e.touches[0].clientY;
      startT = performance.now();
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const d = e.touches[0].clientY - startY;
      if (!dragging) {
        if (d < -4) {
          tracking = false; // hacia arriba: es un desplazamiento normal del contenido
          return;
        }
        if (d > 6 && body.scrollTop <= 0) {
          dragging = true;
          startY = e.touches[0].clientY;
          startT = performance.now();
          (document.activeElement as HTMLElement | null)?.blur?.();
        } else return;
      }
      e.preventDefault();
      dy = Math.max(0, e.touches[0].clientY - startY);
      setPos(dy, false);
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      tracking = false;
      const velocity = dy / Math.max(1, performance.now() - startT);
      if (dy > sheet.offsetHeight * 0.28 || (velocity > 0.5 && dy > 40)) onClose();
      else setPos(0, true);
    };

    sheet.addEventListener('touchstart', onStart, { passive: true });
    sheet.addEventListener('touchmove', onMove, { passive: false });
    sheet.addEventListener('touchend', onEnd);
    sheet.addEventListener('touchcancel', onEnd);
    return () => {
      sheet.removeEventListener('touchstart', onStart);
      sheet.removeEventListener('touchmove', onMove);
      sheet.removeEventListener('touchend', onEnd);
      sheet.removeEventListener('touchcancel', onEnd);
    };
  }, [onClose]);

  return (
    <div
      ref={backdropRef}
      className={`sheet-backdrop${closing ? ' closing' : ''}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={sheetRef}
        className={`sheet${closing ? ' closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sheet-grabber" aria-hidden="true" />
        <div className="sheet-head">
          <div>
            <button type="button" className="link-btn" onClick={onClose}>
              Cancelar
            </button>
          </div>
          <h2>{title}</h2>
          <div className="end">{action}</div>
        </div>
        <div className="sheet-body" ref={bodyRef}>
          {children}
        </div>
      </div>
    </div>
  );
}

interface ToastAction {
  label: string;
  run: () => void;
}
interface ToastMsg {
  text: string;
  sub?: string;
  action?: ToastAction;
}

let toastListener: ((msg: ToastMsg) => void) | null = null;
/** Aviso breve; con `action` muestra un botón (por ejemplo «Deshacer»). */
export function toast(text: string, opts?: { sub?: string; action?: ToastAction }) {
  toastListener?.({ text, ...opts });
}

export function ToastHost() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    toastListener = (m) => {
      setMsg(m);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(null), m.action ? 6000 : 3500);
    };
    return () => {
      toastListener = null;
      window.clearTimeout(timer);
    };
  }, []);
  if (!msg) return null;
  return (
    <div className={`toast${msg.action ? ' with-action' : ''}`} role="status">
      <span className="row-main">
        <span>{msg.text}</span>
        {msg.sub && <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.75 }}>{msg.sub}</span>}
      </span>
      {msg.action && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            msg.action!.run();
            setMsg(null);
          }}
        >
          {msg.action.label}
        </button>
      )}
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" role="progressbar" aria-label="Cargando" />;
}
