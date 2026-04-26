import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { getServerEnv } from '@/lib/env';

const env = getServerEnv();

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

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email : null;
        const password = typeof credentials?.password === 'string' ? credentials.password : null;
        if (!email || !password) return null;

        const res = await fetch(`${env.APP_URL_API}/v1/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
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
});
