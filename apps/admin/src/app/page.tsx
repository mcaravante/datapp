export default function HomePage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-3xl p-12">
      <h1 className="text-3xl font-semibold tracking-tight">CDP Admin</h1>
      <p className="mt-2 text-neutral-600">
        Phase 1 — foundation up. Sign-in, customers, and sync status land in Iteration 3.
      </p>
      <ul className="mt-8 list-disc pl-5 text-sm text-neutral-700">
        <li>
          API: <code className="rounded bg-neutral-200 px-1">http://localhost:3000</code>
        </li>
        <li>
          OpenAPI:{' '}
          <code className="rounded bg-neutral-200 px-1">http://localhost:3000/v1/docs</code>
        </li>
        <li>
          This dashboard: <code className="rounded bg-neutral-200 px-1">http://localhost:3001</code>
        </li>
      </ul>
    </main>
  );
}
