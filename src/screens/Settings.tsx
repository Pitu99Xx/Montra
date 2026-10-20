import { useEffect, useState } from 'react';
import { signOut, type User } from 'firebase/auth';
import { auth } from '../firebase';
import { Logo } from '../components/Logo';
import { Switch, toast } from '../components/ui';
import { IconBell, IconChevron, IconPlus } from '../components/Icons';
import type { Reminder, ThemePref } from '../data/model';
import { requestTestPush, saveUser } from '../data/actions';
import { useStore } from '../data/store';
import { biometricAvailable, biometricEnabled, disableBiometric, enableBiometric } from '../lib/biometric';
import { currencyName, currencySymbol } from '../lib/currency';
import { withoutLock } from '../lib/lockGuard';
import { isIOS, isStandalone } from '../lib/platform';
import { enablePush } from '../lib/push';
import { describeDays } from './ReminderEditor';

const THEMES: { id: ThemePref; label: string }[] = [
  { id: 'dark', label: 'Oscuro' },
  { id: 'light', label: 'Claro' },
  { id: 'system', label: 'Sistema' },
];

export function SettingsScreen({
  authUser,
  onChangePin,
  onPickCurrency,
  onEditReminder,
}: {
  authUser: User;
  onChangePin: () => void;
  onPickCurrency: () => void;
  onEditReminder: (r: Reminder | null) => void;
}) {
  const { uid, user } = useStore();
  const [bioAvail, setBioAvail] = useState(false);
  const [bio, setBio] = useState(() => biometricEnabled(uid));
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    biometricAvailable().then(setBioAvail);
  }, []);

  const toggleBio = async (on: boolean) => {
    if (!on) {
      disableBiometric(uid);
      setBio(false);
      return;
    }
    try {
      await withoutLock(() => enableBiometric(uid, authUser.email ?? 'Montra'));
      setBio(true);
    } catch {
      toast('No se pudo activar Face ID');
    }
  };

  const togglePush = async (on: boolean) => {
    if (!on) {
      await saveUser(uid, { notifications: false });
      return;
    }
    setPushBusy(true);
    try {
      await withoutLock(() => enablePush(uid));
      await saveUser(uid, {
        notifications: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || user.timezone,
      });
      toast('Notificaciones activadas');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudieron activar las notificaciones');
    } finally {
      setPushBusy(false);
    }
  };

  const initials = (authUser.displayName ?? authUser.email ?? '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <main className="screen">
      <header className="screen-header">
        <h1 className="screen-title">Ajustes</h1>
      </header>

      <section className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
        {authUser.photoURL ? (
          <img src={authUser.photoURL} alt="" width={48} height={48} style={{ borderRadius: '50%' }} referrerPolicy="no-referrer" />
        ) : (
          <span
            className="acc-icon"
            style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--gold)', color: '#07101F', fontSize: 16 }}
          >
            {initials}
          </span>
        )}
        <span className="row-main">
          <span className="row-title">{authUser.displayName ?? 'Tu cuenta'}</span>
          <span className="row-sub">{authUser.email} · Google</span>
        </span>
      </section>

      <span className="eyebrow">Seguridad</span>
      <section className="list">
        <button type="button" className="row" onClick={onChangePin}>
          <span className="row-main">
            <span className="row-title">Cambiar código PIN</span>
          </span>
          <IconChevron size={18} style={{ color: 'var(--faint)' }} />
        </button>
        {bioAvail && (
          <div className="row">
            <span className="row-main">
              <span className="row-title">Desbloquear con Face ID</span>
              <span className="row-sub">Solo en este dispositivo</span>
            </span>
            <Switch checked={bio} onChange={toggleBio} label="Desbloquear con Face ID" />
          </div>
        )}
      </section>
      <p className="hint">El código o Face ID se pedirá cada vez que vuelvas a abrir Montra.</p>

      <span className="eyebrow">Preferencias</span>
      <section className="list">
        <button type="button" className="row" onClick={onPickCurrency}>
          <span className="row-main">
            <span className="row-title">Divisa del total</span>
          </span>
          <span className="muted" style={{ fontSize: 15 }}>
            {currencyName(user.baseCurrency)} ({currencySymbol(user.baseCurrency)})
          </span>
          <IconChevron size={18} style={{ color: 'var(--faint)' }} />
        </button>
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <span className="row-title">Apariencia</span>
          <div className="segmented" role="group" aria-label="Apariencia" style={{ background: 'var(--bg)' }}>
            {THEMES.map((t) => (
              <button type="button" key={t.id} aria-pressed={user.theme === t.id} onClick={() => saveUser(uid, { theme: t.id })}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <span className="eyebrow">Notificaciones</span>
      <section className="list">
        <div className="row">
          <span className="row-main">
            <span className="row-title">Permitir notificaciones</span>
          </span>
          <Switch checked={user.notifications} onChange={togglePush} label="Permitir notificaciones" disabled={pushBusy} />
        </div>
        {user.reminders.map((r) => (
          <button type="button" key={r.id} className="row" onClick={() => onEditReminder(r)} style={{ opacity: r.enabled ? 1 : 0.55 }}>
            <IconBell size={20} style={{ color: 'var(--gold-text)' }} />
            <span className="row-main">
              <span className="row-title">
                {describeDays(r.days)} · {r.time}
              </span>
              <span className="row-sub">{r.enabled ? 'Actualizar el estado de las cuentas' : 'Desactivado'}</span>
            </span>
            <IconChevron size={18} style={{ color: 'var(--faint)' }} />
          </button>
        ))}
        <button type="button" className="row" onClick={() => onEditReminder(null)} style={{ color: 'var(--gold-text)' }}>
          <IconPlus size={20} />
          <span className="row-title">Añadir recordatorio</span>
        </button>
      </section>
      {isIOS() && !isStandalone() ? (
        <p className="hint">
          Para recibir avisos en el iPhone instala Montra: en Safari pulsa Compartir → «Añadir a pantalla de inicio» y ábrela desde ahí.
        </p>
      ) : (
        user.notifications && (
          <button
            type="button"
            className="link-btn"
            style={{ alignSelf: 'flex-start' }}
            onClick={async () => {
              await requestTestPush(uid);
              toast('Enviando notificación de prueba…');
            }}
          >
            Enviar notificación de prueba
          </button>
        )
      )}

      <button
        type="button"
        className="btn btn-danger"
        style={{ marginTop: 8 }}
        onClick={() => confirm('¿Cerrar sesión en este dispositivo?') && signOut(auth)}
      >
        Cerrar sesión
      </button>
      <footer style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 0 4px' }}>
        <Logo size={36} tile={false} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>Montra · versión {__APP_VERSION__}</span>
        <span className="row-sub">
          Actualizada el{' '}
          {new Date(__APP_BUILD_DATE__).toLocaleString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          · {__APP_COMMIT__}
        </span>
      </footer>
    </main>
  );
}
