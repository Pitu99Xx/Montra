// Los diálogos del sistema (Face ID, permiso de notificaciones…) pueden ocultar la página
// un instante; mientras están abiertos no queremos volver a bloquear la app.
let pending = 0;
let graceUntil = 0;

export function lockSuppressed(): boolean {
  return pending > 0 || Date.now() < graceUntil;
}

export async function withoutLock<T>(fn: () => Promise<T>): Promise<T> {
  pending++;
  try {
    return await fn();
  } finally {
    pending--;
    graceUntil = Date.now() + 1500;
  }
}
