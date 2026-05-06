'use client';

import { useState, useTransition } from 'react';
import { updateAllowedOrigins } from './actions';

interface Props {
  initial: string[];
}

/**
 * Allow-list of storefront origins for the public popup loader. The
 * input accepts one origin per line; on save the server normalises
 * each entry to scheme+host (no trailing slash) and dedupes. An empty
 * list means popups won't render anywhere — the UI warns explicitly
 * before persisting that state.
 */
export function AllowedOriginsForm({ initial }: Props): React.ReactElement {
  const [text, setText] = useState(initial.join('\n'));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const lines = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s !== '');
    if (lines.length === 0) {
      const ok = confirm(
        'Sin orígenes permitidos los popups dejan de mostrarse en cualquier storefront. ¿Continuar?',
      );
      if (!ok) return;
    }
    startTransition(async () => {
      const result = await updateAllowedOrigins(lines);
      if (!result.ok) {
        setError(result.error ?? 'Unknown error');
      } else {
        setSuccess(true);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSuccess(false);
        }}
        rows={4}
        spellCheck={false}
        placeholder="https://www.tienda.com&#10;https://staging.tienda.com"
        className="block w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <p className="text-[11px] text-muted-foreground">
        Un origen por línea, con esquema (ej. <code>https://tienda.com</code>). Puerto opcional.
      </p>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          Orígenes actualizados.
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? 'Guardando…' : 'Guardar orígenes'}
      </button>
    </form>
  );
}
