import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PLAN, type IncomeStability, type RiskProfile } from '@/config/plan';
import { useStore } from '@/store';
import { computeSizing } from '@/domain/sizing';
import { Alert, Button, Card, Field, Money, NumberInput, PageHeader, Pct, Stat, inputCls } from '@/components/ui';

export default function Sizing() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);

  const [h, setH] = useState({ ...settings.household });
  const [risk, setRisk] = useState<RiskProfile>(settings.riskProfile);
  const [stab, setStab] = useState<IncomeStability>(settings.incomeStability);
  const [ratio, setRatio] = useState(settings.monthlySaveRatio);
  const [planned, setPlanned] = useState<number | ''>('');
  const [saved, setSaved] = useState(false);

  const result = useMemo(
    () => computeSizing({ ...h, riskProfile: risk, incomeStability: stab, monthlySaveRatio: ratio, plannedAmount: planned === '' ? undefined : planned }),
    [h, risk, stab, ratio, planned],
  );
  const filled = h.netAssets > 0;

  const save = () => {
    updateSettings({ household: h, riskProfile: risk, incomeStability: stab, monthlySaveRatio: ratio });
    setSaved(true);
  };
  const num = (k: keyof typeof h) => (v: number | '') => { setH({ ...h, [k]: v === '' ? 0 : v }); setSaved(false); };

  return (
    <div>
      <PageHeader title="仓位规划" subtitle="核心原则：最大回撤发生时，财务和心理都扛得住，不被迫在低点割肉。填写家庭财务情况，系统给出这次能投多少、要不要分批。" />

      <div className="grid gap-4 md:grid-cols-5">
        <Card title="家庭财务" className="md:col-span-2">
          <div className="space-y-3">
            <Field label="家庭净资产" hint="资产减负债，含房产"><NumberInput value={h.netAssets || ''} onChange={num('netAssets')} step={100000} suffix="元" /></Field>
            <Field label="可变现的流动资产" hint="现金、存款、货基、理财等"><NumberInput value={h.liquidAssets || ''} onChange={num('liquidAssets')} step={10000} suffix="元" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="月收入"><NumberInput value={h.monthlyIncome || ''} onChange={num('monthlyIncome')} step={1000} suffix="元" /></Field>
              <Field label="月支出"><NumberInput value={h.monthlyExpense || ''} onChange={num('monthlyExpense')} step={1000} suffix="元" /></Field>
            </div>
            <Field label="3 年内确定要用的钱" hint="购房、教育、医疗等"><NumberInput value={h.shortTermNeeds || ''} onChange={num('shortTermNeeds')} step={10000} suffix="元" /></Field>
            <Field label="已投入松柏计划的市值"><NumberInput value={h.existingPlanValue || ''} onChange={num('existingPlanValue')} step={10000} suffix="元" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="风险类型">
                <select className={inputCls} value={risk} onChange={(e) => { setRisk(e.target.value as RiskProfile); setSaved(false); }}>
                  <option value="conservative">保守型（单次 ≤ 5%）</option>
                  <option value="balanced">稳健型（单次 ≤ 10%）</option>
                </select>
              </Field>
              <Field label="收入稳定性">
                <select className={inputCls} value={stab} onChange={(e) => { setStab(e.target.value as IncomeStability); setSaved(false); }}>
                  <option value="stable">稳定（备用金 6 个月）</option>
                  <option value="average">一般（9 个月）</option>
                  <option value="unstable">不稳定（12 个月）</option>
                </select>
              </Field>
            </div>
            <Field label={`每月结余投入比例：${Math.round(ratio * 100)}%`} hint="工具默认 50%，非课程规则">
              <input type="range" min={0} max={100} step={5} value={ratio * 100} onChange={(e) => { setRatio(Number(e.target.value) / 100); setSaved(false); }} className="w-full accent-pine-600" />
            </Field>
            <Field label="本次计划投入（可选）" hint="留空则用系统建议"><NumberInput value={planned} onChange={setPlanned} step={10000} suffix="元" /></Field>
            <Button onClick={save} className="w-full">{saved ? '已保存' : '保存到设置'}</Button>
          </div>
        </Card>

        <div className="space-y-4 md:col-span-3">
          {!filled ? (
            <Alert tone="info">填写左侧家庭财务后，这里会给出可投金额、分批方案和压力测试。所有数据只保存在本机浏览器。</Alert>
          ) : (
            <>
              {result.warnings.map((w, i) => <Alert key={i} tone="danger">{w}</Alert>)}
              {result.tips.map((t, i) => <Alert key={i} tone="info">{t}</Alert>)}

              <div className="grid grid-cols-2 gap-3">
                <Stat label={`紧急备用金（${result.emergencyMonths} 个月支出）`} value={<Money v={result.emergencyFund} />} sub="先留出来，不参与投资" />
                <Stat label="现在可投入的长期资金" value={<Money v={result.investableNow} />} sub="流动资产 − 备用金 − 短期用款" tone={result.investableNow > 0 ? undefined : 'muted'} />
                <Stat label={`单次买入上限（净资产 ${Math.round(PLAN.singleBuyCapRatio[risk] * 100)}%）`} value={<Money v={result.singleBuyCap} />} sub="课程规则" />
                <Stat label="建议每月定投" value={<Money v={result.monthlyContribution} />} sub={`月结余 ${result.monthlySurplus.toLocaleString()} × ${Math.round(ratio * 100)}%`} />
              </div>

              <Card title="本次投入与分批方案">
                <div className="mb-2 text-sm">
                  计划投入 <b className="num"><Money v={result.plannedAmount} /></b> 元 →{' '}
                  <b>{result.batch.mode === 'lump' ? '一笔投入' : result.batch.mode === 'monthly' ? `分 ${result.batch.parts} 个月，每月 ${result.batch.perPart.toLocaleString()} 元` : `分 ${result.batch.parts} 年，每年 ${result.batch.perPart.toLocaleString()} 元`}</b>
                </div>
                <p className="text-xs text-slate-500">{result.batch.reason}</p>
                <p className="mt-2 text-xs text-slate-500">未来 12 个月可投总额约 <Money v={result.annualCapacity} /> 元（现在可投 + 12 个月定投）。不必精确择时，长期持有才是决定收益的关键。</p>
                <div className="mt-3"><Link to="/ledger" className="text-sm text-pine-700 underline">去记账页"按比例买入"生成份数 →</Link></div>
              </Card>

              <Card title="压力测试：这笔钱跌了你扛得住吗">
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr className="border-b border-slate-200"><th className="py-1.5 text-left font-medium">情景</th><th className="py-1.5 text-right font-medium">账面亏损</th><th className="py-1.5 text-right font-medium">剩余市值</th><th className="py-1.5 text-right font-medium">占净资产</th></tr>
                  </thead>
                  <tbody>
                    {result.stress.map((s) => (
                      <tr key={s.drop} className="border-b border-slate-100">
                        <td className="py-1.5">{s.drop === 0.15 ? '普通回撤 -15%' : s.drop === 0.2 ? '做好准备 -20%' : '极端情况 -30%（2008 级别）'}</td>
                        <td className="num py-1.5 text-right text-up">-<Money v={s.loss} /></td>
                        <td className="num py-1.5 text-right"><Money v={s.remaining} /></td>
                        <td className="py-1.5 text-right"><Pct v={s.pctOfNetAssets} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-slate-500">课程自测：投入 100 万，下跌 20%，暂时亏损 20 万，我能否安然持有不动？答不了"能"，就把金额调小。过去 20 年组合经历过多次 15-20% 回撤，金融危机时接近 30%。</p>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
