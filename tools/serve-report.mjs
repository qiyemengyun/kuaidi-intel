#!/usr/bin/env node
// 只读静态服务：把日报目录通过局域网暴露出去，固定端口 8000。
// 启动：node serve-report.mjs            （后台常驻，建议放启动项）
// 访问：http://<本机主机名>:8000  或  http://<本机内网IP>:8000
// 只提供 output 目录里的文件，不做目录列表，不写任何东西。

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { join, normalize, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = join(REPO, 'docs');
const PORT = Number(process.env.REPORT_PORT || 8000);
const HOST = '0.0.0.0';
const LOG = join(REPO, 'serve-report.log');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const logLine = (s) => {
  const ts = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
  const line = `[${ts}] ${s}`;
  console.log(line);
  try {
    appendFileSync(LOG, line + '\n');
  } catch {
    /* 日志写不进去也不影响服务 */
  }
};

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let rel = urlPath === '/' ? '/index.html' : urlPath;
    const abs = normalize(join(ROOT, rel));
    if (!abs.startsWith(ROOT + sep) && abs !== ROOT) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('403');
      return;
    }
    const info = await stat(abs).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 没有这个文件。日报入口是 /index.html');
      return;
    }
    const body = await readFile(abs);
    res.writeHead(200, {
      'content-type': MIME[extname(abs).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache, no-store, must-revalidate',
      'content-length': body.length,
      'x-content-type-options': 'nosniff',
    });
    res.end(body);
    logLine(`${req.method} ${urlPath} ${res.statusCode} ${body.length}B ${req.socket.remoteAddress}`);
  } catch (err) {
    logLine(`ERROR ${req.url} ${err.message}`);
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('500');
  }
});

server.on('error', (err) => {
  logLine(`listen failed: ${err.code} ${err.message}`);
  process.exit(err.code === 'EADDRINUSE' ? 0 : 1);
});

server.listen(PORT, HOST, () => {
  logLine(`serving ${ROOT} at http://${HOST}:${PORT} (pid ${process.pid})`);
  logLine(`logs: ${LOG}`);
});
