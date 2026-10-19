import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = path.join(root, 'node_modules/electron/dist/electron.exe');
if (!existsSync(executable) || !existsSync(path.join(root, 'electron/main.cjs'))) {
  console.error('缺少 Electron 运行时或 electron/main.cjs，请先完成桌面开发环境。');
  process.exit(1);
}
try {
  const expected = JSON.parse(readFileSync(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version;
  const actual = readFileSync(path.join(root, 'node_modules/electron/dist/version'), 'utf8').trim().replace(/^v/, '');
  if (expected !== actual) throw new Error(`Electron 包 ${expected} 与运行时 ${actual} 不一致`);
} catch (error) {
  console.error(`${error.message}；请先完成 Electron 运行时安装。`);
  process.exit(1);
}
if (!process.env.WEAVE_DEV_URL && !existsSync(path.join(root, 'dist/client/index.html'))) {
  console.error('缺少 dist/client/index.html，请先构建页面。');
  process.exit(1);
}
const env = { ...process.env };
// Electron itself must run as an app, even from a Node-mode parent process.
delete env.ELECTRON_RUN_AS_NODE;
if (env.WEAVE_DEV_URL) delete env.WEAVE_FORCE_PRODUCTION;
else env.WEAVE_FORCE_PRODUCTION = '1';
const child = spawn(executable, [root], { cwd: root, env, stdio: 'inherit', windowsHide: false });
child.once('error', error => {
  console.error(`无法启动 Weave：${error.message}`);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  if (signal) console.error(`Weave 已被终止：${signal}`);
  process.exitCode = code ?? 1;
});
