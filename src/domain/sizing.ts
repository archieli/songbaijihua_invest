import { PLAN, type IncomeStability, type RiskProfile } from '@/config/plan';

export interface HouseholdInput {
  /** 家庭净资产（元） */
  netAssets: number;
  /** 可变现的流动资产：现金、存款、货基、理财等（元） */
  liquidAssets: number;
  monthlyIncome: number;
  monthlyExpense: number;
  /** 3 年内确定要用的钱：购房、教育、医疗等（元） */
  shortTermNeeds: number;
  /** 已投入松柏计划的市值（元） */
  existingPlanValue: number;
  riskProfile: RiskProfile;
  incomeStability: IncomeStability;
  /** 每月结余投入比例 0-1 */
  monthlySaveRatio: number;
  /** 本次计划投入金额（元），不填则用系统建议 */
  plannedAmount?: number;
}

export type BatchMode = 'lump' | 'monthly' | 'yearly';

export interface BatchPlan {
  mode: BatchMode;
  parts: number;
  perPart: number;
  reason: string;
}

export interface StressRow {
  drop: number;
  loss: number;
  remaining: number;
  pctOfNetAssets: number;
}

export interface SizingResult {
  emergencyMonths: number;
  emergencyFund: number;
  /** 现在可以投入的长期资金 */
  investableNow: number;
  /** 课程：单次买入上限 */
  singleBuyCap: number;
  monthlySurplus: number;
  /** 建议每月定投额 */
  monthlyContribution: number;
  /** 未来 12 个月可投总额（现在可投 + 12 个月定投） */
  annualCapacity: number;
  /** 本次建议/计划投入 */
  plannedAmount: number;
  batch: BatchPlan;
  stress: StressRow[];
  warnings: string[];
  tips: string[];
}

/** 课程分批规则 + 单次上限共同决定分几批 */
export function planBatches(amount: number, singleBuyCap: number): BatchPlan {
  const { lumpSumBelow, monthlyAbove, yearlyAbove } = PLAN.batchRules;
  let mode: BatchMode = 'lump';
  let parts = 1;
  let reason = '课程建议：20 万以下一笔投入。';
  if (amount > yearlyAbove) {
    mode = 'yearly';
    parts = amount > yearlyAbove * 2 ? 3 : 2;
    reason = '课程建议：100 万以上可分 2-3 年，每年固定时间买一份。';
  } else if (amount > monthlyAbove) {
    mode = 'monthly';
    parts = 12;
    reason = '课程建议：50-100 万可平均分 12 份，每月固定时间买入一份。';
  } else if (amount > lumpSumBelow) {
    reason = '课程建议：20-50 万可一笔投入；心理承受力较弱时可分 3-6 个月。';
  }
  // 单次买入上限（净资产 5%/10%）也可能要求拆分
  if (singleBuyCap > 0 && amount / parts > singleBuyCap) {
    const needed = Math.ceil(amount / singleBuyCap);
    if (needed > parts) {
      parts = needed;
      if (mode === 'lump') mode = 'monthly';
      reason += ` 同时受"单次买入不超过家庭净资产 5%/10%"约束（上限约 ${Math.round(singleBuyCap / 10_000)} 万），需拆成 ${parts} 次。`;
    }
  }
  return { mode, parts, perPart: Math.floor(amount / parts / 100) * 100, reason };
}

export function stressTest(amount: number, netAssets: number): StressRow[] {
  return PLAN.stressLevels.map((drop) => ({
    drop,
    loss: amount * drop,
    remaining: amount * (1 - drop),
    pctOfNetAssets: netAssets > 0 ? (amount * drop) / netAssets : 0,
  }));
}

export function computeSizing(input: HouseholdInput): SizingResult {
  const warnings: string[] = [];
  const tips: string[] = [];
  const emergencyMonths = PLAN.emergencyMonths[input.incomeStability];
  const emergencyFund = input.monthlyExpense * emergencyMonths;
  const investableNow = Math.max(0, input.liquidAssets - emergencyFund - input.shortTermNeeds);
  const singleBuyCap = input.netAssets * PLAN.singleBuyCapRatio[input.riskProfile];
  const monthlySurplus = Math.max(0, input.monthlyIncome - input.monthlyExpense);
  const monthlyContribution = Math.floor((monthlySurplus * input.monthlySaveRatio) / 100) * 100;
  const annualCapacity = investableNow + monthlyContribution * 12;

  let suggested = Math.floor(investableNow / 10_000) * 10_000;
  if (suggested > PLAN.firstInvestRange.max && input.existingPlanValue === 0) {
    tips.push('首次投入建议 10-100 万，超出部分可作为第二年、第三年的加仓资金。');
  }
  const plannedAmount = input.plannedAmount ?? suggested;

  if (input.liquidAssets < emergencyFund) {
    warnings.push(
      `流动资产不足以覆盖 ${emergencyMonths} 个月紧急备用金（约 ${Math.round(emergencyFund / 10_000)} 万），建议先补齐备用金再投入。`,
    );
  }
  if (plannedAmount > investableNow) {
    warnings.push('计划投入超过了扣除备用金和短期用款后的可投资金，投入后可能被迫在低点卖出。');
  }
  if (input.existingPlanValue === 0 && plannedAmount > 0 && plannedAmount < PLAN.firstInvestRange.min) {
    tips.push('课程建议首次投入 10 万起，金额太小时分散买 5 只 ETF 会受整手限制。');
  }
  const planShare = input.netAssets > 0 ? (plannedAmount + input.existingPlanValue) / input.netAssets : 0;
  if (planShare > 0.5) {
    warnings.push(`松柏计划将占家庭净资产 ${(planShare * 100).toFixed(0)}%，极端回撤 30% 时账面亏损约占净资产 ${(planShare * 30).toFixed(0)}%，请确认能坦然持有。`);
  }
  if (monthlySurplus <= 0) {
    tips.push('当前没有月度结余，暂不启用每月定投，先做一次性投入 + 年度再平衡即可。');
  }

  return {
    emergencyMonths,
    emergencyFund,
    investableNow,
    singleBuyCap,
    monthlySurplus,
    monthlyContribution,
    annualCapacity,
    plannedAmount,
    batch: planBatches(plannedAmount, singleBuyCap),
    stress: stressTest(plannedAmount, input.netAssets),
    warnings,
    tips,
  };
}
