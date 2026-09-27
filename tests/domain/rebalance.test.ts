import { describe, expect, it } from 'vitest';
import { planRebalance } from '@/domain/rebalance';
import { TARGET_WEIGHTS } from '@/config/plan';

describe('planRebalance', () => {
  it('课件 P29 案例：20 万 → 21.4 万，调整回目标比例', () => {
    // 以价格 1 元、不取整的方式复现课件表格
    const rows = [
      { code: '159201', shares: 58_000, price: 1 },
      { code: '513500', shares: 62_000, price: 1 },
      { code: '511090', shares: 31_000, price: 1 },
      { code: '161115', shares: 35_200, price: 1 },
      { code: '518880', shares: 27_800, price: 1 },
    ];
    const plan = planRebalance({ rows, targets: TARGET_WEIGHTS, lotSize: 1, commissionRate: 0 });
    expect(plan.total).toBe(214_000);
    const by = Object.fromEntries(plan.orders.map((o) => [o.code, o]));
    expect(by['159201'].side).toBe('sell');
    expect(by['159201'].shares).toBe(4_500);
    expect(by['513500'].shares).toBe(8_500);
    expect(by['511090'].side).toBe('buy');
    expect(by['511090'].shares).toBe(1_100);
    expect(by['161115'].side).toBe('sell');
    expect(by['161115'].shares).toBe(3_100);
    expect(by['518880'].side).toBe('buy');
    expect(by['518880'].shares).toBe(15_000);
    expect(by['518880'].afterValue).toBe(42_800);
    expect(plan.cashAfter).toBe(0);
    expect(plan.maxDriftAfter).toBeLessThan(1e-9);
  });

  it('整手取整后不会透支现金', () => {
    const rows = [
      { code: '159201', shares: 10_000, price: 1.15 },
      { code: '513500', shares: 5_000, price: 2.68 },
      { code: '511090', shares: 100, price: 120.3 },
      { code: '161115', shares: 8_000, price: 1.75 },
      { code: '518880', shares: 2_000, price: 8.79 },
    ];
    const plan = planRebalance({ rows, targets: TARGET_WEIGHTS, lotSize: 100, commissionRate: 0.0003 });
    expect(plan.cashAfter).toBeGreaterThanOrEqual(0);
    for (const o of plan.orders) {
      expect(o.shares % 100).toBe(0);
      expect(o.afterShares).toBeGreaterThanOrEqual(0);
    }
    // 取整后偏离应明显小于取整前
    const before = Math.max(...plan.orders.map((o) => Math.abs(o.beforeWeight - TARGET_WEIGHTS[o.code])));
    expect(plan.maxDriftAfter).toBeLessThan(before);
  });

  it('新增现金会一并按目标比例买入', () => {
    const rows = [
      { code: '159201', shares: 0, price: 1 },
      { code: '513500', shares: 0, price: 1 },
      { code: '511090', shares: 0, price: 1 },
      { code: '161115', shares: 0, price: 1 },
      { code: '518880', shares: 0, price: 1 },
    ];
    const plan = planRebalance({ rows, targets: TARGET_WEIGHTS, cash: 100_000, lotSize: 100 });
    expect(plan.buyTotal).toBe(100_000);
    expect(plan.orders.find((o) => o.code === '518880')!.shares).toBe(20_000);
  });
});
