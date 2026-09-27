#!/usr/bin/env node
/**
 * 抓取松柏计划五只基金（及代理指数）的前复权日线收盘价，写入 public/data/nav/{symbol}.json。
 *
 * 数据源：腾讯财经 fqkline 接口（前复权，含分红再投资效果）。
 * 每次最多返回 640 行，按结束日期向前翻页直到没有数据。
 *
 * 用法：node scripts/fetch-nav.mjs            # 全量抓取
 *       node scripts/fetch-nav.mjs --since     # 只补最近 30 天（增量）
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'data', 'nav');
const PAGE = 640;
const incremental = process.argv.includes('--since');

const { funds } = JSON.parse(await readFile(path.join(ROOT, 'src/config/funds.json'), 'utf8'));

/** 需要抓取的标的：基金本身 + 代理指数 */
const targets = [];
for (const f of funds) {
  targets.push({ symbol: `${f.market}${f.code}`, name: f.name, kind: 'fund' });
  if (f.proxy) targets.push({ symbol: f.proxy.symbol, name: f.proxy.name, kind: 'proxy' });
}
const uniq = new Map(targets.map((t) => [t.symbol, t]));

function fmt(d) {
  return d.toISOString().slice(0, 10);
}
function shiftDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

async function fetchPage(symbol, begin, end) {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,${begin},${end},${PAGE},qfq`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${symbol} HTTP ${res.status}`);
  const json = await res.json();
  const node = json?.data?.[symbol] ?? {};
  const rows = node.qfqday ?? node.day ?? [];
  const displayName = node.qt?.[symbol]?.[1];
  // 行格式：[date, open, close, high, low, volume]
  return { rows: rows.map((r) => [r[0], Number(r[2])]), displayName };
}

async function fetchAll(symbol) {
  const series = [];
  let end = fmt(new Date());
  let displayName;
  // 从今天向前翻页
  for (let i = 0; i < 60; i++) {
    const { rows, displayName: dn } = await fetchPage(symbol, '2000-01-01', end);
    if (dn) displayName = dn;
    if (rows.length === 0) break;
    series.unshift(...rows);
    if (rows.length < PAGE) break;
    end = shiftDays(rows[0][0], -1);
  }
  // 去重并按日期升序
  const map = new Map(series);
  const sorted = [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { series: sorted, displayName };
}

async function fetchRecent(symbol, existing) {
  const end = fmt(new Date());
  const begin = shiftDays(end, -30);
  const { rows, displayName } = await fetchPage(symbol, begin, end);
  const map = new Map(existing);
  for (const r of rows) map.set(r[0], r[1]);
  return { series: [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)), displayName };
}

await mkdir(OUT_DIR, { recursive: true });

for (const t of uniq.values()) {
  const file = path.join(OUT_DIR, `${t.symbol}.json`);
  let existing = [];
  if (incremental) {
    try {
      existing = JSON.parse(await readFile(file, 'utf8')).series;
    } catch {
      /* 没有旧文件则全量 */
    }
  }
  const { series, displayName } =
    incremental && existing.length ? await fetchRecent(t.symbol, existing) : await fetchAll(t.symbol);
  if (series.length === 0) {
    console.error(`!! ${t.symbol} 没有拿到数据`);
    process.exitCode = 1;
    continue;
  }
  const out = {
    symbol: t.symbol,
    name: t.name,
    displayName: displayName ?? t.name,
    kind: t.kind,
    updatedAt: new Date().toISOString(),
    first: series[0][0],
    last: series[series.length - 1][0],
    series,
  };
  await writeFile(file, JSON.stringify(out));
  console.log(`${t.symbol.padEnd(9)} ${String(series.length).padStart(5)} rows  ${out.first} → ${out.last}  ${t.name}`);
}

// 汇总索引，前端只需读这一个文件就知道有哪些标的和最新日期
const index = {};
for (const t of uniq.values()) {
  try {
    const j = JSON.parse(await readFile(path.join(OUT_DIR, `${t.symbol}.json`), 'utf8'));
    index[t.symbol] = { name: j.name, kind: j.kind, first: j.first, last: j.last, updatedAt: j.updatedAt };
  } catch {
    /* skip */
  }
}
await writeFile(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2));
console.log('done.');
