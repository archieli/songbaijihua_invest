import { estimateFee, round2, roundToLot } from './lots';
import type { WeightMap } from './types';

export interface RebalanceRow {
  code: string;
  shares: number;
  price: number;
}

export interface RebalanceOptions {
  rows: RebalanceRow[];
  targets: WeightMap;
  /** 一并投入的新增现金（可为 0） */
  cash?: number;
  lotSize?: number;
  commissionRate?: number;
  minCommission?: number;
}

export interface RebalanceOrder {
  code: string;
  side: 'buy' | 'sell' | 'hold';
  shares: number;
  price: number;
  /** 成交金额（不含费） */
  amount: number;
  fee: number;
  beforeShares: number;
  beforeValue: number;
  beforeWeight: number;
  targetValue: number;
  /** 理论应调整金额（未取整） */
  idealDelta: number;
  afterShares: number;
  afterValue: number;
  afterWeight: number;
}

export interface RebalancePlan {
  total: number;
  cashBefore: number;
  cashAfter: number;
  sellTotal: number;
  buyTotal: number;
  feeTotal: number;
  orders: RebalanceOrder[];
  /** 调整后最大偏离 */
  maxDriftAfter: number;
}

/**
 * 年度再平衡：把各资产调回目标比例。
 * 先按理论金额算份数，按整手取整；若取整后现金为负，逐手削减最大的买单。
 */
export function planRebalance(opts: RebalanceOptions): RebalancePlan {
  const { rows, targets } = opts;
  const cash = opts.cash ?? 0;
  const lot = opts.lotSize ?? 100;
  const rate = opts.commissionRate ?? 0;
  const minFee = opts.minCommission ?? 0;

  const values = rows.map((r) => r.shares * r.price);
  const total = values.reduce((a, b) => a + b, 0) + cash;

  const orders: RebalanceOrder[] = rows.map((r, i) => {
    const w = targets[r.code] ?? 0;
    const targetValue = total * w;
    const idealDelta = targetValue - values[i];
    let deltaShares = r.price > 0 ? roundToLot(idealDelta / r.price, lot) : 0;
    if (deltaShares < 0 && -deltaShares > r.shares) deltaShares = -roundToLot(r.shares, lot, 'floor');
    const amount = round2(Math.abs(deltaShares) * r.price);
    return {
      code: r.code,
      side: deltaShares > 0 ? 'buy' : deltaShares < 0 ? 'sell' : 'hold',
      shares: Math.abs(deltaShares),
      price: r.price,
      amount,
      fee: estimateFee(amount, rate, minFee),
      beforeShares: r.shares,
      beforeValue: values[i],
      beforeWeight: total > 0 ? values[i] / total : 0,
      targetValue,
      idealDelta,
      afterShares: r.shares + deltaShares,
      afterValue: 0,
      afterWeight: 0,
    };
  });

  const cashAfterOf = () =>
    cash +
    orders.reduce((s, o) => s + (o.side === 'sell' ? o.amount : o.side === 'buy' ? -o.amount : 0) - o.fee, 0);

  // 取整可能导致现金透支：削减最大的买单直到现金非负
  let guard = 0;
  while (cashAfterOf() < 0 && guard++ < 1000) {
    const buys = orders.filter((o) => o.side === 'buy' && o.shares >= lot);
    if (buys.length === 0) break;
    const biggest = buys.reduce((a, b) => (a.amount >= b.amount ? a : b));
    biggest.shares -= lot;
    biggest.afterShares -= lot;
    biggest.amount = round2(biggest.shares * biggest.price);
    biggest.fee = estimateFee(biggest.amount, rate, minFee);
    if (biggest.shares === 0) biggest.side = 'hold';
  }

  const cashAfter = round2(cashAfterOf());
  const totalAfter = orders.reduce((s, o) => s + o.afterShares * o.price, 0) + cashAfter;
  for (const o of orders) {
    o.afterValue = o.afterShares * o.price;
    o.afterWeight = totalAfter > 0 ? o.afterValue / totalAfter : 0;
  }

  return {
    total,
    cashBefore: cash,
    cashAfter,
    sellTotal: round2(orders.filter((o) => o.side === 'sell').reduce((s, o) => s + o.amount, 0)),
    buyTotal: round2(orders.filter((o) => o.side === 'buy').reduce((s, o) => s + o.amount, 0)),
    feeTotal: round2(orders.reduce((s, o) => s + o.fee, 0)),
    orders,
    maxDriftAfter: orders.reduce((m, o) => Math.max(m, Math.abs(o.afterWeight - (targets[o.code] ?? 0))), 0),
  };
}
