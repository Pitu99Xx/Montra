import { LOGO_M, LOGO_RING } from './logoPaths';

export function Logo({ size = 64, tile = true }: { size?: number; tile?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" aria-hidden="true">
      {tile && <rect width="160" height="160" rx="36" fill="var(--surface)" />}
      <path d={LOGO_RING} fill="none" stroke="var(--gold)" strokeWidth="7" strokeLinecap="round" />
      <circle cx="115.4" cy="44.6" r="8" fill="var(--gold)" />
      <path d={LOGO_M} fill="var(--gold)" />
    </svg>
  );
}
