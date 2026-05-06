import type { LoaderPopup, PopupField } from './types';

/**
 * Renders a popup into a Shadow-DOM-isolated wrapper attached to the
 * document body and returns its handle, including:
 *   - the form element (so the caller can wire submit)
 *   - close + remove helpers
 *   - a function to swap the form for a success state
 *
 * Shadow DOM is critical — Magento storefronts ship enormous CSS
 * stacks that would otherwise paint our buttons grey on hover, hide
 * the close icon behind a dropdown, etc. With shadow root, the only
 * style that leaks in is `inherit`-able properties, which we lock
 * down explicitly with `all: initial` on the host.
 */

export interface PopupHandle {
  host: HTMLElement;
  form: HTMLFormElement;
  showSuccess: (message: string | null) => void;
  close: () => void;
}

const HOST_TAG = 'datapp-popup';

export function renderPopup(popup: LoaderPopup): PopupHandle {
  const host = document.createElement(HOST_TAG);
  host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483646;';
  const shadow = host.attachShadow({ mode: 'closed' });

  const accent = sanitizeColor(popup.primary_color) ?? '#c9303f';

  const fieldsHtml = popup.fields.map((f) => fieldHtml(f)).join('');
  const ctaLabel = escapeHtml(popup.primary_cta_label || 'Suscribirme');
  const headline = escapeHtml(popup.headline ?? '');
  const subheadline = escapeHtml(popup.subheadline ?? '');
  const consent = escapeHtml(popup.consent_text ?? '');
  const imageUrl = popup.image_url && isHttpsUrl(popup.image_url) ? popup.image_url : null;

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .backdrop {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.5);
        display: flex; align-items: center; justify-content: center;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        animation: fadeIn 200ms ease-out;
      }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      .modal {
        position: relative;
        background: #fff; color: #1a1a1a;
        border-radius: 8px;
        max-width: 720px; width: calc(100% - 32px);
        max-height: calc(100% - 32px);
        overflow: hidden;
        display: flex; flex-direction: row;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      }
      .body {
        padding: 32px; flex: 1 1 auto;
        display: flex; flex-direction: column; gap: 16px;
      }
      .image {
        flex: 0 0 220px;
        background-size: cover; background-position: center;
      }
      h2 {
        margin: 0; font-size: 22px; line-height: 1.2; font-weight: 700;
        color: ${accent};
      }
      p.sub {
        margin: 0; font-size: 14px; line-height: 1.5; color: #444;
      }
      label {
        display: flex; flex-direction: column; gap: 4px;
        font-size: 12px; color: #555;
      }
      input[type="email"], input[type="text"], input[type="tel"] {
        font: inherit; font-size: 14px;
        padding: 10px 12px;
        border: 1px solid #d0d0d0; border-radius: 6px;
        outline: none;
      }
      input:focus {
        border-color: ${accent};
        box-shadow: 0 0 0 3px ${accent}33;
      }
      .cta {
        font: inherit; font-weight: 600; font-size: 14px;
        background: ${accent}; color: #fff;
        border: none; border-radius: 6px;
        padding: 12px 16px; cursor: pointer;
      }
      .cta:disabled { opacity: 0.6; cursor: progress; }
      .consent { font-size: 11px; color: #777; line-height: 1.4; }
      .close {
        position: absolute; top: 8px; right: 8px;
        background: transparent; border: none;
        font-size: 24px; line-height: 1;
        color: #888; cursor: pointer; padding: 6px 10px;
      }
      .close:hover { color: #222; }
      .honeypot {
        position: absolute; left: -10000px; top: -10000px;
        width: 1px; height: 1px; opacity: 0;
        pointer-events: none;
      }
      .success {
        padding: 32px; text-align: center;
        font-size: 14px; line-height: 1.5; color: #1a1a1a;
      }
      @media (max-width: 600px) {
        .modal { flex-direction: column-reverse; }
        .image { flex: 0 0 140px; width: 100%; }
        .body { padding: 24px; }
      }
    </style>
    <div class="backdrop" data-role="backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-label="${headline || 'Suscripción'}">
        <button type="button" class="close" data-role="close" aria-label="Cerrar">×</button>
        <div class="body" data-role="body">
          ${headline ? `<h2>${headline}</h2>` : ''}
          ${subheadline ? `<p class="sub">${subheadline}</p>` : ''}
          <form data-role="form" novalidate>
            ${fieldsHtml}
            <input type="text" name="hp_company" class="honeypot" tabindex="-1" autocomplete="off" aria-hidden="true" />
            <button type="submit" class="cta">${ctaLabel}</button>
            ${consent ? `<div class="consent">${consent}</div>` : ''}
          </form>
        </div>
        ${imageUrl ? `<div class="image" style="background-image:url('${escapeAttr(imageUrl)}')"></div>` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(host);

  const form = shadow.querySelector('[data-role="form"]') as HTMLFormElement;
  const body = shadow.querySelector('[data-role="body"]') as HTMLElement;
  const closeBtn = shadow.querySelector('[data-role="close"]') as HTMLButtonElement;
  const backdrop = shadow.querySelector('[data-role="backdrop"]') as HTMLElement;

  const handle: PopupHandle = {
    host,
    form,
    showSuccess(message) {
      body.innerHTML = `<div class="success">${escapeHtml(message ?? '¡Listo, gracias!')}</div>`;
    },
    close() {
      try {
        host.remove();
      } catch {
        /* noop */
      }
    },
  };

  closeBtn.addEventListener('click', handle.close);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) handle.close();
  });
  document.addEventListener(
    'keydown',
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        handle.close();
        document.removeEventListener('keydown', onKeyDown);
      }
    },
  );

  return handle;
}

function fieldHtml(field: PopupField): string {
  const id = `df_${field.name}`;
  const label = escapeHtml(field.label);
  const placeholder = escapeAttr(field.placeholder ?? '');
  const required = field.required ? 'required' : '';
  const safeName = escapeAttr(field.name);
  switch (field.type) {
    case 'email':
      return `<label for="${id}">${label}<input id="${id}" name="${safeName}" type="email" placeholder="${placeholder}" autocomplete="email" ${required} /></label>`;
    case 'tel':
      return `<label for="${id}">${label}<input id="${id}" name="${safeName}" type="tel" placeholder="${placeholder}" autocomplete="tel" ${required} /></label>`;
    case 'text':
      return `<label for="${id}">${label}<input id="${id}" name="${safeName}" type="text" placeholder="${placeholder}" ${required} /></label>`;
    default:
      // Unknown field types are dropped silently — older bundle, newer
      // popup config. Better than crashing the storefront.
      return '';
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizeColor(value: string | null): string | null {
  if (!value) return null;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : null;
}
