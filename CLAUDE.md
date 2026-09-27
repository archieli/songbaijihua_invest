# 松柏计划投资管理系统

面向"松柏计划"（中国股票 25% / 美国股票 25% / 30 年国债 15% / 主动债基 15% / 黄金 20%，场内 ETF，每年再平衡）的纯前端投资管理工具。
产品方案与痛点梳理见 `docs/PLAN.md`。

## 命令

```
npm run dev          # 本地开发 http://localhost:5173
npm test             # vitest，领域层单测（tests/domain）
npm run build        # tsc --noEmit + vite build → dist/
npm run fetch-nav    # 抓取行情到 public/data/nav/（--since 只补最近 30 天）
```

## 结构

- `src/config/funds.json` 基金表（代码、目标比例、费率、代理指数）。抓取脚本和前端都读它。
- `src/config/plan.ts` 松柏计划规则常量；带"课程"注释的来自课件，其余是工具默认值。
- `src/domain/` 纯函数，不依赖 React，必须有单测：
  - `rebalance.ts` 年度再平衡交易单（整手取整、现金不透支）
  - `cashflow.ts` 每月定投的现金流再平衡（只买不卖、补最低配）
  - `sizing.ts` 仓位规划（备用金、单次上限、分批、压力测试）
  - `schedule.ts` 周年锚点 = 首笔买入日，再平衡后 +12 个月；.ics 生成
  - `backtest.ts` 历史模拟（前复权、代理指数拼接、XIRR、滚动收益）
- `src/store/` zustand + localStorage（key `songbai-plan-v1`），只存交易、再平衡记录、设置。
- `src/pages/` 仪表盘 / 记账 / 再平衡 / 每月定投 / 仓位规划 / 历史模拟 / 示范账本 / 设置。
- `public/data/nav/*.json` 行情（腾讯财经 fqkline，前复权收盘），`public/data/model-ledger.json` 示范账本（管理员手工维护）。
- `scripts/fetch-nav.mjs` 行情抓取，每次最多 640 行按结束日期向前翻页。

## 约定

- 中文界面，移动端优先；hash 路由（GitHub Pages 友好）。
- 金额用 `Money`、比例用 `Pct` 组件；涨红跌绿（A 股习惯）。
- 修改领域逻辑先改/加 `tests/domain` 用例；再平衡以课件 P29 案例为基准。
- 不要把用户数据发到任何服务器；本工具不构成投资建议。
- 沙箱内无法访问行情接口，抓取需在沙箱外运行。
