import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import { buildRebalanceIcs, computeSchedule } from '@/domain/schedule';
import type { Transaction } from '@/domain/types';

const tx = (date: string, side: 'buy' | 'sell' = 'buy'): Transaction => ({
  id: date + side,
  date,
  code: '518880',
  side,
  shares: 100,
  price: 8,
  fee: 0,
  source: 'manual',
});

describe('computeSchedule', () => {
  it('锚点为首笔买入日，中途加仓不改变', () => {
    const s = computeSchedule([tx('2025-09-08'), tx('2026-03-01'), tx('2026-06-15')], [], dayjs('2026-08-01'));
    expect(s.anchorDate).toBe('2025-09-08');
    expect(s.nextRebalanceDate).toBe('2026-09-08');
    expect(s.level).toBe('none');
  });

  it('到期前 7 天提醒、当天到期、之后逾期', () => {
    const txs = [tx('2025-09-08')];
    expect(computeSchedule(txs, [], dayjs('2026-09-01')).level).toBe('upcoming');
    expect(computeSchedule(txs, [], dayjs('2026-09-08')).level).toBe('due');
    expect(computeSchedule(txs, [], dayjs('2026-09-20')).level).toBe('overdue');
    expect(computeSchedule(txs, [], dayjs('2026-09-20')).daysLeft).toBe(-12);
  });

  it('完成再平衡后，下一次 = 再平衡日 + 1 年', () => {
    const s = computeSchedule([tx('2025-09-08')], [{ id: 'r1', date: '2026-09-10', txIds: [] }], dayjs('2026-10-01'));
    expect(s.nextRebalanceDate).toBe('2027-09-10');
    expect(s.completed).toBe(1);
  });

  it('没有买入时提示未开始', () => {
    expect(computeSchedule([], []).level).toBe('not_started');
  });

  it('生成年度循环 ics', () => {
    const ics = buildRebalanceIcs('2026-09-08');
    expect(ics).toContain('RRULE:FREQ=YEARLY');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260908');
  });
});
