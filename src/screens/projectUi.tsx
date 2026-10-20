import type { Project } from '../data/model';
import { movementTime } from '../data/projects';
import { formatMoney } from '../lib/currency';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
export const monthYear = (t: number) => {
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export const signed = (v: number, code: string) =>
  `${v > 0.004 ? '+' : v < -0.004 ? '−' : ''}${formatMoney(Math.abs(v), code)}`;

/** Icono de un proyecto: cuadrado de su color con la inicial. */
export function ProjectIcon({ project, size = 40 }: { project: Pick<Project, 'name' | 'color'>; size?: number }) {
  return (
    <span
      className="acc-icon"
      style={{ background: project.color, width: size, height: size, borderRadius: size * 0.3, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {project.name.trim().charAt(0).toUpperCase() || 'P'}
    </span>
  );
}

/** «3 gastos · 1 ingreso · feb–mar 2027» */
export function projectMeta(p: Project): string {
  const exp = p.movements.filter((m) => m.kind === 'expense').length;
  const inc = p.movements.length - exp;
  const parts: string[] = [];
  if (exp) parts.push(`${exp} ${exp === 1 ? 'gasto' : 'gastos'}`);
  if (inc) parts.push(`${inc} ${inc === 1 ? 'ingreso' : 'ingresos'}`);
  if (!parts.length) return 'Sin movimientos';
  const times = p.movements.map(movementTime).filter((t): t is number => t !== null);
  if (times.length) {
    const a = monthYear(Math.min(...times));
    const b = monthYear(Math.max(...times));
    if (a === b) parts.push(a);
    else {
      const [ma, ya] = a.split(' ');
      const [mb, yb] = b.split(' ');
      parts.push(ya === yb ? `${ma}–${mb} ${yb}` : `${a} – ${b}`);
    }
  } else parts.push('sin fecha');
  return parts.join(' · ');
}
