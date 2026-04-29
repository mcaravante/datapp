import { z } from 'zod';

export const ForgotPasswordSchema = z.object({
  email: z.string().email().max(254),
});
export type ForgotPasswordBody = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  token: z.string().min(32).max(256),
  password: z.string().min(12).max(128),
});
export type ResetPasswordBody = z.infer<typeof ResetPasswordSchema>;
