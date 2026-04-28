'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { savePermissions } from '@/app/(authed)/permissions/actions';
import type {
  AccessMatrix,
  AdminSection,
  ConfigurableRole,
  PermissionsResponse,
} from '@/lib/types';

interface Props {
  initial: PermissionsResponse;
}

export function PermissionsMatrix({ initial }: Props): React.ReactElement {
  const t = useTranslations('permissions');
  const tSections = useTranslations('permissions.sectionNames');
  const [matrix, setMatrix] = useState<AccessMatrix>(initial.access);
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(role: ConfigurableRole, section: AdminSection): void {
    setSavedAt(null);
    setMatrix((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [section]: !prev[role][section],
      },
    }));
  }

  function onSubmit(): void {
    setError(null);
    startTransition(async () => {
      try {
        await savePermissions(matrix);
        setSavedAt(Date.now());
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        setError(t('error', { message: msg }));
      }
    });
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('matrixHeading')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('matrixHint')}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-semibold">{t('table.section')}</th>
              <th className="w-32 px-3 py-2 text-center font-semibold">{t('table.analyst')}</th>
              <th className="w-32 px-3 py-2 text-center font-semibold">{t('table.viewer')}</th>
            </tr>
          </thead>
          <tbody>
            {initial.sections.map((section) => (
              <tr key={section} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-foreground">
                  {tSections(section as AdminSection)}
                </td>
                <td className="px-3 py-2 text-center">
                  <Toggle
                    checked={matrix.analyst[section] ?? false}
                    onChange={() => toggle('analyst', section)}
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <Toggle
                    checked={matrix.viewer[section] ?? false}
                    onChange={() => toggle('viewer', section)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
        {savedAt && !error && (
          <span className="text-xs text-success">{t('saved')}</span>
        )}
        {error && <span className="text-xs text-destructive">{error}</span>}
        <button
          type="button"
          onClick={onSubmit}
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? t('saving') : t('save')}
        </button>
      </div>
    </section>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={
        checked
          ? 'relative inline-flex h-5 w-9 items-center rounded-full bg-primary transition'
          : 'relative inline-flex h-5 w-9 items-center rounded-full bg-muted transition'
      }
    >
      <span
        className={
          checked
            ? 'inline-block h-4 w-4 translate-x-4 transform rounded-full bg-primary-foreground transition'
            : 'inline-block h-4 w-4 translate-x-0.5 transform rounded-full bg-card transition'
        }
      />
    </button>
  );
}
