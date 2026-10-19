import fs from 'node:fs/promises';
import { createRequire, isBuiltin } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRequire = createRequire(path.join(root, 'electron/main.cjs'));
const release = path.join(root, 'release');
const target = path.join(release, 'Weave');
const marker = '.weave-desktop-package.json';
const stage = path.join(release, `.Weave-build-${randomUUID()}`);
const wantZip = process.argv.includes('--zip');
const versioned = process.argv.includes('--versioned');
const copied = new Map();
const edges = [];

async function exists(file) {
  try { await fs.lstat(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
async function requireFile(file) {
  if (!(await fs.stat(file)).isFile()) throw new Error(`缺少文件：${file}`);
}
// Check every ancestor: a junction must never redirect cleanup or output writes.
async function checkPath(file) {
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`不安全的交付路径：${file}`);
  let cursor = file;
  while (cursor !== root) {
    if (await exists(cursor)) {
      if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error(`交付路径不能是链接：${cursor}`);
    }
    cursor = path.dirname(cursor);
  }
  if ((await fs.lstat(root)).isSymbolicLink()) throw new Error('项目根目录不能是链接。');
}
async function removeOutput(directory) {
  if (directory !== target && directory !== stage) throw new Error('拒绝清理未授权目录。');
  await checkPath(directory);
  if (await exists(directory)) {
    const identity = await readJson(path.join(directory, marker));
    if (identity.format !== 'weave-desktop-v1') throw new Error(`拒绝覆盖非 Weave 交付目录：${directory}`);
    await fs.rm(directory, { recursive: true });
  }
}

// Resolve the package directory rather than requiring its entry. This handles
// exports-hidden package.json, import-only ESM packages, and pnpm junctions.
async function packageRoot(name, fromRequire) {
  if (name.startsWith('node:') && isBuiltin(name)) return null;
  if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)) throw new Error(`无效的依赖名称：${name}`);
  for (const modules of fromRequire.resolve.paths(`${name}/package.json`) ?? []) {
    const candidate = path.join(modules, name);
    if (await exists(path.join(candidate, 'package.json'))) return fs.realpath(candidate);
  }
  // A dependency called process/buffer may be a real npm shim used as
  // require('process/'). Only skip builtins when no package is installed.
  if (isBuiltin(name)) return null;
  const error = new Error(`无法解析运行时依赖 ${name}（${fromRequire.resolve.paths(name)?.[0]}）`);
  error.code = 'MODULE_NOT_FOUND';
  throw error;
}

async function install(name, fromRequire, owner, optional = false) {
  if (name.startsWith('node:') && isBuiltin(name)) return;
  let source;
  try { source = await packageRoot(name, fromRequire); }
  catch (error) {
    if (optional && error.code === 'MODULE_NOT_FOUND') return;
    throw error;
  }
  if (!source) return;
  const localRequire = createRequire(path.join(owner, '__weave_resolution__.cjs'));
  // Reuse an already visible copy only when it came from the same package root.
  for (const modules of localRequire.resolve.paths(`${name}/package.json`) ?? []) {
    const candidate = path.join(modules, name);
    if (copied.has(candidate)) {
      if (copied.get(candidate) === source) {
        edges.push({ owner, name, destination: candidate });
        return;
      }
      break;
    }
  }
  const hoisted = path.join(app, 'node_modules', name);
  const destination = copied.has(hoisted) ? path.join(owner, 'node_modules', name) : hoisted;
  if (copied.has(destination)) throw new Error(`依赖版本冲突：${name} / ${owner}`);
  copied.set(destination, source);
  edges.push({ owner, name, destination });
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, {
    recursive: true, dereference: true,
    filter: file => {
      const relative = path.relative(source, file);
      return relative !== 'node_modules' && !relative.startsWith(`node_modules${path.sep}`);
    },
  });
  const manifest = await readJson(path.join(source, 'package.json'));
  const dependencyRequire = createRequire(path.join(source, 'package.json'));
  const optionalDependencies = manifest.optionalDependencies ?? {};
  const dependencies = { ...manifest.dependencies, ...manifest.peerDependencies, ...optionalDependencies };
  for (const dependency of Object.keys(dependencies)) {
    const mayBeAbsent = Object.hasOwn(optionalDependencies, dependency)
      || manifest.peerDependenciesMeta?.[dependency]?.optional === true;
    await install(dependency, dependencyRequire, destination, mayBeAbsent);
  }
}

async function verifyDirectory(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`交付中残留链接：${full}`);
    if (entry.isDirectory()) await verifyDirectory(full);
  }
}
async function zipOutput() {
  const version = (await readJson(path.join(root, 'package.json'))).version;
  if (versioned && !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('无法生成版本化的 Windows ZIP：版本号无效。');
  const zip = path.join(release, versioned ? `Weave-Windows-v${version}.zip` : 'Weave-Windows.zip');
  const temporary = path.join(release, `.Weave-${randomUUID()}.zip`);
  await checkPath(zip);
  if (await exists(zip)) throw new Error(`ZIP 已存在，请先移动或删除后重新运行：${zip}`);
  const archiver = sourceRequire('archiver');
  const { createWriteStream } = await import('node:fs');
  try {
    await new Promise((resolve, reject) => {
      const output = createWriteStream(temporary, { flags: 'wx' });
      const archive = archiver('zip', { zlib: { level: 6 } });
      const fail = error => { archive.abort(); output.destroy(); reject(error); };
      output.once('close', resolve);
      output.once('error', fail);
      archive.once('error', fail);
      archive.on('warning', fail);
      archive.pipe(output);
      archive.directory(target, 'Weave');
      archive.finalize().catch(fail);
    });
    await fs.rename(temporary, zip);
    console.log(`便携压缩包：${zip}`);
  } finally {
    if (await exists(temporary)) await fs.unlink(temporary);
  }
}

const app = path.join(stage, 'resources/app');
try {
  if (process.platform !== 'win32') throw new Error('此脚本用于 Windows Electron 运行时。');
  for (const file of ['electron/main.cjs', 'electron/preload.cjs', 'shared/editing.mjs', 'dist/client/index.html', 'node_modules/electron/dist/electron.exe']) {
    await requireFile(path.join(root, file));
  }
  const electronPackage = await readJson(path.join(root, 'node_modules/electron/package.json'));
  const runtimeVersion = (await fs.readFile(path.join(root, 'node_modules/electron/dist/version'), 'utf8')).trim().replace(/^v/, '');
  if (runtimeVersion !== electronPackage.version) {
    throw new Error(`Electron 运行时 ${runtimeVersion} 与已安装包 ${electronPackage.version} 不一致，请先完成 electron/install.js。`);
  }
  await checkPath(stage);
  await checkPath(target);
  if (await exists(target)) {
    const identity = await readJson(path.join(target, marker));
    if (identity.format !== 'weave-desktop-v1') throw new Error('release/Weave 不是此脚本生成的目录，拒绝覆盖。');
  }
  await fs.mkdir(stage, { recursive: true });
  await fs.writeFile(path.join(stage, marker), JSON.stringify({ format: 'weave-desktop-v1', electron: runtimeVersion }));
  await fs.cp(path.join(root, 'node_modules/electron/dist'), stage, { recursive: true, dereference: true });
  await fs.rename(path.join(stage, 'electron.exe'), path.join(stage, 'Weave.exe'));
  // app wins over Electron's bundled default_app.asar when resources/app exists.
  await fs.mkdir(app, { recursive: true });
  const project = await readJson(path.join(root, 'package.json'));
  await fs.writeFile(path.join(app, 'package.json'), JSON.stringify({
    name: 'weave', productName: 'Weave', version: project.version,
    private: true, type: 'module', main: 'electron/main.cjs',
  }, null, 2));
  await fs.cp(path.join(root, 'electron'), path.join(app, 'electron'), { recursive: true, dereference: true });
  await fs.cp(path.join(root, 'shared'), path.join(app, 'shared'), { recursive: true, dereference: true });
  await fs.cp(path.join(root, 'dist/client'), path.join(app, 'dist/client'), { recursive: true, dereference: true });
  await fs.copyFile(path.join(root, 'WEAVE-使用说明.md'), path.join(stage, 'WEAVE-使用说明.md'));
  for (const name of ['archiver', 'chokidar']) await install(name, sourceRequire, app);
  // Verify every edge using the delivered layout, with no reliance on pnpm links.
  for (const edge of edges) {
    const delivered = await packageRoot(edge.name, createRequire(path.join(edge.owner, '__weave_resolution__.cjs')));
    if (delivered !== await fs.realpath(edge.destination)) throw new Error(`交付依赖解析错误：${edge.name}`);
  }
  for (const file of ['Weave.exe', 'resources/app/package.json', 'resources/app/electron/main.cjs', 'resources/app/electron/preload.cjs', 'resources/app/dist/client/index.html', 'resources/app/node_modules/archiver/package.json', 'resources/app/node_modules/chokidar/package.json']) {
    await requireFile(path.join(stage, file));
  }
  const deliveredRequire = createRequire(path.join(app, 'electron/main.cjs'));
  deliveredRequire('archiver');
  deliveredRequire('chokidar');
  await verifyDirectory(stage);
  await removeOutput(target);
  await fs.rename(stage, target);
  console.log(`已打包并验证 ${copied.size} 个运行时依赖目录：${target}`);
  console.log('接收方无需安装 Node/npm；双击 Weave.exe 启动。');
  if (wantZip) await zipOutput();
} catch (error) {
  console.error(`打包失败：${error.message}`);
  process.exitCode = 1;
} finally {
  if (await exists(stage)) await removeOutput(stage);
}
