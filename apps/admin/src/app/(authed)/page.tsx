export const metadata = { title: 'CDP Admin · Overview' };

export default function OverviewPage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Overview</h1>
        <p className="mt-1 text-sm text-neutral-500">
          KPIs, top products and cohort retention land in Iteration 4. For now jump into customers
          or sync.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <a
          href="/customers"
          className="rounded-lg border border-neutral-200 bg-white p-5 transition hover:border-neutral-300 hover:shadow-sm"
        >
          <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Customers
          </div>
          <div className="mt-2 text-base font-semibold text-neutral-900">Browse and search</div>
          <p className="mt-1 text-sm text-neutral-500">
            Identity, addresses, lifetime metrics for every synced customer.
          </p>
        </a>
        <a
          href="/sync"
          className="rounded-lg border border-neutral-200 bg-white p-5 transition hover:border-neutral-300 hover:shadow-sm"
        >
          <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Sync</div>
          <div className="mt-2 text-base font-semibold text-neutral-900">Status per entity</div>
          <p className="mt-1 text-sm text-neutral-500">
            Cursor, last error, last processed time per Magento store.
          </p>
        </a>
      </div>
    </div>
  );
}
