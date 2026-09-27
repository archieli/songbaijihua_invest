import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { FUNDS, PLAN, TARGET_WEIGHTS } from '@/config/plan';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useStore } from '@/store';
import { planRebalance } from '@/domain/rebalance';
import { buildRebalanceIcs } from '@/domain/schedule';
import { downloadText } from '@/lib/download';
import type { Transaction } from '@/domain/types';
import { Alert, Button, Card, Empty, Field, Money, NumberInput, PageHeader, Pct, Stat, inputCls } from '@/components/ui';
import { OrderTable } from '@/components/OrderTable';

export default function Rebalance() {
  const { valuation, schedule, holdings, prices, hasHoldings, settings, rebalances, nav } = usePortfolio();
  const addTransactions = useStore((s) => s.addTransactions);
  const addRebalance = useStore((s) => s.addRebalance);
  const removeRebalance = useStore((s) => s.removeRebalance);
  const [cash, setCash] = useState<number | ''>('');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [done, setDone] = useState(false);

  const plan = useMemo(() => {
    if (!hasHoldings) return undefined;
    const rows = FUNDS.map((f) => ({ code: f.code, shares: holdings[f.code]?.shares ?? 0, price: prices[f.code] ?? 0 }));
    return planRebalance({ rows, targets: TARGET_WEIGHTS, cash: cash || 0, lotSize: PLAN.lotSize, commissionRate: settings.commissionRate, minCommission: settings.minCommission });
  }, [hasHoldings, holdings, prices, cash, settings.commissionRate, settings.minCommission]);

  const orders = plan?.orders.map((o) => ({ ...o, targetWeight: TARGET_WEIGHTS[o.code] })) ?? [];
  const actionable = orders.filter((o) => o.side !== 'hold' && o.shares > 0);

  const confirm = () => {
    if (!plan) return;
    const txs: Omit<Transaction, 'id'>[] = actionable.map((o) => ({
      date,
      code: o.code,
      side: o.side as 'buy' | 'sell',
      shares: o.shares,
      price: o.price,
      fee: o.fee,
      source: 'rebalance',
      note: `年度再平衡`,
    }));
    const created = addTransactions(txs);
    addRebalance({ date, txIds: created.map((t) => t.id), note: cash ? `含新增资金 ${cash} 元` : undefined });
    setDone(true);
  };

  const exportIcs = () => {
    if (!schedule.nextRebalanceDate) return;
    downloadText('songbai-rebalance.ics', buildRebalanceIcs(schedule.nextRebalanceDate), 'text/calendar;charset=utf-8');
  };

  return (
    <div>
      <PageHeader
        title="年度再平衡"
        subtitle="系统按最新行情算出每只基金该卖多少、买多少，让各资产回到目标比例。你只需审核，下单后确认入账。"
        action={schedule.nextRebalanceDate && <Button variant="secondary" onClick={exportIcs}>导出日历提醒 (.ics)</Button>}
      />

      <div className="mb-4">
        <Alert tone={schedule.level === 'none' ? 'info' : schedule.level === 'upcoming' ? 'warn' : schedule.level === 'not_started' ? 'info' : 'danger'} title="再平衡时机">
          {schedule.message}
          {schedule.level === 'none' && valuation.maxDrift > 0.05 && ' 不过当前最大偏离已超过 5 个百分点，也可以提前执行。'}
        </Alert>
      </div>

      {!hasHoldings ? (
        <Empty>还没有持仓。先去 <Link to="/ledger" className="text-pine-700 underline">记账</Link> 录入首笔买入。</Empty>
      ) : (
        <>
          <Card title="生成交易单">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="执行日期"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <Field label="同时新增资金（可选）" hint="有新钱就一起按目标比例买入，减少卖出"><NumberInput value={cash} onChange={(v) => { setCash(v); setDone(false); }} step={10000} min={0} suffix="元" /></Field>
              <div className="flex items-end text-xs text-slate-500">参考价：{nav ? `${nav.latestDate} 收盘` : '加载中'}；手动价可在设置中覆盖。</div>
            </div>
          </Card>

          {plan && (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="组合总值" value={<Money v={plan.total} />} sub="含新增资金" />
                <Stat label="需卖出" value={<Money v={plan.sellTotal} />} sub={`${orders.filter((o) => o.side === 'sell').length} 只`} tone="down" />
                <Stat label="需买入" value={<Money v={plan.buyTotal} />} sub={`${orders.filter((o) => o.side === 'buy').length} 只`} tone="up" />
                <Stat label="预计佣金" value={<Money v={plan.feeTotal} digits={2} />} sub={`调整后最大偏离 ${(plan.maxDriftAfter * 100).toFixed(2)}%`} tone="muted" />
              </div>

              <Card title="交易单（先卖后买）" className="mt-4" right={<span className="text-xs text-slate-400">份数已按 100 份整手取整</span>}>
                {actionable.length === 0 ? (
                  <Empty>各资产偏离都不足一手，本次无需调整。</Empty>
                ) : (
                  <OrderTable orders={orders} />
                )}
                <div className="mt-3 text-xs text-slate-500">
                  卖出后现金约 <Money v={plan.sellTotal + plan.cashBefore} /> 元，买入用去 <Money v={plan.buyTotal + plan.feeTotal} /> 元，剩余 <Money v={plan.cashAfter} /> 元留在账户。
                  场内 ETF 卖出资金当日可用于买入。建议在交易时段（9:30-11:30、13:00-15:00）按市价成交。
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button onClick={confirm} disabled={done || actionable.length === 0}>{done ? '已入账' : '已按此执行，记入账本'}</Button>
                  {actionable.length === 0 && !done && (
                    <Button variant="secondary" onClick={() => { addRebalance({ date, txIds: [], note: '偏离不足一手，未调整' }); setDone(true); }}>标记本年已检查</Button>
                  )}
                  {done && <span className="text-sm text-emerald-700">已记录。下次再平衡：{dayjs(date).add(PLAN.rebalanceIntervalMonths, 'month').format('YYYY-MM-DD')}</span>}
                </div>
              </Card>

              <Card title="为什么这样调" className="mt-4">
                <ul className="space-y-1 text-sm text-slate-700">
                  {orders.map((o) => (
                    <li key={o.code} className="flex flex-wrap gap-x-2">
                      <span className="w-20 font-medium">{FUNDS.find((f) => f.code === o.code)?.shortName}</span>
                      <span className="text-slate-500">实际 <Pct v={o.beforeWeight} /> vs 目标 <Pct v={TARGET_WEIGHTS[o.code]} digits={0} /></span>
                      <span>→ {o.side === 'sell' ? '超配，卖出' : o.side === 'buy' ? '低配，买入' : '偏离不足一手，不动'}{o.side !== 'hold' && <>（理论 <Money v={o.idealDelta} sign /> 元，取整 <Money v={o.side === 'sell' ? -o.amount : o.amount} sign /> 元）</>}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}
        </>
      )}

      <Card title="历史再平衡" className="mt-4">
        {rebalances.length === 0 ? (
          <Empty>还没有记录</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {[...rebalances].reverse().map((r) => (
              <li key={r.id} className="flex items-center justify-between border-b border-slate-100 py-1.5">
                <span>{r.date} <span className="text-slate-500">· {r.txIds.length} 笔交易{r.note ? ` · ${r.note}` : ''}</span></span>
                <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => removeRebalance(r.id)}>删除记录</button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-400">删除记录只影响再平衡日期的计算，不会删除对应交易。</p>
      </Card>
    </div>
  );
}
