import type { ResolvedBranding } from './branding.service';

/**
 * Wrap a rendered template body with the brand shell + unsubscribe
 * link. Output is a full standalone HTML document suitable for Resend.
 *
 * Email-client compatibility constraints in mind:
 *   - Tables for layout (not flexbox / grid).
 *   - Inline styles only (no <style> blocks for Outlook-on-PC support).
 *   - All colors as full hex.
 *   - No `position`, `transform`, `flex`, custom fonts via @font-face.
 */
export interface EmailShellInput {
  /** Inner body HTML rendered from the operator's template. */
  bodyHtml: string;
  branding: ResolvedBranding | null;
  unsubscribeUrl: string;
}

/** Escape free-form text for safe insertion in HTML attributes. */
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const SHELL_BG = '#f4f4f7';
const CARD_BG = '#ffffff';
const TEXT_MUTED = '#888888';
const RULE = '#eaeaea';

export function composeEmailShell(input: EmailShellInput): string {
  const { branding, bodyHtml, unsubscribeUrl } = input;

  const logoBlock = branding?.logoUrl
    ? `
        <tr>
          <td align="center" style="padding: 28px 24px 8px 24px;">
            <img src="${escapeAttr(branding.logoUrl)}" alt="Logo" style="display: block; max-width: ${branding.logoMaxWidthPx.toString()}px; height: auto; border: 0; outline: none; text-decoration: none;" />
          </td>
        </tr>`
    : '';

  const senderLine = branding?.senderName
    ? `<div style="margin-top: 6px;">${escapeText(branding.senderName)}${
        branding.senderAddress
          ? `<br/><span style="color: ${TEXT_MUTED};">${escapeText(branding.senderAddress)}</span>`
          : ''
      }</div>`
    : '';

  const customFooter = branding?.footerHtml
    ? `<div style="margin-bottom: 12px;">${branding.footerHtml}</div>`
    : '';

  const unsubscribeLine = `
    <div style="margin-top: 8px;">
      ${escapeText(branding?.unsubscribeText ?? 'Si no querés recibir más estos emails, podés desuscribirte acá.')}
      <br/>
      <a href="${escapeAttr(unsubscribeUrl)}" style="color: ${TEXT_MUTED}; text-decoration: underline;">
        Desuscribirme
      </a>
    </div>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>Email</title>
</head>
<body style="margin: 0; padding: 0; background: ${SHELL_BG}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background: ${SHELL_BG};">
    <tr>
      <td align="center" style="padding: 24px 12px;">
        <table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; background: ${CARD_BG}; border-radius: 8px; overflow: hidden;">
          ${logoBlock}
          <tr>
            <td style="padding: 16px 24px 24px 24px; font-size: 15px; line-height: 1.5; color: #111;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 24px 24px 24px; border-top: 1px solid ${RULE}; font-size: 12px; line-height: 1.5; color: ${TEXT_MUTED};">
              ${customFooter}
              ${senderLine}
              ${unsubscribeLine}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
