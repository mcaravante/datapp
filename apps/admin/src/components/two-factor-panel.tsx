'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  disableTwoFactor,
  enrollTwoFactor,
  regenerateRecoveryCodes,
  verifyTwoFactor,
} from '@/app/(authed)/security/actions';
import type { EnrollResponse } from '@/lib/types';

interface Props {
  initialEnabled: boolean;
  initialRecoveryRemaining: number;
}

type Phase = 'idle' | 'enrolling' | 'disabling' | 'regenerating';

export function TwoFactorPanel({
  initialEnabled,
  initialRecoveryRemaining,
}: Props): React.ReactElement {
  const t = useTranslations('security');
  const tEnroll = useTranslations('security.enroll');
  const tDisable = useTranslations('security.disable');
  const tRecovery = useTranslations('security.recovery');
  const tCommon = useTranslations('common');
  const [enabled, setEnabled] = useState(initialEnabled);
  const [phase, setPhase] = useState<Phase>('idle');
  const [enrollment, setEnrollment] = useState<EnrollResponse | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [recoveryRemaining, setRecoveryRemaining] = useState(initialRecoveryRemaining);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset(): void {
    setPhase('idle');
    setEnrollment(null);
    setCode('');
    setPassword('');
    setError(null);
  }

  function dismissCodes(): void {
    setRecoveryCodes(null);
  }

  function startEnroll(): void {
    setError(null);
    setSuccess(null);
    setRecoveryCodes(null);
    startTransition(async () => {
      try {
        const data = await enrollTwoFactor();
        setEnrollment(data);
        setPhase('enrolling');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'unknown');
      }
    });
  }

  function submitVerify(): void {
    setError(null);
    startTransition(async () => {
      try {
        const result = await verifyTwoFactor(code);
        setEnabled(true);
        setSuccess(t('successEnabled'));
        setRecoveryCodes(result.recovery_codes);
        setRecoveryRemaining(result.recovery_codes.length);
        reset();
      } catch {
        setError(tEnroll('errorInvalid'));
      }
    });
  }

  function submitDisable(): void {
    setError(null);
    startTransition(async () => {
      try {
        await disableTwoFactor(password);
        setEnabled(false);
        setSuccess(t('successDisabled'));
        setRecoveryRemaining(0);
        setRecoveryCodes(null);
        reset();
      } catch {
        setError(tDisable('errorWrongPassword'));
      }
    });
  }

  function submitRegenerate(): void {
    setError(null);
    startTransition(async () => {
      try {
        const result = await regenerateRecoveryCodes(password);
        setRecoveryCodes(result.recovery_codes);
        setRecoveryRemaining(result.recovery_codes.length);
        setSuccess(tRecovery('regenSuccess'));
        reset();
      } catch {
        setError(tDisable('errorWrongPassword'));
      }
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-card p-5 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {enabled ? t('statusEnabledTitle') : t('statusDisabledTitle')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {enabled ? t('statusEnabledBody') : t('statusDisabledBody')}
            </p>
            {enabled && phase === 'idle' && (
              <p
                className={
                  recoveryRemaining <= 2
                    ? 'mt-2 text-xs text-destructive'
                    : 'mt-2 text-xs text-muted-foreground'
                }
              >
                {tRecovery('remaining', { count: recoveryRemaining })}
              </p>
            )}
          </div>
          <span
            className={
              enabled
                ? 'inline-flex h-2.5 w-2.5 rounded-full bg-success ring-4 ring-success/15'
                : 'inline-flex h-2.5 w-2.5 rounded-full bg-muted-foreground/40'
            }
            aria-hidden="true"
          />
        </div>
        {success && !recoveryCodes && (
          <p className="mt-3 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
            {success}
          </p>
        )}
        {error && phase === 'idle' && (
          <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {!enabled && phase === 'idle' && (
            <button
              type="button"
              onClick={startEnroll}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('enableButton')}
            </button>
          )}
          {enabled && phase === 'idle' && (
            <>
              <button
                type="button"
                onClick={() => setPhase('regenerating')}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
              >
                {tRecovery('regenButton')}
              </button>
              <button
                type="button"
                onClick={() => setPhase('disabling')}
                className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/15"
              >
                {t('disableButton')}
              </button>
            </>
          )}
        </div>
      </section>

      {recoveryCodes && (
        <RecoveryCodesPanel codes={recoveryCodes} onDismiss={dismissCodes} />
      )}

      {phase === 'enrolling' && enrollment && (
        <section className="rounded-lg border border-border bg-card p-5 shadow-card">
          <h3 className="text-base font-semibold text-foreground">{tEnroll('heading')}</h3>
          <ol className="mt-4 space-y-4 text-sm text-foreground">
            <li className="text-muted-foreground">{tEnroll('step1')}</li>
            <li>
              <p className="text-muted-foreground">{tEnroll('step2')}</p>
              <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <img
                  src={enrollment.qr_data_url}
                  alt="2FA QR"
                  className="h-44 w-44 rounded-md border border-border bg-background p-2"
                />
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    {tEnroll('manualLabel')}
                  </span>
                  <code className="select-all rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs">
                    {enrollment.manual_entry_secret}
                  </code>
                </div>
              </div>
            </li>
            <li>
              <p className="text-muted-foreground">{tEnroll('step3')}</p>
              <label className="mt-2 block text-xs font-medium text-foreground">
                {tEnroll('codeLabel')}
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={10}
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="mt-1 block w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 font-mono text-base tracking-[0.4em] text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                  placeholder="123 456"
                />
              </label>
            </li>
          </ol>

          {error && (
            <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground transition hover:bg-muted"
            >
              {tCommon('cancel')}
            </button>
            <button
              type="button"
              onClick={submitVerify}
              disabled={isPending || code.replace(/\s+/g, '').length < 6}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? tEnroll('verifying') : tEnroll('verify')}
            </button>
          </div>
        </section>
      )}

      {phase === 'disabling' && (
        <section className="rounded-lg border border-border bg-card p-5 shadow-card">
          <h3 className="text-base font-semibold text-foreground">{tDisable('heading')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{tDisable('body')}</p>
          <label className="mt-4 block text-xs font-medium text-foreground">
            {tDisable('passwordLabel')}
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>

          {error && (
            <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground transition hover:bg-muted"
            >
              {tCommon('cancel')}
            </button>
            <button
              type="button"
              onClick={submitDisable}
              disabled={isPending || password.length === 0}
              className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground shadow-soft transition hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? tDisable('submitting') : tDisable('submit')}
            </button>
          </div>
        </section>
      )}

      {phase === 'regenerating' && (
        <section className="rounded-lg border border-border bg-card p-5 shadow-card">
          <h3 className="text-base font-semibold text-foreground">{tRecovery('regenHeading')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{tRecovery('regenBody')}</p>
          <label className="mt-4 block text-xs font-medium text-foreground">
            {tDisable('passwordLabel')}
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>

          {error && (
            <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground transition hover:bg-muted"
            >
              {tCommon('cancel')}
            </button>
            <button
              type="button"
              onClick={submitRegenerate}
              disabled={isPending || password.length === 0}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? tRecovery('regenerating') : tRecovery('regenSubmit')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function RecoveryCodesPanel({
  codes,
  onDismiss,
}: {
  codes: string[];
  onDismiss: () => void;
}): React.ReactElement {
  const tRecovery = useTranslations('security.recovery');
  const [copied, setCopied] = useState(false);

  async function copyAll(): Promise<void> {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2_000);
    } catch {
      /* clipboard blocked — user can still select-and-copy from the box */
    }
  }

  function downloadTxt(): void {
    const blob = new Blob([codes.join('\n') + '\n'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cdp-recovery-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-lg border border-warning/40 bg-warning/5 p-5 shadow-card">
      <h3 className="text-base font-semibold text-foreground">{tRecovery('codesHeading')}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{tRecovery('codesBody')}</p>

      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-2">
        {codes.map((code) => (
          <li
            key={code}
            className="select-all rounded-md border border-border bg-card px-3 py-2 text-center font-mono text-sm tracking-[0.2em] text-foreground"
          >
            {code}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={copyAll}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground transition hover:bg-muted"
        >
          {copied ? tRecovery('copied') : tRecovery('copy')}
        </button>
        <button
          type="button"
          onClick={downloadTxt}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground transition hover:bg-muted"
        >
          {tRecovery('download')}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          {tRecovery('codesAcknowledge')}
        </button>
      </div>
    </section>
  );
}
