import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { getRedirectResult, onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from './firebase';
import { ToastHost, Spinner } from './components/ui';
import { IconBriefcase, IconChart, IconGear, IconGrid, IconWallet } from './components/Icons';
import { Sidebar } from './components/Sidebar';
import { DESKTOP_QUERY, useMedia } from './lib/useMedia';
import { claimOrCheckOwner, saveUser, type OwnerState } from './data/actions';
import type { Account, Entry, Movement, Project, Reminder, ThemePref } from './data/model';
import { StoreProvider, useStore } from './data/store';
import { lockSuppressed } from './lib/lockGuard';
import { lockOnReturn, lockOnStartup, markActive, markHidden, setGraceMinutes } from './lib/lockTimer';
import { registerServiceWorker } from './lib/push';
import { persistStorage } from './lib/biometric';
import { applyUpdate, useNewVersion } from './lib/update';
import { AccountDetail } from './screens/AccountDetail';
import { GroupDetail } from './screens/GroupDetail';
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
import { ProjectDetail } from './screens/ProjectDetail';
import { MovementEditor, ProjectEditor, ProjectMinEditor } from './screens/ProjectEditors';

// La gráfica (Recharts) se carga solo al abrir «Evolución»
const EvolutionScreen = lazy(() => import('./screens/Evolution').then((m) => ({ default: m.EvolutionScreen })));
const SummaryScreen = lazy(() => import('./screens/Summary').then((m) => ({ default: m.SummaryScreen })));
const ProjectsScreen = lazy(() => import('./screens/Projects').then((m) => ({ default: m.ProjectsScreen })));

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
    persistStorage();
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

// «Resumen» solo existe en la versión de ordenador
type Tab = 'resumen' | 'cuentas' | 'evolucion' | 'proyectos' | 'ajustes';
const TABS: Tab[] = ['resumen', 'cuentas', 'evolucion', 'proyectos', 'ajustes'];
/** En la pila de fichas, los proyectos van con este prefijo (el resto son cuentas) */
const PROJ = 'p:';
type SheetState =
  | { kind: 'account'; account: Account | null; parentId?: string }
  | { kind: 'update'; groupId?: string }
  | { kind: 'currency' }
  | { kind: 'reminder'; reminder: Reminder | null }
  | { kind: 'entry'; entry: Entry | null; account: Account }
  | { kind: 'project'; project: Project | null }
  | { kind: 'movement'; project: Project; movement: Movement | null }
  | { kind: 'projectMin' }
  | null;

function wantsUpdate(url: string) {
  try {
    return new URL(url, location.origin).pathname.startsWith('/actualizar');
  } catch {
    return false;
  }
}

function Shell({ authUser }: { authUser: User }) {
  const { uid, user, userLoaded, accounts, projects } = useStore();
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
  const isDesktop = useMedia(DESKTOP_QUERY);
  const [tabState, setTab] = useState<Tab>(() => (window.matchMedia(DESKTOP_QUERY).matches ? 'resumen' : 'cuentas'));
  const tab: Tab = !isDesktop && tabState === 'resumen' ? 'cuentas' : tabState;
  const [sheet, setSheet] = useState<SheetState>(null);
  const [changingPin, setChangingPin] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState(() => wantsUpdate(location.href));
  const newVersion = useNewVersion();
  // Ficha de una cuenta abierta (entra desde la derecha)
  // Fichas abiertas, apiladas (p. ej. Revolut → Dólares); al volver se cierra la de arriba
  const [detailStack, setDetailStack] = useState<string[]>([]);
  const [closingTop, setClosingTop] = useState(false);
  const openDetail = useCallback((id: string) => setDetailStack((st) => [...st, id]), []);
  const closeDetail = useCallback(() => {
    setClosingTop(true);
    window.setTimeout(() => {
      setDetailStack((st) => st.slice(0, -1));
      setClosingTop(false);
    }, 240);
  }, []);
  // Esc cierra la ficha de arriba (si no hay una hoja abierta encima)
  useEffect(() => {
    if (!detailStack.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.sheet-backdrop')) closeDetail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailStack.length, closeDetail]);

  // Si una cuenta abierta deja de existir (eliminada), se quita de la pila
  useEffect(() => {
    if (closingTop) return;
    const alive = detailStack.filter((id) =>
      id.startsWith(PROJ) ? projects.some((p) => PROJ + p.id === id) : accounts.some((a) => a.id === id),
    );
    if (alive.length !== detailStack.length) setDetailStack(alive);
  }, [detailStack, accounts, projects, closingTop]);
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
    <div className={`app${isDesktop ? ' desk' : ''}`}>
      {isDesktop && (
        <Sidebar
          authUser={authUser}
          current={tab}
          onSelect={selectTab}
          items={[
            { id: 'resumen', label: 'Resumen', icon: <IconGrid size={20} /> },
            { id: 'cuentas', label: 'Cuentas', icon: <IconWallet size={20} /> },
            { id: 'evolucion', label: 'Evolución', icon: <IconChart size={20} /> },
            { id: 'proyectos', label: 'Proyectos', icon: <IconBriefcase size={20} /> },
            { id: 'ajustes', label: 'Ajustes', icon: <IconGear size={20} /> },
          ]}
        />
      )}
      <div className="app-scroll">
        <div key={tab} className={`tab-view ${tabDir}`}>
          {tab === 'resumen' && (
            <Suspense fallback={<Splash />}>
              <SummaryScreen
                onOpen={(account) => openDetail(account.id)}
                onCreate={() => setSheet({ kind: 'account', account: null })}
                onUpdateAll={() => setSheet({ kind: 'update' })}
                onEditEntry={(entry, account) => setSheet({ kind: 'entry', entry, account })}
              />
            </Suspense>
          )}
          {tab === 'cuentas' && (
            <AccountsScreen
              onCreate={() => setSheet({ kind: 'account', account: null })}
              onOpen={(account) => openDetail(account.id)}
              onEdit={(account) => setSheet({ kind: 'account', account })}
              onUpdateAll={() => setSheet({ kind: 'update' })}
            />
          )}
          {tab === 'evolucion' && (
            <Suspense fallback={<Splash />}>
              <EvolutionScreen onEditEntry={(entry, account) => setSheet({ kind: 'entry', entry, account })} />
            </Suspense>
          )}
          {tab === 'proyectos' && (
            <Suspense fallback={<Splash />}>
              <ProjectsScreen
                onOpen={(p) => openDetail(PROJ + p.id)}
                onCreate={() => setSheet({ kind: 'project', project: null })}
                onEditMin={() => setSheet({ kind: 'projectMin' })}
              />
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

      {!isDesktop && (
        <nav className="tabbar" aria-label="Secciones">
          <div className="tabbar-inner">
            <TabButton id="cuentas" tab={tab} setTab={selectTab} label="Cuentas" icon={<IconWallet />} />
            <TabButton id="evolucion" tab={tab} setTab={selectTab} label="Evolución" icon={<IconChart />} />
            <TabButton id="proyectos" tab={tab} setTab={selectTab} label="Proyectos" icon={<IconBriefcase />} />
            <TabButton id="ajustes" tab={tab} setTab={selectTab} label="Ajustes" icon={<IconGear />} />
          </div>
        </nav>
      )}

      {/* Ordenador: el resto de la página se desenfoca; al pulsarlo se vuelve atrás */}
      {isDesktop && detailStack.length > 0 && (
        <div
          className={`detail-backdrop${closingTop && detailStack.length === 1 ? ' closing' : ''}`}
          onClick={closeDetail}
          aria-hidden="true"
        />
      )}

      {detailStack.map((id, i) => {
        const closing = closingTop && i === detailStack.length - 1;
        if (id.startsWith(PROJ)) {
          const project = projects.find((p) => PROJ + p.id === id);
          if (!project) return null;
          return (
            <ProjectDetail
              key={`${id}-${i}`}
              project={project}
              closing={closing}
              onBack={closeDetail}
              onEdit={() => setSheet({ kind: 'project', project })}
              onEditMovement={(movement) => setSheet({ kind: 'movement', project, movement })}
            />
          );
        }
        const acc = accounts.find((a) => a.id === id);
        if (!acc) return null;
        return acc.isGroup ? (
          <GroupDetail
            key={`${id}-${i}`}
            group={acc}
            closing={closing}
            onBack={closeDetail}
            onEditGroup={() => setSheet({ kind: 'account', account: acc })}
            onOpenChild={(c) => openDetail(c.id)}
            onAddChild={() => setSheet({ kind: 'account', account: null, parentId: acc.id })}
            onUpdateGroup={() => setSheet({ kind: 'update', groupId: acc.id })}
            onEditEntry={(entry, account) => setSheet({ kind: 'entry', entry, account })}
          />
        ) : (
          <AccountDetail
            key={`${id}-${i}`}
            account={acc}
            closing={closing}
            backLabel={i > 0 ? accounts.find((a) => a.id === detailStack[i - 1])?.name : undefined}
            onBack={closeDetail}
            onEditAccount={() => setSheet({ kind: 'account', account: acc })}
            onEditEntry={(entry) => setSheet({ kind: 'entry', entry, account: acc })}
            onAddEntry={() => setSheet({ kind: 'entry', entry: null, account: acc })}
          />
        );
      })}

      {sheet?.kind === 'account' && <AccountEditor account={sheet.account} parentId={sheet.parentId} onClose={close} />}
      {sheet?.kind === 'entry' && <EntryEditor entry={sheet.entry} account={sheet.account} onClose={close} />}
      {sheet?.kind === 'update' && <UpdateBalances groupId={sheet.groupId} onClose={close} />}
      {sheet?.kind === 'project' && (
        <ProjectEditor project={sheet.project} onClose={close} onCreated={(id) => openDetail(PROJ + id)} />
      )}
      {sheet?.kind === 'movement' && (
        <MovementEditor
          project={projects.find((p) => p.id === sheet.project.id) ?? sheet.project}
          movement={sheet.movement}
          onClose={close}
        />
      )}
      {sheet?.kind === 'projectMin' && <ProjectMinEditor onClose={close} />}
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
