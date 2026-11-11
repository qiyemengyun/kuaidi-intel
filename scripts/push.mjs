// 推送 kuaidi-intel 到 GitHub。
// 背景：本机网络下 github.com 的默认解析 IP（20.205.243.16x）经常连不通，
// 但 GitHub 其它边缘 IP 可达。所以先直连，失败后逐个用 curloptResolve 换 IP 重试。
// 用法：node scripts/push.mjs [branch]
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const branch = process.argv[2] || 'main';

const IPS = [
  '140.82.113.3',
  '140.82.114.3',
  '140.82.112.3',
  '140.82.116.3',
  '20.27.177.113',
  '20.205.243.168',
  '4.237.22.38',
];

function push(ip) {
  const args = ['-c', 'http.version=HTTP/1.1'];
  if (ip) args.push('-c', `http.curloptResolve=github.com:443:${ip}`);
  args.push('push', 'origin', branch);
  const r = spawnSync('git', args, {
    cwd: repo,
    stdio: 'inherit',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return r.status ?? 1;
}

if (push(null) === 0) {
  console.log('push ok (direct)');
  process.exit(0);
}

for (const ip of IPS) {
  console.log(`retry with pinned ip ${ip} ...`);
  if (push(ip) === 0) {
    console.log(`push ok (pinned ${ip})`);
    process.exit(0);
  }
}

console.error('push failed: all endpoints unreachable');
process.exit(1);
