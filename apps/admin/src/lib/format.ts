/**
 * Display helpers shared across analytics pages. Currency + numbers
 * format using the locale passed in (defaults to es-AR for the
 * Argentine tenant); timestamps stay in Buenos Aires local time
 * regardless of locale, only the surrounding labels change.
 */

import type { Locale } from '@/i18n/config';

const DEFAULT_INTL = 'es-AR';

function intlLocale(locale: Locale | undefined): string {
  if (locale === 'en') return 'en-US';
  return DEFAULT_INTL;
}

const currencyCache = new Map<string, Intl.NumberFormat>();
const numberCache = new Map<string, Intl.NumberFormat>();
const percentCache = new Map<string, Intl.NumberFormat>();
const dateCache = new Map<string, Intl.DateTimeFormat>();

export function formatCurrencyArs(value: string | number, locale: Locale = 'es'): string {
  return formatCurrency(value, 'ARS', locale);
}

export function formatCurrency(
  value: string | number,
  currencyCode: string,
  locale: Locale = 'es',
): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  const key = `${locale}|${currencyCode}`;
  let fmt = currencyCache.get(key);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat(intlLocale(locale), {
        style: 'currency',
        currency: currencyCode,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    } catch {
      fmt = new Intl.NumberFormat(intlLocale(locale), {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    }
    currencyCache.set(key, fmt);
  }
  return fmt.format(n);
}

export function formatNumber(value: number, locale: Locale = 'es'): string {
  if (!Number.isFinite(value)) return '—';
  let fmt = numberCache.get(locale);
  if (!fmt) {
    fmt = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 });
    numberCache.set(locale, fmt);
  }
  return fmt.format(value);
}

export function formatPercent01(value: number, locale: Locale = 'es'): string {
  if (!Number.isFinite(value)) return '—';
  let fmt = percentCache.get(locale);
  if (!fmt) {
    fmt = new Intl.NumberFormat(intlLocale(locale), {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    percentCache.set(locale, fmt);
  }
  return fmt.format(value);
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

/**
 * Buenos Aires-local timestamp. The time zone is fixed (the data is
 * Argentine), only the surface format follows the user's locale so a
 * 24h vs 12h reader sees the convention they expect.
 */
export function formatBuenosAires(iso: string, locale: Locale = 'es'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  let fmt = dateCache.get(locale);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(intlLocale(locale), {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    dateCache.set(locale, fmt);
  }
  return fmt.format(d);
}
