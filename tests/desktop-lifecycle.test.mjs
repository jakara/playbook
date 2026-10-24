import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { CleanupScope, cleanupSummary, interrupted, recoveryHandle, budgets, safeError } from '../desktop/lifecycle.mjs';
import { defineProfile, runPlaybook } from '../dist/index.js';

// These tests exercise the real manager and file receipts; they are not desktop stop/Quit acceptance.
const oldProfile = () => ({ schemaVersion: 1, id: 'fixture', title: 'Fixture', dataMode: 'fixture', roles: [],
  prepare: async ({ page }) => ({ context: { page }, release: async () => {} }) });

async function fixture(t, profile = oldProfile(), parameters = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'playbook-lifecycle-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'receipt.json'), history = [];
  const persist = async receipt => {
    await writeFile(file, JSON.stringify(receipt), { mode: 0o600 });
    const durable = JSON.parse(await readFile(file, 'utf8'));
    assert.deepEqual(durable, receipt); history.push(durable);
  };
  const create = previous => new CleanupScope({ runId: 'run-1', flowId: 'flow-1', scopeId: 'run-1.0', profile, parameters, persist, previous });
  return { root, file, history, create, scope: create(), saved: async () => JSON.parse(await readFile(file, 'utf8')) };
}

function prepared(scope) { scope.receipt.prepared = true; return scope; }

test('awaited registration is durable; registered and returned identical release runs once', async t => {
  const fx = await fixture(t), scope = prepared(fx.scope); let calls = 0;
  const release = async () => { calls++; await writeFile(path.join(fx.root, 'released'), 'done'); };
  await scope.register(release, { id: 'returned-release' });
  assert.equal((await fx.saved()).entries[0].status, 'pending');
  await scope.register(release); // The host registers the returned release before validating context.
  await scope.register(release, { id: 'another-label' });
  assert.equal(scope.receipt.entries.length, 1);
  const first = await scope.release('completed');
  const second = await scope.release('stopped');
  assert.equal(first, second); assert.equal(calls, 1);
  assert.equal(await readFile(path.join(fx.root, 'released'), 'utf8'), 'done');
  const saved = await fx.saved();
  assert.equal(saved.status, 'succeeded'); assert.equal(saved.entries[0].attempts, 1);
  await assert.rejects(scope.register(async () => {}), /登记已结束/);
});

test('different callbacks cannot reuse a cleanup ID and invalid registrations create no extra responsibility', async t => {
  const { scope, saved } = await fixture(t);
  await scope.register(async () => {}, { id: 'owned-file' });
  await assert.rejects(scope.register(async () => {}, { id: 'owned-file' }), /不同回调/);
  await assert.rejects(scope.register(async () => {}, { id: '../escape' }), /标识无效/);
  await assert.rejects(scope.register(null), /回调无效/);
  assert.equal((await saved()).entries.length, 1);
});

test('release is LIFO, persists failure, and still attempts the remaining callbacks', async t => {
  const fx = await fixture(t, oldProfile(), { password: 'do-not-persist-me' });
  const log = path.join(fx.root, 'order.log');
  for (const id of ['first', 'failing', 'last']) await fx.scope.register(async () => {
    await appendFile(log, `${id}\n`);
    if (id === 'failing') throw new Error('release failed; password=do-not-persist-me');
  }, { id });
  const receipt = await fx.scope.release('failed');
  assert.equal(await readFile(log, 'utf8'), 'last\nfailing\nfirst\n');
  assert.equal(receipt.status, 'failed');
  assert.deepEqual(receipt.entries.map(entry => entry.status), ['succeeded', 'failed', 'succeeded']);
  const disk = await readFile(fx.file, 'utf8');
  assert.doesNotMatch(disk, /do-not-persist-me/); assert.match(disk, /release failed/);
  assert.deepEqual(cleanupSummary([receipt]).errors.map(error => error.id), ['failing']);
  await fx.scope.release('failed');
  assert.equal(await readFile(log, 'utf8'), 'last\nfailing\nfirst\n');
});

test('cleanup receives a fresh independent signal, reason and stable identities after execution cancellation', async t => {
  const fx = await fixture(t), execution = new AbortController(); execution.abort();
  let received;
  await fx.scope.register(async options => {
    received = options;
    assert.notEqual(options.signal, execution.signal); assert.equal(options.signal.aborted, false);
    await delay(35); options.signal.throwIfAborted();
    await writeFile(path.join(fx.root, 'cleanup-after-stop'), options.reason);
  });
  const receipt = await fx.scope.release('stopped');
  assert.equal(receipt.status, 'succeeded');
  assert.deepEqual({ reason: received.reason, runId: received.runId, flowId: received.flowId, scopeId: received.scopeId },
    { reason: 'stopped', runId: 'run-1', flowId: 'flow-1', scopeId: 'run-1.0' });
  assert.equal(await readFile(path.join(fx.root, 'cleanup-after-stop'), 'utf8'), 'stopped');
});

test('12 and 25 second budgets are retained independently from the execution-stop grace period', async t => {
  for (const cleanupTimeoutMs of [12000, 25000]) {
    const fx = await fixture(t, { ...oldProfile(), lifecycle: { stopTimeoutMs: 1000, cleanupTimeoutMs } });
    await fx.scope.register(async () => delay(15));
    const receipt = await fx.scope.release('stopped');
    assert.equal(receipt.stopTimeoutMs, 1000); assert.equal(receipt.cleanupTimeoutMs, cleanupTimeoutMs);
    assert.equal(receipt.status, 'succeeded');
    const firstRunning = fx.history.find(value => value.status === 'running');
    assert.ok(firstRunning.deadline - Date.parse(firstRunning.startedAt) >= cleanupTimeoutMs - 5);
  }
});

test('timeout is unknown, aborts cleanup signal, leaves unstarted callbacks unknown and ignores late success', { timeout: 5000 }, async t => {
  const fx = await fixture(t, { ...oldProfile(), lifecycle: { cleanupTimeoutMs: 1000 } });
  let skipped = 0, lateFinish, signal;
  await fx.scope.register(async () => { skipped++; }, { id: 'must-not-start' });
  await fx.scope.register(options => {
    signal = options.signal;
    return new Promise(resolve => { lateFinish = resolve; });
  }, { id: 'hangs' });
  const start = Date.now(), receipt = await fx.scope.release('stopped');
  assert.ok(Date.now() - start >= 900); assert.equal(signal.aborted, true);
  assert.equal(receipt.status, 'unknown'); assert.equal(skipped, 0);
  assert.deepEqual(receipt.entries.map(entry => entry.status), ['unknown', 'timeout']);
  assert.equal(receipt.entries[0].attempts, undefined); assert.equal(receipt.entries[1].attempts, 1);
  assert.equal((await fx.saved()).status, 'unknown');
  lateFinish(); await delay(10);
  assert.deepEqual((await fx.saved()).entries.map(entry => entry.status), ['unknown', 'timeout']);
  await fx.scope.release('completed'); assert.equal(skipped, 0);
});

test('prepare with no durable cleanup and no returned context cannot claim cleanup success', async t => {
  const fx = await fixture(t);
  const receipt = await fx.scope.release('failed');
  assert.equal(receipt.status, 'unknown'); assert.equal((await fx.saved()).status, 'unknown');
  assert.equal(cleanupSummary([receipt]).status, 'unknown');
});

test('a successfully prepared legacy profile may legitimately have no release callback', async t => {
  const fx = await fixture(t); prepared(fx.scope);
  assert.equal((await fx.scope.release('completed')).status, 'succeeded');
  assert.equal((await fx.saved()).entries.length, 0);
});

test('partial prepare can release its registered resource without having returned context', async t => {
  const fx = await fixture(t), owned = path.join(fx.root, 'partial-resource');
  await fx.scope.register(async () => rm(owned, { force: true }), { id: 'partial' });
  await writeFile(owned, 'created before prepare error');
  assert.equal(fx.scope.receipt.prepared, undefined);
  const receipt = await fx.scope.release('failed');
  assert.equal(receipt.status, 'succeeded'); await assert.rejects(readFile(owned), { code: 'ENOENT' });
  assert.equal((await fx.saved()).entries[0].status, 'succeeded');
});

test('recovery uses precise handles and skips already successful entries across repeated recovery hosts', async t => {
  const calls = [];
  const profile = { ...oldProfile(), recovery: { version: 'file-v1', recover: async options => {
    assert.equal(options.signal.aborted, false); assert.equal(options.scopeId, 'run-1.0');
    assert.equal(options.workspaceDir, fx.root); assert.equal(options.runId, 'run-1');
    assert.equal(options.handle.file, options.cleanupId);
    calls.push(options.cleanupId);
    await rm(path.join(options.workspaceDir, options.handle.file), { force: true });
  } } };
  const fx = await fixture(t, profile);
  const unrelated = path.join(fx.root, 'keep-evidence'); await writeFile(unrelated, 'original');
  for (const id of ['already-done', 'failed-entry', 'unknown-entry']) {
    await fx.scope.register(async () => {}, { id, recovery: { file: id } });
    await writeFile(path.join(fx.root, id), 'owned fixture');
  }
  const previous = structuredClone(fx.scope.receipt); previous.prepared = true; previous.status = 'unknown';
  previous.entries[0].status = 'succeeded'; previous.entries[1].status = 'failed'; previous.entries[2].status = 'unknown';
  const recovering = fx.create(previous); recovering.workspaceDir = fx.root;
  const receipt = await recovering.release('stopped', true);
  assert.deepEqual(calls, ['unknown-entry', 'failed-entry']); assert.equal(receipt.status, 'succeeded');
  await recovering.release('stopped', true);
  const nextHost = fx.create(await fx.saved()); nextHost.workspaceDir = fx.root;
  await nextHost.release('stopped', true);
  assert.deepEqual(calls, ['unknown-entry', 'failed-entry']);
  assert.equal(await readFile(path.join(fx.root, 'already-done'), 'utf8'), 'owned fixture');
  assert.equal(await readFile(unrelated, 'utf8'), 'original');
  assert.deepEqual((await fx.saved()).entries.map(entry => entry.status), ['succeeded', 'succeeded', 'succeeded']);
});

test('a persistent recovery handle requires a declared recovery entry point', async t => {
  const { scope, saved } = await fixture(t);
  await assert.rejects(scope.register(async () => {}, { id: 'file', recovery: { file: 'owned' } }), /声明幂等 recovery/);
  assert.equal(scope.receipt.entries.length, 0);
  await assert.rejects(saved(), { code: 'ENOENT' });
});

test('recovery handle validation rejects credentials, executable values, cycles and oversized JSON', () => {
  const handle = { resourceId: 'run-1-resource', policy: 'purge', nested: [null, false, 42] };
  const copy = recoveryHandle(handle); assert.deepEqual(copy, handle); assert.notEqual(copy, handle);
  assert.equal(recoveryHandle(null), null);
  const cyclic = {}; cyclic.self = cyclic;
  let deep = 'end'; for (let index = 0; index < 10; index++) deep = { child: deep };
  const values = [{ token: 'private' }, { nested: { password: 'private' } }, { privateKey: 'private' },
    'Bearer hidden', 'https://name:password@example.test/path', '-----BEGIN PRIVATE KEY-----',
    undefined, () => {}, NaN, Infinity, new Date(), cyclic, deep, 'x'.repeat(2049),
    Array.from({ length: 9 }, () => 'x'.repeat(2000))];
  for (const value of values) assert.throws(() => recoveryHandle(value));
});

test('error text retains cause while removing credentials, ANSI escapes and known nested parameter secrets', () => {
  const message = safeError(new Error('\u001b[31moriginal execution failure; password=hunter2; Bearer access-123; '
    + 'https://alice:basic-123@example.test/path; nested-secret-value; token=token-123\u001b[0m'),
  { auth: { refreshToken: 'nested-secret-value' } });
  assert.match(message, /original execution failure/); assert.match(message, /已隐藏/);
  for (const secret of ['hunter2', 'access-123', 'alice', 'basic-123', 'nested-secret-value', 'token-123', '\u001b']) assert.ok(!message.includes(secret), secret);
  assert.equal(safeError(new Error('x'.repeat(2000))).length, 1600);
});

test('interrupted execution remains failed/unknown even after stop intent, preserving successful cleanup and failure evidence', () => {
  const run = { state: 'stopping', executing: true, cleanupScopes: [{ scopeId: 'scope', status: 'running', entries: [
    { id: 'done', status: 'succeeded' }, { id: 'error', status: 'failed', error: 'original cleanup failure' }, { id: 'pending', status: 'pending' },
  ] }] };
  const result = interrupted(run);
  assert.equal(result.state, 'failed'); assert.equal(result.executionStatus, 'unknown'); assert.equal(result.cleanup.status, 'unknown');
  assert.deepEqual(result.cleanupScopes[0].entries.map(entry => entry.status), ['succeeded', 'unknown', 'unknown']);
  assert.equal(result.cleanup.errors[0].message, 'original cleanup failure');
  assert.equal(run.cleanupScopes[0].status, 'running'); assert.equal(run.cleanupScopes[0].entries[1].status, 'failed');
  assert.equal(interrupted({ state: 'stopping', executing: true }).cleanup.status, 'unknown');
  assert.equal(interrupted({ executing: false }).cleanup.status, 'not-required');
});

test('cleanup summaries distinguish pending, running, failed, unknown and successful responsibilities', () => {
  assert.deepEqual(cleanupSummary(), { status: 'not-required', errors: [] });
  const scope = status => ({ scopeId: status, status, entries: [] });
  for (const status of ['pending', 'running', 'failed', 'unknown']) assert.equal(cleanupSummary([scope(status)]).status, status);
  assert.equal(cleanupSummary([scope('succeeded'), scope('not-required')]).status, 'succeeded');
  assert.equal(cleanupSummary([scope('failed'), scope('unknown')]).status, 'unknown');
  assert.equal(cleanupSummary([scope('running'), scope('unknown')]).status, 'running');
});

test('SDK accepts unchanged legacy Profiles and validates optional lifecycle/recovery declarations', async () => {
  const legacy = oldProfile(); assert.equal(defineProfile(legacy), legacy);
  assert.deepEqual(budgets(legacy), { stopTimeoutMs: 30000, cleanupTimeoutMs: 60000 });
  for (const cleanupTimeoutMs of [1000, 12000, 25000, 300000]) {
    const profile = defineProfile({ ...legacy, lifecycle: { stopTimeoutMs: 1000, cleanupTimeoutMs }, recovery: { version: 'v1', recover: async () => {} } });
    assert.equal(budgets(profile).cleanupTimeoutMs, cleanupTimeoutMs);
  }
  for (const value of [999, 300001, 1.5, NaN, Infinity, '1000']) {
    assert.throws(() => defineProfile({ ...legacy, lifecycle: { cleanupTimeoutMs: value } }), /lifecycle/);
    assert.throws(() => budgets({ lifecycle: { stopTimeoutMs: value } }), /生命周期预算/);
  }
  for (const lifecycle of [null, [], 'invalid', { unknownBudget: 1000 }]) assert.throws(() => defineProfile({ ...legacy, lifecycle }), /lifecycle/);
  for (const recovery of [null, { version: ' ', recover: async () => {} }, { version: 'v1' }]) assert.throws(() => defineProfile({ ...legacy, recovery }), /recovery/);
  let steps = 0;
  const context = { page: {}, release: () => { throw new Error('implicit teardown'); } };
  await runPlaybook({ steps: [{ run: async () => { steps++; }, verify: async () => { steps++; } }] }, context);
  assert.equal(steps, 2); assert.equal('signal' in context, false);
});

test('database URI credentials, private keys and token URLs cannot enter receipts or handles', () => {
  const message = safeError('failed postgres://operator:never-store-this@localhost/db');
  assert.doesNotMatch(message, /operator|never-store-this/);
  assert.match(message, /postgres:\/\/.*localhost\/db/);
  assert.doesNotMatch(safeError('-----BEGIN PRIVATE KEY-----\nnever-store-this\n-----END PRIVATE KEY-----'), /never-store-this/);
  for (const endpoint of ['postgres://operator:password@localhost/db', 'https://localhost/?token=private-value', 'password=private-value']) {
    assert.throws(() => recoveryHandle({ endpoint }), /凭据/);
  }
});
