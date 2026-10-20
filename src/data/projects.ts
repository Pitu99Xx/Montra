import { collection, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Movement, Project, Scenario } from './model';

const projectsCol = (uid: string) => collection(db, 'users', uid, 'projects');

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Crea o guarda un proyecto completo (los movimientos van dentro del propio documento). */
export async function saveProject(uid: string, project: Project): Promise<string> {
  const { id, ...data } = project;
  const ref = id ? doc(projectsCol(uid), id) : doc(projectsCol(uid));
  await setDoc(ref, data);
  return ref.id;
}

export function deleteProject(uid: string, project: Project) {
  return deleteDoc(doc(projectsCol(uid), project.id));
}

export function saveMovement(uid: string, project: Project, movement: Movement) {
  const exists = project.movements.some((m) => m.id === movement.id);
  const movements = exists
    ? project.movements.map((m) => (m.id === movement.id ? movement : m))
    : [...project.movements, movement];
  return saveProject(uid, { ...project, movements });
}

export function deleteMovement(uid: string, project: Project, movement: Movement) {
  return saveProject(uid, { ...project, movements: project.movements.filter((m) => m.id !== movement.id) });
}

// ---------------------------------------------------------------------------------------------
// Cálculos (siempre con el tipo de cambio del día, como los saldos de las cuentas)

type Convert = (amount: number, from: string) => number | null;

/** Importe con signo en la divisa base, ajustado al escenario (el margen encarece gastos o recorta ingresos). */
export function movementValue(m: Movement, margin: number, scenario: Scenario, valueIn: Convert): number | null {
  const v = valueIn(m.amount, m.currency);
  if (v === null) return null;
  const k = margin / 100;
  const factor =
    scenario === 'expected' ? 1 : (scenario === 'pessimistic') === (m.kind === 'expense') ? 1 + k : Math.max(0, 1 - k);
  return (m.kind === 'expense' ? -v : v) * factor;
}

export interface ProjectTotals {
  income: number;
  expense: number;
  net: number;
  /** Movimientos cuya divisa aún no tiene tipo de cambio */
  missing: number;
}

export function projectTotals(p: Project, scenario: Scenario, valueIn: Convert): ProjectTotals {
  let income = 0;
  let expense = 0;
  let missing = 0;
  for (const m of p.movements) {
    const v = movementValue(m, p.margin, scenario, valueIn);
    if (v === null) missing++;
    else if (v >= 0) income += v;
    else expense -= v;
  }
  return { income, expense, net: income - expense, missing };
}

/** Momento en que se aplica un movimiento en la proyección (los «sin fecha», después del último). */
export function movementTime(m: Movement): number | null {
  if (m.dateMode === 'none' || !m.date) return null;
  if (m.dateMode === 'month') {
    const [y, mo] = m.date.split('-').map(Number);
    return new Date(y, mo - 1, 15, 12).getTime();
  }
  return new Date(`${m.date}T12:00`).getTime();
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

/** «12 mar 2027», «≈ mar 2027» o «Sin fecha» */
export function movementDateLabel(m: Movement): string {
  if (m.dateMode === 'none' || !m.date) return 'Sin fecha';
  const [y, mo, d] = m.date.split('-').map(Number);
  return m.dateMode === 'month' ? `≈ ${MONTHS[mo - 1]} ${y}` : `${d} ${MONTHS[mo - 1]} ${y}`;
}

/** Clave de agrupación por mes («2027-03») o «none» */
export function movementMonth(m: Movement): string {
  return m.dateMode === 'none' || !m.date ? 'none' : m.date.slice(0, 7);
}

export function monthTitle(key: string): string {
  if (key === 'none') return 'Sin fecha';
  const [y, mo] = key.split('-').map(Number);
  const s = new Date(y, mo - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface ProjectionStep {
  t: number;
  movement: Movement;
  project: Project;
  value: number;
  /** Saldo total después de aplicarlo */
  balance: number;
  undated: boolean;
}

/**
 * Aplica los movimientos de los proyectos elegidos sobre el total de hoy, en orden de fecha.
 * Los ya vencidos (fecha pasada) se aplican hoy; los «sin fecha», al final.
 */
export function buildProjection(projects: Project[], start: number, scenario: Scenario, valueIn: Convert) {
  const now = Date.now();
  const items: { t: number | null; movement: Movement; project: Project; value: number }[] = [];
  for (const p of projects) {
    for (const m of p.movements) {
      const value = movementValue(m, p.margin, scenario, valueIn);
      if (value === null) continue;
      const t = movementTime(m);
      items.push({ t: t === null ? null : Math.max(t, now), movement: m, project: p, value });
    }
  }
  const dated = items.filter((i) => i.t !== null).sort((a, b) => a.t! - b.t!);
  const lastT = dated.length ? dated[dated.length - 1].t! : now;
  // Los «sin fecha» se colocan un mes después del último movimiento con fecha
  const undatedT = lastT + 30 * 86_400_000;
  const ordered = [...dated, ...items.filter((i) => i.t === null).map((i) => ({ ...i, t: undatedT }))];
  let balance = start;
  const steps: ProjectionStep[] = ordered.map((i) => {
    balance += i.value;
    return {
      t: i.t!,
      movement: i.movement,
      project: i.project,
      value: i.value,
      balance,
      undated: i.movement.dateMode === 'none' || !i.movement.date,
    };
  });
  // Un punto por fecha: los movimientos del mismo día (o del mismo mes aproximado) se aplican juntos
  const points: { t: number; balance: number }[] = [];
  for (const s of steps) {
    const last = points[points.length - 1];
    if (last?.t === s.t) last.balance = s.balance;
    else points.push({ t: s.t, balance: s.balance });
  }
  let min = { t: now, balance: start };
  for (const pt of points) if (pt.balance < min.balance) min = pt;
  return { steps, points, final: balance, min, end: ordered.length ? ordered[ordered.length - 1].t! : now };
}
