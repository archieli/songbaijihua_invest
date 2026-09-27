import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { FUND_BY_CODE, FUNDS, PLAN, TARGET_WEIGHTS } from '@/config/plan';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useStore } from '@/store';
import { priceOn } from '@/data/nav';
import { planRebalance } from '@/domain/rebalance';
import { Alert, Badge, Button, Card, DriftBar, Empty, Money, PageHeader, Pct, Stat } from '@/components/ui';
import type { ReminderLevel } from '@/domain/schedule';

/** 课件 P28 示例：2025-09-08 一次性投入 20 万 */
const DEMO_DATE = '2025-09-08';
const DEMO_AMOUNT = 200_000;

const LEVEL_TONE: Record<ReminderLevel, 'info' | 'warn' | 'danger' | 'success'> = {
  none: 'success',
  upcoming: 'warn',
  due: 'danger',
  overdue: 'danger',
  not_started: 'info',
};

export default function Dashboard() {
  const { valuation, schedule, nav, loading, error, hasHoldings, settings, rebalances } = usePortfolio();
  const [params, setParams] = useSearchParams();
  const addTransactions = useStore((s) => s.addTransactions);

  /** 载入课件示例：按 2025-09-08 收盘价，20 万按目标比例买入 */
  const loadDemo = () => {
    if (!nav) return;
    const rows = FUNDS.map((f) => ({ code: f.code, shares: 0, price: priceOn(nav.byCode[f.code].series, DEMO_DATE) ?? 0 }));
    const plan = planRebalance({ rows, targets: TARGET_WEIGHTS, cash: DEMO_AMOUNT, lotSize: PLAN.lotSize, commissionRate: settings.commissionRate, minCommission: settings.minCommission });
    addTransactions(
      plan.orders
        .filter((o) => o.side === 'buy')
        .map((o) => ({ date: DEMO_DATE, code: o.code, side: 'buy' as const, shares: o.shares, price: o.price, fee: o.fee, source: 'initial' as const, note: '课件示例数据' })),
    );
  };
  useEffect(() => {
    if (params.get('demo') === '1' && nav && !hasHoldings) {
      loadDemo();
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, nav, hasHoldings]);

  // 打开页面时的浏览器通知（静态站无法主动推送，只能在访问时提醒）
  useEffect(() => {
    if (!settings.browserNotify || typeof Notification === 'undefined') return;
    if (!['upcoming', 'due', 'overdue'].includes(schedule.level)) return;
    if (Notification.permission === 'granted') {
      const key = `songbai-notified-${schedule.nextRebalanceDate}-${schedule.level}`;
      if (sessionStorage.getItem(key)) return;
      new Notification('松柏计划 · 再平衡提醒', { body: schedule.message });
      sessionStorage.setItem(key, '1');
    }
  }, [settings.browserNotify, schedule]);

  const pnlPct = valuation.netInvested > 0 ? valuation.pnl / valuation.netInvested : 0;

  return (
    <div>
      <PageHeader
        title="仪表盘"
        subtitle={nav ? `行情更新至 ${nav.latestDate}（前复权收盘价）` : loading ? '正在加载行情…' : ''}
        action={
          <div className="flex gap-2">
            <Link to="/ledger" className="rounded-lg bg-pine-600 px-3 py-2 text-sm font-medium text-white hover:bg-pine-700">记一笔</Link>
            <Link to="/rebalance" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">再平衡</Link>
          </div>
        }
      />

      {error && <Alert tone="danger" title="行情加载失败">{error}。可在"设置"里手动填入各基金当前价。</Alert>}

      <div className="mb-4">
        <Alert tone={LEVEL_TONE[schedule.level]} title={schedule.level === 'not_started' ? '还未开始' : '年度再平衡'}>
          {schedule.message}
          {schedule.anchorDate && (
            <span className="ml-1 text-xs opacity-80">（锚点：首笔买入 {schedule.anchorDate}{schedule.lastRebalanceDate ? `，上次再平衡 ${schedule.lastRebalanceDate}` : ''}，已完成 {schedule.completed} 次）</span>
          )}
        </Alert>
      </div>

      {!hasHoldings ? (
        <Card title="三步开始松柏计划">
          <ol className="space-y-3 text-sm text-slate-700">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pine-600 text-xs font-bold text-white">1</span>
              <div><Link to="/sizing" className="font-medium text-pine-700 underline">仓位规划</Link>：填家庭财务情况，算出这次能投多少、要不要分批，并做 -20% 压力测试。</div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pine-600 text-xs font-bold text-white">2</span>
              <div><Link to="/ledger" className="font-medium text-pine-700 underline">记账</Link>：用"按比例买入"输入总金额，系统按 25/25/15/15/20 算出每只 ETF 买多少份（整手），下单后一键入账。</div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pine-600 text-xs font-bold text-white">3</span>
              <div>之后什么都不用做。一年后仪表盘会提醒你到<Link to="/rebalance" className="font-medium text-pine-700 underline">再平衡</Link>页生成交易单；每月有结余就去<Link to="/monthly" className="font-medium text-pine-700 underline">每月定投</Link>。</div>
            </li>
          </ol>
          <p className="mt-4 text-xs text-slate-500">还在犹豫要不要入场？看看<Link to="/simulator" className="text-pine-700 underline">历史模拟</Link>：如果一年前、三年前投入，今天值多少。</p>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={loadDemo} disabled={!nav}>载入课件示例数据</Button>
            <span className="text-xs text-slate-500">按课件 P28 的例子：{DEMO_DATE} 一次性投入 {DEMO_AMOUNT / 10_000} 万，用真实收盘价生成持仓，方便先体验各功能。之后可在设置里一键清空。</span>
          </div>
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="总市值" value={<Money v={valuation.total} />} sub="元" />
            <Stat label="净投入" value={<Money v={valuation.netInvested} />} sub="买入含费 − 卖出净额" />
            <Stat label="累计收益" value={<Money v={valuation.pnl} sign />} sub={<Pct v={pnlPct} sign />} tone={valuation.pnl > 0 ? 'up' : valuation.pnl < 0 ? 'down' : 'muted'} />
            <Stat label="最大偏离" value={<Pct v={valuation.maxDrift} />} sub={valuation.maxDrift > 0.05 ? '偏离较大，可提前再平衡' : '在正常范围'} tone={valuation.maxDrift > 0.05 ? 'up' : 'muted'} />
          </div>

          <Card title="持仓与目标比例" right={<span className="text-xs text-slate-400">竖线为目标比例</span>}>
            <div className="space-y-3">
              {valuation.rows.map((r) => {
                const f = FUND_BY_CODE[r.code];
                const override = settings.priceOverrides[r.code];
                return (
                  <div key={r.code} className="grid grid-cols-12 items-center gap-2 text-sm">
                    <div className="col-span-5 md:col-span-3">
                      <div className="font-medium text-slate-800">{f.shortName} <span className="text-xs text-slate-400">{r.code}</span></div>
                      <div className="text-xs text-slate-500">{f.assetLabel}</div>
                    </div>
                    <div className="col-span-7 md:col-span-4">
                      <DriftBar weight={r.weight} target={r.targetWeight} />
                      <div className="mt-1 flex justify-between text-xs text-slate-500">
                        <span><Pct v={r.weight} /> / 目标 <Pct v={r.targetWeight} digits={0} /></span>
                        <span className={r.drift > 0.005 ? 'text-up' : r.drift < -0.005 ? 'text-amber-600' : ''}><Pct v={r.drift} sign /></span>
                      </div>
                    </div>
                    <div className="col-span-6 md:col-span-3 md:text-right">
                      <div className="num"><Money v={r.value} /> 元</div>
                      <div className="text-xs text-slate-500">{r.shares.toLocaleString()} 份 × {r.price.toFixed(3)} {override && <Badge tone="amber">手动价</Badge>}</div>
                    </div>
                    <div className="col-span-6 md:col-span-2 md:text-right">
                      <div className={`num ${r.pnl > 0 ? 'text-up' : r.pnl < 0 ? 'text-down' : ''}`}><Money v={r.pnl} sign /></div>
                      <div className="text-xs text-slate-500">成本 {r.avgCost.toFixed(3)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card title="下一步">
              <ul className="space-y-2 text-sm text-slate-700">
                <li>· 每月有结余 → <Link to="/monthly" className="text-pine-700 underline">每月定投</Link>，新钱只买低配资产，不影响年度再平衡。</li>
                <li>· 到期或偏离大 → <Link to="/rebalance" className="text-pine-700 underline">再平衡</Link>，系统生成交易单，你只需审核。</li>
                <li>· 想加一笔大钱 → 先做 <Link to="/sizing" className="text-pine-700 underline">仓位规划</Link>，再用记账页"按比例买入"。</li>
              </ul>
            </Card>
            <Card title="再平衡记录">
              {rebalances.length === 0 ? (
                <Empty>还没有再平衡记录。首个周年日 {schedule.nextRebalanceDate} 会提醒。</Empty>
              ) : (
                <ul className="space-y-1 text-sm">
                  {[...rebalances].reverse().map((r) => (
                    <li key={r.id} className="flex justify-between border-b border-slate-100 py-1.5">
                      <span>{r.date}</span>
                      <span className="text-slate-500">{r.txIds.length} 笔交易{r.note ? ` · ${r.note}` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      <div className="mt-6 text-xs text-slate-400">
        目标配置：{FUNDS.map((f) => `${f.assetLabel} ${Math.round(f.targetWeight * 100)}%`).join(' · ')}。今天 {dayjs().format('YYYY-MM-DD')}。
      </div>
    </div>
  );
}
