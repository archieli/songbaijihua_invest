import { FUND_BY_CODE } from '@/config/plan';
import { Badge, Money, Pct } from './ui';

export interface OrderLike {
  code: string;
  side: 'buy' | 'sell' | 'hold';
  shares: number;
  price: number;
  amount: number;
  fee: number;
  beforeWeight: number;
  afterWeight: number;
  targetWeight: number;
}

/** 交易单表格：方向、份数、金额、调整前后占比 */
export function OrderTable({ orders }: { orders: OrderLike[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-xs text-slate-500">
          <tr className="border-b border-slate-200">
            <th className="py-2 pr-2 text-left font-medium">基金</th>
            <th className="py-2 pr-2 text-left font-medium">操作</th>
            <th className="py-2 pr-2 text-right font-medium">份数</th>
            <th className="py-2 pr-2 text-right font-medium">参考价</th>
            <th className="py-2 pr-2 text-right font-medium">金额</th>
            <th className="py-2 pr-2 text-right font-medium">佣金</th>
            <th className="py-2 pr-2 text-right font-medium">调整前</th>
            <th className="py-2 pr-2 text-right font-medium">调整后</th>
            <th className="py-2 text-right font-medium">目标</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const f = FUND_BY_CODE[o.code];
            return (
              <tr key={o.code} className="border-b border-slate-100">
                <td className="py-2.5 pr-2">
                  <div className="font-medium text-slate-800">{f?.shortName ?? o.code}</div>
                  <div className="text-xs text-slate-400">{o.code}</div>
                </td>
                <td className="py-2.5 pr-2">
                  {o.side === 'buy' && <Badge tone="red">买入</Badge>}
                  {o.side === 'sell' && <Badge tone="green">卖出</Badge>}
                  {o.side === 'hold' && <Badge>不动</Badge>}
                </td>
                <td className="num py-2.5 pr-2 text-right">{o.side === 'hold' ? '—' : o.shares.toLocaleString()}</td>
                <td className="num py-2.5 pr-2 text-right">{o.price.toFixed(3)}</td>
                <td className="py-2.5 pr-2 text-right">{o.side === 'hold' ? '—' : <Money v={o.amount} />}</td>
                <td className="py-2.5 pr-2 text-right text-slate-500">{o.side === 'hold' ? '—' : <Money v={o.fee} digits={2} />}</td>
                <td className="py-2.5 pr-2 text-right"><Pct v={o.beforeWeight} /></td>
                <td className="py-2.5 pr-2 text-right font-medium"><Pct v={o.afterWeight} /></td>
                <td className="py-2.5 text-right text-slate-500"><Pct v={o.targetWeight} digits={0} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
