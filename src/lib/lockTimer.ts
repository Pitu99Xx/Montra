// Margen antes de volver a pedir el código: se guarda en el dispositivo la hora a la que se salió
// de la app, así también vale si iOS la cierra por detrás o se recarga para actualizar.
const HIDDEN_KEY = 'montra.hiddenAt';
const GRACE_KEY = 'montra.lockAfter';

export const LOCK_OPTIONS = [
  { minutes: 0, label: 'Al salir' },
  { minutes: 1, label: '1 min' },
  { minutes: 5, label: '5 min' },
  { minutes: 15, label: '15 min' },
];
export const DEFAULT_LOCK_MINUTES = 5;

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento: se bloquea siempre */
  }
};

export function graceMinutes(): number {
  const v = Number(read(GRACE_KEY));
  return read(GRACE_KEY) !== null && Number.isFinite(v) ? v : DEFAULT_LOCK_MINUTES;
}

export function setGraceMinutes(m: number) {
  write(GRACE_KEY, String(m));
}

export function markHidden() {
  write(HIDDEN_KEY, String(Date.now()));
}

export function markActive() {
  write(HIDDEN_KEY, null);
}

const withinGrace = (): boolean => {
  const t = Number(read(HIDDEN_KEY));
  const grace = graceMinutes();
  return !!t && grace > 0 && Date.now() - t < grace * 60_000;
};

/** Al abrir la app: bloqueada salvo que se saliera hace menos del margen. */
export const lockOnStartup = (): boolean => !withinGrace();

/** Al volver a primer plano: bloquear si se salió y ya pasó el margen. */
export const lockOnReturn = (): boolean => !!read(HIDDEN_KEY) && !withinGrace();
