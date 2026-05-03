import { z } from 'zod';
import { CurrencyFilter } from './range.dto';

export const YearlyRevenueQuerySchema = z.object({
  currency: CurrencyFilter.default('ars'),
});
export type YearlyRevenueQuery = z.infer<typeof YearlyRevenueQuerySchema>;

/**
 * "All years" comparison: monthly revenue grouped by calendar year for
 * every year that has at least one order. Output is ordered ascending
 * by year so the chart legend reads naturally.
 */
export interface YearlyMonthPoint {
  /** 1–12. */
  month: number;
  /** Revenue summed in Buenos Aires local time. */
  revenue: string;
  orders: number;
}

export interface YearlyRevenueYear {
  year: number;
  total_revenue: string;
  total_orders: number;
  months: YearlyMonthPoint[];
}

export interface YearlyRevenueResponse {
  /** Ascending. Empty when the tenant has no orders yet. */
  years: YearlyRevenueYear[];
}
