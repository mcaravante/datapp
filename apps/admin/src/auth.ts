import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
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

interface BackendErrorBody {
  error?: string;
  message?: string;
}

/**
 * Custom error so the /login server action can tell "2FA needed" apart
 * from "wrong password" and re-render the form with the TOTP field.
 */
class TwoFactorRequired extends CredentialsSignin {
  override code = '2fa_required';
}

// Lazy config: env is read at first request, not at module load. Lets
// `next build` succeed without AUTH_* / APP_URL_API set in the build env.
export const { handlers, signIn, signOut, auth } = NextAuth(() => {
  const env = getServerEnv();
  return {
    secret: env.AUTH_SECRET,
    trustHost: true,
    session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
    pages: { signIn: '/login' },
    providers: [
      Credentials({
        credentials: {
          email: { label: 'Email', type: 'email' },
          password: { label: 'Password', type: 'password' },
          totp: { label: '2FA code', type: 'text' },
        },
        async authorize(credentials) {
          const email = typeof credentials?.email === 'string' ? credentials.email : null;
          const password = typeof credentials?.password === 'string' ? credentials.password : null;
          const totp = typeof credentials?.totp === 'string' && credentials.totp.length > 0
            ? credentials.totp
            : undefined;
          if (!email || !password) return null;

          const res = await fetch(`${env.APP_URL_API}/v1/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email, password, totp }),
          });

          if (res.status === 401) {
            const body = (await res.json().catch(() => null)) as BackendErrorBody | null;
            if (body?.error === '2fa_required') {
              throw new TwoFactorRequired();
            }
            return null;
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
    ],
    callbacks: {
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
