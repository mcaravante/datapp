import type { RfmSegmentLabel } from '@cdp/db';

export interface RfmDimensions {
  /** Days since the customer's most recent order. */
  recencyDays: number;
  /** Order count in the trailing 365-day window. */
  frequency: number;
  /** Sum of `real_revenue` over the trailing 365-day window. */
  monetary: number;
}

export interface RfmScored extends RfmDimensions {
  /** Customer key — caller-defined; passed through unchanged. */
  customerProfileId: string;
  /** 1..5, higher is better. */
  recencyScore: number;
  frequencyScore: number;
  monetaryScore: number;
  segment: RfmSegmentLabel;
}

/**
 * Bucket a list of customers into quintiles 1..5 per dimension and label
 * each one with the matching RFM segment. Pure function; no I/O.
 *
 * Recency is inverted: smaller `recencyDays` is better, so we score the
 * lowest 20% of recency values as 5 and the highest 20% as 1.
 *
 * Customers with `frequency === 0` (no purchase in the 365d window) bucket
 * to score 1 on F and M regardless of distribution; they tend to be
 * "Hibernating" or "Lost".
 */
export function scoreRfm<T extends { customerProfileId: string } & RfmDimensions>(
  rows: readonly T[],
): RfmScored[] {
  if (rows.length === 0) return [];

  const recencyScores = quintileBucket(
    rows.map((r) => r.recencyDays),
    'asc',
  );
  const frequencyScores = quintileBucket(
    rows.map((r) => r.frequency),
    'desc',
  );
  const monetaryScores = quintileBucket(
    rows.map((r) => r.monetary),
    'desc',
  );

  return rows.map((row, i) => {
    const r = recencyScores[i] ?? 1;
    const f = row.frequency === 0 ? 1 : (frequencyScores[i] ?? 1);
    const m = row.monetary === 0 ? 1 : (monetaryScores[i] ?? 1);
    return {
      customerProfileId: row.customerProfileId,
      recencyDays: row.recencyDays,
      frequency: row.frequency,
      monetary: row.monetary,
      recencyScore: r,
      frequencyScore: f,
      monetaryScore: m,
      segment: mapRfmToSegment(r, f, m),
    };
  });
}

/**
 * Assign quintile scores 1..5 to a list of values. `direction = 'asc'`
 * means the smallest value gets the highest score (used for recency,
 * where small days = good). `direction = 'desc'` means the largest value
 * gets the highest score (frequency / monetary).
 *
 * Returns an array parallel to the input. Ties are bucketed by their
 * sorted position so a tie on the boundary lands in the lower quintile.
 */
export function quintileBucket(values: readonly number[], direction: 'asc' | 'desc'): number[] {
  const n = values.length;
  if (n === 0) return [];
  // Build [originalIndex, value] tuples sorted by value.
  const indexed = values.map((value, idx) => ({ idx, value }));
  indexed.sort((a, b) => (direction === 'asc' ? a.value - b.value : b.value - a.value));

  const scores = new Array<number>(n);
  for (let rank = 0; rank < n; rank += 1) {
    const quintile = Math.min(5, Math.floor((rank * 5) / n) + 1);
    // For ASC direction (recency), best (smallest) values get 5 first.
    // For DESC direction (freq/monetary), best (largest) values get 5 first.
    const score = 6 - quintile;
    scores[indexed[rank]!.idx] = score;
  }
  return scores;
}

/**
 * Map an (R, F, M) tuple to its segment label. Implements the de-facto
 * industry mapping documented in ADR 0006. The cascade is ordered so
 * more specific rules win over broader fallbacks (e.g. (1,1,1) is
 * "lost" rather than "hibernating", even though both rules match).
 */
export function mapRfmToSegment(r: number, f: number, m: number): RfmSegmentLabel {
  // Champions — top of the funnel on every axis.
  if (r >= 4 && f >= 4 && m >= 4) return 'champions';

  // Cannot lose them — used to spend, completely stopped showing up.
  if (r === 1 && f >= 4 && m >= 4) return 'cannot_lose_them';

  // At risk — used to buy regularly, now slipping away.
  if (r === 2 && f >= 3 && m >= 3) return 'at_risk';
  if (r === 1 && f === 4 && m >= 3) return 'at_risk';

  // Loyal customers — frequent, decent spend, recent or near-recent.
  if (r >= 3 && f >= 4) return 'loyal';
  if (r >= 4 && f >= 3 && m >= 3) return 'loyal';

  // New customers — fresh signups, just one purchase.
  if (r === 5 && f === 1) return 'new_customers';

  // Potential loyalists — recent buyers showing repeat behaviour.
  // Constrained to r >= 4 so (3,3,*) falls into "needing attention" below.
  if (r >= 4 && f >= 3 && m >= 2) return 'potential_loyalists';
  if (r === 5 && f === 2 && m >= 2) return 'potential_loyalists';
  if (r === 3 && f >= 4) return 'potential_loyalists';

  // Promising — recent, low frequency, low to mid value.
  if (r >= 4 && f === 2 && m <= 2) return 'promising';
  if (r === 5 && f === 3) return 'promising';

  // Needing attention — middling on every axis ((3,3,*) cluster).
  if (r === 3 && f === 3) return 'needing_attention';
  if (r === 3 && f === 2 && m >= 2) return 'needing_attention';
  if (r === 2 && f === 3 && m >= 2) return 'needing_attention';

  // Lost — specific before the hibernating catch-all so (1,1,*) doesn't
  // drift into hibernating.
  if (r === 1 && f === 1) return 'lost';

  // About to sleep — slipping recency, low engagement.
  if (r === 3 && f <= 2) return 'about_to_sleep';
  if (r === 2 && f <= 2 && m <= 2) return 'about_to_sleep';

  // Hibernating — old, infrequent, low value (broadest catch).
  if (r <= 2 && f <= 2 && m <= 2) return 'hibernating';

  // Final fallback — never label as Champion by accident.
  return 'hibernating';
}
