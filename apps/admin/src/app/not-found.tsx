import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function NotFound(): Promise<React.ReactElement> {
  const t = await getTranslations('errors');
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">{t('notFoundTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('notFoundBody')}</p>
      </div>
    </main>
  );
}
