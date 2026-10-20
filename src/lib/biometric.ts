import { fromB64, toB64 } from './pin';

// Face ID / Touch ID mediante una passkey (WebAuthn) de este dispositivo.
// Es un cierre local: confirma que quien abre la app es el dueño del iPhone.
const key = (uid: string) => `montra.bio.${uid}`;

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

export async function enableBiometric(uid: string, label: string): Promise<void> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Montra', id: location.hostname },
      user: { id: new TextEncoder().encode(uid.slice(0, 64)), name: label, displayName: label },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60_000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('No se pudo registrar Face ID');
  localStorage.setItem(key(uid), toB64(cred.rawId));
}

export function disableBiometric(uid: string): void {
  try {
    localStorage.removeItem(key(uid));
  } catch {
    /* sin almacenamiento */
  }
}

export async function verifyBiometric(uid: string): Promise<boolean> {
  const id = localStorage.getItem(key(uid));
  if (!id) return false;
  const res = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: fromB64(id) }],
      userVerification: 'required',
      timeout: 60_000,
    },
  });
  return !!res;
}
