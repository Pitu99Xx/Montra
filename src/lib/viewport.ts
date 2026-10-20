import { useEffect } from 'react';
import { isIOS, isStandalone } from './platform';

/*
 * Con la app instalada, iOS a veces deja la vista web unos 60 pt más corta que la pantalla
 * y no dibuja nada en esa franja inferior: solo se ve el color de fondo del documento.
 * 1) Se detecta y se marca <html class="ios-clipped">, para no reservar el margen de la barra
 *    de inicio (queda fuera de la vista).
 * 2) El fondo del documento toma el color de lo que esté abajo del todo (barra, hoja, ficha…),
 *    así la franja parece parte de ello.
 */
export function watchViewport(): void {
  const update = () => {
    const portrait = window.innerHeight >= window.innerWidth;
    const screenH = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    const clipped = isIOS() && isStandalone() && screenH - window.innerHeight > 30;
    document.documentElement.classList.toggle('ios-clipped', clipped);
  };
  update();
  for (const ev of ['resize', 'orientationchange', 'pageshow']) window.addEventListener(ev, update);
  document.addEventListener('visibilitychange', update);
}

const bandStack: string[] = [];
const applyBand = () => {
  const top = bandStack[bandStack.length - 1];
  document.documentElement.style.backgroundColor = top ? `var(${top})` : '';
};

/** Mientras el componente esté montado, la franja inferior toma el color indicado (token CSS). */
export function useBottomBand(token: string) {
  useEffect(() => {
    bandStack.push(token);
    applyBand();
    return () => {
      const i = bandStack.lastIndexOf(token);
      if (i >= 0) bandStack.splice(i, 1);
      applyBand();
    };
  }, [token]);
}
