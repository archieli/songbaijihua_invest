import { FUNDS } from '@/config/plan';
import type { Series } from '@/domain/backtest';
import type { PriceMap } from '@/domain/types';

export interface NavFile {
  symbol: string;
  name: string;
  displayName: string;
  kind: 'fund' | 'proxy';
  updatedAt: string;
  first: string;
  last: string;
  series: Series;
}

export interface NavBundle {
  /** code → 基金行情 */
  byCode: Record<string, NavFile>;
  /** code → 代理指数行情（若配置） */
  proxyByCode: Record<string, NavFile | undefined>;
  /** 最新收盘价 {code: price} */
  latestPrices: PriceMap;
  /** 各基金最新数据日期中最早的一个 */
  latestDate: string;
  updatedAt: string;
}

const cache = new Map<string, Promise<NavFile>>();

function base(): string {
  const b = import.meta.env.BASE_URL || '/';
  return b.endsWith('/') ? b : b + '/';
}

export function loadNav(symbol: string): Promise<NavFile> {
  if (!cache.has(symbol)) {
    cache.set(
      symbol,
      fetch(`${base()}data/nav/${symbol}.json`).then((r) => {
        if (!r.ok) throw new Error(`加载行情失败：${symbol} (${r.status})`);
        return r.json() as Promise<NavFile>;
      }),
    );
  }
  return cache.get(symbol)!;
}

export async function loadAllNav(): Promise<NavBundle> {
  const files = await Promise.all(FUNDS.map((f) => loadNav(f.symbol)));
  const proxies = await Promise.all(FUNDS.map((f) => (f.proxy ? loadNav(f.proxy.symbol) : Promise.resolve(undefined))));
  const byCode: Record<string, NavFile> = {};
  const proxyByCode: Record<string, NavFile | undefined> = {};
  const latestPrices: PriceMap = {};
  let latestDate = '9999-12-31';
  let updatedAt = '';
  FUNDS.forEach((f, i) => {
    byCode[f.code] = files[i];
    proxyByCode[f.code] = proxies[i];
    latestPrices[f.code] = files[i].series.at(-1)?.[1] ?? 0;
    if (files[i].last < latestDate) latestDate = files[i].last;
    if (files[i].updatedAt > updatedAt) updatedAt = files[i].updatedAt;
  });
  return { byCode, proxyByCode, latestPrices, latestDate, updatedAt };
}

/** 取某日（或之前最近交易日）的收盘价 */
export function priceOn(series: Series, date: string): number | undefined {
  let lo = 0;
  let hi = series.length - 1;
  let ans: number | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= date) {
      ans = series[mid][1];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
