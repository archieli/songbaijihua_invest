import { useState } from 'react';
import type { AssetClass } from '@/config/plan';

/** 经典仓位配置色：股票蓝系、债券绿系、黄金金色（低饱和，贴合冬眠行动气质） */
export const ASSET_COLORS: Record<AssetClass, string> = {
  cn_stock: '#4a6fa5',
  us_stock: '#86a3c9',
  cn_bond_long: '#4f8767',
  cn_bond: '#9dbfae',
  gold: '#c9a54a',
};

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  weight: number;
  color: string;
}

/**
 * 纯 SVG 环形图：外环为实际占比，内侧细环为目标占比，便于一眼看出偏离。
 */
export function AllocationDonut({ slices, targets, centerTop, centerBottom }: { slices: DonutSlice[]; targets: DonutSlice[]; centerTop: string; centerBottom: string }) {
  const [hover, setHover] = useState<string>();
  const size = 220;
  const c = size / 2;
  const rOuter = 92;
  const rInner = 66;
  const wOuter = 22;
  const wInner = 8;

  const ring = (items: DonutSlice[], r: number, w: number, dim: boolean) => {
    const circ = 2 * Math.PI * r;
    let offset = 0;
    return items.map((s) => {
      const len = Math.max(0, s.weight) * circ;
      const el = (
        <circle
          key={s.key}
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={s.color}
          strokeWidth={w}
          strokeDasharray={`${Math.max(0, len - 2)} ${circ - Math.max(0, len - 2)}`}
          strokeDashoffset={-offset}
          opacity={dim ? 0.35 : hover && hover !== s.key ? 0.35 : 1}
          style={{ transition: 'opacity .25s' }}
          onMouseEnter={() => setHover(s.key)}
          onMouseLeave={() => setHover(undefined)}
        >
          <title>{`${s.label}：${(s.weight * 100).toFixed(1)}%`}</title>
        </circle>
      );
      offset += len;
      return el;
    });
  };

  const active = slices.find((s) => s.key === hover);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="mx-auto block max-w-full" style={{ transform: 'rotate(-90deg)' }}>
      {/* 底环 */}
      <circle cx={c} cy={c} r={rOuter} fill="none" stroke="#eeece6" strokeWidth={wOuter} />
      <circle cx={c} cy={c} r={rInner} fill="none" stroke="#eeece6" strokeWidth={wInner} />
      {ring(targets, rInner, wInner, true)}
      {ring(slices, rOuter, wOuter, false)}
      <g style={{ transform: 'rotate(90deg)', transformOrigin: `${c}px ${c}px` }}>
        <text x={c} y={c - 6} textAnchor="middle" fontSize="11" fill="#77756c">{active ? active.label : centerTop}</text>
        <text x={c} y={c + 14} textAnchor="middle" fontSize="18" fontWeight="600" fill="#302f2a">{active ? `${(active.weight * 100).toFixed(1)}%` : centerBottom}</text>
      </g>
    </svg>
  );
}
