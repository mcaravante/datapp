export const dynamic = 'force-dynamic';

export default function NotFound(): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-neutral-900">404</h1>
        <p className="text-sm text-neutral-500">That page does not exist.</p>
      </div>
    </main>
  );
}
