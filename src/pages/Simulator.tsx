import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FUND_BY_CODE, FUNDS, TARGET_WEIGHTS } from '@/config/plan';
import { useNav } from '@/hooks/useNav';
import { buildPriceTable, delayedEntry, downsample, rollingReturns, runBacktest, type ContributionMode } from '@/domain/backtest';
import { fmtMoney } from '@/domain/lots';
import { Alert, Badge, Card, Empty, Field, Money, NumberInput, PageHeader, Pct, Stat, inputCls } from '@/components/ui';

const SERIES = { value: '#2a78d6', invested: '#898781' };

export default function Simulator() {
  const { nav, loading, error } = useNav();
  const [useProxy, setUseProxy] = useState(true);
  const [amount, setAmount] = useState<number | ''>(200_000);
  const [mode, setMode] = useState<ContributionMode>('lump');
  const [parts, setParts] = useState(12);
  const [rebalance, setRebalance] = useState(true);
  const [start, setStart] = useState('');

  const table = useMemo(() => {
    if (!nav) return undefined;
    const fundSeries = Object.fromEntries(FUNDS.map((f) => [f.code, nav.byCode[f.code].series]));
    const proxies = Object.fromEntries(FUNDS.map((f) => [f.code, nav.proxyByCode[f.code] && f.proxy ? { series: nav.proxyByCode[f.code]!.series, name: f.proxy.name } : undefined]));
    return buildPriceTable(fundSeries, proxies, useProxy);
  }, [nav, useProxy]);

  const effStart = start || (table ? dayjs(table.last).subtract(1, 'year').format('YYYY-MM-DD') : '');
  const startValid = table && effStart >= table.first && effStart < table.last;

  const result = useMemo(() => {
    if (!table || !startValid || !amount || amount <= 0) return undefined;
    try {
      return runBacktest({ table, start: effStart, amount, mode, parts, rebalance, targets: TARGET_WEIGHTS });
    } catch {
      return undefined;
    }
  }, [table, startValid, effStart, amount, mode, parts, rebalance]);

  const delayed = useMemo(() => {
    if (!table || !startValid || !amount || amount <= 0) return undefined;
    return delayedEntry({ table, start: effStart, amount, rebalance, targets: TARGET_WEIGHTS });
  }, [table, startValid, effStart, amount, rebalance]);

  const rolling = useMemo(() => {
    if (!table) return [];
    return [1, 3, 5].map((y) => rollingReturns(table, TARGET_WEIGHTS, y, rebalance, 5)).filter(Boolean) as NonNullable<ReturnType<typeof rollingReturns>>[];
  }, [table, rebalance]);

  const chartData = useMemo(() => (result ? downsample(result.curve, 500).map((p) => ({ date: p.date, 市值: Math.round(p.value), 累计投入: Math.round(p.invested) })) : []), [result]);

  const quick = (years: number | 'max') => {
    if (!table) return;
    setStart(years === 'max' ? table.first : dayjs(table.last).subtract(years, 'year').format('YYYY-MM-DD'));
  };

  return (
    <div>
      <PageHeader title="历史模拟" subtitle="如果在过去某一天投入了松柏计划，今天值多少？用真实前复权行情回测，帮你看清「等低点」和「现在就投」的差别。" />

      {error && <Alert tone="danger">{error}</Alert>}
      {loading && <Empty>正在加载行情…</Empty>}

      {table && (
        <>
          <Card title="模拟条件">
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="起点日期" hint={`可选范围 ${table.first} ~ ${table.last}`}>
                <input type="date" className={inputCls} value={effStart} min={table.first} max={table.last} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field label="投入金额"><NumberInput value={amount} onChange={setAmount} step={10000} min={0} suffix="元" /></Field>
              <Field label="投入方式">
                <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value as ContributionMode)}>
                  <option value="lump">一次性投入</option>
                  <option value="monthly">按月分批</option>
                  <option value="yearly">按年分批</option>
                </select>
              </Field>
              {mode !== 'lump' ? (
                <Field label="分几份"><NumberInput value={parts} onChange={(v) => setParts(v === '' ? 1 : Math.max(1, v))} min={1} step={1} /></Field>
              ) : (
                <div />
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs text-slate-500">快捷：</span>
              {[1, 2, 3, 5, 8].map((y) => (
                <button key={y} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-pine-50 hover:text-pine-700" onClick={() => quick(y)}>{y} 年前</button>
              ))}
              <button className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-pine-50 hover:text-pine-700" onClick={() => quick('max')}>最早</button>
              <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={rebalance} onChange={(e) => setRebalance(e.target.checked)} className="accent-pine-600" />周年再平衡</label>
              <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={useProxy} onChange={(e) => setUseProxy(e.target.checked)} className="accent-pine-600" />基金成立前用指数回溯</label>
            </div>
            {Object.keys(table.proxied).length > 0 && (
              <p className="mt-2 text-xs text-amber-700">
                代理数据：{Object.entries(table.proxied).map(([code, p]) => `${FUND_BY_CODE[code].shortName} 在 ${p.until} 前用「${p.name}」`).join('；')}。代理与真实基金走势不完全一致，仅供参考。
              </p>
            )}
          </Card>

          {!startValid && <div className="mt-4"><Alert tone="warn">起点日期超出可用范围。</Alert></div>}

          {result && (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label={`${result.start} 投入`} value={<Money v={result.invested} />} sub={mode === 'lump' ? '一次性' : `分 ${result.contributions.length} 次`} />
                <Stat label={`${result.end} 市值`} value={<Money v={result.finalValue} />} sub={<span>累计 <Pct v={result.totalReturn} sign /></span>} tone={result.totalReturn >= 0 ? 'up' : 'down'} />
                <Stat label="年化收益" value={<Pct v={result.annualized} />} sub={`持有 ${result.years.toFixed(1)} 年`} tone={result.annualized >= 0 ? 'up' : 'down'} />
                <Stat label="期间最大回撤" value={<Pct v={-result.maxDrawdown} />} sub={`${result.maxDrawdownStart} → ${result.maxDrawdownEnd}`} tone="down" />
              </div>

              <Card title="市值曲线" className="mt-4">
                <div className="h-72 w-full">
                  <ResponsiveContainer>
                    <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                      <CartesianGrid stroke="#e1e0d9" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#898781' }} tickLine={false} axisLine={{ stroke: '#c3c2b7' }} minTickGap={48} tickFormatter={(d: string) => d.slice(0, 7)} />
                      <YAxis tick={{ fontSize: 11, fill: '#898781' }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => `${(v / 10000).toFixed(1).replace(/\.0$/, '')}万`} domain={['auto', 'auto']} />
                      <Tooltip
                        formatter={(v: number) => `${fmtMoney(v)} 元`}
                        labelStyle={{ color: '#52514e', fontSize: 12 }}
                        contentStyle={{ borderRadius: 8, border: '1px solid #e1e0d9', fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="市值" stroke={SERIES.value} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                      <Line type="monotone" dataKey="累计投入" stroke={SERIES.invested} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {result.rebalances.length > 0 && <p className="mt-2 text-xs text-slate-500">周年再平衡日：{result.rebalances.join('、')}</p>}
              </Card>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Card title="各资产贡献">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-slate-500"><tr className="border-b border-slate-200"><th className="py-1.5 text-left font-medium">资产</th><th className="py-1.5 text-right font-medium">投入</th><th className="py-1.5 text-right font-medium">期末市值</th><th className="py-1.5 text-right font-medium">收益</th></tr></thead>
                    <tbody>
                      {result.byAsset.map((a) => (
                        <tr key={a.code} className="border-b border-slate-100">
                          <td className="py-1.5">{FUND_BY_CODE[a.code].shortName} {table.proxied[a.code] && <Badge tone="amber">含代理</Badge>}</td>
                          <td className="num py-1.5 text-right"><Money v={a.invested} /></td>
                          <td className="num py-1.5 text-right"><Money v={a.value} /></td>
                          <td className="py-1.5 text-right"><Pct v={a.ret} sign colored /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-slate-500">再平衡会在资产间搬钱，"投入"为首次分配 + 后续流入，不含再平衡转移。</p>
                </Card>

                {delayed && (
                  <Card title="如果再等等呢？">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-slate-500"><tr className="border-b border-slate-200"><th className="py-1.5 text-left font-medium">入场时点</th><th className="py-1.5 text-right font-medium">同一终点市值</th><th className="py-1.5 text-right font-medium">与立刻入场相比</th></tr></thead>
                      <tbody>
                        <tr className="border-b border-slate-100 font-medium"><td className="py-1.5">{delayed.now.start} 立刻入场</td><td className="num py-1.5 text-right"><Money v={delayed.now.finalValue} /></td><td className="py-1.5 text-right">—</td></tr>
                        {delayed.delayed.map((d) => (
                          <tr key={d.delayMonths} className="border-b border-slate-100">
                            <td className="py-1.5">再等 {d.delayMonths} 个月（{d.start}）</td>
                            <td className="num py-1.5 text-right"><Money v={d.finalValue} /></td>
                            <td className={`num py-1.5 text-right ${d.diffVsNow < 0 ? 'text-down' : 'text-up'}`}><Money v={d.diffVsNow} sign /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-xs text-slate-500">等待期间现金按 0 收益计。一次性投入同样金额，比较同一终点的市值。</p>
                  </Card>
                )}
              </div>
            </>
          )}

          {rolling.length > 0 && (
            <Card title="任意一天入场，持有 N 年会怎样" className="mt-4" right={<span className="text-xs text-slate-400">{table.first} 起，每 5 个交易日取一个起点</span>}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="py-1.5 text-left font-medium">持有期</th>
                      <th className="py-1.5 text-right font-medium">样本数</th>
                      <th className="py-1.5 text-right font-medium">正收益概率</th>
                      <th className="py-1.5 text-right font-medium">中位数</th>
                      <th className="py-1.5 text-right font-medium">中位年化</th>
                      <th className="py-1.5 text-right font-medium">最差</th>
                      <th className="py-1.5 text-right font-medium">最好</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rolling.map((r) => (
                      <tr key={r.horizonYears} className="border-b border-slate-100">
                        <td className="py-1.5">{r.horizonYears} 年</td>
                        <td className="num py-1.5 text-right">{r.count}</td>
                        <td className="num py-1.5 text-right font-medium">{(r.positiveRate * 100).toFixed(0)}%</td>
                        <td className="py-1.5 text-right"><Pct v={r.median} sign colored /></td>
                        <td className="py-1.5 text-right"><Pct v={r.medianAnnualized} /></td>
                        <td className="py-1.5 text-right"><Pct v={r.min} sign colored /> <span className="text-xs text-slate-400">{r.minStart}</span></td>
                        <td className="py-1.5 text-right"><Pct v={r.max} sign colored /> <span className="text-xs text-slate-400">{r.maxStart}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-500">历史不代表未来。这张表回答的是"随便挑一天入场、拿满 N 年"的分布，而不是预测。</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
