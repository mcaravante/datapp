interface ExportButtonProps {
  href: string;
  label?: string;
}

/**
 * Anchor styled as a secondary button. The browser hits our Next.js
 * route handler with the session cookie; the handler forwards to the
 * API with the JWT and streams CSV back.
 */
export function ExportButton({
  href,
  label = 'Export CSV',
}: ExportButtonProps): React.ReactElement {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-soft transition hover:bg-muted"
    >
      <DownloadIcon className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

function DownloadIcon({ className }: { className?: string }): React.ReactElement {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}
