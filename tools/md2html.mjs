#!/usr/bin/env node
// 把最新的日报 Markdown 转成一张离线可用的网页（无外部依赖、无 CDN）。
// 用法：node md2html.mjs [--latest | <某个 md 路径>]
// 输出：output/index.html

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = join(ROOT, 'output');
const DOCS_DIR = join(ROOT, 'docs');
const TZ_NOTE = 'Asia/Shanghai';
const HOST_NAME = (process.env.COMPUTERNAME || 'localhost').toLowerCase();

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

function pickLatest() {
  const files = readdirSync(OUT_DIR)
    .filter((f) => /^daily-.*\.md$/i.test(f))
    .map((f) => ({ f, t: statSync(join(OUT_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!files.length) throw new Error(`没有找到任何 daily-*.md：${OUT_DIR}`);
  return join(OUT_DIR, files[0].f);
}

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(src) {
  const codes = [];
  let s = src.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^()\s]+)\)/g, (_, text, url) => {
    let href = url;
    if (!/^https?:/i.test(href)) href = 'https://' + href.replace(/^\/+/, '');
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });
  s = s.replace(/<a ([^>]*)>/g, '<a $1>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
  return s;
}

function splitRow(line) {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let cur = '';
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '[') depth++;
    if (ch === ']') depth = Math.max(0, depth - 1);
    if (ch === '|' && depth === 0) {
      cells.push(cur);
      cur = '';
    } else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

const isTableSep = (line) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');

function renderTable(lines) {
  const head = splitRow(lines[0]);
  const body = lines.slice(2).map(splitRow);
  const cls = head.some((h) => /内容摘要/.test(h))
    ? 't-abstract'
    : head.some((h) => /调整内容/.test(h))
      ? 't-change'
      : head.some((h) => /摘要/.test(h))
        ? 't-summary'
        : 't-basic';
  const th = head.map((c) => `<th>${inline(c)}</th>`).join('');
  const tr = body
    .filter((r) => r.length)
    .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
    .join('\n');
  return `<div class="table-wrap"><table class="${cls}"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

function renderQuote(lines) {
  const block = [];
  for (const raw of lines) {
    const t = raw.replace(/^\s*>\s?/, '');
    if (!t.trim()) {
      block.push('');
      continue;
    }
    const m = t.match(/^\s*[-*]\s+(.*)$/);
    if (m) block.push(`\u0001LI\u0001${m[1]}`);
    else block.push(t);
  }
  let html = '';
  let ul = [];
  const flush = () => {
    if (ul.length) {
      html += `<ul>${ul.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`;
      ul = [];
    }
  };
  let para = [];
  const flushP = () => {
    if (para.length) {
      html += `<p>${para.map((x) => inline(x)).join('<br />')}</p>`;
      para = [];
    }
  };
  for (const line of block) {
    if (line.startsWith('\u0001LI\u0001')) {
      flushP();
      ul.push(line.slice(4));
    } else if (line === '') {
      flush();
      flushP();
    } else {
      flush();
      para.push(line);
    }
  }
  flush();
  flushP();
  return `<blockquote>${html}</blockquote>`;
}

function convert(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let title = '';
  let metaLines = [];
  let quoteAcc = [];
  let listAcc = [];
  let ordered = false;
  let para = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(' '))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (listAcc.length) {
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${listAcc.map((x) => `<li>${inline(x)}</li>`).join('')}</${tag}>`);
      listAcc = [];
    }
  };
  const flushQuote = () => {
    if (quoteAcc.length) {
      if (!metaLines.length && !out.length) metaLines = quoteAcc.slice();
      else out.push(renderQuote(quoteAcc));
      quoteAcc = [];
    }
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] ?? '';

    if (!line.trim()) {
      flushAll();
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushAll();
      const level = h[1].length;
      const text = inline(h[2]);
      if (level <= 2 && !title) {
        title = h[2].replace(/[*`]/g, '').trim();
        continue;
      }
      const id = `s${out.length}`;
      out.push(`<h${level} id="${id}">${text}</h${level}>`);
      continue;
    }
    if (/^\s*---+\s*$/.test(line)) {
      flushAll();
      out.push('<hr />');
      continue;
    }
    if (line.trim().startsWith('|') && isTableSep(next)) {
      flushAll();
      const block = [line];
      let j = i + 1;
      while (j < lines.length && lines[j].trim().startsWith('|')) block.push(lines[j++]);
      out.push(renderTable(block));
      i = j - 1;
      continue;
    }
    if (/^\s*>/.test(line)) {
      flushPara();
      flushList();
      quoteAcc.push(line);
      continue;
    }
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    const oli = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (li || oli) {
      flushPara();
      flushQuote();
      const isOrd = Boolean(oli);
      if (listAcc.length && ordered !== isOrd) flushList();
      ordered = isOrd;
      listAcc.push((li ?? oli)[1]);
      continue;
    }
    if (listAcc.length) flushList();
    if (quoteAcc.length) flushQuote();
    para.push(line.trim());
  }
  flushAll();

  return { title: title || '快递行业情报日报', metaLines, body: out.join('\n') };
}

function metaChips(metaLines) {
  const items = metaLines
    .map((l) => l.replace(/^\s*>\s?/, '').trim())
    .filter(Boolean);
  if (!items.length) return '';
  const rows = items
    .map((t) => {
      const m = t.match(/^([^：:]{2,8})[：:]\s*(.*)$/);
      const label = m ? m[1] : '说明';
      const value = m ? m[2] : t;
      return `<div class="meta-row"><b>${inline(label)}</b><span>${inline(value)}</span></div>`;
    })
    .join('\n');
  return `<div class="meta-panel">${rows}</div>`;
}

function nextRefresh(now) {
  const d = new Date(now);
  d.setHours(8, 0, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d;
}

const arg = process.argv[2];
const mdPath = !arg || arg === '--latest' ? pickLatest() : arg;
const md = readFileSync(mdPath, 'utf8');
const { title, metaLines, body } = convert(md);

const genMatch = md.match(/生成时间[：:]\s*([0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2})/);
const genTime = genMatch ? genMatch[1].replace('T', ' ') : fmt(statSync(mdPath).mtime);
const now = new Date();
const nr = nextRefresh(now);
const dateTag = (mdPath.match(/daily-(\d{4}-\d{2}-\d{2})/) ?? [, ''])[1];

const sections = [
  ['价格变动', '价格'],
  ['活动公告', '活动'],
  ['政策/其他', '政策'],
  ['无变动', '无变动'],
  ['去重与口径说明', '口径'],
];

// 给 h3 加锚点，方便顶栏跳转
let bodyWithIds = body;
for (const [name] of sections) {
  const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  bodyWithIds = bodyWithIds.replace(
    new RegExp(`<h3 id="(s\\d+)">${safe}</h3>`),
    `<h3 id="h-$1" data-sec="${name}">${name}</h3>`,
  );
}
const nav = sections
  .map(([name]) => {
    const m = bodyWithIds.match(new RegExp(`data-sec="${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    const id = bodyWithIds.match(new RegExp(`<h3 id="([^"]+)" data-sec="${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    return id ? `<a href="#${id[1]}">${name}</a>` : '';
  })
  .join('');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} · ${esc(dateTag)}</title>
<style>
  :root {
    --ink: #16202c;
    --muted: #64748b;
    --line: #e6ebf2;
    --brand: #1f6feb;
    --bg: #f6f8fb;
    --card: #ffffff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font: 15px/1.75 -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .page { max-width: 1080px; margin: 0 auto; padding: 28px 20px 64px; }
  header.hero {
    background: linear-gradient(135deg, #1f3c88 0%, #2f6df6 55%, #4aa8ff 100%);
    color: #fff;
    border-radius: 16px;
    padding: 26px 28px 22px;
    box-shadow: 0 12px 30px rgba(31, 60, 136, .18);
  }
  header.hero h1 { margin: 0 0 6px; font-size: 26px; line-height: 1.35; letter-spacing: .3px; }
  .sub { opacity: .85; font-size: 13.5px; }
  .badges { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  .badge {
    font-size: 12.5px;
    padding: 5px 11px;
    border-radius: 999px;
    background: rgba(255, 255, 255, .16);
    border: 1px solid rgba(255, 255, 255, .28);
    white-space: nowrap;
  }
  nav.jump {
    display: flex; flex-wrap: wrap; gap: 6px;
    margin: 18px 0 0;
  }
  nav.jump a {
    font-size: 13px; color: #2b3a55; text-decoration: none;
    background: #fff; border: 1px solid var(--line); border-radius: 8px;
    padding: 5px 12px;
  }
  nav.jump a:hover { border-color: #b9cdf5; background: #f4f8ff; color: var(--brand); }
  main.card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 30px 32px 34px;
    margin-top: 16px;
    box-shadow: 0 6px 20px rgba(22, 32, 44, .05);
  }
  main.card > h3 {
    font-size: 19px; margin: 34px 0 12px; padding-left: 12px;
    border-left: 4px solid var(--brand); line-height: 1.4;
  }
  main.card > h3:first-child { margin-top: 0; }
  h4 { font-size: 16px; margin: 22px 0 8px; }
  p { margin: 10px 0; }
  strong { font-weight: 650; }
  a { color: var(--brand); text-decoration: none; border-bottom: 1px solid rgba(31, 111, 235, .25); }
  a:hover { border-bottom-color: var(--brand); background: #f0f6ff; }
  code {
    font-family: Consolas, "Cascadia Mono", monospace;
    font-size: .92em; background: #f1f4f9; border: 1px solid #e3e9f2;
    border-radius: 5px; padding: 1px 5px;
  }
  .table-wrap { overflow-x: auto; margin: 14px 0 18px; border: 1px solid var(--line); border-radius: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 680px; }
  .t-abstract th:nth-child(4), .t-abstract td:nth-child(4) { min-width: 340px; }
  .t-change th:nth-child(3), .t-change td:nth-child(3) { min-width: 250px; }
  .t-change th:nth-child(1), .t-change td:nth-child(1) { white-space: nowrap; }
  .t-summary th:nth-child(3), .t-summary td:nth-child(3) { min-width: 300px; }
  .t-abstract th:last-child, .t-abstract td:last-child,
  .t-change th:last-child, .t-change td:last-child,
  .t-summary th:last-child, .t-summary td:last-child,
  .t-basic th:last-child, .t-basic td:last-child { min-width: 180px; }
  .t-abstract th:nth-child(2), .t-abstract td:nth-child(2),
  .t-summary th:nth-child(2), .t-summary td:nth-child(2) { min-width: 110px; }
  thead th {
    background: #f4f7fc; text-align: left; font-weight: 650; color: #2b3a55;
    padding: 11px 14px; border-bottom: 1px solid var(--line); white-space: nowrap;
  }
  tbody td { padding: 11px 14px; border-bottom: 1px solid #f0f3f8; vertical-align: top; }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:nth-child(even) { background: #fafcff; }
  tbody tr:hover { background: #f3f8ff; }
  blockquote {
    margin: 16px 0; padding: 14px 18px; background: #f7faff;
    border: 1px solid #dde8fb; border-left: 4px solid #9cc0f8; border-radius: 10px;
    color: #33415c;
  }
  blockquote p { margin: 6px 0; }
  blockquote ul { margin: 6px 0 6px; padding-left: 20px; }
  ol, ul { padding-left: 22px; }
  li { margin: 5px 0; }
  hr { border: 0; border-top: 1px dashed var(--line); margin: 26px 0; }
  footer.meta {
    margin-top: 22px; font-size: 13px; color: var(--muted);
    display: flex; flex-wrap: wrap; gap: 6px 18px;
  }
  .meta-panel {
    margin-top: 16px; background: #fff; border: 1px solid var(--line);
    border-radius: 14px; padding: 8px 18px; box-shadow: 0 4px 14px rgba(22, 32, 44, .04);
  }
  .meta-row { display: flex; gap: 14px; padding: 9px 0; border-bottom: 1px dashed #eef2f8; font-size: 13.5px; color: #3d4a63; }
  .meta-row:last-child { border-bottom: 0; }
  .meta-row b { flex: 0 0 74px; font-weight: 650; color: #1f3c88; }
  .meta-row span { flex: 1 1 auto; }
  .note {
    margin-top: 12px; font-size: 12.5px; color: #8a6d1f;
    background: #fff9e8; border: 1px solid #f3e2ae; border-radius: 10px; padding: 10px 14px;
  }
  @media (max-width: 640px) {
    header.hero { padding: 20px; border-radius: 12px; }
    header.hero h1 { font-size: 21px; }
    main.card { padding: 20px 16px 24px; border-radius: 12px; }
  }
  @media print {
    body { background: #fff; }
    nav.jump, .badges { display: none; }
    main.card, header.hero { box-shadow: none; }
  }
</style>
</head>
<body>
<div class="page">
  <header class="hero">
    <h1>${esc(title)}</h1>
    <div class="sub">速递行业公开信息 · 价格 / 活动 / 政策 每日追踪</div>
    <div class="badges">
      <span class="badge">报告生成：${esc(genTime)}</span>
      <span class="badge">页面重建：${esc(fmt(now))}（${esc(TZ_NOTE)}）</span>
      <span class="badge">每日刷新 08:00 · 下次 ${esc(fmt(nr))}</span>
    </div>
    <nav class="jump">${nav}</nav>
  </header>

  <main class="card">
${bodyWithIds}
  </main>

  ${metaChips(metaLines)}
  <div class="note">刷新说明：日报每日 08:00 由定时任务自动检索并重建本页，也可随时双击桌面「快递情报日报」图标立即刷新。本页每次重建都会读取 output 目录里最新的 daily-*.md，所以同一地址永远是最新一期。</div>
  <div class="note">局域网访问：<code>http://${esc(HOST_NAME)}:8000</code>（同一 WiFi 下的设备可直接打开；页面本身也可作为单个 HTML 文件转发）</div>
  <footer class="meta">
    <span>所有来源链接均指向公开报道 / 企业官网，点击即在新标签页打开</span>
    <span>仅供内部参考 · 公开信息人工检索结果，非全量监测</span>
  </footer>
</div>
</body>
</html>`;

const HTML_OUT = join(DOCS_DIR, 'index.html');
mkdirSync(DOCS_DIR, { recursive: true });
writeFileSync(HTML_OUT, html, 'utf8');
console.log(JSON.stringify({ md: mdPath, html: HTML_OUT, genTime, rebuilt: fmt(now) }));
