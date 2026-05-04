/**
 * Magento 2 `searchCriteria` query-string builder.
 *
 * Magento expects nested array-style query parameters:
 *   searchCriteria[filter_groups][0][filters][0][field]=updated_at
 *   searchCriteria[filter_groups][0][filters][0][value]=2026-04-25
 *   searchCriteria[filter_groups][0][filters][0][condition_type]=gteq
 *   searchCriteria[pageSize]=100
 *   searchCriteria[currentPage]=1
 *
 * All filters inside the same group are OR'd; different groups are AND'd.
 */

export type ConditionType =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gteq'
  | 'lt'
  | 'lteq'
  | 'like'
  | 'nlike'
  | 'in'
  | 'nin'
  | 'finset'
  | 'from'
  | 'to'
  | 'null'
  | 'notnull';

export interface Filter {
  field: string;
  value?: string | number;
  condition_type?: ConditionType;
}

export interface SortOrder {
  field: string;
  direction: 'ASC' | 'DESC';
}

export interface SearchCriteria {
  /** Each inner array is a filter group (OR within, AND between). */
  filterGroups?: Filter[][];
  pageSize?: number;
  currentPage?: number;
  sortOrders?: SortOrder[];
  /**
   * REST projection — Magento honours `fields=items[a,b[c]],total_count`
   * to trim the response. Cuts payload 50–100x on big lists when you
   * only need a few columns.
   */
  fields?: string;
}

/**
 * Encode a SearchCriteria into a URLSearchParams instance.
 * `URLSearchParams` handles encoding of special characters; we just
 * supply the (already-bracketed) keys.
 */
export function buildSearchCriteriaParams(criteria: SearchCriteria): URLSearchParams {
  const params = new URLSearchParams();
  const groups = criteria.filterGroups ?? [];
  groups.forEach((group, gi) => {
    group.forEach((f, fi) => {
      const prefix = `searchCriteria[filter_groups][${gi.toString()}][filters][${fi.toString()}]`;
      params.append(`${prefix}[field]`, f.field);
      if (f.value !== undefined) {
        params.append(`${prefix}[value]`, String(f.value));
      }
      if (f.condition_type) {
        params.append(`${prefix}[condition_type]`, f.condition_type);
      }
    });
  });
  if (criteria.pageSize !== undefined) {
    params.append('searchCriteria[pageSize]', criteria.pageSize.toString());
  }
  if (criteria.currentPage !== undefined) {
    params.append('searchCriteria[currentPage]', criteria.currentPage.toString());
  }
  (criteria.sortOrders ?? []).forEach((o, i) => {
    params.append(`searchCriteria[sortOrders][${i.toString()}][field]`, o.field);
    params.append(`searchCriteria[sortOrders][${i.toString()}][direction]`, o.direction);
  });
  if (criteria.fields !== undefined && criteria.fields.length > 0) {
    params.append('fields', criteria.fields);
  }
  return params;
}
