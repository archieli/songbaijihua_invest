import raw from './funds.json';

export type AssetClass = 'cn_stock' | 'us_stock' | 'cn_bond_long' | 'cn_bond' | 'gold';
export type Market = 'sh' | 'sz';

export interface FundProxy {
  symbol: string;
  name: string;
  note: string;
}

export interface Fund {
  code: string;
  market: Market;
  /** 行情文件名，例如 sh518880 */
  symbol: string;
  name: string;
  shortName: string;
  assetClass: AssetClass;
  assetLabel: string;
  targetWeight: number;
  feeRate: number;
  inception: string;
  aum: number;
  tags: string[];
  proxy?: FundProxy;
}

export const FUNDS: Fund[] = (raw.funds as Omit<Fund, 'symbol'>[]).map((f) => ({
  ...f,
  symbol: `${f.market}${f.code}`,
}));

export const FUND_BY_CODE: Record<string, Fund> = Object.fromEntries(FUNDS.map((f) => [f.code, f]));
export const FUND_CODES = FUNDS.map((f) => f.code);

/** 目标权重表 {code: weight} */
export const TARGET_WEIGHTS: Record<string, number> = Object.fromEntries(
  FUNDS.map((f) => [f.code, f.targetWeight]),
);

export type RiskProfile = 'conservative' | 'balanced';
export type IncomeStability = 'stable' | 'average' | 'unstable';

/** 松柏计划规则常量。带 "课程" 注释的来自课件，其余为工具默认值，可在设置中调整。 */
export const PLAN = {
  name: '松柏计划',
  /** 场内 ETF / LOF 最小交易单位 */
  lotSize: 100,
  /** 佣金费率默认万 3（工具默认，可设） */
  defaultCommissionRate: 0.0003,
  /** 最低佣金（元），很多券商 ETF 无最低佣金，默认 0 */
  defaultMinCommission: 0,
  /** 课程：每隔一年再平衡一次 */
  rebalanceIntervalMonths: 12,
  /** 再平衡到期前提前几天提醒（工具默认） */
  reminderLeadDays: 7,
  /** 课程：单次买入不超过家庭净资产的比例 */
  singleBuyCapRatio: { conservative: 0.05, balanced: 0.1 } as Record<RiskProfile, number>,
  /** 课程：首次投资金额建议区间（元） */
  firstInvestRange: { min: 100_000, max: 1_000_000 },
  /** 课程：分批规则阈值（元） */
  batchRules: {
    lumpSumBelow: 200_000, // 20 万以下建议一笔投入
    monthlyAbove: 500_000, // 50-100 万可分 12 月
    yearlyAbove: 1_000_000, // 100 万以上可分 2-3 年
  },
  /** 紧急备用金月数（工具默认，按收入稳定性） */
  emergencyMonths: { stable: 6, average: 9, unstable: 12 } as Record<IncomeStability, number>,
  /** 每月结余投入比例默认值（工具默认，非课程规则） */
  defaultMonthlySaveRatio: 0.5,
  /** 课程：压力测试档位 */
  stressLevels: [0.15, 0.2, 0.3],
  /** 课程：预期年化 */
  expectedReturn: { low: 0.05, high: 0.07 },
};

/** 校验目标权重之和为 1 */
export function assertWeights(weights: Record<string, number>) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-6) throw new Error(`目标比例之和应为 100%，当前 ${(sum * 100).toFixed(2)}%`);
}
assertWeights(TARGET_WEIGHTS);
