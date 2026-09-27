export type Side = 'buy' | 'sell';
export type TxSource = 'initial' | 'add' | 'monthly' | 'rebalance' | 'manual';

/** 一笔场内成交记录 */
export interface Transaction {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  code: string;
  side: Side;
  shares: number;
  price: number;
  /** 手续费（元） */
  fee: number;
  source: TxSource;
  note?: string;
}

/** 一次已完成的再平衡记录 */
export interface RebalanceRecord {
  id: string;
  date: string;
  /** 本次生成的交易 id */
  txIds: string[];
  note?: string;
}

/** 价格表 {code: price} */
export type PriceMap = Record<string, number>;
/** 权重表 {code: weight} */
export type WeightMap = Record<string, number>;

export interface Holding {
  code: string;
  shares: number;
  /** 持仓成本（含手续费，卖出按均价扣减） */
  cost: number;
  /** 平均成本价 */
  avgCost: number;
}

export interface ValuedRow extends Holding {
  price: number;
  value: number;
  weight: number;
  targetWeight: number;
  /** 实际 − 目标（百分点小数） */
  drift: number;
  /** 未实现盈亏 */
  pnl: number;
}

export interface Valuation {
  rows: ValuedRow[];
  total: number;
  /** 净投入：Σ买入(含费) − Σ卖出(扣费) */
  netInvested: number;
  pnl: number;
  /** 最大绝对偏离 */
  maxDrift: number;
}
