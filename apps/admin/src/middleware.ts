import { NextResponse } from 'next/server';
import { auth } from '@/auth';

/**
 * Wraps the NextAuth `auth` middleware to (a) enforce session and (b)
 * forward the current pathname as `x-pathname` so server components can
 * gate access by route (e.g. the 2FA-enrollment redirect in the authed
 * layout).
 */
export default auth((req) => {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  // Run on every page except Auth.js routes, statics, and public auth
  // pages (login, forgot password, reset password).
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|login|forgot|reset).*)'],
};
