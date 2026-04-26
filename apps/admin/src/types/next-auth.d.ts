import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface User {
    role: 'super_admin' | 'admin' | 'analyst' | 'viewer';
    tenantId: string | null;
    accessToken: string;
    accessTokenExpiresAt: number;
  }

  interface Session {
    accessToken: string;
    user: DefaultSession['user'] & {
      role: 'super_admin' | 'admin' | 'analyst' | 'viewer';
      tenantId: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken: string;
    accessTokenExpiresAt: number;
    role: 'super_admin' | 'admin' | 'analyst' | 'viewer';
    tenantId: string | null;
  }
}
