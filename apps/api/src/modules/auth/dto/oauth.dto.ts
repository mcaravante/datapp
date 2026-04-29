import { z } from 'zod';

export const GoogleOAuthSchema = z.object({
  /** ID token returned by Google's OAuth/OIDC flow. */
  id_token: z.string().min(50).max(8_192),
});
export type GoogleOAuthBody = z.infer<typeof GoogleOAuthSchema>;

export const OAuthChallengeSchema = z
  .object({
    challenge_token: z.string().min(20).max(8_192),
    totp: z.string().min(6).max(10).optional(),
    recovery_code: z.string().min(8).max(20).optional(),
  })
  .refine((v) => Boolean(v.totp) || Boolean(v.recovery_code), {
    message: 'Either `totp` or `recovery_code` is required',
    path: ['totp'],
  });
export type OAuthChallengeBody = z.infer<typeof OAuthChallengeSchema>;
