import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const skillDir = decodeURIComponent(scriptDir).replace(/^\/[A-Za-z]:/, (m) => m.slice(1));
const skillRoot = path.resolve(skillDir, '..');
const configPath = path.resolve(skillDir, '..', 'config', 'web-dependencies.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const name = process.argv[2];
const outputJson = process.argv.includes('--json');

if (!name || !config.dependencies[name]) {
  throw new Error(`用法：node ensure-web-dependency.mjs <agent-reach|browser-harness> [--json]`);
}

const dependency = config.dependencies[name];
const dependencyDir = path.resolve(skillRoot, config.runtime.relativeDependencyDirectory);
const runtimeDir = path.join(dependencyDir, dependency.directory);
const venvDir = path.join(runtimeDir, '.venv');
const pythonPath = process.platform === 'win32' ? path.join(venvDir, 'Scripts', 'python.exe') : path.join(venvDir, 'bin', 'python');
const localBin = process.platform === 'win32' ? path.join(venvDir, 'Scripts') : path.join(venvDir, 'bin');
const localCommand = path.join(localBin, process.platform === 'win32' ? `${name}.exe` : name);
const skillPath = path.join(runtimeDir, 'skill', 'SKILL.md');

function commandPath(command) {
  const result = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [command], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.trim().split(/\r?\n/)[0] || null;
}

function run(command, args, options = {}) {
  const spawnOptions = outputJson && options.stdio === 'inherit'
    ? { ...options, stdio: ['inherit', 'pipe', 'inherit'] }
    : options;
  const result = spawnSync(command, args, { encoding: 'utf8', ...spawnOptions });
  if (outputJson && result.stdout) process.stderr.write(result.stdout);
  if (result.error) throw new Error(`${command} 不可用：${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} 执行失败，退出码 ${result.status}\n${result.stderr || ''}`.trim());
  return result.stdout || '';
}

function parseVersion(value) {
  const match = String(value).match(/(\d+\.\d+\.\d+)/);
  return match ? match[1].split('.').map(Number) : null;
}

function versionAtLeast(actual, minimum) {
  const a = parseVersion(actual);
  const b = parseVersion(minimum);
  if (!a || !b) return false;
  return a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2])));
}

function commandVersion(command) {
  try {
    return run(command, ['--version']).trim();
  } catch {
    return '';
  }
}

function pythonCommand() {
  if (commandPath('uv')) return { command: 'uv', args: [] };
  if (process.platform === 'win32' && commandPath('py')) return { command: 'py', args: ['-3'] };
  for (const candidate of ['python', 'python3']) {
    if (commandPath(candidate)) return { command: candidate, args: [] };
  }
  return null;
}

function emit(result) {
  if (outputJson) console.log(JSON.stringify(result, null, 2));
  else console.log(`[ai-daily] ${dependency.displayName} 已就绪：${result.command}`);
}

async function cacheSkill() {
  if (fs.existsSync(skillPath)) return;
  fs.mkdirSync(path.dirname(skillPath), { recursive: true });
  const response = await fetch(dependency.officialSkill);
  if (!response.ok) throw new Error(`无法下载 ${dependency.displayName} 的 SKILL.md：HTTP ${response.status}`);
  fs.writeFileSync(skillPath, await response.text(), 'utf8');
}

function writeState(result) {
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(path.join(runtimeDir, 'state.json'), JSON.stringify({ ...result, checkedAt: new Date().toISOString() }, null, 2));
}

async function main() {
  if (fs.existsSync(localCommand) && versionAtLeast(commandVersion(localCommand), dependency.minimumVersion)) {
    await cacheSkill();
    const result = { name, command: localCommand, skillPath, source: 'local-runtime' };
    writeState(result);
    emit(result);
    return;
  }

  const existing = commandPath(name);
  if (existing && versionAtLeast(commandVersion(existing), dependency.minimumVersion)) {
    await cacheSkill();
    const result = { name, command: existing, skillPath, source: 'system' };
    writeState(result);
    emit(result);
    return;
  }

  const python = pythonCommand();
  if (!python) {
    throw new Error(`缺少 Python ${dependency.minimumPython}+ 或 uv。请先安装 Python/uv，再查看官方说明：${dependency.officialInstall}`);
  }

  fs.mkdirSync(runtimeDir, { recursive: true });
  let createdVenv = false;
  try {
    if (!fs.existsSync(pythonPath)) {
      if (python.command === 'uv') run('uv', ['venv', '--python', '3.12', venvDir], { stdio: 'inherit' });
      else run(python.command, [...python.args, '-m', 'venv', venvDir], { stdio: 'inherit' });
      createdVenv = true;
    }
    if (python.command === 'uv') {
      const packageSpec = dependency.install.type === 'github-archive' ? dependency.install.url : dependency.install.package;
      run('uv', ['pip', 'install', '--python', pythonPath, packageSpec], { stdio: 'inherit' });
    } else {
      const packageSpec = dependency.install.type === 'github-archive' ? dependency.install.url : dependency.install.package;
      run(pythonPath, ['-m', 'pip', 'install', '--upgrade', packageSpec], { stdio: 'inherit' });
    }
    if (!fs.existsSync(localCommand) || !versionAtLeast(commandVersion(localCommand), dependency.minimumVersion)) {
      throw new Error(`${dependency.displayName} 安装后版本检查失败。`);
    }
    await cacheSkill();
    const result = { name, command: localCommand, skillPath, source: 'local-runtime' };
    writeState(result);
    emit(result);
  } catch (error) {
    if (createdVenv) fs.rmSync(venvDir, { recursive: true, force: true });
    throw new Error(`${error.message}\n官方安装说明：${dependency.officialInstall}`);
  }
}

await main();
