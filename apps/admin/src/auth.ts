import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { getServerEnv } from '@/lib/env';

interface BackendLoginResponse {
  access_token: string;
  expires_in: number;
  user: {
    id: string;
    email: string;
    name: string;
    role: 'super_admin' | 'admin' | 'analyst' | 'viewer';
    tenant_id: string | null;
  };
}

interface BackendOAuthPending {
  status: 'requires_2fa';
  challenge_token: string;
  email: string;
}

type BackendOAuthResponse = BackendLoginResponse | BackendOAuthPending;

interface BackendErrorBody {
  error?: string;
  message?: string;
}

/**
 * Custom errors so the /login server action can tell apart the various
 * paths the backend can refuse a credential. NextAuth surfaces the
 * `code` field on the AuthError thrown out of `signIn()`.
 */
class TwoFactorRequired extends CredentialsSignin {
  override code = '2fa_required';
}

class OAuthTwoFactorRequired extends CredentialsSignin {
  override code = 'oauth_2fa_required';
}

class RateLimited extends CredentialsSignin {
  override code = 'rate_limited';
}

class AccountLocked extends CredentialsSignin {
  override code = 'account_locked';
}

class OAuthNotAuthorized extends CredentialsSignin {
  override code = 'oauth_not_authorized';
}

// Lazy config: env is read at first request, not at module load. Lets
// `next build` succeed without AUTH_* / APP_URL_API set in the build env.
export const { handlers, signIn, signOut, auth } = NextAuth(() => {
  const env = getServerEnv();
  const isHttps = env.AUTH_URL.startsWith('https://');
  const googleEnabled = env.AUTH_GOOGLE_ID.length > 0 && env.AUTH_GOOGLE_SECRET.length > 0;

  return {
    secret: env.AUTH_SECRET,
    trustHost: true,
    useSecureCookies: isHttps,
    session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
    pages: { signIn: '/login' },
    providers: [
      Credentials({
        credentials: {
          email: { label: 'Email', type: 'email' },
          password: { label: 'Password', type: 'password' },
          totp: { label: '2FA code', type: 'text' },
          recovery_code: { label: 'Recovery code', type: 'text' },
        },
        async authorize(credentials) {
          const email = typeof credentials?.email === 'string' ? credentials.email : null;
          const password = typeof credentials?.password === 'string' ? credentials.password : null;
          const totp = typeof credentials?.totp === 'string' && credentials.totp.length > 0
            ? credentials.totp
            : undefined;
          const recoveryCode = typeof credentials?.recovery_code === 'string' &&
            credentials.recovery_code.length > 0
            ? credentials.recovery_code
            : undefined;
          if (!email || !password) return null;

          const res = await fetch(`${env.APP_URL_API}/v1/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email, password, totp, recovery_code: recoveryCode }),
          });

          if (res.status === 401) {
            const body = (await res.json().catch(() => null)) as BackendErrorBody | null;
            if (body?.error === '2fa_required') {
              throw new TwoFactorRequired();
            }
            return null;
          }
          if (res.status === 429) {
            const body = (await res.json().catch(() => null)) as BackendErrorBody | null;
            if (body?.error === 'account_locked') throw new AccountLocked();
            throw new RateLimited();
          }
          if (!res.ok) return null;
          const data = (await res.json()) as BackendLoginResponse;
          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            tenantId: data.user.tenant_id,
            accessToken: data.access_token,
            accessTokenExpiresAt: Date.now() + data.expires_in * 1000,
          };
        },
      }),
      // Phase 2 of Google OAuth: redeem the challenge token + a TOTP
      // (or recovery code) for a real session JWT. Used by the
      // /login/2fa-oauth page.
      Credentials({
        id: 'oauth-2fa',
        credentials: {
          challenge_token: { type: 'text' },
          totp: { type: 'text' },
          recovery_code: { type: 'text' },
        },
        async authorize(credentials) {
          const challengeToken = typeof credentials?.challenge_token === 'string'
            ? credentials.challenge_token
            : null;
          const totp = typeof credentials?.totp === 'string' && credentials.totp.length > 0
            ? credentials.totp
            : undefined;
          const recoveryCode = typeof credentials?.recovery_code === 'string' &&
            credentials.recovery_code.length > 0
            ? credentials.recovery_code
            : undefined;
          if (!challengeToken || (!totp && !recoveryCode)) return null;

          const res = await fetch(`${env.APP_URL_API}/v1/auth/oauth/google/2fa`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              challenge_token: challengeToken,
              totp,
              recovery_code: recoveryCode,
            }),
          });

          if (res.status === 401) {
            const body = (await res.json().catch(() => null)) as BackendErrorBody | null;
            if (body?.error === '2fa_required') throw new TwoFactorRequired();
            return null;
          }
          if (res.status === 429) {
            const body = (await res.json().catch(() => null)) as BackendErrorBody | null;
            if (body?.error === 'account_locked') throw new AccountLocked();
            throw new RateLimited();
          }
          if (!res.ok) return null;
          const data = (await res.json()) as BackendLoginResponse;
          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            tenantId: data.user.tenant_id,
            accessToken: data.access_token,
            accessTokenExpiresAt: Date.now() + data.expires_in * 1000,
          };
        },
      }),
      ...(googleEnabled
        ? [
            Google({
              clientId: env.AUTH_GOOGLE_ID,
              clientSecret: env.AUTH_GOOGLE_SECRET,
              // We don't keep the OAuth tokens — we exchange the
              // id_token for a CDP session JWT and forget the rest.
              authorization: {
                params: { prompt: 'select_account' },
              },
            }),
          ]
        : []),
    ],
    callbacks: {
      // The Google provider produces a NextAuth user from the id_token
      // claims locally — but the *real* authorization decision is the
      // API's. Intercept here, call the API, and either:
      //   - mutate `user` with the real CDP claims (no 2FA → session)
      //   - return a redirect URL to the 2FA challenge page (2FA on)
      //   - return false to refuse the sign-in entirely
      async signIn({ user, account }) {
        if (account?.provider !== 'google') return true;
        const idToken = account.id_token;
        if (typeof idToken !== 'string' || idToken.length === 0) return false;

        const res = await fetch(`${env.APP_URL_API}/v1/auth/oauth/google`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id_token: idToken }),
        });

        if (res.status === 429) {
          const body = (await res.json().catch(() => null)) as BackendErrorBody | null;
          if (body?.error === 'account_locked') throw new AccountLocked();
          throw new RateLimited();
        }
        if (res.status === 401 || res.status === 403) {
          // Unauthorized email — surface as an error code the /login
          // page knows how to render.
          throw new OAuthNotAuthorized();
        }
        if (!res.ok) return false;

        const data = (await res.json()) as BackendOAuthResponse;
        if ('status' in data && data.status === 'requires_2fa') {
          // Stop the OAuth-only sign-in and redirect to phase 2. The
          // challenge token + email travel in the URL; the token is
          // self-contained (signed JWT, 5-min TTL) so leaking it via
          // browser history is bounded.
          const params = new URLSearchParams({
            ct: data.challenge_token,
            email: data.email,
          });
          return `/login/2fa-oauth?${params.toString()}`;
        }

        const session = data as BackendLoginResponse;
        // Mutate the `user` object NextAuth will store on the JWT so
        // role / tenant / accessToken match the API.
        user.id = session.user.id;
        user.email = session.user.email;
        user.name = session.user.name;
        user.role = session.user.role;
        user.tenantId = session.user.tenant_id;
        user.accessToken = session.access_token;
        user.accessTokenExpiresAt = Date.now() + session.expires_in * 1000;
        return true;
      },
      jwt({ token, user }) {
        if (user) {
          token.accessToken = user.accessToken;
          token.accessTokenExpiresAt = user.accessTokenExpiresAt;
          token.role = user.role;
          token.tenantId = user.tenantId;
        }
        return token;
      },
      session({ session, token }) {
        // The next-auth.d.ts augmentation narrows these but isn't always
        // picked up across tooling boundaries — cast at the edge.
        session.accessToken = token.accessToken as string;
        session.user.role = token.role as 'super_admin' | 'admin' | 'analyst' | 'viewer';
        session.user.tenantId = token.tenantId as string | null;
        return session;
      },
    },
  };
});

export const oauthTwoFactorErrorCodes = {
  oauthTwoFactorRequired: new OAuthTwoFactorRequired().code,
  oauthNotAuthorized: new OAuthNotAuthorized().code,
} as const;
