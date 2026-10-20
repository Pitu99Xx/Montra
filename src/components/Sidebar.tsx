import type { ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { Logo } from './Logo';
import { IconBell } from './Icons';
import { useStore } from '../data/store';
import { nextReminder } from '../lib/reminders';

export interface NavItem<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
}

/** Barra lateral de la versión de ordenador. */
export function Sidebar<T extends string>({
  items,
  current,
  onSelect,
  authUser,
}: {
  items: NavItem<T>[];
  current: T;
  onSelect: (id: T) => void;
  authUser: User;
}) {
  const { user } = useStore();
  const next = user.notifications ? nextReminder(user.reminders) : null;
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Logo size={40} />
        <span className="serif" style={{ fontSize: 24, fontWeight: 500 }}>
          Montra
        </span>
      </div>
      <nav aria-label="Secciones" className="sidebar-nav">
        {items.map((it) => (
          <button
            type="button"
            key={it.id}
            className="sidebar-link"
            aria-current={current === it.id ? 'page' : undefined}
            onClick={() => onSelect(it.id)}
          >
            {it.icon}
            {it.label}
          </button>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      {next && (
        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconBell size={14} /> Próximo recordatorio
          </span>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{next.label}</span>
          <span className="row-sub">Actualizar el estado de las cuentas</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px' }}>
        {authUser.photoURL ? (
          <img src={authUser.photoURL} alt="" width={36} height={36} style={{ borderRadius: '50%' }} referrerPolicy="no-referrer" />
        ) : (
          <span className="acc-icon" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--gold)', fontSize: 13 }}>
            {(authUser.displayName ?? authUser.email ?? '?').charAt(0).toUpperCase()}
          </span>
        )}
        <span className="row-main">
          <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {authUser.displayName ?? authUser.email}
          </span>
          <span className="row-sub" style={{ fontSize: 12 }}>
            v{__APP_VERSION__} · Google
          </span>
        </span>
      </div>
    </aside>
  );
}
