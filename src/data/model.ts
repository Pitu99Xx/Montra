import type { PinRecord } from '../lib/pin';

export type AccountType = 'corriente' | 'ahorro' | 'inversion' | 'efectivo' | 'otra';
/** Preparado para el futuro: las cuentas «liability» (tarjetas, préstamos) restan del total. */
export type AccountKind = 'asset' | 'liability';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  kind: AccountKind;
  currency: string;
  color: string;
  balance: number;
  includeInTotal: boolean;
  order: number;
  updatedAt?: Date;
  /** Cuenta eliminada: no se muestra, pero su historial se conserva en la evolución */
  archived?: boolean;
  /** Cuenta con subcuentas: no tiene saldo propio, su saldo es la suma de sus subcuentas */
  isGroup?: boolean;
  /** Subcuenta: id de la cuenta con subcuentas a la que pertenece */
  parentId?: string | null;
}

/** Cómo se introdujo un registro */
export type EntrySource = 'initial' | 'update' | 'edit' | 'closed' | 'migrated';

/** Un valor introducido: el saldo de una cuenta en un momento dado. */
export interface Entry {
  id: string;
  accountId: string;
  balance: number;
  currency: string;
  /** Momento al que corresponde el saldo (editable) */
  at: Date;
  /** Cuándo se introdujo */
  createdAt: Date;
  source: EntrySource;
  /** Agrupa los registros de una misma «Actualización de saldos» */
  batchId?: string;
  note?: string;
  /** Tipos del BCE (unidades por 1 EUR) en el momento de introducirlo */
  rates?: Record<string, number> | null;
}

export const SOURCE_LABEL: Record<EntrySource, string> = {
  initial: 'Saldo inicial · cuenta creada',
  update: 'Actualización de saldos',
  edit: 'Editado a mano',
  closed: 'Cuenta eliminada',
  migrated: 'Actualización de saldos',
};

export interface Reminder {
  id: string;
  /** 0 = domingo … 6 = sábado */
  days: number[];
  /** «HH:MM» en la zona horaria del usuario */
  time: string;
  enabled: boolean;
}

export type ThemePref = 'dark' | 'light' | 'system';

export interface UserDoc {
  baseCurrency: string;
  theme: ThemePref;
  notifications: boolean;
  timezone: string;
  reminders: Reminder[];
  pin?: PinRecord;
  reminderState?: Record<string, string>;
  /** Los puntos antiguos (snapshots) ya se convirtieron en registros */
  entriesMigrated?: boolean;
  /** Minutos fuera de la app antes de volver a pedir el código (0 = siempre) */
  lockAfter?: number;
  /** Ya se agruparon automáticamente las cuentas de Revolut como subcuentas (1.9.0) */
  autoGroupDone?: boolean;
  /** Ya se repararon los importes sin decimales mal leídos (1.10.4) */
  zeroDecimalFixed?: boolean;
  /** Proyectos: saldo mínimo deseado (en la divisa base) para avisar en la proyección */
  projectMin?: number | null;
}

export interface SnapshotAccount {
  name: string;
  color: string;
  currency: string;
  balance: number;
  valueEUR: number | null;
  included: boolean;
  kind: AccountKind;
}

export interface Snapshot {
  id: string;
  at: Date;
  totalEUR: number;
  rates: Record<string, number>;
  accounts: Record<string, SnapshotAccount>;
}

export interface Rates {
  base: 'EUR';
  date: string;
  rates: Record<string, number>;
}

export const ACCOUNT_TYPES: { id: AccountType; label: string }[] = [
  { id: 'corriente', label: 'Corriente' },
  { id: 'ahorro', label: 'Ahorro' },
  { id: 'inversion', label: 'Inversión' },
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'otra', label: 'Otra' },
];

export const ACCOUNT_COLORS: { hex: string; label: string }[] = [
  { hex: '#C9A45C', label: 'Oro' },
  { hex: '#9CC3F5', label: 'Cielo' },
  { hex: '#7FD1B9', label: 'Menta' },
  { hex: '#F2A38E', label: 'Coral' },
  { hex: '#B9A7F2', label: 'Lavanda' },
  { hex: '#F0A6CA', label: 'Rosa' },
  { hex: '#E8D5A8', label: 'Arena' },
  { hex: '#A9B6C9', label: 'Pizarra' },
];

export const DEFAULT_USER: UserDoc = {
  baseCurrency: 'EUR',
  theme: 'dark',
  notifications: false,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid',
  reminders: [],
};

/** Proyectos: previsiones de gastos e ingresos que aún no han ocurrido (no cambian las cuentas). */
export type MovementKind = 'expense' | 'income';
/** Fecha exacta (AAAA-MM-DD), aproximada (solo mes, AAAA-MM) o sin fecha */
export type MovementDateMode = 'exact' | 'month' | 'none';

export interface Movement {
  id: string;
  kind: MovementKind;
  concept: string;
  /** Importe positivo; el signo lo da «kind» */
  amount: number;
  currency: string;
  dateMode: MovementDateMode;
  date?: string | null;
  note?: string;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  /** Incluido en la simulación */
  selected: boolean;
  /** Margen de imprevistos en % para los escenarios optimista y pesimista */
  margin: number;
  order: number;
  movements: Movement[];
  /** Fecha del proyecto entero: si la tiene, todos sus movimientos se aplican de golpe en ella
   *  (las fechas de cada movimiento se conservan, pero no se usan en la previsión) */
  dateMode?: MovementDateMode;
  date?: string | null;
}

export type Scenario = 'expected' | 'pessimistic' | 'optimistic';
