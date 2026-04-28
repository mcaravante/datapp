'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { LOCALE_COOKIE, isLocale } from './config';

/**
 * Persist the user's locale choice in a cookie and force a full
 * re-render so server components pick up the new dictionary.
 */
export async function setLocaleAction(value: string): Promise<void> {
  if (!isLocale(value)) return;
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, value, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    // 1 year — locale is a stable user preference.
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath('/', 'layout');
}
