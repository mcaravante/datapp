/**
 * localStorage / sessionStorage helpers, robust to disabled storage
 * (Safari private mode, browsers with cookies blocked). All reads
 * fall back to `null`, all writes silently no-op so a hostile/locked
 * environment doesn't crash the storefront.
 */

const VISITOR_KEY = 'datapp.visitor.anonymousId';
const SHOWN_PREFIX = 'datapp.popup.shown.';

function safeGet(area: 'local' | 'session', key: string): string | null {
  try {
    const store = area === 'local' ? window.localStorage : window.sessionStorage;
    return store.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(area: 'local' | 'session', key: string, value: string): void {
  try {
    const store = area === 'local' ? window.localStorage : window.sessionStorage;
    store.setItem(key, value);
  } catch {
    /* noop */
  }
}

/**
 * Returns the visitor's anonymous id, generating one on first call.
 * UUID v7 is preferred (time-ordered), but the loader uses a
 * lightweight v4-ish generator to avoid pulling a UUID dependency
 * into the bundle. The id is purely for de-duplication on the
 * server side, so cryptographic randomness is sufficient.
 */
export function getOrCreateAnonymousId(): string {
  const existing = safeGet('local', VISITOR_KEY);
  if (existing && existing.length >= 8) return existing;
  const id = generateId();
  safeSet('local', VISITOR_KEY, id);
  return id;
}

function generateId(): string {
  // 16 bytes of randomness, hex-encoded → 32 chars. Keeps the URL
  // short and stays compatible with the API's `min(8).max(64)` rule.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * "Have we already shown this popup to this visitor for the current
 * frequency window?" — local for `once_per_visitor`, session for
 * `once_per_session`, never for `every_visit`.
 */
export function alreadyShown(
  popupId: string,
  frequency: 'once_per_session' | 'once_per_visitor' | 'every_visit',
): boolean {
  if (frequency === 'every_visit') return false;
  const area = frequency === 'once_per_visitor' ? 'local' : 'session';
  const value = safeGet(area, SHOWN_PREFIX + popupId);
  return value !== null;
}

export function markShown(
  popupId: string,
  frequency: 'once_per_session' | 'once_per_visitor' | 'every_visit',
): void {
  if (frequency === 'every_visit') return;
  const area = frequency === 'once_per_visitor' ? 'local' : 'session';
  safeSet(area, SHOWN_PREFIX + popupId, String(Date.now()));
}
