import dayjs from 'dayjs';
import { PLAN } from '@/config/plan';
import type { RebalanceRecord, Transaction } from './types';
import { firstBuyDate } from './portfolio';

export type ReminderLevel = 'none' | 'upcoming' | 'due' | 'overdue' | 'not_started';

export interface Schedule {
  /** 锚点 = 首笔买入日 */
  anchorDate?: string;
  lastRebalanceDate?: string;
  nextRebalanceDate?: string;
  daysLeft?: number;
  level: ReminderLevel;
  message: string;
  /** 已完成再平衡次数 */
  completed: number;
}

/**
 * 锚点规则：
 * - 周年日以首笔买入日为准，中途加仓/定投不改变锚点；
 * - 每完成一次再平衡，下一次 = 本次再平衡日 + 12 个月。
 */
export function computeSchedule(txs: Transaction[], records: RebalanceRecord[], today = dayjs()): Schedule {
  const anchorDate = firstBuyDate(txs);
  if (!anchorDate) {
    return { level: 'not_started', message: '还没有记录首笔买入。录入后系统会自动计算再平衡日期。', completed: 0 };
  }
  const done = [...records].sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = done.length ? done[done.length - 1].date : undefined;
  const base = last ?? anchorDate;
  const next = dayjs(base).add(PLAN.rebalanceIntervalMonths, 'month');
  const daysLeft = next.startOf('day').diff(today.startOf('day'), 'day');

  let level: ReminderLevel = 'none';
  let message = `下次再平衡：${next.format('YYYY-MM-DD')}，还有 ${daysLeft} 天。中途加仓不影响这个日期。`;
  if (daysLeft < 0) {
    level = 'overdue';
    message = `再平衡已逾期 ${-daysLeft} 天（应于 ${next.format('YYYY-MM-DD')} 执行）。请到"再平衡"页生成交易单。`;
  } else if (daysLeft === 0) {
    level = 'due';
    message = '今天是年度再平衡日。请到"再平衡"页生成交易单并执行。';
  } else if (daysLeft <= PLAN.reminderLeadDays) {
    level = 'upcoming';
    message = `${daysLeft} 天后（${next.format('YYYY-MM-DD')}）到年度再平衡日，请提前准备资金与时间。`;
  }
  return {
    anchorDate,
    lastRebalanceDate: last,
    nextRebalanceDate: next.format('YYYY-MM-DD'),
    daysLeft,
    level,
    message,
    completed: done.length,
  };
}

/** 生成年度循环的 .ics 日历事件，可导入手机日历作为提醒 */
export function buildRebalanceIcs(nextDate: string, title = '松柏计划 · 年度再平衡'): string {
  const d = dayjs(nextDate);
  const stamp = dayjs().format('YYYYMMDDTHHmmss[Z]');
  const uid = `songbai-rebalance-${d.format('YYYYMMDD')}@songbai`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//songbai//rebalance//CN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d.format('YYYYMMDD')}`,
    `DTEND;VALUE=DATE:${d.add(1, 'day').format('YYYYMMDD')}`,
    'RRULE:FREQ=YEARLY',
    `SUMMARY:${title}`,
    'DESCRIPTION:打开松柏计划管理页，生成再平衡交易单并执行。',
    'BEGIN:VALARM',
    'TRIGGER:-P7D',
    'ACTION:DISPLAY',
    'DESCRIPTION:一周后是松柏计划年度再平衡日',
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:PT9H',
    'ACTION:DISPLAY',
    'DESCRIPTION:今天是松柏计划年度再平衡日',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
