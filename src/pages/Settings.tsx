import { useRef, useState } from 'react';
import dayjs from 'dayjs';
import { FUNDS, PLAN } from '@/config/plan';
import { useNav } from '@/hooks/useNav';
import { useStore, type ExportedData } from '@/store';
import { downloadText, readFileAsText } from '@/lib/download';
import { Alert, Button, Card, Field, NumberInput, PageHeader, Pct, inputCls } from '@/components/ui';

export default function Settings() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const setPriceOverride = useStore((s) => s.setPriceOverride);
  const exportData = useStore((s) => s.exportData);
  const importData = useStore((s) => s.importData);
  const clearAll = useStore((s) => s.clearAll);
  const { nav } = useNav();
  const [msg, setMsg] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = () => {
    downloadText(`songbai-backup-${dayjs().format('YYYYMMDD')}.json`, JSON.stringify(exportData(), null, 2), 'application/json');
    setMsg('已导出备份文件');
  };
  const doImport = async (f?: File) => {
    if (!f) return;
    try {
      importData(JSON.parse(await readFileAsText(f)) as ExportedData);
      setMsg('已导入备份');
    } catch (e) {
      setMsg(`导入失败：${(e as Error).message}`);
    }
  };
  const askNotify = async () => {
    if (typeof Notification === 'undefined') {
      setMsg('当前浏览器不支持通知');
      return;
    }
    const p = await Notification.requestPermission();
    updateSettings({ browserNotify: p === 'granted' });
    setMsg(p === 'granted' ? '已开启：打开页面时若临近再平衡会弹出通知' : '未获得通知权限');
  };

  return (
    <div>
      <PageHeader title="设置" subtitle="交易成本、提醒方式、价格覆盖与数据备份。所有数据只保存在本机浏览器。" />
      {msg && <div className="mb-4"><Alert tone="info">{msg}</Alert></div>}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="交易成本">
          <div className="grid grid-cols-2 gap-3">
            <Field label="佣金费率（万分之）" hint="券商 ETF 佣金通常万 0.5 ~ 万 3">
              <NumberInput value={Math.round(settings.commissionRate * 1e6) / 100} onChange={(v) => updateSettings({ commissionRate: (v === '' ? 0 : v) / 10000 })} step={0.1} min={0} />
            </Field>
            <Field label="最低佣金（元）" hint="多数券商 ETF 无最低佣金，填 0">
              <NumberInput value={settings.minCommission} onChange={(v) => updateSettings({ minCommission: v === '' ? 0 : v })} step={1} min={0} suffix="元" />
            </Field>
          </div>
        </Card>

        <Card title="再平衡提醒">
          <p className="text-sm text-slate-600">静态网页无法主动推送。三种提醒方式：</p>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
            <li>1. 打开本页时，仪表盘横幅按到期状态提醒（始终开启）。</li>
            <li>2. 在"再平衡"页导出 .ics 加入手机日历，每年自动提醒（推荐）。</li>
            <li>3. 浏览器通知：<Button variant="secondary" onClick={askNotify}>{settings.browserNotify ? '已开启' : '开启'}</Button>{settings.browserNotify && <button className="ml-2 text-xs text-slate-400 underline" onClick={() => updateSettings({ browserNotify: false })}>关闭</button>}</li>
          </ul>
        </Card>
      </div>

      <Card title="价格覆盖（行情滞后时使用）" className="mt-4" right={<span className="text-xs text-slate-400">行情更新至 {nav?.latestDate ?? '—'}</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-xs text-slate-500"><tr className="border-b border-slate-200"><th className="py-1.5 text-left font-medium">基金</th><th className="py-1.5 text-right font-medium">目标</th><th className="py-1.5 text-right font-medium">费率</th><th className="py-1.5 text-right font-medium">行情价</th><th className="py-1.5 text-right font-medium">手动价</th><th className="py-1.5"></th></tr></thead>
            <tbody>
              {FUNDS.map((f) => {
                const o = settings.priceOverrides[f.code];
                return (
                  <tr key={f.code} className="border-b border-slate-100">
                    <td className="py-1.5">{f.name} <span className="text-xs text-slate-400">{f.code}</span></td>
                    <td className="py-1.5 text-right"><Pct v={f.targetWeight} digits={0} /></td>
                    <td className="py-1.5 text-right"><Pct v={f.feeRate} digits={2} /></td>
                    <td className="num py-1.5 text-right">{nav ? nav.latestPrices[f.code].toFixed(3) : '—'} <span className="text-xs text-slate-400">{nav?.byCode[f.code].last}</span></td>
                    <td className="py-1.5 text-right">
                      <input
                        type="number"
                        step={0.001}
                        className={`${inputCls} num w-28 text-right`}
                        value={o?.price ?? ''}
                        placeholder="留空用行情"
                        onChange={(e) => setPriceOverride(f.code, e.target.value === '' ? undefined : { price: Number(e.target.value), date: dayjs().format('YYYY-MM-DD') })}
                      />
                    </td>
                    <td className="py-1.5 text-right">{o && <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => setPriceOverride(f.code, undefined)}>清除</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">行情由脚本每周抓取后随网页发布（腾讯财经前复权收盘价）。再平衡日若行情未更新，可从券商 App 查最新价填在这里，计算会优先使用手动价。</p>
      </Card>

      <Card title="数据备份" className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={doExport}>导出备份 (JSON)</Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>导入备份</Button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => doImport(e.target.files?.[0])} />
          {!confirmClear ? (
            <Button variant="danger" onClick={() => setConfirmClear(true)}>清空所有数据</Button>
          ) : (
            <span className="flex items-center gap-2 text-sm">
              确定清空？此操作不可恢复。
              <Button variant="danger" onClick={() => { clearAll(); setConfirmClear(false); setMsg('已清空'); }}>确定</Button>
              <Button variant="ghost" onClick={() => setConfirmClear(false)}>取消</Button>
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">换设备或清理浏览器前请先导出备份。备份文件包含交易记录、再平衡记录和设置。</p>
      </Card>

      <Card title="松柏计划规则（来自课件）" className="mt-4">
        <ul className="space-y-1 text-sm text-slate-700">
          <li>· 目标配置：{FUNDS.map((f) => `${f.assetLabel} ${Math.round(f.targetWeight * 100)}%`).join('，')}。</li>
          <li>· 每隔 {PLAN.rebalanceIntervalMonths} 个月再平衡一次，周年日以首笔买入日为准。</li>
          <li>· 单次买入不超过家庭净资产的 {Math.round(PLAN.singleBuyCapRatio.conservative * 100)}%（保守）/ {Math.round(PLAN.singleBuyCapRatio.balanced * 100)}%（稳健）；首次投入建议 10-100 万。</li>
          <li>· 20 万以下一笔投入；50-100 万可分 12 月；100 万以上可分 2-3 年。</li>
          <li>· 预期年化 {Math.round(PLAN.expectedReturn.low * 100)}-{Math.round(PLAN.expectedReturn.high * 100)}%，普通回撤 15-20%，极端回撤 25-30%。</li>
        </ul>
      </Card>
    </div>
  );
}
