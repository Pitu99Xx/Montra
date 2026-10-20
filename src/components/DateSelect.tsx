const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();

/**
 * Fecha en formato cerrado: Día / Mes / Año con desplegables (el día solo si es exacta).
 * El valor es «AAAA-MM-DD» (exacta) o «AAAA-MM» (aproximada).
 */
export function DateSelect({
  exact,
  value,
  onChange,
  label,
}: {
  exact: boolean;
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const now = new Date();
  const [y, m, d] = value.split('-').map(Number);
  const year = y || now.getFullYear();
  const month = m || now.getMonth() + 1;
  const day = Math.min(d || 1, daysIn(year, month));
  const first = Math.min(year, now.getFullYear() - 1);
  const years = Array.from({ length: Math.max(year, now.getFullYear() + 15) - first + 1 }, (_, i) => first + i);

  const emit = (ny: number, nm: number, nd: number) => {
    const dd = Math.min(nd, daysIn(ny, nm));
    onChange(exact ? `${ny}-${pad(nm)}-${pad(dd)}` : `${ny}-${pad(nm)}`);
  };

  return (
    <div className={`date-select${exact ? ' exact' : ''}`} role="group" aria-label={label}>
      {exact && (
        <select
          className="input"
          aria-label="Día"
          value={day}
          onChange={(e) => emit(year, month, Number(e.target.value))}
        >
          {Array.from({ length: daysIn(year, month) }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      )}
      <select
        className="input"
        aria-label="Mes"
        value={month}
        onChange={(e) => emit(year, Number(e.target.value), day)}
      >
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
      <select
        className="input"
        aria-label="Año"
        value={year}
        onChange={(e) => emit(Number(e.target.value), month, day)}
      >
        {years.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}
