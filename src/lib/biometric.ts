import { fromB64, toB64 } from './pin';

// Face ID / Touch ID mediante una passkey (WebAuthn) de este dispositivo.
// Es un cierre local: confirma que quien abre la app es el dueño del iPhone o del Mac.
//
// Las passkeys se sincronizan por el llavero de iCloud, y una passkey nueva con el mismo
// usuario sustituye a la anterior. Antes todas usaban el mismo usuario, así que al activarlo
// en el Mac se borraba la del iPhone (y al revés) y el desbloqueo dejaba de funcionar.
// Ahora cada dispositivo crea la suya, con un identificador propio.
const key = (uid: string) => `montra.bio.${uid}`;
const deviceKey = 'montra.bio.device';

const isMac = () => /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints <= 1;

/** «Touch ID» en el Mac, «Face ID» en el iPhone */
export function biometricName(): string {
  return isMac() ? 'Touch ID' : 'Face ID';
}

/** Pide al navegador que no borre el almacenamiento de la app (Safari lo limpia si no se usa). */
export function persistStorage(): void {
  try {
    navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    /* no disponible */
  }
}

export async function biometricAvailable(): Promise<boolean> {
  try {
    return (
      typeof PublicKeyCredential !== 'undefined' &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

export function biometricEnabled(uid: string): boolean {
  try {
    return !!localStorage.getItem(key(uid));
  } catch {
    return false;
  }
}

function deviceId(): string {
  let id = localStorage.getItem(deviceKey);
  if (!id) {
    id = toB64(crypto.getRandomValues(new Uint8Array(9)).buffer);
    localStorage.setItem(deviceKey, id);
  }
  return id;
}

export async function enableBiometric(uid: string, label: string): Promise<void> {
  const device = isMac() ? 'Mac' : 'iPhone';
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Montra', id: location.hostname },
      // Usuario distinto por dispositivo: así la passkey de un dispositivo no sustituye a la de otro
      user: {
        id: new TextEncoder().encode(`${uid.slice(0, 40)}:${deviceId()}`),
        name: `${label} · ${device}`,
        displayName: `Montra · ${device}`,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'required',
      },
      timeout: 60_000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error(`No se pudo registrar ${biometricName()}`);
  localStorage.setItem(key(uid), toB64(cred.rawId));
  persistStorage();
}

export function disableBiometric(uid: string): void {
  try {
    localStorage.removeItem(key(uid));
  } catch {
    /* sin almacenamiento */
  }
}

const getCredential = (allow: BufferSource | null) =>
  navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: location.hostname,
      allowCredentials: allow ? [{ type: 'public-key', id: allow }] : [],
      userVerification: 'required',
      timeout: 60_000,
    },
  }) as Promise<PublicKeyCredential | null>;

/**
 * Desbloqueo con Face ID / Touch ID.
 * - Normal: con la passkey guardada de este dispositivo (va directo a la cara o la huella).
 * - `discover`: busca cualquier passkey de Montra de esta cuenta en el llavero (por si la guardada
 *   ya no existe) y la recuerda para la próxima vez. iOS solo deja lanzarlo una vez por toque,
 *   así que se usa en el siguiente toque después de un fallo.
 */
export async function verifyBiometric(uid: string, discover = false): Promise<boolean> {
  const id = localStorage.getItem(key(uid));
  if (!id) return false;
  if (!discover) return !!(await getCredential(fromB64(id)));
  const res = await getCredential(null);
  if (!res) return false;
  // Solo vale una passkey de esta misma cuenta
  const handle = (res.response as AuthenticatorAssertionResponse).userHandle;
  const owner = handle ? new TextDecoder().decode(handle) : '';
  if (owner !== uid && !owner.startsWith(`${uid.slice(0, 40)}:`)) return false;
  localStorage.setItem(key(uid), toB64(res.rawId));
  return true;
}
