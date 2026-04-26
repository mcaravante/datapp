import { z } from 'zod';

export const LoginRequestSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(1024),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal('Bearer'),
  expires_in: z.number().int().positive(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    role: z.enum(['super_admin', 'admin', 'analyst', 'viewer']),
    tenant_id: z.string().uuid().nullable(),
  }),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
