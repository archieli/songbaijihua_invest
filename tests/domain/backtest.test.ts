import { describe, expect, it } from 'vitest';
import { buildPriceTable, delayedEntry, rollingReturns, runBacktest, xirr, type Series } from '@/domain/backtest';

// 两只资产、每年翻倍/不变的极简序列，便于手算
function mk(days: number, fn: (i: number) => number, from = '2020-01-01'): Series {
  const out: Series = [];
  const d = new Date(from + 'T00:00:00Z');
  for (let i = 0; i < days; i++) {
    out.push([d.toISOString().slice(0, 10), fn(i)]);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const DAYS = 366 * 2 + 1;
const A = mk(DAYS, (i) => 1 + i / 366); // 两年线性涨到 3
const B = mk(DAYS, () => 2); // 不变
const targets = { A: 0.5, B: 0.5 };

describe('buildPriceTable', () => {
  it('对齐日期并向前填充', () => {
    const t = buildPriceTable({ A, B: B.filter((_, i) => i % 2 === 0) }, {}, false);
    expect(t.dates.length).toBe(DAYS);
    expect(t.prices.B.every((p) => p === 2)).toBe(true);
  });
  it('代理指数按基金首日价格拼接', () => {
    const fund = A.slice(366); // 基金 2021 年起
    const proxy = mk(DAYS, (i) => 100 + i, '2020-01-01');
    const t = buildPriceTable({ A: fund, B }, { A: { series: proxy, name: 'P' } }, true);
    expect(t.first).toBe('2020-01-01');
    expect(t.proxied.A.until).toBe(fund[0][0]);
    const idx = t.dates.indexOf(fund[0][0]);
    expect(t.prices.A[idx]).toBeCloseTo(fund[0][1]);
    expect(t.prices.A[idx - 1]).toBeCloseTo(((100 + 365) * fund[0][1]) / (100 + 366));
  });
});

describe('runBacktest', () => {
  const table = buildPriceTable({ A, B }, {}, false);
  it('一次性投入、不再平衡：A 三倍、B 不变', () => {
    const r = runBacktest({ table, start: '2020-01-01', amount: 100, mode: 'lump', rebalance: false, targets });
    expect(r.invested).toBe(100);
    expect(r.finalValue).toBeCloseTo(50 * 3 + 50, 1);
    expect(r.totalReturn).toBeCloseTo(1, 1);
    expect(r.maxDrawdown).toBe(0);
  });
  it('周年再平衡会在一年后把 A 的盈利搬到 B', () => {
    const r = runBacktest({ table, start: '2020-01-01', amount: 100, mode: 'lump', rebalance: true, targets });
    expect(r.rebalances.length).toBe(2);
    // 一年后 A=2、B=2 → 总 150 → 各 75；第二年 A 再涨 1.5 倍 → 112.5 + 75
    expect(r.finalValue).toBeCloseTo(187.5, 0);
  });
  it('分 12 月投入时累计投入等于总额', () => {
    const r = runBacktest({ table, start: '2020-01-01', amount: 1200, mode: 'monthly', parts: 12, rebalance: false, targets });
    expect(r.invested).toBe(1200);
    expect(r.contributions.length).toBe(12);
    expect(r.annualized).toBeGreaterThan(0);
  });
});

describe('xirr', () => {
  it('单笔投入两年翻倍 ≈ 41.4% 年化', () => {
    const r = xirr([
      { date: '2020-01-01', amount: -100 },
      { date: '2022-01-01', amount: 200 },
    ]);
    expect(r).toBeCloseTo(Math.SQRT2 - 1, 2);
  });
});

describe('delayedEntry / rollingReturns', () => {
  const table = buildPriceTable({ A, B }, {}, false);
  it('单边上涨市场里等待入场会更差', () => {
    const d = delayedEntry({ table, start: '2020-01-01', amount: 100, rebalance: false, targets });
    expect(d.delayed.every((x) => x.diffVsNow < 0)).toBe(true);
  });
  it('滚动持有 1 年全部正收益', () => {
    const s = rollingReturns(table, targets, 1, false, 10)!;
    expect(s.positiveRate).toBe(1);
    expect(s.count).toBeGreaterThan(5);
  });
});
