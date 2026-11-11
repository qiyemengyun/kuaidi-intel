# 快递行业情报日报 · 自动化流水线

每天 08:00 检索 9 家快递公司过去 24 小时的价格调整 / 活动公告 / 政策变化，去重后生成一份 Markdown 日报，并自动重建为可点击来源链接的单页 HTML。

覆盖公司：中通、圆通、申通、韵达、极兔、顺丰、京东物流、德邦、邮政 EMS。

```
kuaidi-intel/
├── prompt.txt                   # 每日任务的完整指令模板（喂给 Agent）
├── output/
│   └── daily-YYYY-MM-DD.md      # 每日日报（数据）
├── docs/
│   └── index.html               # 由最新 md 生成的可发布网页（GitHub Pages 源）
├── tools/
│   ├── md2html.mjs              # md -> 单页 HTML（零依赖，样式全内联）
│   └── serve-report.mjs         # 只读静态服务，局域网可访问
└── scripts/
    ├── show-report.vbs          # 重建并打开页面（桌面快捷方式）
    ├── start-report-server.vbs  # 后台启动局域网服务（开机自启）
    └── allow-port-8000.cmd      # 放行 Windows 防火墙入站 TCP 8000（需管理员）
```

## 工作方式

1. **采集**：Agent 用搜索工具按 `prompt.txt` 抓取公开报道与公司公告，逐条打开原文核对发布日期。
2. **成稿**：写入 `output/daily-YYYY-MM-DD.md`，来源列必须是可点击的真实链接；窗口内的存量旧闻会显式标注“非今日新增”。
3. **发布**：`node tools/md2html.mjs --latest` 读取最新的 `daily-*.md`，生成 `docs/index.html`；同一地址永远显示最新一期。
4. **分发**（任选其一）：
   - 本地：双击 `scripts/show-report.vbs`，或直接打开 `docs/index.html`
   - 局域网：`node tools/serve-report.mjs` 后访问 `http://<主机名>:8000`（需先跑一次 `allow-port-8000.cmd`）
   - 公网：推送到 GitHub 仓库，开启 Pages（分支 `main`，目录 `/docs`）

## 手动使用

```bash
# 生成网页（默认取 output 下最新的 daily-*.md）
node tools/md2html.mjs --latest

# 指定某个文件
node tools/md2html.mjs output/daily-2026-11-11.md

# 局域网静态服务（默认 8000，可用 REPORT_PORT 覆盖）
node tools/serve-report.mjs
```

## 环境要求

- Node.js 18+（只用了内置模块，无 npm 依赖）
- Windows：`scripts/*.vbs` 用 `wscript` 运行；`allow-port-8000.cmd` 需管理员权限
- 定时任务：本仓库配套的每日 08:00 任务由 DeepSeek Harness 的定时功能驱动，指令见 `prompt.txt`；也可用系统计划任务调用任意 Agent CLI 复现同一流程

## 说明与边界

- 数据全部来自公开报道，**非全量监测**：没搜到的公司不等于没有发布调价函（线下《告客户书》通常不上网）。
- 同一事件只保留最早 / 最权威来源，避免多家转载被当成多条新闻。
- 价格为公开报道口径，个别幅度来自研报估算，已在表格中标注来源类型。
