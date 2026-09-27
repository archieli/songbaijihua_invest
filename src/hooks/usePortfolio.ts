import { useMemo } from 'react';
import { TARGET_WEIGHTS } from '@/config/plan';
import { aggregateHoldings, valuePortfolio } from '@/domain/portfolio';
import { computeSchedule } from '@/domain/schedule';
import { useStore } from '@/store';
import { useNav } from './useNav';

/** 持仓、估值、再平衡日程的组合视图 */
export function usePortfolio() {
  const transactions = useStore((s) => s.transactions);
  const rebalances = useStore((s) => s.rebalances);
  const settings = useStore((s) => s.settings);
  const { nav, prices, loading, error } = useNav();

  const holdings = useMemo(() => aggregateHoldings(transactions), [transactions]);
  const valuation = useMemo(() => valuePortfolio(holdings, prices, TARGET_WEIGHTS, transactions), [holdings, prices, transactions]);
  const schedule = useMemo(() => computeSchedule(transactions, rebalances), [transactions, rebalances]);
  const hasHoldings = valuation.rows.some((r) => r.shares > 0);

  return { transactions, rebalances, settings, nav, prices, loading, error, holdings, valuation, schedule, hasHoldings };
}
