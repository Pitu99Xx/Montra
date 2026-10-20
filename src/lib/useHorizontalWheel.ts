import { useCallback, useRef } from 'react';

/**
 * Fila que se desplaza en horizontal sin barra visible: con la rueda del ratón (vertical) también
 * se mueve hacia los lados. El panel táctil y el arrastre en el móvil funcionan igual que antes.
 * Devuelve una «ref» de función, así funciona aunque la fila aparezca más tarde.
 */
export function useHorizontalWheel<T extends HTMLElement>() {
  const cleanup = useRef<(() => void) | null>(null);
  return useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      const next = Math.max(0, Math.min(max, el.scrollLeft + e.deltaY));
      if (next === el.scrollLeft) return; // en un extremo: deja que la página siga desplazándose
      e.preventDefault();
      el.scrollLeft = next;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    cleanup.current = () => el.removeEventListener('wheel', onWheel);
  }, []);
}
