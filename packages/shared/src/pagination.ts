import { z } from 'zod';

/**
 * Cursor-based pagination contract used by every list endpoint.
 *
 * The cursor is opaque to the client: the API encodes the last item's
 * `(sort_field, id)` tuple into a base64url string. Clients pass it back
 * verbatim.
 */
export const PaginationQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    next_cursor: z.string().nullable(),
  });

export interface PaginatedResponse<T> {
  data: T[];
  next_cursor: string | null;
}
