import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PLAN, type IncomeStability, type RiskProfile } from '@/config/plan';
import type { RebalanceRecord, Transaction } from '@/domain/types';
import type { HouseholdInput } from '@/domain/sizing';

export interface PriceOverride {
  price: number;
  date: string;
}

export interface Settings {
  commissionRate: number;
  minCommission: number;
  riskProfile: RiskProfile;
  incomeStability: IncomeStability;
  monthlySaveRatio: number;
  household: Omit<HouseholdInput, 'riskProfile' | 'incomeStability' | 'monthlySaveRatio'>;
  /** 手动覆盖的价格（行情滞后时使用） */
  priceOverrides: Record<string, PriceOverride>;
  /** 每月定投不足一手的结转余额 */
  carryOver: number;
  /** 打开页面时是否用浏览器通知提醒再平衡 */
  browserNotify: boolean;
}

export interface ExportedData {
  version: 1;
  exportedAt: string;
  transactions: Transaction[];
  rebalances: RebalanceRecord[];
  settings: Settings;
}

interface State {
  transactions: Transaction[];
  rebalances: RebalanceRecord[];
  settings: Settings;
  addTransactions: (txs: Omit<Transaction, 'id'>[]) => Transaction[];
  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  removeTransaction: (id: string) => void;
  addRebalance: (r: Omit<RebalanceRecord, 'id'>) => void;
  removeRebalance: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setPriceOverride: (code: string, o?: PriceOverride) => void;
  exportData: () => ExportedData;
  importData: (data: ExportedData) => void;
  clearAll: () => void;
}

export const DEFAULT_SETTINGS: Settings = {
  commissionRate: PLAN.defaultCommissionRate,
  minCommission: PLAN.defaultMinCommission,
  riskProfile: 'balanced',
  incomeStability: 'stable',
  monthlySaveRatio: PLAN.defaultMonthlySaveRatio,
  household: {
    netAssets: 0,
    liquidAssets: 0,
    monthlyIncome: 0,
    monthlyExpense: 0,
    shortTermNeeds: 0,
    existingPlanValue: 0,
  },
  priceOverrides: {},
  carryOver: 0,
  browserNotify: false,
};

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      transactions: [],
      rebalances: [],
      settings: DEFAULT_SETTINGS,
      addTransactions: (txs) => {
        const created = txs.map((t) => ({ ...t, id: newId() }));
        set((s) => ({ transactions: [...s.transactions, ...created] }));
        return created;
      },
      updateTransaction: (id, patch) =>
        set((s) => ({ transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      removeTransaction: (id) => set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),
      addRebalance: (r) => set((s) => ({ rebalances: [...s.rebalances, { ...r, id: newId() }] })),
      removeRebalance: (id) => set((s) => ({ rebalances: s.rebalances.filter((r) => r.id !== id) })),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setPriceOverride: (code, o) =>
        set((s) => {
          const priceOverrides = { ...s.settings.priceOverrides };
          if (o) priceOverrides[code] = o;
          else delete priceOverrides[code];
          return { settings: { ...s.settings, priceOverrides } };
        }),
      exportData: () => {
        const { transactions, rebalances, settings } = get();
        return { version: 1, exportedAt: new Date().toISOString(), transactions, rebalances, settings };
      },
      importData: (data) => {
        if (!data || data.version !== 1 || !Array.isArray(data.transactions)) throw new Error('文件格式不正确');
        set({
          transactions: data.transactions,
          rebalances: data.rebalances ?? [],
          settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}), household: { ...DEFAULT_SETTINGS.household, ...(data.settings?.household ?? {}) } },
        });
      },
      clearAll: () => set({ transactions: [], rebalances: [], settings: DEFAULT_SETTINGS }),
    }),
    {
      name: 'songbai-plan-v1',
      version: 1,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        return {
          ...current,
          ...p,
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}), household: { ...DEFAULT_SETTINGS.household, ...(p.settings?.household ?? {}) } },
        };
      },
    },
  ),
);
