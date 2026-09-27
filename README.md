# 松柏计划 · 投资管理工具

把松柏计划的执行环节自动化：再平衡提醒与交易单、每月定投买入单、仓位规划与压力测试、历史模拟、示范账本。纯前端静态站，数据只存在浏览器本地。

## 本地运行

```bash
npm install
npm run dev
```

## 更新行情

```bash
npm run fetch-nav            # 全量
npm run fetch-nav -- --since # 增量（最近 30 天）
```

行情来自腾讯财经日线（前复权收盘价），写入 `public/data/nav/`。仓库里的 GitHub Actions `update-nav.yml` 每周一自动抓取并提交。

## 部署到 GitHub Pages

1. 推送到 GitHub，仓库 Settings → Pages → Source 选 **GitHub Actions**。
2. `deploy.yml` 会在每次 push 到 `main` 时构建并发布。若仓库名不是 `<user>.github.io`，工作流已自动把 `VITE_BASE` 设为 `/<仓库名>/`。
3. 访问 `https://<user>.github.io/<仓库名>/`。

部署到 Vercel / Cloudflare Pages：构建命令 `npm run build`，输出目录 `dist`，无需设置 `VITE_BASE`。

## 维护示范账本

编辑 `public/data/model-ledger.json`，只写日期与操作类型（buy / add / rebalance / note），不写金额。

## 免责声明

本工具只做记账与计算，不构成投资建议；历史模拟不代表未来表现。
