import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';

export const SKILL_NAMES = Object.freeze(['playbook-wright', 'playbook-playwright']);
const RECORD = '.playbook-install.json';

// Verified against the official documentation on 2026-10-21.
export const FRAMEWORKS = Object.freeze([
  Object.freeze({ id: 'codex', name: 'Codex', userDirectory: '.agents/skills', projectDirectory: '.agents/skills', documentationUrl: 'https://learn.chatgpt.com/docs/build-skills' }),
  Object.freeze({ id: 'claude-code', name: 'Claude Code', userDirectory: '.claude/skills', projectDirectory: '.claude/skills', documentationUrl: 'https://code.claude.com/docs/en/skills' }),
]);

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

function absolute(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw fail('INVALID_PATH', `${label}必须是绝对路径。`);
  return path.resolve(value);
}

export function targetFor({ framework, scope, home = homedir(), projectRoot, skillName = SKILL_NAMES[0] } = {}) {
  const entry = FRAMEWORKS.find(item => item.id === framework);
  if (!entry) throw fail('INVALID_FRAMEWORK', '请选择支持的智能体。');
  if (scope !== 'user' && scope !== 'project') throw fail('INVALID_SCOPE', '安装范围必须为 user 或 project。');
  if (!SKILL_NAMES.includes(skillName)) throw fail('INVALID_SKILL', '不支持此 Skill 名称。');
  return path.join(absolute(scope === 'user' ? home : projectRoot, scope === 'user' ? '用户目录' : '项目目录'), scope === 'user' ? entry.userDirectory : entry.projectDirectory, skillName);
}

async function statOrNull(file) {
  try { return await fs.lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function canonicalDestination(file) {
  let current = file;
  const suffix = [];
  while (!(await statOrNull(current))) {
    suffix.unshift(path.basename(current));
    current = path.dirname(current);
  }
  return path.join(await fs.realpath(current), ...suffix);
}

function digest(data) { return createHash('sha256').update(data).digest('hex'); }

async function readRegularFile(file, stat) {
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev) throw fail('CHANGED_DURING_READ', '文件在检查过程中发生变化，请重新检查。');
    return await handle.readFile();
  } finally { await handle.close(); }
}

async function snapshot(root) {
  const rootStat = await statOrNull(root);
  if (!rootStat) return null;
  if (rootStat.isSymbolicLink()) throw fail('SYMLINK', `目标或来源是软链接，已保留且不会写入：${root}`);
  const nodes = new Map();
  const realRoot = await fs.realpath(root);
  async function walk(file, relative, stat) {
    if (stat.isSymbolicLink()) throw fail('SYMLINK', `检测到软链接，已保留且不会写入：${file}`);
    if (!inside(realRoot, await fs.realpath(file))) throw fail('PATH_ESCAPE', '文件超出 Skill 目录，已停止安装。');
    const mode = stat.mode & 0o777;
    if (stat.isFile()) {
      const data = await readRegularFile(file, stat);
      nodes.set(relative, { type: 'file', mode, data, hash: digest(data) });
    } else if (stat.isDirectory()) {
      nodes.set(relative, { type: 'directory', mode });
      for (const name of (await fs.readdir(file)).sort()) {
        const child = path.join(file, name);
        await walk(child, relative ? `${relative}/${name}` : name, await fs.lstat(child));
      }
    } else throw fail('UNSUPPORTED_FILE', `目录包含不支持的文件类型，已保留且不会写入：${file}`);
  }
  await walk(root, '', rootStat);
  return nodes;
}

function fingerprint(nodes) {
  if (!nodes) return 'missing';
  return digest(JSON.stringify([...nodes].sort(([a], [b]) => a.localeCompare(b)).map(([name, node]) => [name, node.type, node.mode, node.hash])));
}

function fileHashes(nodes) {
  return Object.fromEntries([...nodes].filter(([name, node]) => name && name !== RECORD && node.type === 'file').map(([name, node]) => [name, node.hash]));
}

function validRecord(data, skill) {
  try {
    const record = JSON.parse(data.toString('utf8'));
    if (record.schemaVersion !== 1 || record.skill !== skill || typeof record.version !== 'string' || !record.version || !record.files || Array.isArray(record.files) || typeof record.files !== 'object' || !record.files['SKILL.md']) return null;
    for (const [name, hash] of Object.entries(record.files)) {
      if (!name || name === RECORD || name.includes('\\') || path.posix.isAbsolute(name) || name.split('/').some(part => !part || part === '.' || part === '..') || !/^[a-f0-9]{64}$/.test(hash)) return null;
    }
    return record;
  } catch { return null; }
}

async function examine({ sourceDir, targetDir, version }) {
  if (typeof version !== 'string' || !version.trim() || version.length > 128) throw fail('INVALID_VERSION', '请提供有效的 Skill 版本。');
  sourceDir = absolute(sourceDir, '来源目录');
  targetDir = absolute(targetDir, '目标目录');
  const skill = path.basename(targetDir);
  if (!SKILL_NAMES.includes(skill)) throw fail('INVALID_TARGET', '安装目标必须为主 Skill 或旧调用名兼容子目录。');
  const source = await snapshot(sourceDir);
  if (!source || source.get('')?.type !== 'directory' || source.get('SKILL.md')?.type !== 'file') throw fail('INVALID_SOURCE', '来源必须是含 SKILL.md 的 Skill 目录。');
  if (source.has(RECORD)) throw fail('INVALID_SOURCE', `来源不能包含安装器保留文件 ${RECORD}。`);
  const base = { name: skill, targetDir, version, fileCount: Object.keys(fileHashes(source)).length };
  if ((await statOrNull(targetDir))?.isSymbolicLink()) return { source, result: { ...base, status: 'symlink', message: '目标是软链接，已保留且不会写入；请手动处理该链接。' } };
  const realSource = await fs.realpath(sourceDir);
  const realTarget = await canonicalDestination(targetDir);
  if (inside(realSource, realTarget) || inside(realTarget, realSource)) throw fail('PATH_OVERLAP', '来源与目标不能互相包含。');
  let target;
  try { target = await snapshot(targetDir); } catch (error) {
    if (error.code === 'SYMLINK') return { source, result: { ...base, status: 'symlink', message: error.message } };
    if (error.code === 'UNSUPPORTED_FILE' || error.code === 'PATH_ESCAPE') return { source, result: { ...base, status: 'conflict', message: error.message } };
    throw error;
  }
  const state = (status, message, record) => ({ source, target, record, result: { ...base, status, ...(record ? { installedVersion: record.version } : {}), message } });
  if (!target) return state('new', '尚未安装，可安装内置 Skill。');
  const record = target.get(RECORD)?.type === 'file' ? validRecord(target.get(RECORD).data, skill) : null;
  const bootstrap = nodes => /(?:^|\n)\s*edition:\s*community-bootstrap(?:\s|$)/.test(nodes.get('SKILL.md')?.data?.toString('utf8') || '');
  if (bootstrap(source) && !bootstrap(target)) return state('conflict', '目标不是公开基础引导，可能包含完整或专业 Skill；不会自动降级替换。请保留专业内容，确需改装时先明确确认并完整备份。', record);
  if (!record || target.get('')?.type !== 'directory') return state('conflict', '目标已存在且不属于可识别的 Playbook 安装；替换前须确认并备份。');
  const hashes = fileHashes(target);
  const modified = Object.entries(record.files).some(([name, hash]) => hashes[name] !== hash);
  const unknown = Object.keys(hashes).filter(name => !Object.hasOwn(record.files, name));
  if (modified || unknown.length) return state('modified', `目标有本地修改或额外文件；替换前须确认并备份，额外文件将尽量保留。`, record);
  const expected = fileHashes(source);
  const same = record.version === version && Object.keys(record.files).length === Object.keys(expected).length && Object.entries(expected).every(([name, hash]) => record.files[name] === hash);
  return state(same ? 'installed' : 'update', same ? '已安装此版本，文件校验一致。' : '可更新内置 Skill；更新前须确认并备份。', record);
}

export async function inspectSkill(options) { return (await examine(options)).result; }

async function writeSnapshot(root, nodes) {
  const rootNode = nodes.get('');
  if (rootNode.type === 'file') {
    await fs.writeFile(root, rootNode.data, { flag: 'wx', mode: rootNode.mode });
    await fs.chmod(root, rootNode.mode);
    return;
  }
  await fs.mkdir(root, { recursive: true });
  for (const [name, node] of [...nodes].filter(([name]) => name).sort(([a], [b]) => a.split('/').length - b.split('/').length || a.localeCompare(b))) {
    const file = path.join(root, ...name.split('/'));
    if (node.type === 'directory') await fs.mkdir(file, { recursive: true });
    else {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, node.data, { flag: 'wx', mode: node.mode });
      await fs.chmod(file, node.mode);
    }
  }
  // Apply directory permissions last, so a read-only original remains recoverable.
  for (const [name, node] of [...nodes].reverse()) if (node.type === 'directory') await fs.chmod(name ? path.join(root, ...name.split('/')) : root, node.mode);
}

async function verifySnapshot(root, expected) {
  if (fingerprint(await snapshot(root)) !== fingerprint(expected)) throw fail('VERIFICATION_FAILED', `文件校验失败：${root}`);
}

function mergePayload(source, target, record) {
  const merged = new Map();
  let preserved = 0;
  let collisions = 0;
  if (target?.get('')?.type === 'directory') {
    for (const [name, node] of target) {
      if (!name || name === RECORD || (node.type === 'file' && record && Object.hasOwn(record.files, name))) continue;
      const ancestors = name.split('/').slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join('/'));
      const collision = source.has(name) && (node.type === 'file' || source.get(name).type !== 'directory') || ancestors.some(parent => source.get(parent)?.type === 'file');
      if (collision) { if (node.type === 'file') collisions++; continue; }
      merged.set(name, node);
      if (node.type === 'file') preserved++;
    }
  }
  for (const [name, node] of source) merged.set(name, node);
  return { merged, preserved, collisions };
}

async function backupTarget(targetDir, backupRoot, original, skill) {
  backupRoot = absolute(backupRoot, '备份目录');
  const rootStat = await statOrNull(backupRoot);
  if (rootStat && (!rootStat.isDirectory() || rootStat.isSymbolicLink())) throw fail('INVALID_BACKUP', '备份目录必须是普通目录，不能使用软链接。');
  await fs.mkdir(backupRoot, { recursive: true });
  const container = await fs.mkdtemp(path.join(backupRoot, `${skill}-${Date.now()}-`));
  const backupPath = path.join(container, 'original');
  await writeSnapshot(backupPath, original);
  await verifySnapshot(backupPath, original);
  await fs.writeFile(path.join(container, 'restore.json'), JSON.stringify({ targetDir, backupPath, createdAt: new Date().toISOString(), instruction: '关闭使用该 Skill 的进程后，将 original 完整复制回 targetDir；先另存当前目标。' }, null, 2), { flag: 'wx' });
  return backupPath;
}

export async function installSkill({ sourceDir, targetDir, version, backupRoot, replace = false } = {}) {
  const { source, target, record, result } = await examine({ sourceDir, targetDir, version });
  targetDir = result.targetDir;
  const skill = result.name;
  if (result.status === 'symlink') throw fail('SYMLINK', result.message);
  if (result.status === 'installed') return { status: 'installed', targetDir, version, message: '已安装此版本，无需重复写入。' };
  if (result.status !== 'new' && !replace) throw fail('REPLACE_REQUIRED', result.message);
  if (result.status !== 'new' && !target) throw fail('UNSAFE_TARGET', result.message);
  const parent = path.dirname(targetDir);
  backupRoot ??= path.join(parent, '.playbook-backups');
  const canonicalBackup = await canonicalDestination(absolute(backupRoot, '备份目录'));
  for (const root of [await fs.realpath(sourceDir), await canonicalDestination(targetDir)]) {
    if (inside(root, canonicalBackup) || inside(canonicalBackup, root)) throw fail('PATH_OVERLAP', '备份目录必须与来源和目标分开。');
  }
  await fs.mkdir(parent, { recursive: true });
  const lock = `${targetDir}.playbook-lock`;
  try { await fs.mkdir(lock); } catch (error) { if (error.code === 'EEXIST') throw fail('INSTALL_BUSY', '此 Skill 正在安装，或上次中断留下了安装锁；请检查后重试。'); throw error; }
  let stage;
  let transaction;
  let oldMoved = false;
  let stageMoved = false;
  let backupPath;
  let preserveTransaction = false;
  try {
    const { merged, preserved, collisions } = mergePayload(source, target, record);
    const metadata = Buffer.from(`${JSON.stringify({ schemaVersion: 1, skill, version, installedAt: new Date().toISOString(), files: fileHashes(source) }, null, 2)}\n`);
    merged.set(RECORD, { type: 'file', mode: 0o600, data: metadata, hash: digest(metadata) });
    stage = await fs.mkdtemp(path.join(parent, `.${skill}-stage-`));
    await writeSnapshot(stage, merged);
    await verifySnapshot(stage, merged);
    if (target) backupPath = await backupTarget(targetDir, backupRoot, target, skill);
    if (fingerprint(await snapshot(targetDir)) !== fingerprint(target)) throw fail('TARGET_CHANGED', '目标在安装过程中发生变化，已停止替换；请重新检查。');
    transaction = await fs.mkdtemp(path.join(parent, `.${skill}-transaction-`));
    if (target) { await fs.rename(targetDir, path.join(transaction, 'original')); oldMoved = true; }
    await fs.rename(stage, targetDir);
    stageMoved = true;
    await verifySnapshot(targetDir, merged);
    if (backupPath) await verifySnapshot(backupPath, target);
    return { status: 'installed', targetDir, version, ...(backupPath ? { backupPath } : {}), message: `Skill ${version} 已安装并校验。${backupPath ? '原目录已完整备份。' : ''}${preserved ? `已保留 ${preserved} 个额外文件。` : ''}${collisions ? `${collisions} 个同名冲突文件已保留在备份中。` : ''}` };
  } catch (error) {
    try {
      if (stageMoved) {
        await fs.rename(targetDir, path.join(transaction, 'failed-install'));
        preserveTransaction = true;
      }
      if (oldMoved) {
        if (await statOrNull(targetDir)) throw fail('ROLLBACK_BLOCKED', '目标路径被其他进程占用。');
        await fs.rename(path.join(transaction, 'original'), targetDir);
        await verifySnapshot(targetDir, target);
      }
    } catch (rollbackError) {
      preserveTransaction = true;
      throw fail('ROLLBACK_FAILED', `${error.message} 自动恢复失败：${rollbackError.message} 原数据保留在 ${transaction}，备份：${backupPath ?? '未创建'}。`);
    }
    if (preserveTransaction) error.message += ` 原目录已恢复；失败安装保留在 ${transaction}。`;
    throw error;
  } finally {
    if (stage && !stageMoved) await fs.rm(stage, { recursive: true, force: true });
    if (transaction && !preserveTransaction) await fs.rm(transaction, { recursive: true, force: true });
    await fs.rmdir(lock);
  }
}

function bundleEntries(options) {
  const sourceDir = absolute(options.sourceDir, '来源目录');
  const targetDir = absolute(options.targetDir, '目标目录');
  if (path.basename(targetDir) !== SKILL_NAMES[0]) throw fail('INVALID_TARGET', '安装包的主目标必须为 playbook-wright。');
  return [
    { ...options, sourceDir, targetDir },
    { ...options, sourceDir: path.join(path.dirname(sourceDir), SKILL_NAMES[1]), targetDir: path.join(path.dirname(targetDir), SKILL_NAMES[1]) },
  ];
}

export async function inspectSkillBundle(options) {
  const targets = await Promise.all(bundleEntries(options).map(inspectSkill));
  const status = ['symlink', 'conflict', 'modified', 'update', 'new', 'installed'].find(status => targets.some(target => target.status === status));
  const relevant = targets.find(target => target.status === status);
  return { ...targets[0], status, targets, fileCount: targets.reduce((count, target) => count + target.fileCount, 0),
    message: status === 'installed' ? '主 Skill 与旧调用名兼容入口均已安装，文件校验一致。' : `${relevant.name}：${relevant.message}` };
}

export async function installSkillBundle(options) {
  const preview = await inspectSkillBundle(options);
  if (preview.status === 'symlink') throw fail('SYMLINK', preview.message);
  if (!options.replace && preview.targets.some(target => !['new', 'installed'].includes(target.status))) throw fail('REPLACE_REQUIRED', preview.message);
  const completed = [];
  for (const entry of bundleEntries(options)) {
    try { completed.push(await installSkill(entry)); }
    catch (error) {
      if (completed.length) error.message += ' 主入口已就绪，兼容入口未完成；请重新查看目标后重试。';
      throw error;
    }
  }
  return { status: 'installed', targetDir: completed[0].targetDir, version: options.version,
    backups: completed.flatMap((result, index) => result.backupPath ? [{ name: SKILL_NAMES[index], targetDir: result.targetDir, path: result.backupPath }] : []),
    message: '主 Skill 与旧调用名兼容入口均已安装并校验。' };
}
