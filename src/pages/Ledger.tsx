import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { FUND_BY_CODE, FUNDS, PLAN, TARGET_WEIGHTS } from '@/config/plan';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useStore } from '@/store';
import { priceOn } from '@/data/nav';
import { planRebalance } from '@/domain/rebalance';
import { planContribution } from '@/domain/cashflow';
import { estimateFee, round2, roundToLot } from '@/domain/lots';
import type { Side, Transaction, TxSource } from '@/domain/types';
import { Alert, Badge, Button, Card, Empty, Field, Money, NumberInput, PageHeader, Pct, inputCls } from '@/components/ui';
import { OrderTable, type OrderLike } from '@/components/OrderTable';

const SOURCE_LABEL: Record<TxSource, string> = { initial: '首笔', add: '加仓', monthly: '定投', rebalance: '再平衡', manual: '手动' };

export default function Ledger() {
  const [params] = useSearchParams();
  const transactions = useStore((s) => s.transactions);
  const removeTransaction = useStore((s) => s.removeTransaction);
  const [tab, setTab] = useState<'batch' | 'single'>(params.get('mode') === 'single' ? 'single' : 'batch');
  const defaultDate = params.get('date') ?? undefined;

  return (
    <div>
      <PageHeader title="记账" subtitle='记录每一笔场内成交。买入前用"按比例买入"算出每只基金的份数，成交后一键入账。' />
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        <button className={`flex-1 rounded-md py-1.5 ${tab === 'batch' ? 'bg-white font-medium text-pine-700 shadow-sm' : 'text-slate-600'}`} onClick={() => setTab('batch')}>按比例买入（首笔 / 加仓）</button>
        <button className={`flex-1 rounded-md py-1.5 ${tab === 'single' ? 'bg-white font-medium text-pine-700 shadow-sm' : 'text-slate-600'}`} onClick={() => setTab('single')}>单笔录入</button>
      </div>

      {tab === 'batch' ? <BatchBuy defaultDate={defaultDate} /> : <SingleEntry defaultDate={defaultDate} />}

      <Card title="交易记录" className="mt-4" right={<span className="text-xs text-slate-400">{transactions.length} 笔</span>}>
        {transactions.length === 0 ? (
          <Empty>还没有交易记录</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="py-2 text-left font-medium">日期</th>
                  <th className="py-2 text-left font-medium">基金</th>
                  <th className="py-2 text-left font-medium">方向</th>
                  <th className="py-2 text-right font-medium">份数</th>
                  <th className="py-2 text-right font-medium">成交价</th>
                  <th className="py-2 text-right font-medium">金额</th>
                  <th className="py-2 text-right font-medium">手续费</th>
                  <th className="py-2 text-left font-medium">来源</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {[...transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="num py-2">{t.date}</td>
                    <td className="py-2">{FUND_BY_CODE[t.code]?.shortName ?? t.code} <span className="text-xs text-slate-400">{t.code}</span></td>
                    <td className="py-2">{t.side === 'buy' ? <Badge tone="red">买入</Badge> : <Badge tone="green">卖出</Badge>}</td>
                    <td className="num py-2 text-right">{t.shares.toLocaleString()}</td>
                    <td className="num py-2 text-right">{t.price.toFixed(3)}</td>
                    <td className="py-2 text-right"><Money v={t.shares * t.price} /></td>
                    <td className="py-2 text-right text-slate-500"><Money v={t.fee} digits={2} /></td>
                    <td className="py-2 text-xs text-slate-500">{SOURCE_LABEL[t.source]}{t.note ? ` · ${t.note}` : ''}</td>
                    <td className="py-2 text-right"><button className="text-xs text-slate-400 hover:text-red-600" onClick={() => removeTransaction(t.id)}>删除</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/** 按比例买入：首笔按目标比例，已有持仓时按缺口加仓 */
function BatchBuy({ defaultDate }: { defaultDate?: string }) {
  const { nav, prices, holdings, hasHoldings, settings } = usePortfolio();
  const addTransactions = useStore((s) => s.addTransactions);
  const [amount, setAmount] = useState<number | ''>(200_000);
  const [date, setDate] = useState(defaultDate ?? dayjs().format('YYYY-MM-DD'));
  const [done, setDone] = useState(false);

  // 该日期的价格：历史日期用当日收盘价；手动覆盖价优先
  const datePrices = useMemo(() => {
    const p: Record<string, number> = {};
    for (const f of FUNDS) {
      const s = nav?.byCode[f.code]?.series;
      const hist = s ? priceOn(s, date) : undefined;
      p[f.code] = settings.priceOverrides[f.code]?.price ?? hist ?? prices[f.code] ?? 0;
    }
    return p;
  }, [date, nav, prices, settings.priceOverrides]);

  const plan = useMemo(() => {
    if (!amount || amount <= 0) return undefined;
    const rows = FUNDS.map((f) => ({ code: f.code, shares: holdings[f.code]?.shares ?? 0, price: datePrices[f.code] }));
    const common = { targets: TARGET_WEIGHTS, lotSize: PLAN.lotSize, commissionRate: settings.commissionRate, minCommission: settings.minCommission };
    if (hasHoldings) {
      const c = planContribution({ rows, amount, ...common });
      const orders: OrderLike[] = c.orders.map((o) => ({ ...o, side: o.shares > 0 ? 'buy' : 'hold' }));
      return { orders, spent: c.spent, leftover: c.leftover, fee: c.orders.reduce((s, o) => s + o.fee, 0), mode: 'add' as const };
    }
    const r = planRebalance({ rows, cash: amount, ...common });
    const orders: OrderLike[] = r.orders.map((o) => ({ ...o, targetWeight: TARGET_WEIGHTS[o.code] }));
    return { orders, spent: r.buyTotal + r.feeTotal, leftover: r.cashAfter, fee: r.feeTotal, mode: 'initial' as const };
  }, [amount, datePrices, holdings, hasHoldings, settings.commissionRate, settings.minCommission]);

  const confirm = () => {
    if (!plan) return;
    const txs: Omit<Transaction, 'id'>[] = plan.orders
      .filter((o) => o.side === 'buy' && o.shares > 0)
      .map((o) => ({ date, code: o.code, side: 'buy' as Side, shares: o.shares, price: o.price, fee: o.fee, source: plan.mode, note: plan.mode === 'initial' ? '首笔按比例买入' : '按缺口加仓' }));
    addTransactions(txs);
    setDone(true);
  };

  return (
    <Card title={hasHoldings ? '加仓：按缺口买入' : '首笔：按目标比例买入'}>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="投入金额（元）"><NumberInput value={amount} onChange={(v) => { setAmount(v); setDone(false); }} step={10000} min={0} suffix="元" /></Field>
        <Field label="买入日期" hint="历史日期会用当日收盘价估算份数"><input type="date" className={inputCls} value={date} max={dayjs().format('YYYY-MM-DD')} onChange={(e) => { setDate(e.target.value); setDone(false); }} /></Field>
        <div className="flex items-end"><Button onClick={confirm} disabled={!plan || done} className="w-full">{done ? '已入账' : '已按此下单，记入账本'}</Button></div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {hasHoldings
          ? '已有持仓时，新资金优先买入当前最低配的资产（只买不卖），加仓本身就是一次温和的再平衡。'
          : '首笔按 25% / 25% / 15% / 15% / 20% 配置，份数按 100 份整手取整，剩余现金留在账户。'}
        实际成交价与参考价会有差异，成交后可在记录里删除重录，或用"单笔录入"按真实成交价记。
      </p>
      {plan && (
        <div className="mt-4">
          <OrderTable orders={plan.orders} />
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
            <span>预计买入 <b><Money v={plan.spent} /></b> 元（含佣金 <Money v={plan.fee} digits={2} />）</span>
            <span>剩余现金 <b><Money v={plan.leftover} /></b> 元{plan.leftover > 0 && '（不足整手，留作下次）'}</span>
          </div>
        </div>
      )}
      {done && <div className="mt-3"><Alert tone="success">已记入账本。仪表盘会以首笔买入日为锚点计算年度再平衡日期。</Alert></div>}
    </Card>
  );
}

/** 单笔录入 */
function SingleEntry({ defaultDate }: { defaultDate?: string }) {
  const { prices, holdings, settings } = usePortfolio();
  const addTransactions = useStore((s) => s.addTransactions);
  const [date, setDate] = useState(defaultDate ?? dayjs().format('YYYY-MM-DD'));
  const [code, setCode] = useState(FUNDS[0].code);
  const [side, setSide] = useState<Side>('buy');
  const [shares, setShares] = useState<number | ''>('');
  const [price, setPrice] = useState<number | ''>('');
  const [fee, setFee] = useState<number | ''>('');
  const [byAmount, setByAmount] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');

  const refPrice = prices[code] ?? 0;
  const effPrice = price === '' ? refPrice : price;
  const autoFee = shares !== '' && effPrice > 0 ? estimateFee(shares * effPrice, settings.commissionRate, settings.minCommission) : 0;

  const fillByAmount = () => {
    if (byAmount === '' || effPrice <= 0) return;
    setShares(roundToLot(byAmount / effPrice, PLAN.lotSize, 'floor'));
  };

  const submit = () => {
    if (shares === '' || shares <= 0 || effPrice <= 0) {
      setMsg('请填写份数和成交价');
      return;
    }
    if (side === 'sell' && (holdings[code]?.shares ?? 0) < shares) {
      setMsg(`当前持有 ${holdings[code]?.shares ?? 0} 份，卖出份数不能超过持仓`);
      return;
    }
    addTransactions([{ date, code, side, shares, price: effPrice, fee: fee === '' ? autoFee : fee, source: 'manual', note: note || undefined }]);
    setShares('');
    setFee('');
    setNote('');
    setMsg('已记录');
  };

  return (
    <Card title="单笔录入">
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="日期"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="基金">
          <select className={inputCls} value={code} onChange={(e) => setCode(e.target.value)}>
            {FUNDS.map((f) => <option key={f.code} value={f.code}>{f.shortName} {f.code}</option>)}
          </select>
        </Field>
        <Field label="方向">
          <select className={inputCls} value={side} onChange={(e) => setSide(e.target.value as Side)}>
            <option value="buy">买入</option>
            <option value="sell">卖出</option>
          </select>
        </Field>
        <Field label="成交价" hint={`参考价 ${refPrice.toFixed(3)}`}><NumberInput value={price} onChange={setPrice} step={0.001} placeholder={refPrice.toFixed(3)} /></Field>
        <Field label="按金额换算份数" hint="向下取整到 100 份">
          <div className="flex gap-2">
            <NumberInput value={byAmount} onChange={setByAmount} step={1000} suffix="元" />
            <Button variant="secondary" onClick={fillByAmount}>换算</Button>
          </div>
        </Field>
        <Field label="份数"><NumberInput value={shares} onChange={setShares} step={100} min={0} suffix="份" /></Field>
        <Field label="手续费" hint={`留空按万 ${(settings.commissionRate * 10000).toFixed(1)} 估算：${round2(autoFee)} 元`}><NumberInput value={fee} onChange={setFee} step={0.01} suffix="元" /></Field>
        <Field label="备注"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="可选" /></Field>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={submit}>记录</Button>
        {shares !== '' && effPrice > 0 && <span className="text-sm text-slate-500">金额 <Money v={shares * effPrice} /> 元，该基金目标占比 <Pct v={TARGET_WEIGHTS[code]} digits={0} /></span>}
        {msg && <span className="text-sm text-pine-700">{msg}</span>}
      </div>
    </Card>
  );
}
