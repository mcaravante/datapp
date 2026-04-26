import { describe, expect, it } from 'vitest';
import { mapRfmToSegment, quintileBucket, scoreRfm } from './rfm-scoring';

describe('quintileBucket', () => {
  it('assigns 1..5 across an even distribution descending', () => {
    // 10 values, 2 per bucket. Largest = 5, smallest = 1.
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const scores = quintileBucket(values, 'desc');
    expect(scores).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it('assigns 1..5 across an even distribution ascending (recency)', () => {
    // ASC: smallest is best (recency_days = 0 → score 5).
    const values = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45];
    const scores = quintileBucket(values, 'asc');
    expect(scores).toEqual([5, 5, 4, 4, 3, 3, 2, 2, 1, 1]);
  });

  it('handles n < 5: best gets 5, ranks decrease monotonically', () => {
    // With 3 elements split into 5 buckets, scores end up at 5, 4, 2.
    // The worst doesn't necessarily hit 1 — that's expected quintile
    // behaviour for tiny populations.
    const scores = quintileBucket([1, 2, 3], 'desc');
    expect(scores[2]).toBe(5); // value 3 is best
    expect(scores[1]).toBeLessThan(scores[2]!);
    expect(scores[0]).toBeLessThan(scores[1]!);
  });

  it('returns empty array for empty input', () => {
    expect(quintileBucket([], 'desc')).toEqual([]);
  });

  it('preserves the input order with monotonic ranks', () => {
    // values: [50, 10, 30] desc → ranks 5, ?, ? with 50 best, 10 worst.
    const values = [50, 10, 30];
    const scores = quintileBucket(values, 'desc');
    expect(scores[0]).toBe(5); // 50 is the largest
    expect(scores[1]).toBeLessThan(scores[2]!); // 10 < 30 in score
    expect(scores[2]).toBeLessThan(scores[0]!); // 30 < 50 in score
  });
});

describe('mapRfmToSegment', () => {
  it('top spenders are Champions', () => {
    expect(mapRfmToSegment(5, 5, 5)).toBe('champions');
    expect(mapRfmToSegment(4, 5, 5)).toBe('champions');
    expect(mapRfmToSegment(5, 4, 4)).toBe('champions');
  });

  it('recent + frequent + low spend → loyal/potential', () => {
    // r=4 f=5 m=2 → not champions (m < 4), not cannot_lose, not at_risk,
    // matches loyal (r>=3 && f>=4)
    expect(mapRfmToSegment(4, 5, 2)).toBe('loyal');
  });

  it('one-purchase recent customer is "new_customers"', () => {
    expect(mapRfmToSegment(5, 1, 1)).toBe('new_customers');
    expect(mapRfmToSegment(5, 1, 5)).toBe('new_customers');
  });

  it('high-value customers gone cold are "cannot_lose_them"', () => {
    expect(mapRfmToSegment(1, 5, 5)).toBe('cannot_lose_them');
    expect(mapRfmToSegment(1, 4, 4)).toBe('cannot_lose_them');
  });

  it('mid-recency mid-frequency mid-value → "needing_attention"', () => {
    expect(mapRfmToSegment(3, 3, 3)).toBe('needing_attention');
  });

  it('long-gone low-value → "lost"', () => {
    expect(mapRfmToSegment(1, 1, 1)).toBe('lost');
    expect(mapRfmToSegment(1, 1, 2)).toBe('lost');
  });

  it('long-gone, low everything → "hibernating" (r=1, mixed low)', () => {
    expect(mapRfmToSegment(1, 2, 1)).toBe('hibernating');
    expect(mapRfmToSegment(1, 2, 2)).toBe('hibernating');
  });

  it('(2,2,2) is "about_to_sleep" per ADR (more specific rule wins)', () => {
    expect(mapRfmToSegment(2, 2, 2)).toBe('about_to_sleep');
  });

  it('bottoms in 3-axis cube cascade through cleanly', () => {
    // Sweep edge tuples and ensure no throws.
    for (let r = 1; r <= 5; r += 1) {
      for (let f = 1; f <= 5; f += 1) {
        for (let m = 1; m <= 5; m += 1) {
          const segment = mapRfmToSegment(r, f, m);
          expect(segment).toMatch(
            /^(champions|loyal|potential_loyalists|new_customers|promising|needing_attention|about_to_sleep|at_risk|cannot_lose_them|hibernating|lost)$/,
          );
        }
      }
    }
  });
});

describe('scoreRfm', () => {
  it('returns empty for empty input', () => {
    expect(scoreRfm([])).toEqual([]);
  });

  it('scores a tiny dataset and labels segments', () => {
    const rows = [
      { customerProfileId: 'a', recencyDays: 1, frequency: 12, monetary: 50_000 },
      { customerProfileId: 'b', recencyDays: 3, frequency: 8, monetary: 30_000 },
      { customerProfileId: 'c', recencyDays: 365, frequency: 1, monetary: 1_000 },
      { customerProfileId: 'd', recencyDays: 730, frequency: 0, monetary: 0 },
      { customerProfileId: 'e', recencyDays: 30, frequency: 4, monetary: 10_000 },
    ];
    const scored = scoreRfm(rows);
    expect(scored).toHaveLength(5);
    // Best customer should be 'a': lowest recency, highest frequency + monetary.
    const a = scored.find((s) => s.customerProfileId === 'a')!;
    expect(a.recencyScore).toBe(5);
    expect(a.frequencyScore).toBe(5);
    expect(a.monetaryScore).toBe(5);
    expect(a.segment).toBe('champions');
    // Worst customer should be 'd' — never bought in the window.
    const d = scored.find((s) => s.customerProfileId === 'd')!;
    expect(d.frequencyScore).toBe(1);
    expect(d.monetaryScore).toBe(1);
    expect(d.recencyScore).toBe(1);
  });

  it('zero-frequency customers always score 1 on F and M regardless of bucket', () => {
    // All zero-freq customers — bucket would assign them all 5 normally
    // (because they tie for "highest" in DESC). The override forces 1.
    const rows = Array.from({ length: 10 }, (_, i) => ({
      customerProfileId: `c${i.toString()}`,
      recencyDays: 100 + i,
      frequency: 0,
      monetary: 0,
    }));
    const scored = scoreRfm(rows);
    for (const s of scored) {
      expect(s.frequencyScore).toBe(1);
      expect(s.monetaryScore).toBe(1);
    }
  });
});
