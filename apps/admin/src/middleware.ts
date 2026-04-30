import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/auth';

/**
 * Auth + pathname forwarding.
 *
 * - Reads the NextAuth session cookie via `auth()`. When there's no
 *   session, redirects to `/login` (the matcher already excludes the
 *   public auth pages, so this only fires on protected routes).
 * - Forwards `x-pathname` so server components in the authed layout
 *   can gate access by route (used by the 2FA-enrollment redirect).
 *
 * NOTE: we don't use the `auth()` callback wrapper because our
 * `NextAuth(() => ...)` lazy config breaks the default-export shape
 * the Next.js middleware loader expects.
 */
export default async function middleware(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) {
    const url = new URL('/login', req.url);
    return NextResponse.redirect(url);
  }
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Run on every page except Auth.js routes, statics, and public auth
  // pages (login, forgot password, reset password, OAuth challenge).
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|login|forgot|reset).*)'],
};
