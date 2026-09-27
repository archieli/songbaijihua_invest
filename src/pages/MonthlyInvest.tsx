import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { FUNDS, PLAN, TARGET_WEIGHTS } from '@/config/plan';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useStore } from '@/store';
import { planContribution } from '@/domain/cashflow';
import { computeSizing } from '@/domain/sizing';
import type { Transaction } from '@/domain/types';
import { Alert, Button, Card, Empty, Field, Money, NumberInput, PageHeader, Pct, Stat, inputCls } from '@/components/ui';
import { OrderTable, type OrderLike } from '@/components/OrderTable';

export default function MonthlyInvest() {
  const { holdings, prices, hasHoldings, settings, schedule, transactions } = usePortfolio();
  const addTransactions = useStore((s) => s.addTransactions);
  const updateSettings = useStore((s) => s.updateSettings);

  const sizing = useMemo(
    () => computeSizing({ ...settings.household, riskProfile: settings.riskProfile, incomeStability: settings.incomeStability, monthlySaveRatio: settings.monthlySaveRatio }),
    [settings],
  );
  const suggested = sizing.monthlyContribution + settings.carryOver;
  const [amount, setAmount] = useState<number | ''>(suggested > 0 ? suggested : '');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [done, setDone] = useState(false);

  const plan = useMemo(() => {
    if (!hasHoldings || !amount || amount <= 0) return undefined;
    const rows = FUNDS.map((f) => ({ code: f.code, shares: holdings[f.code]?.shares ?? 0, price: prices[f.code] ?? 0 }));
    return planContribution({ rows, targets: TARGET_WEIGHTS, amount, lotSize: PLAN.lotSize, commissionRate: settings.commissionRate, minCommission: settings.minCommission });
  }, [hasHoldings, holdings, prices, amount, settings.commissionRate, settings.minCommission]);

  const orders: OrderLike[] = plan?.orders.map((o) => ({ ...o, side: o.shares > 0 ? 'buy' : 'hold' })) ?? [];
  const monthlyTxs = transactions.filter((t) => t.source === 'monthly');
  const thisMonth = monthlyTxs.filter((t) => t.date.slice(0, 7) === dayjs().format('YYYY-MM'));

  const confirm = () => {
    if (!plan) return;
    const txs: Omit<Transaction, 'id'>[] = orders
      .filter((o) => o.side === 'buy')
      .map((o) => ({ date, code: o.code, side: 'buy', shares: o.shares, price: o.price, fee: o.fee, source: 'monthly', note: `${dayjs(date).format('YYYY-MM')} 定投` }));
    addTransactions(txs);
    updateSettings({ carryOver: plan.leftover });
    setDone(true);
  };

  return (
    <div>
      <PageHeader title="每月定投（现金流再平衡）" subtitle="每月结余不按固定比例平均买，而是全部买入当前最低配的资产。只买不卖，和年度再平衡不冲突。" />

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Alert tone="info" title="为什么这样做不和年度再平衡冲突">
          年度再平衡的锚点是首笔买入日（{schedule.anchorDate ?? '未开始'}），定投不会改变它。
          每月的新钱都去补最缺的资产，相当于用现金流做"温和再平衡"，到周年日时偏离会更小、需要卖出的更少。
        </Alert>
        <Alert tone="warn" title="场内定投的两个现实约束">
          ETF 最小 100 份，小额资金一个月可能只够买 1-2 只，工具会把余额结转到下月；券商的"场内定投"功能不能按缺口分配，建议每月固定一天手动按交易单下单。
        </Alert>
      </div>

      {!hasHoldings ? (
        <Empty>还没有持仓。先去 <Link to="/ledger" className="text-pine-700 underline">记账</Link> 录入首笔买入，之后每月再来。</Empty>
      ) : (
        <>
          <Card title="本月买入单">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="本月可投金额" hint={sizing.monthlyContribution > 0 ? `仓位规划建议 ${sizing.monthlyContribution.toLocaleString()} 元 + 上月结转 ${settings.carryOver.toLocaleString()} 元` : '在"仓位规划"填写月收支后会自动建议'}>
                <NumberInput value={amount} onChange={(v) => { setAmount(v); setDone(false); }} step={500} min={0} suffix="元" />
              </Field>
              <Field label="买入日期"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <div className="flex items-end"><Button onClick={confirm} disabled={!plan || done || orders.every((o) => o.side === 'hold')} className="w-full">{done ? '已入账' : '已按此下单，记入账本'}</Button></div>
            </div>
            {thisMonth.length > 0 && !done && <div className="mt-3"><Alert tone="warn">本月已记录 {thisMonth.length} 笔定投，确认是否重复。</Alert></div>}
            {plan && (
              <div className="mt-4">
                <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Stat label="买入" value={<Money v={plan.spent} />} sub={`${orders.filter((o) => o.side === 'buy').length} 只`} />
                  <Stat label="结转下月" value={<Money v={plan.leftover} />} sub="不足一手" tone="muted" />
                  <Stat label="买入前最大偏离" value={<Pct v={plan.maxDriftBefore} />} tone="muted" />
                  <Stat label="买入后最大偏离" value={<Pct v={plan.maxDriftAfter} />} tone={plan.maxDriftAfter < plan.maxDriftBefore ? 'down' : 'muted'} />
                </div>
                <OrderTable orders={orders} />
              </div>
            )}
            {done && <div className="mt-3"><Alert tone="success">已记入账本，结转余额 {plan?.leftover.toLocaleString()} 元会自动加到下月建议金额里。</Alert></div>}
          </Card>

          <Card title="定投记录" className="mt-4">
            {monthlyTxs.length === 0 ? (
              <Empty>还没有定投记录</Empty>
            ) : (
              <ul className="text-sm">
                {Object.entries(
                  monthlyTxs.reduce<Record<string, number>>((acc, t) => {
                    const k = t.date.slice(0, 7);
                    acc[k] = (acc[k] ?? 0) + t.shares * t.price + t.fee;
                    return acc;
                  }, {}),
                )
                  .sort((a, b) => (a[0] < b[0] ? 1 : -1))
                  .map(([m, v]) => (
                    <li key={m} className="flex justify-between border-b border-slate-100 py-1.5"><span>{m}</span><span><Money v={v} /> 元</span></li>
                  ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
