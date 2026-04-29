import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { apiFetch } from '@/lib/api-client';
import { formatBuenosAires } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { AdminRole, AuditActionId, AuditLogPage, AuditLogRow } from '@/lib/types';

export const metadata = { title: 'CDP Admin · Audit log' };

const ALLOWED: readonly AdminRole[] = ['super_admin', 'admin'];

const ACTIONS_FILTER: readonly AuditActionId[] = [
  'login',
  'logout',
  'login_failed',
  'account_locked',
  'password_reset_requested',
  'password_reset_completed',
  'session_revoked',
  'two_factor_enrolled',
  'two_factor_disabled',
  'two_factor_admin_reset',
  'recovery_codes_generated',
  'recovery_code_used',
  'create',
  'update',
  'delete',
  'export',
  'erase',
];

interface PageProps {
  searchParams: Promise<{ cursor?: string; action?: string }>;
}

export default async function AuditLogPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const session = await auth();
  if (!session) redirect('/login');
  const role = (session.user?.role ?? 'viewer') as AdminRole;
  if (!ALLOWED.includes(role)) redirect('/');

  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.cursor) params.set('cursor', sp.cursor);
  if (sp.action) params.set('action', sp.action);
  const qs = params.toString();
  const path = qs ? `/v1/admin/audit?${qs}` : '/v1/admin/audit';
  const page = await apiFetch<AuditLogPage>(path);

  const t = await getTranslations('audit');
  const tActions = await getTranslations('audit.actions');
  const locale = (await getLocale()) as Locale;

  const baseFilterUrl = (action: string | null): string => {
    const u = new URLSearchParams();
    if (action) u.set('action', action);
    return `/audit${u.toString() ? `?${u.toString()}` : ''}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card/60 p-3 text-xs">
        <span className="text-muted-foreground">{t('filter')}:</span>
        <Link
          href={baseFilterUrl(null)}
          className={
            !sp.action
              ? 'rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary'
              : 'rounded-full px-2 py-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground'
          }
        >
          {t('allActions')}
        </Link>
        {ACTIONS_FILTER.map((action) => (
          <Link
            key={action}
            href={baseFilterUrl(action)}
            className={
              sp.action === action
                ? 'rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary'
                : 'rounded-full px-2 py-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground'
            }
          >
            {tActions(action)}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">{t('table.when')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.action')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.actor')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.entity')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.ip')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.detail')}</th>
            </tr>
          </thead>
          <tbody>
            {page.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  {t('table.empty')}
                </td>
              </tr>
            )}
            {page.data.map((row) => (
              <AuditRow key={row.id} row={row} locale={locale} />
            ))}
          </tbody>
        </table>
      </div>

      {page.next_cursor && (
        <div className="flex justify-end">
          <Link
            href={`/audit?${new URLSearchParams({
              ...(sp.action ? { action: sp.action } : {}),
              cursor: page.next_cursor,
            }).toString()}`}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground transition hover:bg-muted"
          >
            {t('next')} →
          </Link>
        </div>
      )}
    </div>
  );
}

async function AuditRow({
  row,
  locale,
}: {
  row: AuditLogRow;
  locale: Locale;
}): Promise<React.ReactElement> {
  const tActions = await getTranslations('audit.actions');
  const tone = actionTone(row.action);
  const detail = renderDetail(row);
  return (
    <tr className="border-b border-border last:border-0 align-top transition hover:bg-muted/40">
      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
        {formatBuenosAires(row.at, locale)}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
        >
          {tActions(row.action)}
        </span>
      </td>
      <td className="px-4 py-3 text-foreground/80">
        {row.user ? (
          <div>
            <div className="font-medium">{row.user.name}</div>
            <div className="text-xs text-muted-foreground">{row.user.email}</div>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
        {row.entity}
        {row.entity_id && (
          <div className="mt-0.5 text-[10px] text-muted-foreground/70">
            {row.entity_id.slice(0, 8)}…
          </div>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
        {row.ip ?? '—'}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{detail}</td>
    </tr>
  );
}

function actionTone(action: AuditActionId): string {
  switch (action) {
    case 'login':
    case 'two_factor_enrolled':
    case 'recovery_codes_generated':
      return 'bg-success/15 text-success';
    case 'login_failed':
    case 'account_locked':
    case 'two_factor_disabled':
    case 'two_factor_admin_reset':
    case 'delete':
    case 'erase':
      return 'bg-destructive/15 text-destructive';
    case 'password_reset_requested':
    case 'password_reset_completed':
    case 'recovery_code_used':
    case 'session_revoked':
      return 'bg-warning/15 text-warning';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function renderDetail(row: AuditLogRow): string {
  const parts: string[] = [];
  if (row.after && typeof row.after === 'object') {
    for (const [key, value] of Object.entries(row.after)) {
      if (key === 'session_id') continue; // noisy
      parts.push(`${key}=${formatValue(value)}`);
    }
  }
  return parts.length > 0 ? parts.join(' · ') : '—';
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}
