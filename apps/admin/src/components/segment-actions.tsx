'use client';

import { useState, useTransition } from 'react';
import { deleteSegment, refreshSegment } from '@/app/(authed)/segments/actions';

interface SegmentActionsProps {
  segmentId: string;
  segmentName: string;
}

export function SegmentActions({
  segmentId,
  segmentName,
}: SegmentActionsProps): React.ReactElement {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshOk, setRefreshOk] = useState(false);

  function onRefresh(): void {
    setError(null);
    setRefreshOk(false);
    startTransition(async () => {
      try {
        await refreshSegment(segmentId);
        setRefreshOk(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to refresh');
      }
    });
  }

  function onDelete(): void {
    setError(null);
    startTransition(async () => {
      try {
        await deleteSegment(segmentId);
        // deleteSegment redirects on success, so we won't reach here.
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete');
        setConfirmOpen(false);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-soft transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshIcon className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
          {isPending ? 'Refreshing…' : 'Refresh'}
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <TrashIcon className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
      {refreshOk && (
        <span className="text-xs text-success">Membership refreshed.</span>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-6 backdrop-blur-sm"
        >
          <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-elevated">
            <h3 id="delete-title" className="text-base font-semibold text-foreground">
              Delete &ldquo;{segmentName}&rdquo;?
            </h3>
            <p className="text-sm text-muted-foreground">
              The segment definition and member list will be removed. The customer profiles
              themselves are not affected.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground transition hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={isPending}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground shadow-soft transition hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RefreshIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
