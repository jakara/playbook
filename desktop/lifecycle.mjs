import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const terminal = state => ['completed', 'failed', 'stopped'].includes(state);
export const settledCleanup = status => ['succeeded', 'not-required'].includes(status);
export function safeError(error, parameters = {}) {
  let message = String(error?.message || error).replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/(?:Bearer\s+)[^\s,;]+/gi, 'Bearer [已隐藏]')
    .replace(/(password|passwd|api[_-]?key|token|secret|authorization|cookie)(["'\s:=]+)[^\s,}\n]+/gi, '$1$2[已隐藏]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[已隐藏]@')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[已隐藏私钥]');
  const redact = (value, sensitive = false) => {
    if (typeof value === 'string' && sensitive && value) message = message.split(value).join('[已隐藏]');
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) redact(child, sensitive || /password|passwd|token|secret|cookie|key|authorization/i.test(key));
  };
  redact(parameters); return message.slice(0, 1600);
}
export async function atomicJSON(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600); await handle.writeFile(JSON.stringify(value, null, 2)); await handle.sync(); await handle.close(); handle = null;
    await rename(temporary, file);
    const directory = await open(path.dirname(file), 'r'); try { await directory.sync(); } finally { await directory.close(); }
  } finally { await handle?.close(); await rm(temporary, { force: true }); }
}
export function budgets(profile = {}) {
  const values = { stopTimeoutMs: 30000, cleanupTimeoutMs: 60000, ...profile.lifecycle };
  for (const key of ['stopTimeoutMs', 'cleanupTimeoutMs']) if (!Number.isInteger(values[key]) || values[key] < 1000 || values[key] > 300000) throw new Error('生命周期预算须为 1000～300000 ms 的整数');
  return values;
}
export function recoveryHandle(value) {
  const seen = new Set();
  const inspect = (node, depth = 0) => {
    if (depth > 8) throw new Error('恢复句柄层级过深');
    if (node === null || typeof node === 'boolean' || typeof node === 'number' && Number.isFinite(node)) return;
    if (typeof node === 'string') {
      if (node.length > 2048 || /Bearer\s|-----BEGIN|[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]+@|(?:[?&#;]|\b)(?:password|passwd|token|secret|authorization|api[_-]?key)=/i.test(node)) throw new Error('恢复句柄不得包含凭据');
      return;
    }
    if (!node || typeof node !== 'object' || seen.has(node) || !Array.isArray(node) && Object.getPrototypeOf(node) !== Object.prototype) throw new Error('恢复句柄必须是非循环 JSON 数据');
    seen.add(node);
    for (const [key, child] of Object.entries(node)) {
      if (/password|passwd|token|secret|cookie|authorization|credential|private.?key|api.?key/i.test(key)) throw new Error('恢复句柄不得包含凭据字段');
      inspect(child, depth + 1);
    }
    seen.delete(node);
  };
  inspect(value);
  const serialized = JSON.stringify(value);
  if (serialized === undefined || Buffer.byteLength(serialized) > 16384) throw new Error('恢复句柄不可为空或超过 16 KB');
  return JSON.parse(serialized);
}

// One scope per prepare, including a prepare that throws before returning its context.
export class CleanupScope {
  constructor({ runId, flowId, scopeId, profile, persist, parameters = {}, previous }) {
    this.profile = profile; this.persist = persist; this.parameters = parameters; this.callbacks = new Map(); this.ids = new Set(); this.tasks = []; this.sealed = false;
    this.receipt = previous ? structuredClone(previous) : { runId, flowId, scopeId, status: 'pending', entries: [], recoveryVersion: profile.recovery?.version || null, ...budgets(profile) };
  }
  async save() { await this.persist(structuredClone(this.receipt)); }
  async register(callback, options = {}) {
    if (this.sealed || typeof callback !== 'function') throw new Error('清理登记已结束或回调无效');
    if (this.callbacks.has(callback)) return this.callbacks.get(callback).registered;
    const id = options.id || `cleanup-${this.tasks.length + 1}`;
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(id) || this.ids.has(id)) throw new Error('清理标识无效或同标识登记了不同回调');
    let handle;
    if (Object.hasOwn(options, 'recovery')) {
      if (!this.profile.recovery?.version || typeof this.profile.recovery.recover !== 'function') throw new Error('持久恢复句柄需要 Profile 声明幂等 recovery 入口');
      handle = recoveryHandle(options.recovery);
    }
    const entry = { id, status: 'pending', ...(handle !== undefined ? { handle } : {}) };
    this.receipt.entries.push(entry); this.ids.add(id);
    const task = { callback, entry }; this.tasks.push(task); this.callbacks.set(callback, task);
    // Register in memory before the first await; caller must await durable acknowledgement before creation.
    task.registered = this.save(); await task.registered;
  }
  async release(reason, recover = false) {
    if (this.releasing) return this.releasing;
    this.sealed = true;
    this.releasing = this.performRelease(reason, recover); return this.releasing;
  }
  async performRelease(reason, recover) {
    const controller = new AbortController(), deadline = Date.now() + this.receipt.cleanupTimeoutMs;
    this.receipt.status = 'running'; this.receipt.startedAt = new Date().toISOString(); this.receipt.deadline = deadline;
    await this.save();
    const tasks = recover ? [...this.receipt.entries].reverse().filter(entry => !settledCleanup(entry.status)).map(entry => ({ entry,
      callback: () => this.profile.recovery.recover({ runId: this.receipt.runId, flowId: this.receipt.flowId, scopeId: this.receipt.scopeId, cleanupId: entry.id, handle: structuredClone(entry.handle), workspaceDir: this.workspaceDir, signal: controller.signal }) })) : [...this.tasks].reverse();
    for (const { callback, entry, registered } of tasks) {
      if (registered) await registered;
      const remaining = deadline - Date.now();
      if (remaining <= 0) { entry.status = 'unknown'; entry.error = '清理预算已耗尽，此回调未确认完成'; continue; }
      entry.status = 'running'; entry.attempts = (entry.attempts || 0) + 1; await this.save();
      let timer;
      try {
        await Promise.race([Promise.resolve().then(() => callback({ signal: controller.signal, reason, runId: this.receipt.runId, flowId: this.receipt.flowId, scopeId: this.receipt.scopeId })),
          new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); const error = new Error('清理超时，资源结果未知'); error.code = 'CLEANUP_TIMEOUT'; reject(error); }, Math.max(1, deadline - Date.now())); })]);
        entry.status = 'succeeded'; delete entry.error;
      } catch (error) { entry.status = error.code === 'CLEANUP_TIMEOUT' ? 'timeout' : 'failed'; entry.error = safeError(error, this.parameters); }
      finally { clearTimeout(timer); }
      await this.save();
      if (controller.signal.aborted) break;
    }
    for (const entry of this.receipt.entries) if (entry.status === 'pending' || entry.status === 'running') { entry.status = 'unknown'; entry.error = '清理未完成，资源结果未知'; }
    const failed = this.receipt.entries.filter(entry => !settledCleanup(entry.status));
    this.receipt.status = !this.receipt.entries.length && !this.receipt.prepared ? 'unknown' : failed.some(entry => ['timeout', 'unknown'].includes(entry.status)) ? 'unknown' : failed.length ? 'failed' : 'succeeded';
    this.receipt.finishedAt = new Date().toISOString(); await this.save(); return this.receipt;
  }
}
export function cleanupSummary(scopes = []) {
  const status = !scopes.length ? 'not-required' : scopes.every(scope => settledCleanup(scope.status)) ? 'succeeded'
    : scopes.some(scope => scope.status === 'running') ? 'running' : scopes.some(scope => scope.status === 'unknown') ? 'unknown'
    : scopes.some(scope => scope.status === 'failed') ? 'failed' : 'pending';
  const errors = scopes.flatMap(scope => scope.entries.filter(entry => entry.error).map(entry => ({ scopeId: scope.scopeId, id: entry.id, status: entry.status, message: entry.error })));
  return { status, errors };
}
export function interrupted(run, message = '运行器中断，执行与资源释放结果需核对') {
  const scopes = structuredClone(run.cleanupScopes || []);
  for (const scope of scopes) if (!settledCleanup(scope.status)) {
    scope.status = 'unknown';
    for (const entry of scope.entries) if (!settledCleanup(entry.status)) entry.status = 'unknown';
  }
  const cleanup = scopes.length ? cleanupSummary(scopes) : { status: run.executing ? 'unknown' : 'not-required', errors: [] };
  return { state: 'failed', finishedAt: new Date().toISOString(), executionStatus: 'unknown', error: message, cleanupScopes: scopes, cleanup };
}
