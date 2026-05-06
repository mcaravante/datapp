import { renderPopup } from './render';
import { alreadyShown, getOrCreateAnonymousId, markShown } from './storage';
import type {
  LoaderConfig,
  LoaderPopup,
  SubmissionPayload,
  SubmissionResponse,
} from './types';

declare const process: { env: { LOADER_DEFAULT_API_URL: string } };

(function bootstrap(): void {
  // No-op on non-browser, on prerender, or if the DOM isn't there yet
  // (we attach a DOMContentLoaded listener and bail early).
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => start());
  } else {
    start();
  }
})();

function start(): void {
  const config = readConfig();
  if (!config) {
    console.warn('[datapp] loader missing tenant slug; add ?tenant=… to the script src');
    return;
  }
  void run(config);
}

/**
 * Reads `?tenant=…&api=…` off the script tag's own src. Falling back
 * to data attributes (`data-tenant`, `data-api`) makes life easier for
 * Magento layout XML where escaping ?'s in URLs is sometimes painful.
 */
function readConfig(): LoaderConfig | null {
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[src]');
  let tenantSlug: string | null = null;
  let apiUrl: string | null = null;
  scripts.forEach((s) => {
    if (!s.src.includes('/loader.js')) return;
    try {
      const url = new URL(s.src, window.location.href);
      const t = url.searchParams.get('tenant') ?? s.dataset.tenant ?? null;
      const a = url.searchParams.get('api') ?? s.dataset.api ?? null;
      if (t && !tenantSlug) tenantSlug = t;
      if (a && !apiUrl) apiUrl = a;
    } catch {
      /* ignore malformed src */
    }
  });
  if (!tenantSlug) return null;
  return {
    tenantSlug,
    apiUrl: apiUrl ?? process.env.LOADER_DEFAULT_API_URL,
  };
}

async function run(config: LoaderConfig): Promise<void> {
  let popups: LoaderPopup[] = [];
  try {
    popups = await fetchPopups(config);
  } catch (err) {
    console.warn('[datapp] popup fetch failed:', err);
    return;
  }
  if (popups.length === 0) return;

  // The list arrives sorted by display_priority desc + updated_at, so
  // the first one is the winner. Showing only one popup per page-view
  // keeps the experience sane; multi-popup competitions go on the
  // backlog.
  for (const popup of popups) {
    if (alreadyShown(popup.id, popup.display_frequency)) continue;
    schedulePopup(config, popup);
    return;
  }
}

async function fetchPopups(config: LoaderConfig): Promise<LoaderPopup[]> {
  const url = new URL('/public/popups', config.apiUrl);
  url.searchParams.set('tenant_slug', config.tenantSlug);
  url.searchParams.set('path', window.location.pathname);
  const res = await fetch(url.toString(), {
    method: 'GET',
    credentials: 'omit',
    mode: 'cors',
    headers: { accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { popups?: LoaderPopup[] };
  return Array.isArray(data.popups) ? data.popups : [];
}

function schedulePopup(config: LoaderConfig, popup: LoaderPopup): void {
  const delayMs =
    popup.trigger === 'immediate'
      ? 0
      : Math.max(0, popup.trigger_delay_seconds * 1000);
  // `time_on_page` is the only non-immediate trigger we support today.
  // `scroll_depth` and `exit_intent` are scaffolded in the API but the
  // browser-side handlers ship in iter 2.1.
  setTimeout(() => showPopup(config, popup), delayMs);
}

function showPopup(config: LoaderConfig, popup: LoaderPopup): void {
  const handle = renderPopup(popup);

  handle.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(handle.form);
    const honeypot = String(formData.get('hp_company') ?? '');
    const email = String(formData.get('email') ?? '').trim();
    if (!email) return;

    const extra: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (key === 'email' || key === 'hp_company') continue;
      if (typeof value === 'string') extra[key] = value;
    }

    const submitBtn = handle.form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (submitBtn) submitBtn.disabled = true;

    const payload: SubmissionPayload = {
      formSlug: popup.slug,
      email,
      pageUrl: window.location.href.split('?')[0] ?? window.location.href,
      anonymousId: getOrCreateAnonymousId(),
      honeypot,
      extra,
    };

    let response: SubmissionResponse | null = null;
    try {
      response = await postSubmission(config, payload);
    } catch (err) {
      console.warn('[datapp] popup submission failed:', err);
    }

    if (response?.status === 'ok' || response?.status === 'honeypot') {
      handle.showSuccess(popup.success_message);
      markShown(popup.id, popup.display_frequency);
      // Auto-close after 3 seconds so the visitor doesn't have to
      // hunt for the X button after a successful submit.
      setTimeout(() => handle.close(), 3000);
    } else if (submitBtn) {
      submitBtn.disabled = false;
    }
  });

  // Mark on render too — `display_frequency` is "we showed it",
  // independent of whether the visitor submitted.
  markShown(popup.id, popup.display_frequency);
}

async function postSubmission(
  config: LoaderConfig,
  payload: SubmissionPayload,
): Promise<SubmissionResponse> {
  const url = new URL('/ingest/popup-submission', config.apiUrl);
  url.searchParams.set('tenant_slug', config.tenantSlug);
  const res = await fetch(url.toString(), {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as SubmissionResponse;
}
