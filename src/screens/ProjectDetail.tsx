import { useMemo } from 'react';
import { Switch, toast } from '../components/ui';
import { IconBack, IconPlus } from '../components/Icons';
import type { Movement, Project } from '../data/model';
import {
  monthTitle,
  movementDateLabel,
  movementMonth,
  movementTime,
  movementValue,
  projectTotals,
  saveProject,
} from '../data/projects';
import { useStore } from '../data/store';
import { currencySymbol, formatMoney, rateLabel } from '../lib/currency';
import { useBottomBand } from '../lib/viewport';
import { ProjectIcon, projectMeta, signed } from './projectUi';

/** Ficha de un proyecto: resultado neto y movimientos previstos agrupados por mes. */
export function ProjectDetail({
  project,
  closing,
  onBack,
  onEdit,
  onEditMovement,
}: {
  project: Project;
  closing: boolean;
  onBack: () => void;
  onEdit: () => void;
  onEditMovement: (m: Movement | null) => void;
}) {
  const { uid, user, rates, valueIn } = useStore();
  useBottomBand('--bg');
  const base = user.baseCurrency;
  const totals = projectTotals(project, 'expected', valueIn);
  const low = project.margin > 0 ? projectTotals(project, 'pessimistic', valueIn).net : null;
  const high = project.margin > 0 ? projectTotals(project, 'optimistic', valueIn).net : null;
  const foreign = [...new Set(project.movements.map((m) => m.currency).filter((c) => c !== base))];

  const months = useMemo(() => {
    const sorted = [...project.movements].sort((a, b) => {
      const ta = movementTime(a) ?? Infinity;
      const tb = movementTime(b) ?? Infinity;
      return ta - tb || a.concept.localeCompare(b.concept);
    });
    const out: { key: string; items: Movement[] }[] = [];
    for (const m of sorted) {
      const key = movementMonth(m);
      const g = out[out.length - 1];
      if (g?.key === key) g.items.push(m);
      else out.push({ key, items: [m] });
    }
    return out;
  }, [project.movements]);

  const setSelected = async (v: boolean) => {
    try {
      await saveProject(uid, { ...project, selected: v });
    } catch {
      toast('No se pudo guardar el proyecto');
    }
  };

  return (
    <div className={`detail-view${closing ? ' closing' : ''}`} role="dialog" aria-label={project.name}>
      <main className="screen">
        <header className="screen-header">
          <button
            type="button"
            className="link-btn"
            onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: 2 }}
          >
            <IconBack size={22} /> Proyectos
          </button>
          <button type="button" className="link-btn" onClick={onEdit}>
            Editar
          </button>
        </header>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <ProjectIcon project={project} size={56} />
          <div className="row-main">
            <h1 className="serif" style={{ margin: 0, fontSize: 28, fontWeight: 500 }}>
              {project.name}
            </h1>
            <span className="row-sub" style={{ fontSize: 14 }}>
              {projectMeta(project)}
            </span>
          </div>
        </div>

        <section className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="eyebrow">Resultado neto</span>
            <span
              className={`num ${totals.net >= 0 ? 'delta-up' : 'delta-down'}`}
              style={{ fontSize: 36, fontWeight: 500 }}
            >
              {signed(totals.net, base)}
            </span>
            {low !== null && high !== null && (
              <span className="row-sub">
                Margen ±{project.margin} %: entre {signed(low, base)} y {signed(high, base)}
              </span>
            )}
            {foreign.length > 0 && (
              <span className="row-sub">
                Con el cambio de hoy
                {foreign
                  .map((c) => rateLabel(base, c, rates))
                  .filter(Boolean)
                  .map((l) => ` · ${l}`)
                  .join('')}
              </span>
            )}
            {totals.missing > 0 && <span className="error">Falta el tipo de cambio de algún movimiento.</span>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mini-stat">
              <span className="row-sub">Ingresos</span>
              <span className="delta-up" style={{ fontWeight: 600, fontSize: 16 }}>
                {formatMoney(totals.income, base)}
              </span>
            </div>
            <div className="mini-stat">
              <span className="row-sub">Gastos</span>
              <span className="delta-down" style={{ fontWeight: 600, fontSize: 16 }}>
                {formatMoney(totals.expense, base)}
              </span>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              borderTop: '1px solid var(--border)',
              paddingTop: 12,
            }}
          >
            <span className="row-main">
              <span style={{ fontWeight: 600, fontSize: 15 }}>Incluir en la simulación</span>
              <span className="row-sub">Suma su resultado al saldo final</span>
            </span>
            <Switch checked={project.selected} onChange={setSelected} label="Incluir en la simulación" />
          </div>
        </section>

        {months.length === 0 && (
          <p className="hint">
            Añade los gastos e ingresos que prevés: con su divisa y una fecha exacta, aproximada o sin fecha.
          </p>
        )}

        {months.map((g) => (
          <section key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="month-label">{monthTitle(g.key)}</span>
            <div className="list">
              {g.items.map((m) => {
                const v = movementValue(m, 0, 'expected', valueIn);
                return (
                  <button type="button" key={m.id} className="row" onClick={() => onEditMovement(m)}>
                    <span className="mov-icon" aria-hidden="true">
                      {currencySymbol(m.currency)}
                    </span>
                    <span className="row-main">
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {m.concept}
                      </span>
                      <span
                        className="row-sub"
                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {movementDateLabel(m)}
                        {m.note ? ` · ${m.note}` : ''}
                      </span>
                    </span>
                    <span className="row-end">
                      <span
                        className={`num ${m.kind === 'income' ? 'delta-up' : 'delta-down'}`}
                        style={{ fontSize: 16 }}
                      >
                        {m.kind === 'income' ? '+' : '−'}
                        {formatMoney(m.amount, m.currency)}
                      </span>
                      {m.currency !== base && (
                        <span className="row-sub" style={{ fontSize: 12 }}>
                          {v !== null ? `≈ ${signed(v, base)}` : 'sin tipo de cambio'}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        <button type="button" className="btn btn-outline dashed" onClick={() => onEditMovement(null)}>
          <IconPlus size={20} /> Añadir movimiento
        </button>
      </main>
    </div>
  );
}
