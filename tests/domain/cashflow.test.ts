import { describe, expect, it } from 'vitest';
import { planContribution } from '@/domain/cashflow';
import { TARGET_WEIGHTS } from '@/config/plan';

const rows = [
  { code: '159201', shares: 50_000, price: 1.16 }, // 58,000 超配
  { code: '513500', shares: 23_000, price: 2.7 }, // 62,100 超配
  { code: '511090', shares: 250, price: 124 }, // 31,000 低配
  { code: '161115', shares: 20_000, price: 1.76 }, // 35,200 超配
  { code: '518880', shares: 3_100, price: 8.97 }, // 27,807 严重低配
];

describe('planContribution', () => {
  it('新增资金只买不卖，并优先补最低配的资产', () => {
    const plan = planContribution({ rows, targets: TARGET_WEIGHTS, amount: 10_000, lotSize: 100 });
    const by = Object.fromEntries(plan.orders.map((o) => [o.code, o]));
    expect(by['518880'].amount).toBeGreaterThan(0);
    expect(by['159201'].amount).toBe(0);
    expect(by['513500'].amount).toBe(0);
    expect(plan.spent + plan.leftover).toBeCloseTo(10_000, 2);
    expect(plan.leftover).toBeGreaterThanOrEqual(0);
    expect(plan.maxDriftAfter).toBeLessThanOrEqual(plan.maxDriftBefore + 1e-9);
  });

  it('资金很多时先补满缺口，余额按目标比例分配', () => {
    const plan = planContribution({ rows, targets: TARGET_WEIGHTS, amount: 1_000_000, lotSize: 100 });
    for (const o of plan.orders) expect(o.shares).toBeGreaterThan(0);
    expect(plan.maxDriftAfter).toBeLessThan(0.01);
  });

  it('金额不足一手时全部结转', () => {
    const plan = planContribution({ rows, targets: TARGET_WEIGHTS, amount: 100, lotSize: 100 });
    expect(plan.spent).toBe(0);
    expect(plan.leftover).toBe(100);
  });
});
