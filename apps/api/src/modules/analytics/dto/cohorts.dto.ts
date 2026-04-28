import { z } from 'zod';

export const CohortsQuerySchema = z.object({
  /**
   * How many cohorts (months) to return, ending with the most recent.
   * Default 12.
   */
  cohorts: z.coerce.number().int().min(1).max(48).default(12),
  /**
   * How many months-after-acquisition to project. Default 12.
   * Cells beyond `min(today_month - cohort_month, horizon)` are returned
   * as null so the UI can render them as N/A instead of 0.
   */
  horizon: z.coerce.number().int().min(1).max(36).default(12),
});

export type CohortsQuery = z.infer<typeof CohortsQuerySchema>;

export interface CohortRow {
  /** First-of-month ISO string (e.g. `2025-08-01T00:00:00.000Z`). */
  cohort_month: string;
  /** Distinct customers whose first-ever order placed in this month. */
  size: number;
  /**
   * Per offset (0..horizon): distinct customers from this cohort who
   * placed at least one order in cohort_month + offset. `null` for
   * offsets that haven't elapsed yet.
   */
  retained: (number | null)[];
}

export interface CohortsResponse {
  timezone: 'America/Argentina/Buenos_Aires';
  horizon: number;
  cohorts: CohortRow[];
}
