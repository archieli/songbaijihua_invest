/** 整手取整与佣金估算 */

export type RoundMode = 'nearest' | 'floor' | 'ceil';

export function roundToLot(shares: number, lotSize: number, mode: RoundMode = 'nearest'): number {
  if (lotSize <= 1) return Math.round(shares);
  const lots = shares / lotSize;
  const n = mode === 'floor' ? Math.floor(lots) : mode === 'ceil' ? Math.ceil(lots) : Math.round(lots);
  return n * lotSize;
}

export function estimateFee(amount: number, rate: number, minFee = 0): number {
  if (amount <= 0) return 0;
  return Math.max(round2(amount * rate), minFee);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function fmtMoney(n: number, digits = 0): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}
