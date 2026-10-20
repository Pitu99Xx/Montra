import { useRef, useState, type ReactNode } from 'react';
import { IconPencil, IconTrash } from './Icons';

const ACTIONS_W = 152;

/** Fila que al deslizarla hacia la izquierda muestra «Editar» y «Eliminar». */
export function SwipeRow({
  open,
  onOpenChange,
  onTap,
  onEdit,
  onDelete,
  label,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTap: () => void;
  onEdit: () => void;
  onDelete: () => void;
  label: string;
  children: ReactNode;
}) {
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const moved = useRef(false);

  const shift = drag ?? (open ? -ACTIONS_W : 0);

  return (
    <div className="swipe-row">
      <div className="swipe-actions" aria-hidden={!open}>
        <button type="button" className="swipe-edit" onClick={onEdit} tabIndex={open ? 0 : -1}>
          <IconPencil size={18} />
          Editar
        </button>
        <button type="button" className="swipe-delete" onClick={onDelete} tabIndex={open ? 0 : -1}>
          <IconTrash size={18} />
          Eliminar
        </button>
      </div>
      <button
        type="button"
        className="swipe-front row"
        aria-label={label}
        style={{ transform: `translateX(${shift}px)`, transition: drag === null ? undefined : 'none' }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          start.current = { x: t.clientX, y: t.clientY, base: open ? -ACTIONS_W : 0 };
          moved.current = false;
        }}
        onTouchMove={(e) => {
          if (!start.current) return;
          const t = e.touches[0];
          const dx = t.clientX - start.current.x;
          const dy = t.clientY - start.current.y;
          if (!moved.current && Math.abs(dy) > Math.abs(dx)) {
            start.current = null; // desplazamiento vertical: no es un deslizamiento
            return;
          }
          if (Math.abs(dx) > 6) moved.current = true;
          setDrag(Math.max(-ACTIONS_W - 24, Math.min(0, start.current.base + dx)));
        }}
        onTouchEnd={() => {
          if (drag !== null) onOpenChange(drag < -ACTIONS_W / 2.5);
          setDrag(null);
          start.current = null;
        }}
        onClick={() => {
          if (moved.current) {
            moved.current = false;
            return;
          }
          if (open) onOpenChange(false);
          else onTap();
        }}
      >
        {children}
      </button>
    </div>
  );
}
