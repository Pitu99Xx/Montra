import { useEffect, useState } from 'react';

/** Pantalla de ordenador: ventana de al menos 1024 px de ancho. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}
