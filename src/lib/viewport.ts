import { isIOS, isStandalone } from './platform';

/**
 * Altura real de la pantalla en la CSS var --app-h.
 * En el iPhone, con la app instalada, iOS a veces calcula la ventana descontando la zona de la
 * Dynamic Island aunque la app la ocupa entera, y lo que va «abajo del todo» queda ~60 pt elevado.
 * Ahí la app ocupa toda la pantalla, así que se usa la altura del dispositivo.
 */
export function syncViewportHeight(): void {
  const update = () => {
    let h = window.innerHeight;
    if (isIOS() && isStandalone() && /iPhone|iPod/.test(navigator.userAgent)) {
      const landscape = window.innerWidth > window.innerHeight;
      h = landscape ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
    }
    document.documentElement.style.setProperty('--app-h', `${h}px`);
  };
  update();
  for (const ev of ['resize', 'orientationchange', 'pageshow']) window.addEventListener(ev, update);
  document.addEventListener('visibilitychange', update);
}
