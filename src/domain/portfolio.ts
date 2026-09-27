import type { Holding, PriceMap, Transaction, Valuation, ValuedRow, WeightMap } from './types';

/** 按基金聚合持仓（份数、成本） */
export function aggregateHoldings(txs: Transaction[]): Record<string, Holding> {
  const sorted = [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out: Record<string, Holding> = {};
  for (const t of sorted) {
    const h = (out[t.code] ??= { code: t.code, shares: 0, cost: 0, avgCost: 0 });
    if (t.side === 'buy') {
      h.shares += t.shares;
      h.cost += t.shares * t.price + t.fee;
    } else {
      const avg = h.shares > 0 ? h.cost / h.shares : 0;
      h.shares -= t.shares;
      h.cost -= avg * t.shares;
      if (h.shares <= 0) {
        h.shares = 0;
        h.cost = 0;
      }
    }
    h.avgCost = h.shares > 0 ? h.cost / h.shares : 0;
  }
  return out;
}

/** 净投入现金：买入含费，卖出扣费 */
export function netInvested(txs: Transaction[]): number {
  return txs.reduce((s, t) => s + (t.side === 'buy' ? t.shares * t.price + t.fee : -(t.shares * t.price - t.fee)), 0);
}

/** 用最新价给持仓估值 */
export function valuePortfolio(
  holdings: Record<string, Holding>,
  prices: PriceMap,
  targets: WeightMap,
  txs: Transaction[] = [],
): Valuation {
  const codes = Object.keys(targets);
  const rows: ValuedRow[] = codes.map((code) => {
    const h = holdings[code] ?? { code, shares: 0, cost: 0, avgCost: 0 };
    const price = prices[code] ?? 0;
    const value = h.shares * price;
    return { ...h, price, value, weight: 0, targetWeight: targets[code], drift: 0, pnl: value - h.cost };
  });
  const total = rows.reduce((s, r) => s + r.value, 0);
  for (const r of rows) {
    r.weight = total > 0 ? r.value / total : 0;
    r.drift = total > 0 ? r.weight - r.targetWeight : 0;
  }
  const invested = netInvested(txs);
  return {
    rows,
    total,
    netInvested: invested,
    pnl: total - invested,
    maxDrift: rows.reduce((m, r) => Math.max(m, Math.abs(r.drift)), 0),
  };
}

export function firstBuyDate(txs: Transaction[]): string | undefined {
  const buys = txs.filter((t) => t.side === 'buy').map((t) => t.date);
  if (buys.length === 0) return undefined;
  return buys.reduce((a, b) => (a < b ? a : b));
}
