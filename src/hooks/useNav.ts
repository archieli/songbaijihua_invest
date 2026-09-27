import { useEffect, useMemo, useState } from 'react';
import { loadAllNav, type NavBundle } from '@/data/nav';
import { useStore } from '@/store';
import type { PriceMap } from '@/domain/types';

let bundlePromise: Promise<NavBundle> | undefined;

/** 加载行情（全局只加载一次），并合并用户手动覆盖的价格 */
export function useNav() {
  const [bundle, setBundle] = useState<NavBundle>();
  const [error, setError] = useState<string>();
  const overrides = useStore((s) => s.settings.priceOverrides);

  useEffect(() => {
    bundlePromise ??= loadAllNav();
    bundlePromise.then(setBundle).catch((e: Error) => setError(e.message));
  }, []);

  const prices: PriceMap = useMemo(() => {
    const p: PriceMap = { ...(bundle?.latestPrices ?? {}) };
    for (const [code, o] of Object.entries(overrides)) if (o?.price > 0) p[code] = o.price;
    return p;
  }, [bundle, overrides]);

  return { nav: bundle, prices, loading: !bundle && !error, error };
}
