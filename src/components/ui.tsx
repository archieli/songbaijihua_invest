import type { ReactNode } from 'react';
import { fmtMoney, fmtPct } from '@/domain/lots';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-pine-800">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ title, children, className = '', right }: { title?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`rounded-xl border border-slate-200/70 bg-white p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-slate-800">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'up' | 'down' | 'muted' }) {
  const color = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : tone === 'muted' ? 'text-slate-500' : 'text-slate-900';
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`num mt-0.5 text-lg font-semibold ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Money({ v, digits = 0, sign = false }: { v: number; digits?: number; sign?: boolean }) {
  const s = fmtMoney(Math.abs(v), digits);
  const prefix = v < 0 ? '-' : sign && v > 0 ? '+' : '';
  return <span className="num">{prefix}{s}</span>;
}

export function Pct({ v, digits = 1, sign = false, colored = false }: { v: number; digits?: number; sign?: boolean; colored?: boolean }) {
  const cls = colored ? (v > 0 ? 'text-up' : v < 0 ? 'text-down' : '') : '';
  return <span className={`num ${cls}`}>{sign && v > 0 ? '+' : ''}{fmtPct(v, digits)}</span>;
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'blue' | 'green' | 'red' | 'amber' }) {
  const map = {
    gray: 'bg-slate-100 text-slate-600',
    blue: 'bg-pine-50 text-pine-700',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${map[tone]}`}>{children}</span>;
}

export function Alert({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'danger' | 'success'; title?: string; children: ReactNode }) {
  const map = {
    info: 'border-pine-200 bg-pine-50 text-pine-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };
  return (
    <div className={`rounded-lg border px-3 py-2.5 text-sm ${map[tone]}`}>
      {title && <div className="mb-0.5 font-semibold">{title}</div>}
      <div>{children}</div>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const map = {
    primary: 'bg-pine-600 text-white hover:bg-pine-700 disabled:bg-slate-300',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400',
    danger: 'border border-red-300 bg-white text-red-700 hover:bg-red-50',
    ghost: 'text-pine-700 hover:bg-pine-50',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${map[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-pine-500 focus:ring-2 focus:ring-pine-100';

export function NumberInput({
  value,
  onChange,
  step,
  min,
  placeholder,
  suffix,
}: {
  value: number | '';
  onChange: (v: number | '') => void;
  step?: number;
  min?: number;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        className={`${inputCls} num ${suffix ? 'pr-10' : ''}`}
        value={value}
        step={step}
        min={min}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      />
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">{suffix}</span>}
    </div>
  );
}

/** 实际占比 vs 目标占比的偏离条 */
export function DriftBar({ weight, target }: { weight: number; target: number }) {
  const max = Math.max(target * 1.6, weight, 0.01);
  const w = Math.min(100, (weight / max) * 100);
  const t = Math.min(100, (target / max) * 100);
  const over = weight > target + 0.005;
  const under = weight < target - 0.005;
  return (
    <div className="relative h-2.5 w-full rounded-full bg-slate-100">
      <div className={`absolute inset-y-0 left-0 rounded-full ${over ? 'bg-up/70' : under ? 'bg-amber-400' : 'bg-pine-500'}`} style={{ width: `${w}%` }} />
      <div className="absolute inset-y-[-3px] w-0.5 bg-slate-700" style={{ left: `${t}%` }} title={`目标 ${fmtPct(target, 0)}`} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">{children}</div>;
}
