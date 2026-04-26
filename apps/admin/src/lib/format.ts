/**
 * Display helpers shared across analytics pages. Currency + numbers
 * format in Argentine Spanish; timestamps in Buenos Aires local time.
 */

const CURRENCY_AR = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const NUMBER_AR = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 0,
});

const PERCENT_AR = new Intl.NumberFormat('es-AR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const DATE_AR = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatCurrencyArs(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return CURRENCY_AR.format(n);
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return NUMBER_AR.format(value);
}

export function formatPercent01(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return PERCENT_AR.format(value);
}

export function formatDeltaPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

export function deltaTone(pct: number | null): 'up' | 'down' | 'flat' {
  if (pct === null || !Number.isFinite(pct) || pct === 0) return 'flat';
  return pct > 0 ? 'up' : 'down';
}

export function formatBuenosAires(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return DATE_AR.format(d);
}
