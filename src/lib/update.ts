import { useEffect, useState } from 'react';

interface VersionInfo {
  version: string;
  commit: string;
}

const CHECK_EVERY_MS = 30 * 60 * 1000;

/** Devuelve la versión publicada si es distinta de la que se está ejecutando. */
export function useNewVersion(): VersionInfo | null {
  const [available, setAvailable] = useState<VersionInfo | null>(null);

  useEffect(() => {
    if (__APP_COMMIT__ === 'dev') return;
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const info = (await res.json()) as VersionInfo;
        if (alive && info.commit && info.commit !== __APP_COMMIT__) setAvailable(info);
      } catch {
        /* sin conexión: se vuelve a intentar más tarde */
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && check();
    check();
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return available;
}

export async function applyUpdate(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {
    /* no importa: index.html no se cachea */
  }
  location.reload();
}
