import { Suspense, lazy } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Ledger from './pages/Ledger';
import Rebalance from './pages/Rebalance';
import MonthlyInvest from './pages/MonthlyInvest';
import Sizing from './pages/Sizing';
import ModelLedger from './pages/ModelLedger';
import Settings from './pages/Settings';

// 图表库较大，历史模拟页按需加载
const Simulator = lazy(() => import('./pages/Simulator'));

const NAV = [
  { to: '/', label: '松柏计划', icon: '◎' },
  { to: '/ledger', label: '记账', icon: '▤' },
  { to: '/rebalance', label: '再平衡', icon: '⇄' },
  { to: '/monthly', label: '每月定投', icon: '⤴' },
  { to: '/sizing', label: '仓位规划', icon: '◔' },
  { to: '/simulator', label: '历史模拟', icon: '∿' },
  { to: '/model', label: '示范账本', icon: '☰' },
  { to: '/settings', label: '设置', icon: '⚙' },
];

export default function App() {
  return (
    <div className="min-h-dvh md:flex">
      {/* 桌面侧栏 */}
      <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white md:block">
        <div className="px-5 py-5">
          <div className="text-lg font-bold text-pine-700">冬眠行动</div>
          <div className="text-xs text-slate-500">松柏计划持有助手</div>
          <div className="mt-2 text-xs text-pine-500">穿越寒冬，安心持有</div>
        </div>
        <nav className="px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-pine-50 font-medium text-pine-700' : 'text-slate-600 hover:bg-slate-50'}`
              }
            >
              <span className="w-4 text-center text-xs opacity-70">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6 px-5 text-xs leading-relaxed text-slate-400">
          数据只保存在本机浏览器。
          <br />
          本工具不构成投资建议。
        </div>
      </aside>

      {/* 移动端顶栏 */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur md:hidden" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="text-base font-bold text-pine-700">冬眠行动</div>
          <div className="text-xs text-slate-500">穿越寒冬，安心持有</div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `shrink-0 rounded-full px-3 py-1 text-xs ${isActive ? 'bg-pine-600 text-white' : 'bg-slate-100 text-slate-600'}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-7">
        <div className="mx-auto max-w-5xl">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/rebalance" element={<Rebalance />} />
            <Route path="/monthly" element={<MonthlyInvest />} />
            <Route path="/sizing" element={<Sizing />} />
            <Route path="/simulator" element={<Suspense fallback={<div className="py-10 text-center text-sm text-slate-400">加载中…</div>}><Simulator /></Suspense>} />
            <Route path="/model" element={<ModelLedger />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
