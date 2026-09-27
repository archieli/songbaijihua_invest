import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { usePortfolio } from '@/hooks/usePortfolio';
import { Alert, Badge, Card, Empty, PageHeader } from '@/components/ui';

interface Entry {
  date: string;
  type: 'buy' | 'add' | 'rebalance' | 'note';
  note?: string;
}
interface Author {
  id: string;
  name: string;
  desc?: string;
  entries: Entry[];
}
interface ModelLedgerFile {
  updatedAt: string;
  note?: string;
  authors: Author[];
}

const TYPE: Record<Entry['type'], { label: string; tone: 'red' | 'blue' | 'green' | 'gray' }> = {
  buy: { label: '首笔买入', tone: 'red' },
  add: { label: '加仓', tone: 'blue' },
  rebalance: { label: '再平衡', tone: 'green' },
  note: { label: '说明', tone: 'gray' },
};

export default function ModelLedger() {
  const [data, setData] = useState<ModelLedgerFile>();
  const [error, setError] = useState<string>();
  const { schedule } = usePortfolio();
  const today = dayjs().format('YYYY-MM-DD');

  useEffect(() => {
    const b = import.meta.env.BASE_URL || '/';
    fetch(`${b.endsWith('/') ? b : b + '/'}data/model-ledger.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div>
      <PageHeader title="示范账本" subtitle="导师与资深成员的操作时间线：只公布日期与操作类型，不含金额。用来对照节奏，不是用来择时。" />

      <div className="mb-4">
        <Alert tone="info" title="怎么用">
          松柏计划不择时，示范账本的价值是让你看到"别人也是随便挑一天就开始、然后每年同一天再平衡"。
          你的波动比例和他们完全一致，差别只在金额。想跟着做：点某条"首笔买入"旁的按钮，以同一天作为你的记账日期即可。
        </Alert>
      </div>

      {error && <Alert tone="danger">示范账本加载失败：{error}</Alert>}
      {!data && !error && <Empty>加载中…</Empty>}

      {data?.authors.map((a) => (
        <Card key={a.id} title={a.name} className="mb-4" right={a.desc && <span className="max-w-xs text-right text-xs text-slate-400">{a.desc}</span>}>
          <ol className="relative ml-2 border-l border-slate-200 pl-5">
            {a.entries
              .slice()
              .sort((x, y) => (x.date < y.date ? -1 : 1))
              .map((e, i) => {
                const future = e.date > today;
                const t = TYPE[e.type];
                return (
                  <li key={i} className="relative mb-4 last:mb-0">
                    <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white ${future ? 'bg-slate-300' : 'bg-pine-600'}`} />
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="num font-medium text-slate-800">{e.date}</span>
                      <Badge tone={t.tone}>{t.label}</Badge>
                      {future && <Badge>计划中</Badge>}
                      {e.type === 'buy' && !future && (
                        <Link to={`/ledger?date=${e.date}`} className="text-xs text-pine-700 underline">以这天为我的首笔日期去记账</Link>
                      )}
                    </div>
                    {e.note && <div className="mt-0.5 text-xs text-slate-500">{e.note}</div>}
                  </li>
                );
              })}
          </ol>
        </Card>
      ))}

      <Card title="我的节奏">
        {schedule.anchorDate ? (
          <div className="text-sm text-slate-700">
            我的首笔买入：<b>{schedule.anchorDate}</b>，下次再平衡：<b>{schedule.nextRebalanceDate}</b>，已完成 {schedule.completed} 次。
          </div>
        ) : (
          <Empty>还没有记录首笔买入。</Empty>
        )}
        <p className="mt-2 text-xs text-slate-400">示范账本由管理员维护（public/data/model-ledger.json），更新时间 {data?.updatedAt ?? '—'}。{data?.note}</p>
      </Card>
    </div>
  );
}
