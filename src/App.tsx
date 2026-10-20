import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { getRedirectResult, onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from './firebase';
import { ToastHost, Spinner } from './components/ui';
import { IconChart, IconGear, IconWallet } from './components/Icons';
import { claimOrCheckOwner, saveUser, type OwnerState } from './data/actions';
import type { Account, Entry, Reminder, ThemePref } from './data/model';
import { StoreProvider, useStore } from './data/store';
import { lockSuppressed } from './lib/lockGuard';
import { lockOnReturn, lockOnStartup, markActive, markHidden, setGraceMinutes } from './lib/lockTimer';
import { registerServiceWorker } from './lib/push';
import { applyUpdate, useNewVersion } from './lib/update';
import { AccountDetail } from './screens/AccountDetail';
import { AccountEditor } from './screens/AccountEditor';
import { EntryEditor } from './screens/EntryEditor';
import { AccountsScreen } from './screens/Accounts';
import { CurrencyPicker } from './screens/CurrencyPicker';
import { LockScreen, RESET_PIN_FLAG } from './screens/Lock';
import { LoginScreen, NotOwnerScreen, authErrorMessage } from './screens/Login';
import { PinSetup } from './screens/PinSetup';
import { ReminderEditor } from './screens/ReminderEditor';
import { SettingsScreen } from './screens/Settings';
import { UpdateBalances } from './screens/UpdateBalances';

// La gráfica (Recharts) se carga solo al abrir «Evolución»
const EvolutionScreen = lazy(() => import('./screens/Evolution').then((m) => ({ default: m.EvolutionScreen })));

const THEME_KEY = 'montra.theme';

export function applyTheme(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && !window.matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0B1B33' : '#F4F1EA');
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* sin almacenamiento */
  }
}

export function initialTheme(): ThemePref {
  try {
    return (localStorage.getItem(THEME_KEY) as ThemePref) || 'dark';
  } catch {
    return 'dark';
  }
}

function Splash() {
  return (
    <main className="center-screen" style={{ justifyContent: 'center' }}>
      <Spinner />
    </main>
  );
}

export function App() {
  const [authUser, setAuthUser] = useState<User | null | undefined>(undefined);
  const [owner, setOwner] = useState<OwnerState | null>(null);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    registerServiceWorker();
    getRedirectResult(auth).catch((e) => setLoginError(authErrorMessage((e as { code?: string }).code)));
    return onAuthStateChanged(auth, (u) => {
      setOwner(null);
      setAuthUser(u);
    });
  }, []);

  useEffect(() => {
    if (!authUser) return;
    claimOrCheckOwner(authUser.uid)
      .then(setOwner)
      .catch(() => setOwner('other'));
  }, [authUser]);

  if (authUser === undefined) return <Splash />;
  if (authUser === null) return <LoginScreen initialError={loginError} />;
  if (owner === null) return <Splash />;
  if (owner === 'other') return <NotOwnerScreen onSignOut={() => signOut(auth)} />;
  return (
    <StoreProvider uid={authUser.uid}>
      <Shell authUser={authUser} />
      <ToastHost />
    </StoreProvider>
  );
}

type Tab = 'cuentas' | 'evolucion' | 'ajustes';
const TABS: Tab[] = ['cuentas', 'evolucion', 'ajustes'];
type SheetState =
  | { kind: 'account'; account: Account | null }
  | { kind: 'update' }
  | { kind: 'currency' }
  | { kind: 'reminder'; reminder: Reminder | null }
  | { kind: 'entry'; entry: Entry | null; account: Account }
  | null;

function wantsUpdate(url: string) {
  try {
    return new URL(url, location.origin).pathname.startsWith('/actualizar');
  } catch {
    return false;
  }
}

function Shell({ authUser }: { authUser: User }) {
  const { uid, user, userLoaded, accounts } = useStore();
  const [locked, setLocked] = useState(lockOnStartup);
  const [resetPin, setResetPin] = useState(() => {
    try {
      return localStorage.getItem(RESET_PIN_FLAG) === '1';
    } catch {
      return false;
    }
  });
  // Se mantiene la pantalla de alta del PIN hasta que termine (incluido el paso de Face ID),
  // aunque el PIN ya se haya guardado y llegue por la suscripción a Firestore.
  const [inSetup, setInSetup] = useState(false);
  const [tab, setTab] = useState<Tab>('cuentas');
  const [sheet, setSheet] = useState<SheetState>(null);
  const [changingPin, setChangingPin] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState(() => wantsUpdate(location.href));
  const newVersion = useNewVersion();
  // Ficha de una cuenta abierta (entra desde la derecha)
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailClosing, setDetailClosing] = useState(false);
  const detailAccount = detailId ? accounts.find((a) => a.id === detailId) : undefined;
  const closeDetail = useCallback(() => {
    setDetailClosing(true);
    window.setTimeout(() => {
      setDetailId(null);
      setDetailClosing(false);
    }, 240);
  }, []);
  // Si la cuenta se elimina con la ficha abierta, se cierra
  useEffect(() => {
    if (detailId && !detailAccount && !detailClosing) setDetailId(null);
  }, [detailId, detailAccount, detailClosing]);
  // Dirección del deslizamiento al cambiar de pestaña (hacia la derecha o la izquierda)
  const [tabDir, setTabDir] = useState<'from-right' | 'from-left'>('from-right');
  const selectTab = useCallback(
    (next: Tab) => {
      if (next === tab) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setTabDir(TABS.indexOf(next) > TABS.indexOf(tab) ? 'from-right' : 'from-left');
      setTab(next);
    },
    [tab],
  );

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  useEffect(() => {
    if (userLoaded) applyTheme(user.theme);
    if (user.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const on = () => applyTheme('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [user.theme, userLoaded]);

  // Al salir de la app se apunta la hora; al volver se bloquea si pasó el margen elegido en Ajustes
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        if (!lockSuppressed()) markHidden();
        return;
      }
      if (lockOnReturn()) setLocked(true);
      markActive();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', markHidden);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', markHidden);
    };
  }, []);

  useEffect(() => {
    if (userLoaded && user.lockAfter !== undefined) setGraceMinutes(user.lockAfter);
  }, [userLoaded, user.lockAfter]);

  // Al tocar un recordatorio: abrir «Actualizar saldos»
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'open' && wantsUpdate(e.data.url)) setPendingUpdate(true);
    };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    if (!locked && pendingUpdate) {
      setPendingUpdate(false);
      setTab('cuentas');
      setSheet({ kind: 'update' });
      history.replaceState(null, '', '/');
    }
  }, [locked, pendingUpdate]);

  // Primera vez: guardar la zona horaria para los recordatorios
  useEffect(() => {
    if (userLoaded && !user.pin) {
      saveUser(uid, {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid',
      });
    }
  }, [userLoaded, user.pin, uid]);

  const finishSetup = useCallback(() => {
    try {
      localStorage.removeItem(RESET_PIN_FLAG);
    } catch {
      /* sin almacenamiento */
    }
    setResetPin(false);
    setInSetup(false);
    setLocked(false);
  }, []);

  useEffect(() => {
    if (userLoaded && (!user.pin || resetPin)) setInSetup(true);
  }, [userLoaded, user.pin, resetPin]);

  if (!userLoaded) return <Splash />;
  const label = authUser.email ?? 'Montra';
  if (inSetup || !user.pin || resetPin) return <PinSetup uid={uid} label={label} onDone={finishSetup} />;
  if (locked) return <LockScreen uid={uid} pin={user.pin} onUnlock={() => setLocked(false)} />;
  if (changingPin)
    return (
      <PinSetup
        uid={uid}
        label={label}
        current={user.pin}
        onDone={() => setChangingPin(false)}
        onCancel={() => setChangingPin(false)}
      />
    );

  const close = () => setSheet(null);

  return (
    <div className="app">
      <div className="app-scroll">
        <div key={tab} className={`tab-view ${tabDir}`}>
          {tab === 'cuentas' && (
            <AccountsScreen
              onCreate={() => setSheet({ kind: 'account', account: null })}
              onOpen={(account) => setDetailId(account.id)}
              onEdit={(account) => setSheet({ kind: 'account', account })}
              onUpdateAll={() => setSheet({ kind: 'update' })}
            />
          )}
          {tab === 'evolucion' && (
            <Suspense fallback={<Splash />}>
              <EvolutionScreen onEditEntry={(entry, account) => setSheet({ kind: 'entry', entry, account })} />
            </Suspense>
          )}
          {tab === 'ajustes' && (
            <SettingsScreen
              authUser={authUser}
              onChangePin={() => setChangingPin(true)}
              onPickCurrency={() => setSheet({ kind: 'currency' })}
              onEditReminder={(reminder) => setSheet({ kind: 'reminder', reminder })}
            />
          )}
        </div>
      </div>

      {newVersion && (
        <div className="update-banner" role="status">
          <span className="row-main">
            <span style={{ fontWeight: 600, fontSize: 15 }}>Nueva versión {newVersion.version}</span>
            <span className="row-sub">Toca «Actualizar» para usarla ya</span>
          </span>
          <button type="button" className="btn btn-primary" onClick={applyUpdate}>
            Actualizar
          </button>
        </div>
      )}

      <nav className="tabbar" aria-label="Secciones">
        <div className="tabbar-inner">
          <TabButton id="cuentas" tab={tab} setTab={selectTab} label="Cuentas" icon={<IconWallet />} />
          <TabButton id="evolucion" tab={tab} setTab={selectTab} label="Evolución" icon={<IconChart />} />
          <TabButton id="ajustes" tab={tab} setTab={selectTab} label="Ajustes" icon={<IconGear />} />
        </div>
      </nav>

      {detailAccount && (
        <AccountDetail
          account={detailAccount}
          closing={detailClosing}
          onBack={closeDetail}
          onEditAccount={() => setSheet({ kind: 'account', account: detailAccount })}
          onEditEntry={(entry) => setSheet({ kind: 'entry', entry, account: detailAccount })}
          onAddEntry={() => setSheet({ kind: 'entry', entry: null, account: detailAccount })}
        />
      )}

      {sheet?.kind === 'account' && <AccountEditor account={sheet.account} onClose={close} />}
      {sheet?.kind === 'entry' && <EntryEditor entry={sheet.entry} account={sheet.account} onClose={close} />}
      {sheet?.kind === 'update' && <UpdateBalances onClose={close} />}
      {sheet?.kind === 'reminder' && <ReminderEditor reminder={sheet.reminder} onClose={close} />}
      {sheet?.kind === 'currency' && (
        <CurrencyPicker
          title="Divisa del total"
          value={user.baseCurrency}
          onPick={(c) => saveUser(uid, { baseCurrency: c })}
          onClose={close}
        />
      )}
    </div>
  );
}

function TabButton({
  id,
  tab,
  setTab,
  label,
  icon,
}: {
  id: Tab;
  tab: Tab;
  setTab: (t: Tab) => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button type="button" className="tab" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
      {icon}
      {label}
    </button>
  );
}
