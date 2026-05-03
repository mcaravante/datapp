'use client';

import { useRef, useState, useTransition } from 'react';
import { updateBranding } from './actions';
import { RichTextEditor } from '@/components/rich-text-editor';
import type { BrandingDto } from '@/lib/types';

interface UploadedLogo {
  id: string;
  url: string;
  filename: string;
}

const FOOTER_VARIABLES = [
  { label: 'Año actual', expression: new Date().getFullYear().toString() },
];

export function BrandingForm({ branding }: { branding: BrandingDto }): React.ReactElement {
  const [logo, setLogo] = useState<UploadedLogo | null>(
    branding.logo_media_asset_id && branding.logo_url
      ? { id: branding.logo_media_asset_id, url: branding.logo_url, filename: 'logo' }
      : null,
  );
  const [logoMaxWidthPx, setLogoMaxWidthPx] = useState(branding.logo_max_width_px);
  const [primaryColor, setPrimaryColor] = useState(branding.primary_color ?? '#111111');
  const [footerHtml, setFooterHtml] = useState(branding.footer_html ?? '');
  const [senderName, setSenderName] = useState(branding.sender_name ?? '');
  const [senderAddress, setSenderAddress] = useState(branding.sender_address ?? '');
  const [unsubscribeText, setUnsubscribeText] = useState(branding.unsubscribe_text);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function uploadLogo(file: File): Promise<void> {
    setUploadError(null);
    setUploading(true);
    try {
      if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen.');
      if (file.size > 5 * 1024 * 1024) throw new Error('La imagen supera 5 MB.');
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/admin/media', { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Upload falló (${res.status.toString()})`);
      const json = (await res.json()) as { id: string; url: string; filename: string };
      setLogo({ id: json.id, url: json.url, filename: json.filename });
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function onSave(): void {
    setSaveError(null);
    setSavedAt(null);
    startSaving(async () => {
      try {
        await updateBranding({
          logoMediaAssetId: logo ? logo.id : null,
          logoMaxWidthPx,
          primaryColor: primaryColor.trim() === '' ? null : primaryColor,
          footerHtml: footerHtml.trim() === '' ? null : footerHtml,
          senderName: senderName.trim() === '' ? null : senderName,
          senderAddress: senderAddress.trim() === '' ? null : senderAddress,
          unsubscribeText: unsubscribeText.trim(),
        });
        setSavedAt(new Date().toLocaleTimeString('es-AR'));
      } catch (err) {
        setSaveError((err as Error).message);
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5 rounded-lg border border-border bg-card p-6 shadow-card">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">Logo de la marca</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            PNG / JPG / WEBP / GIF, máx 5 MB. Aparece centrado arriba de cada email.
          </p>
          {logo ? (
            <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
              <img
                src={logo.url}
                alt="Logo actual"
                style={{ maxWidth: 120, maxHeight: 60 }}
                className="rounded-md bg-white p-1"
              />
              <div className="flex-1 text-xs text-muted-foreground">
                <code className="break-all">{logo.url}</code>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:bg-muted"
              >
                Cambiar
              </button>
              <button
                type="button"
                onClick={() => setLogo(null)}
                className="rounded-md border border-destructive bg-card px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
              >
                Quitar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-foreground hover:bg-muted disabled:opacity-50"
            >
              {uploading ? 'Subiendo…' : '+ Subir logo'}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void uploadLogo(file);
            }}
          />
          {uploadError && (
            <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {uploadError}
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Ancho máximo (px)
              </label>
              <input
                type="number"
                min={40}
                max={600}
                value={logoMaxWidthPx}
                onChange={(e) => setLogoMaxWidthPx(Number(e.target.value))}
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Color principal (hex)
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded-md border border-input bg-background"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  pattern="^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"
                  placeholder="#111111"
                  className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">Footer</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            HTML que se renderiza al pie de cada email, antes del link de desuscripción.
          </p>
          <RichTextEditor
            value={footerHtml}
            onChange={setFooterHtml}
            minHeight={180}
            placeholder="© 2026 Mi Tienda · todos los derechos reservados…"
            variables={FOOTER_VARIABLES.map((v) => ({
              label: v.label,
              expression: v.expression,
            }))}
          />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">Datos del remitente</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            El nombre y la dirección física aparecen en el footer y en la página de
            desuscripción. Recomendado para cumplir con CAN-SPAM (US) y dar transparencia.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Nombre
              </label>
              <input
                type="text"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="Mi Tienda"
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Dirección física
              </label>
              <input
                type="text"
                value={senderAddress}
                onChange={(e) => setSenderAddress(e.target.value)}
                placeholder="Av. Corrientes 1234, CABA, Argentina"
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">Texto de desuscripción</h2>
          <input
            type="text"
            value={unsubscribeText}
            onChange={(e) => setUnsubscribeText(e.target.value)}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            El link "Desuscribirme" se agrega automáticamente debajo de este texto.
          </p>
        </section>

        {saveError && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {saveError}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          {savedAt && (
            <span className="text-xs text-success">Guardado a las {savedAt}</span>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      <aside className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold text-foreground">Preview del shell</h2>
        <p className="text-xs text-muted-foreground">
          Vista del wrapper que envuelve cada email. El cuerpo del template va donde dice
          "Cuerpo del email aquí…".
        </p>
        <div className="rounded-md border border-border bg-[#f4f4f7] p-2">
          <div className="mx-auto max-w-md rounded-md bg-white shadow-sm">
            {logo && (
              <div className="px-6 pb-2 pt-7 text-center">
                <img
                  src={logo.url}
                  alt="Logo"
                  style={{ maxWidth: logoMaxWidthPx, maxHeight: 80 }}
                  className="mx-auto"
                />
              </div>
            )}
            <div className="px-6 py-4 text-sm text-foreground">
              <em className="text-muted-foreground">[ Cuerpo del email aquí… ]</em>
            </div>
            <div className="border-t border-border px-6 py-4 text-[11px] leading-relaxed text-muted-foreground">
              {footerHtml && (
                <div
                  className="mb-2"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: footerHtml }}
                />
              )}
              {(senderName || senderAddress) && (
                <div className="mb-2">
                  {senderName && <div>{senderName}</div>}
                  {senderAddress && <div>{senderAddress}</div>}
                </div>
              )}
              <div>
                {unsubscribeText}
                <br />
                <a className="underline" href="#preview">
                  Desuscribirme
                </a>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
