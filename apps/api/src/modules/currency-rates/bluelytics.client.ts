/**
 * Bluelytics API client (https://bluelytics.com.ar/).
 *
 * The free `evolution.json` endpoint returns the entire historical
 * series in a single call (~6kb per year), so backfilling is one
 * request and the daily refresh just slices the latest entries.
 *
 * The response interleaves `Oficial` and `Blue` rows; we filter to
 * `Blue` here so callers get a clean per-date slice.
 */

const EVOLUTION_URL = 'https://api.bluelytics.com.ar/v2/evolution.json';

interface BluelyticsRow {
  date: string;
  source: 'Oficial' | 'Blue';
  value_buy: number;
  value_sell: number;
}

export interface BlueRate {
  date: Date;
  buy: number;
  sell: number;
}

export async function fetchBlueHistory(days?: number): Promise<BlueRate[]> {
  const url = days ? `${EVOLUTION_URL}?days=${days}` : EVOLUTION_URL;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Bluelytics responded ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const raw = (await res.json()) as BluelyticsRow[];
  return raw
    .filter((r) => r.source === 'Blue')
    .map((r) => ({ date: parseDate(r.date), buy: r.value_buy, sell: r.value_sell }))
    .filter((r) => Number.isFinite(r.buy) && Number.isFinite(r.sell) && r.buy > 0 && r.sell > 0);
}

function parseDate(s: string): Date {
  // Bluelytics dates are `YYYY-MM-DD`. Force midnight UTC so the date
  // column on Postgres lands on the same day regardless of the
  // server's local TZ.
  return new Date(`${s}T00:00:00Z`);
}
