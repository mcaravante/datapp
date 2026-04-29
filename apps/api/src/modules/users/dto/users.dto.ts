import { z } from 'zod';

const ROLE = z.enum(['super_admin', 'admin', 'analyst', 'viewer']);

export const ListUsersQuerySchema = z.object({
  q: z.string().min(1).max(200).optional(),
  role: ROLE.optional(),
});
export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

export const CreateUserSchema = z.object({
  email: z.string().email().min(1).max(254),
  name: z.string().min(1).max(120),
  role: ROLE,
  /**
   * Optional. When omitted, the user can only sign in via Google
   * (their email matches the row, but they have no local credentials).
   * When present, must be at least 12 chars.
   */
  password: z.string().min(12).max(128).optional(),
});
export type CreateUserBody = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    role: ROLE.optional(),
    /** Optional password reset; omitted = leave password as-is. */
    password: z.string().min(12).max(128).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'No fields to update',
  });
export type UpdateUserBody = z.infer<typeof UpdateUserSchema>;
