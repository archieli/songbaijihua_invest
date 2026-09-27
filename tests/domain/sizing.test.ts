import { describe, expect, it } from 'vitest';
import { computeSizing, planBatches } from '@/domain/sizing';

describe('planBatches（课程分批规则）', () => {
  it('20 万以下一笔', () => {
    expect(planBatches(150_000, 1_000_000).parts).toBe(1);
  });
  it('50-100 万分 12 月', () => {
    const b = planBatches(600_000, 1_000_000);
    expect(b.mode).toBe('monthly');
    expect(b.parts).toBe(12);
    expect(b.perPart).toBe(50_000);
  });
  it('100 万以上分 2-3 年', () => {
    expect(planBatches(1_500_000, 10_000_000)).toMatchObject({ mode: 'yearly', parts: 2 });
    expect(planBatches(2_500_000, 10_000_000)).toMatchObject({ mode: 'yearly', parts: 3 });
  });
  it('单次上限更严格时按上限拆分', () => {
    // 净资产 100 万、稳健型上限 10 万，投 30 万需拆 3 次
    const b = planBatches(300_000, 100_000);
    expect(b.parts).toBe(3);
  });
});

describe('computeSizing', () => {
  const base = {
    netAssets: 3_000_000,
    liquidAssets: 800_000,
    monthlyIncome: 30_000,
    monthlyExpense: 15_000,
    shortTermNeeds: 100_000,
    existingPlanValue: 0,
    riskProfile: 'balanced' as const,
    incomeStability: 'stable' as const,
    monthlySaveRatio: 0.5,
  };
  it('扣除备用金和短期用款后得到可投资金', () => {
    const r = computeSizing(base);
    expect(r.emergencyFund).toBe(90_000);
    expect(r.investableNow).toBe(610_000);
    expect(r.singleBuyCap).toBe(300_000);
    expect(r.monthlyContribution).toBe(7_500);
    expect(r.batch.mode).toBe('monthly');
    expect(r.stress[1]).toMatchObject({ drop: 0.2, loss: 122_000 });
    expect(r.warnings).toHaveLength(0);
  });
  it('备用金不足时给出警告', () => {
    const r = computeSizing({ ...base, liquidAssets: 50_000 });
    expect(r.warnings.some((w) => w.includes('紧急备用金'))).toBe(true);
    expect(r.investableNow).toBe(0);
  });
});
