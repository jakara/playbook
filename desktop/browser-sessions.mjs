import { mkdtempSync, writeFileSync, readFileSync, realpathSync, lstatSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { atomicJSON } from './lifecycle.mjs';

const prefix = 'playbook-browser-';
const marker = '.playbook-browser-owner.json';
const fields = ['path', 'nonce', 'pid', 'appId'];
const entryFor = value => Object.fromEntries(fields.map(key => [key, value[key]]));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; } };
const valid = value => value && typeof value === 'object' && !Array.isArray(value)
  && typeof value.path === 'string' && path.isAbsolute(value.path)
  && typeof value.appId === 'string' && value.appId.length > 0
  && typeof value.nonce === 'string' && /^[a-f0-9-]{36}$/i.test(value.nonce)
  && Number.isSafeInteger(value.pid) && value.pid > 0;

/** Create an owned browser cache before Electron initializes its default Session. */
export function createBrowserSession(root = tmpdir(), { appId = 'com.playbook.desktop' } = {}) {
  if (typeof appId !== 'string' || !appId.trim()) throw new Error('Invalid browser session application identity');
  root = realpathSync(root);
  const directory = mkdtempSync(path.join(root, prefix));
  const current = { path: directory, nonce: randomUUID(), pid: process.pid, appId, root };
  try {
    writeFileSync(path.join(directory, marker), JSON.stringify({ schemaVersion: 1, ...entryFor(current) }), { flag: 'wx', mode: 0o600 });
  } catch (error) { rmSync(directory, { recursive: true, force: true }); throw error; }
  return current;
}

function inspect(entry, root, appId) {
  if (!valid(entry) || entry.appId !== appId) return '浏览器缓存的应用或所有权记录不匹配';
  if (path.dirname(entry.path) !== root || !path.basename(entry.path).startsWith(prefix)) return '浏览器缓存不在登记的临时目录内';
  let directory;
  try { directory = lstatSync(entry.path); } catch (error) { return error.code === 'ENOENT' ? null : '浏览器缓存无法读取，需人工核对'; }
  if (!directory.isDirectory() || directory.isSymbolicLink() || realpathSync(entry.path) !== entry.path) return '浏览器缓存路径已改变，需人工核对';
  try {
    const filename = path.join(entry.path, marker), info = lstatSync(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 4096) return '浏览器缓存的所有权标记无效';
    const owner = JSON.parse(readFileSync(filename, 'utf8'));
    if (owner.schemaVersion !== 1 || !fields.every(key => owner[key] === entry[key])) return '浏览器缓存的所有权标记不匹配';
  } catch { return '浏览器缓存缺少可核验的所有权标记'; }
  return undefined;
}

/** Delete only this process's exact marked directory after all browser views have closed. */
export function destroyBrowserSession(current) {
  const warnings = [];
  try {
    const root = realpathSync(current.root);
    const problem = inspect(current, root, current.appId);
    if (problem === null) return { removed: true, warnings };
    if (problem || current.pid !== process.pid) return { removed: false, warnings: [problem || '浏览器缓存仍属于其他进程'] };
    rmSync(current.path, { recursive: true, force: true });
    return { removed: true, warnings };
  } catch { return { removed: false, warnings: ['浏览器缓存未能释放，需下次启动核对'] }; }
}

/** Reconcile an explicit local index; never enumerate or guess temporary directories. */
export async function reconcileBrowserSessions({ indexFile, current }) {
  const warnings = [], retained = [];
  const root = realpathSync(current.root);
  const currentProblem = inspect(current, root, current.appId);
  if (currentProblem !== undefined || current.pid !== process.pid) throw new Error('当前浏览器缓存的所有权无法核验');
  let entries;
  try {
    const source = await readFile(indexFile, 'utf8');
    if (source.length > 1024 * 1024) throw new Error('Oversized index');
    const index = JSON.parse(source);
    if (index.schemaVersion !== 1 || !Array.isArray(index.entries)) throw new Error('Invalid index');
    entries = index.entries;
  } catch (error) {
    if (error.code !== 'ENOENT') return { warnings: ['浏览器缓存索引无法核验，已保留原文件；需人工核对'] };
    entries = [];
  }
  for (const entry of entries) {
    if (fields.every(key => entry?.[key] === current[key])) continue;
    const problem = inspect(entry, root, current.appId);
    if (problem === null) continue; // A previously deleted exact path needs no further recovery.
    if (problem) { retained.push(entry); warnings.push(problem); continue; }
    if (alive(entry.pid)) { retained.push(entry); warnings.push('另一进程的浏览器缓存仍在使用，已保留'); continue; }
    try { rmSync(entry.path, { recursive: true, force: true }); }
    catch { retained.push(entry); warnings.push('已登记的浏览器缓存未能释放，需人工核对'); }
  }
  retained.push(entryFor(current));
  await atomicJSON(indexFile, { schemaVersion: 1, entries: retained });
  return { warnings: [...new Set(warnings)] };
}
