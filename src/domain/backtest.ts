import dayjs from 'dayjs';
import type { WeightMap } from './types';

/** [date, close][] 升序 */
export type Series = [string, number][];

export interface PriceTable {
  dates: string[];
  /** code → 与 dates 对齐的价格数组 */
  prices: Record<string, number[]>;
  /** 使用了代理指数的基金：code → 代理截止日（该日起为真实基金数据） */
  proxied: Record<string, { until: string; name: string }>;
  first: string;
  last: string;
}

export interface ProxyInfo {
  series: Series;
  name: string;
}

/**
 * 把各基金序列对齐到同一交易日历（并集 + 向前填充）。
 * useProxy 时，基金成立前用代理指数回溯，并在基金首日按价格比例拼接。
 */
export function buildPriceTable(
  fundSeries: Record<string, Series>,
  proxies: Record<string, ProxyInfo | undefined>,
  useProxy: boolean,
): PriceTable {
  const effective: Record<string, Series> = {};
  const proxied: PriceTable['proxied'] = {};

  for (const [code, s] of Object.entries(fundSeries)) {
    const p = useProxy ? proxies[code] : undefined;
    if (!p || s.length === 0 || p.series.length === 0) {
      effective[code] = s;
      continue;
    }
    const fundFirst = s[0][0];
    const fundFirstPrice = s[0][1];
    // 代理在基金首日（或之前最近一日）的价格
    let anchor: number | undefined;
    for (let i = p.series.length - 1; i >= 0; i--) {
      if (p.series[i][0] <= fundFirst) {
        anchor = p.series[i][1];
        break;
      }
    }
    if (!anchor) {
      effective[code] = s;
      continue;
    }
    const scale = fundFirstPrice / anchor;
    const before: Series = p.series.filter((r) => r[0] < fundFirst).map((r) => [r[0], r[1] * scale]);
    effective[code] = [...before, ...s];
    proxied[code] = { until: fundFirst, name: p.name };
  }

  const codes = Object.keys(effective);
  const first = codes.map((c) => effective[c][0]?.[0]).filter(Boolean).sort().at(-1)!;
  const last = codes.map((c) => effective[c].at(-1)?.[0]).filter(Boolean).sort()[0]!;

  const dateSet = new Set<string>();
  for (const c of codes) for (const [d] of effective[c]) if (d >= first && d <= last) dateSet.add(d);
  const dates = [...dateSet].sort();

  const prices: Record<string, number[]> = {};
  for (const c of codes) {
    const s = effective[c];
    const arr = new Array<number>(dates.length);
    let j = 0;
    let lastPrice = s[0][1];
    for (let i = 0; i < dates.length; i++) {
      while (j < s.length && s[j][0] <= dates[i]) {
        lastPrice = s[j][1];
        j++;
      }
      arr[i] = lastPrice;
    }
    prices[c] = arr;
  }
  return { dates, prices, proxied, first, last };
}

export type ContributionMode = 'lump' | 'monthly' | 'yearly';

export interface BacktestOptions {
  table: PriceTable;
  start: string;
  end?: string;
  amount: number;
  mode: ContributionMode;
  /** 分几份（monthly/yearly 有效） */
  parts?: number;
  /** 是否周年再平衡 */
  rebalance: boolean;
  targets: WeightMap;
}

export interface CurvePoint {
  date: string;
  value: number;
  invested: number;
  /** 时间加权净值指数（起点 1） */
  nav: number;
}

export interface BacktestResult {
  start: string;
  end: string;
  years: number;
  invested: number;
  finalValue: number;
  totalReturn: number;
  /** 资金加权年化（XIRR） */
  annualized: number;
  maxDrawdown: number;
  maxDrawdownStart: string;
  maxDrawdownEnd: string;
  curve: CurvePoint[];
  byAsset: { code: string; invested: number; value: number; ret: number }[];
  contributions: { date: string; amount: number }[];
  rebalances: string[];
}

function indexOnOrAfter(dates: string[], d: string): number {
  let lo = 0;
  let hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** 缺口优先分配（与现金流再平衡一致，但不取整） */
function allocateByGap(values: number[], weights: number[], amount: number): number[] {
  const total = values.reduce((a, b) => a + b, 0) + amount;
  const gaps = values.map((v, i) => Math.max(0, weights[i] * total - v));
  const gapSum = gaps.reduce((a, b) => a + b, 0);
  if (gapSum <= 0) return weights.map((w) => w * amount);
  if (gapSum >= amount) return gaps.map((g) => (amount * g) / gapSum);
  return gaps.map((g, i) => g + (amount - gapSum) * weights[i]);
}

export function runBacktest(opts: BacktestOptions): BacktestResult {
  const { table, targets } = opts;
  const codes = Object.keys(targets);
  const weights = codes.map((c) => targets[c]);
  const { dates } = table;
  const i0 = indexOnOrAfter(dates, opts.start);
  const iEnd = opts.end ? Math.min(dates.length - 1, indexOnOrAfter(dates, opts.end)) : dates.length - 1;
  if (i0 >= dates.length || i0 > iEnd) throw new Error('起点超出数据范围');

  // 投入日程
  const parts = opts.mode === 'lump' ? 1 : Math.max(1, opts.parts ?? (opts.mode === 'monthly' ? 12 : 2));
  const per = opts.amount / parts;
  const contribIdx = new Map<number, number>();
  for (let k = 0; k < parts; k++) {
    const d = opts.mode === 'lump' ? dates[i0] : dayjs(dates[i0]).add(k, opts.mode === 'monthly' ? 'month' : 'year').format('YYYY-MM-DD');
    const idx = indexOnOrAfter(dates, d);
    if (idx > iEnd) break;
    contribIdx.set(idx, (contribIdx.get(idx) ?? 0) + per);
  }
  // 周年再平衡日
  const rebalIdx = new Set<number>();
  if (opts.rebalance) {
    for (let y = 1; ; y++) {
      const d = dayjs(dates[i0]).add(y, 'year').format('YYYY-MM-DD');
      const idx = indexOnOrAfter(dates, d);
      if (idx > iEnd) break;
      rebalIdx.add(idx);
    }
  }

  const shares = codes.map(() => 0);
  const investedByAsset = codes.map(() => 0);
  let invested = 0;
  let nav = 1;
  let prevValue = 0;
  let peak = 1;
  let maxDD = 0;
  let peakDate = dates[i0];
  let ddStart = dates[i0];
  let ddEnd = dates[i0];
  const curve: CurvePoint[] = [];
  const contributions: { date: string; amount: number }[] = [];
  const rebalances: string[] = [];

  for (let i = i0; i <= iEnd; i++) {
    const px = codes.map((c) => table.prices[c][i]);
    let value = shares.reduce((s, sh, k) => s + sh * px[k], 0);
    // 先算当日收益（不含当日流入）
    if (i > i0 && prevValue > 0) nav *= value / prevValue;
    if (nav > peak) {
      peak = nav;
      peakDate = dates[i];
    }
    const dd = 1 - nav / peak;
    if (dd > maxDD) {
      maxDD = dd;
      ddStart = peakDate;
      ddEnd = dates[i];
    }
    // 当日流入
    const flow = contribIdx.get(i);
    if (flow) {
      const values = shares.map((sh, k) => sh * px[k]);
      const alloc = allocateByGap(values, weights, flow);
      alloc.forEach((a, k) => {
        shares[k] += a / px[k];
        investedByAsset[k] += a;
      });
      invested += flow;
      contributions.push({ date: dates[i], amount: flow });
      value += flow;
    }
    // 周年再平衡（当日收盘价）；终点当日不再调仓，保留各资产真实贡献
    if (rebalIdx.has(i) && i < iEnd && value > 0) {
      codes.forEach((_, k) => (shares[k] = (value * weights[k]) / px[k]));
      rebalances.push(dates[i]);
    }
    prevValue = value;
    curve.push({ date: dates[i], value, invested, nav });
  }

  const finalValue = curve.at(-1)!.value;
  const years = Math.max(1 / 365, dayjs(dates[iEnd]).diff(dayjs(dates[i0]), 'day') / 365.25);
  const flows = [...contributions.map((c) => ({ date: c.date, amount: -c.amount })), { date: dates[iEnd], amount: finalValue }];
  const pxEnd = codes.map((c) => table.prices[c][iEnd]);

  return {
    start: dates[i0],
    end: dates[iEnd],
    years,
    invested,
    finalValue,
    totalReturn: invested > 0 ? finalValue / invested - 1 : 0,
    annualized: xirr(flows),
    maxDrawdown: maxDD,
    maxDrawdownStart: ddStart,
    maxDrawdownEnd: ddEnd,
    curve,
    byAsset: codes.map((code, k) => ({
      code,
      invested: investedByAsset[k],
      value: shares[k] * pxEnd[k],
      ret: investedByAsset[k] > 0 ? (shares[k] * pxEnd[k]) / investedByAsset[k] - 1 : 0,
    })),
    contributions,
    rebalances,
  };
}

/** 资金加权年化收益，二分求解 */
export function xirr(flows: { date: string; amount: number }[]): number {
  if (flows.length < 2) return 0;
  const t0 = dayjs(flows[0].date);
  const ts = flows.map((f) => dayjs(f.date).diff(t0, 'day') / 365.25);
  const npv = (r: number) => flows.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, ts[i]), 0);
  let lo = -0.99;
  let hi = 10;
  if (npv(lo) * npv(hi) > 0) return 0;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface DelayedEntryRow {
  delayMonths: number;
  start: string;
  finalValue: number;
  totalReturn: number;
  /** 相对不等待的差额 */
  diffVsNow: number;
}

/** "再等 N 个月入场"对比：同样金额一次性投入，看同一终点的市值差异 */
export function delayedEntry(
  base: Omit<BacktestOptions, 'mode' | 'parts'>,
  delays = [3, 6, 12],
): { now: DelayedEntryRow; delayed: DelayedEntryRow[] } {
  const run = (start: string) => runBacktest({ ...base, start, mode: 'lump' });
  const now = run(base.start);
  const toRow = (delayMonths: number, r: BacktestResult): DelayedEntryRow => ({
    delayMonths,
    start: r.start,
    finalValue: r.finalValue,
    totalReturn: r.totalReturn,
    diffVsNow: r.finalValue - now.finalValue,
  });
  const delayed: DelayedEntryRow[] = [];
  for (const m of delays) {
    const s = dayjs(base.start).add(m, 'month').format('YYYY-MM-DD');
    if (s >= base.table.last) continue;
    try {
      delayed.push(toRow(m, run(s)));
    } catch {
      /* 超出范围则跳过 */
    }
  }
  return { now: toRow(0, now), delayed };
}

export interface RollingStats {
  horizonYears: number;
  count: number;
  median: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
  minStart: string;
  maxStart: string;
  positiveRate: number;
  /** 中位数对应年化 */
  medianAnnualized: number;
}

/** 任意一天一次性入场、持有 N 年的收益分布（每 stepDays 取一个起点） */
export function rollingReturns(table: PriceTable, targets: WeightMap, horizonYears: number, rebalance: boolean, stepDays = 5): RollingStats | undefined {
  const { dates } = table;
  const codes = Object.keys(targets);
  const w = codes.map((c) => targets[c]);
  const results: { start: string; ret: number }[] = [];
  for (let i = 0; i < dates.length; i += stepDays) {
    const endDate = dayjs(dates[i]).add(horizonYears, 'year').format('YYYY-MM-DD');
    const j = indexOnOrAfter(dates, endDate);
    if (j >= dates.length) break;
    // 快速模拟：一次性投入 1 元
    const shares = codes.map((c, k) => w[k] / table.prices[c][i]);
    let nextRebal = rebalance ? indexOnOrAfter(dates, dayjs(dates[i]).add(1, 'year').format('YYYY-MM-DD')) : Infinity;
    let yearsAhead = 1;
    for (let t = i + 1; t <= j; t++) {
      if (t === nextRebal && t < j) {
        const v = shares.reduce((s, sh, k) => s + sh * table.prices[codes[k]][t], 0);
        codes.forEach((c, k) => (shares[k] = (v * w[k]) / table.prices[c][t]));
        yearsAhead++;
        nextRebal = indexOnOrAfter(dates, dayjs(dates[i]).add(yearsAhead, 'year').format('YYYY-MM-DD'));
      }
    }
    const v = shares.reduce((s, sh, k) => s + sh * table.prices[codes[k]][j], 0);
    results.push({ start: dates[i], ret: v - 1 });
  }
  if (results.length < 5) return undefined;
  const sorted = [...results].sort((a, b) => a.ret - b.ret);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))].ret;
  const median = q(0.5);
  return {
    horizonYears,
    count: results.length,
    median,
    p25: q(0.25),
    p75: q(0.75),
    min: sorted[0].ret,
    max: sorted[sorted.length - 1].ret,
    minStart: sorted[0].start,
    maxStart: sorted[sorted.length - 1].start,
    positiveRate: results.filter((r) => r.ret > 0).length / results.length,
    medianAnnualized: Math.pow(1 + median, 1 / horizonYears) - 1,
  };
}

/** 均匀抽样，用于图表降采样 */
export function downsample<T>(arr: T[], max = 600): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]);
  return out;
}
