import Link from 'next/link';
import { buildListHref } from '@/lib/list-state';
import { getTranslations } from 'next-intl/server';

export type Currency = 'ars' | 'usd';

export function pickCurrency(raw: string | undefined): Currency {
  return raw === 'usd' ? 'usd' : 'ars';
}

interface Props {
  current: Currency;
  basePath: string;
  /** Search params already on the URL — preserved when switching. */
  currentParams: Record<string, string | string[] | undefined>;
}

/**
 * Two-button switch between ARS and USD revenue. Used on /insights and
 * /reports; converted in SQL via the daily Bluelytics rate (avg of
 * buy/sell at order date).
 */
export async function CurrencyToggle({
  current,
  basePath,
  currentParams,
}: Props): Promise<React.ReactElement> {
  const t = await getTranslations('common.currencyToggle');

  const hrefFor = (c: Currency): string =>
    buildListHref(basePath, currentParams, { currency: c === 'ars' ? undefined : c });

  return (
    <div
      role="group"
      aria-label={t('label')}
      className="inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5 text-xs"
    >
      <Link
        href={hrefFor('ars')}
        aria-pressed={current === 'ars'}
        className={
          current === 'ars'
            ? 'rounded-sm bg-primary px-3 py-1 font-medium text-primary-foreground'
            : 'rounded-sm px-3 py-1 text-muted-foreground transition hover:bg-muted hover:text-foreground'
        }
      >
        {t('ars')}
      </Link>
      <Link
        href={hrefFor('usd')}
        aria-pressed={current === 'usd'}
        className={
          current === 'usd'
            ? 'rounded-sm bg-primary px-3 py-1 font-medium text-primary-foreground'
            : 'rounded-sm px-3 py-1 text-muted-foreground transition hover:bg-muted hover:text-foreground'
        }
      >
        {t('usd')}
      </Link>
    </div>
  );
}
