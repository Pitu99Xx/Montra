import { useEffect } from 'react';

/*
 * Con la app instalada, iOS a veces deja la vista web unos 60 pt más corta que la pantalla y en esa
 * franja inferior solo se ve el color de fondo del documento. Para que no se note, el fondo toma
 * el color de lo que esté abajo del todo (barra, hoja, ficha…).
 */
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
