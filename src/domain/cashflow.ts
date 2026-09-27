import { estimateFee, round2, roundToLot } from './lots';
import type { WeightMap } from './types';
import type { RebalanceRow } from './rebalance';

export interface ContributionOptions {
  rows: RebalanceRow[];
  targets: WeightMap;
  /** 本月可投金额（含上月结转） */
  amount: number;
  lotSize?: number;
  commissionRate?: number;
  minCommission?: number;
}

export interface ContributionOrder {
  code: string;
  shares: number;
  price: number;
  amount: number;
  fee: number;
  /** 理论分配金额 */
  idealAmount: number;
  beforeWeight: number;
  afterWeight: number;
  targetWeight: number;
}

export interface ContributionPlan {
  amount: number;
  orders: ContributionOrder[];
  /** 买入总额（含费） */
  spent: number;
  /** 不足一手的余额，结转下月 */
  leftover: number;
  totalBefore: number;
  totalAfter: number;
  maxDriftBefore: number;
  maxDriftAfter: number;
}

/**
 * 现金流再平衡：新增资金只买不卖，优先补最低配的资产。
 * gap_i = max(0, w_i × (total + M) − value_i)；
 * Σgap ≥ M 时按 gap 比例分配；否则先补满缺口，余额按目标比例分配。
 * 按整手向下取整，剩余现金结转；再用贪心把余额尽量买成整手。
 */
export function planContribution(opts: ContributionOptions): ContributionPlan {
  const { rows, targets, amount } = opts;
  const lot = opts.lotSize ?? 100;
  const rate = opts.commissionRate ?? 0;
  const minFee = opts.minCommission ?? 0;

  const values = rows.map((r) => r.shares * r.price);
  const totalBefore = values.reduce((a, b) => a + b, 0);
  const totalTarget = totalBefore + amount;

  const gaps = rows.map((r, i) => Math.max(0, (targets[r.code] ?? 0) * totalTarget - values[i]));
  const gapSum = gaps.reduce((a, b) => a + b, 0);
  const ideal = rows.map((r, i) => {
    if (gapSum <= 0) return amount * (targets[r.code] ?? 0);
    if (gapSum >= amount) return (amount * gaps[i]) / gapSum;
    return gaps[i] + (amount - gapSum) * (targets[r.code] ?? 0);
  });

  const orders: ContributionOrder[] = rows.map((r, i) => {
    const shares = r.price > 0 ? roundToLot(ideal[i] / r.price, lot, 'floor') : 0;
    const amt = round2(shares * r.price);
    return {
      code: r.code,
      shares,
      price: r.price,
      amount: amt,
      fee: estimateFee(amt, rate, minFee),
      idealAmount: ideal[i],
      beforeWeight: totalBefore > 0 ? values[i] / totalBefore : 0,
      afterWeight: 0,
      targetWeight: targets[r.code] ?? 0,
    };
  });

  const spentOf = () => orders.reduce((s, o) => s + o.amount + o.fee, 0);

  // 贪心：余额够一手就买给"买完后仍最低配"的那只
  let guard = 0;
  while (guard++ < 500) {
    const leftover = amount - spentOf();
    const totalNow = totalBefore + orders.reduce((s, o) => s + o.amount, 0);
    let best: ContributionOrder | undefined;
    let bestDrift = 0;
    for (const o of orders) {
      const lotCost = o.price * lot;
      if (o.price <= 0 || lotCost + estimateFee(lotCost, rate, minFee) > leftover) continue;
      const valueNow = rows.find((r) => r.code === o.code)!.shares * o.price + o.amount;
      const drift = totalNow > 0 ? valueNow / totalNow - o.targetWeight : -o.targetWeight;
      // 只给仍低配的资产加仓，超配资产留给年度再平衡处理
      if (drift >= 0) continue;
      if (!best || drift < bestDrift) {
        best = o;
        bestDrift = drift;
      }
    }
    if (!best) break;
    best.shares += lot;
    best.amount = round2(best.shares * best.price);
    best.fee = estimateFee(best.amount, rate, minFee);
  }

  const spent = round2(spentOf());
  const totalAfter = totalBefore + orders.reduce((s, o) => s + o.amount, 0);
  for (const o of orders) {
    const valueAfter = rows.find((r) => r.code === o.code)!.shares * o.price + o.amount;
    o.afterWeight = totalAfter > 0 ? valueAfter / totalAfter : 0;
  }
  const drift = (w: number, t: number) => Math.abs(w - t);
  return {
    amount,
    orders,
    spent,
    leftover: round2(amount - spent),
    totalBefore,
    totalAfter,
    maxDriftBefore: orders.reduce((m, o) => Math.max(m, drift(o.beforeWeight, o.targetWeight)), 0),
    maxDriftAfter: orders.reduce((m, o) => Math.max(m, drift(o.afterWeight, o.targetWeight)), 0),
  };
}
