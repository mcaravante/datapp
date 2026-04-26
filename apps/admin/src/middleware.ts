export { auth as middleware } from '@/auth';

export const config = {
  // Run on every page except Auth.js routes, statics, and the login page.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|login).*)'],
};
