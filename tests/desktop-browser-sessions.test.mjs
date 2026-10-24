import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, access, symlink } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createBrowserSession, reconcileBrowserSessions, destroyBrowserSession } from '../desktop/browser-sessions.mjs';

const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
const deadPid = child.pid;
await once(child, 'exit');
const marker = '.playbook-browser-owner.json';
const entry = value => Object.fromEntries(['path', 'nonce', 'pid', 'appId'].map(key => [key, value[key]]));
async function fixture(t) {
  const root = realpathSync(await mkdtemp(path.join(tmpdir(), 'playbook-session-test-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, indexFile: path.join(root, 'browser-sessions.json') };
}
async function markDead(value) {
  value.pid = deadPid;
  await writeFile(path.join(value.path, marker), JSON.stringify({ schemaVersion: 1, ...entry(value) }));
  return value;
}
async function writeIndex(indexFile, entries) { await writeFile(indexFile, JSON.stringify({ schemaVersion: 1, entries })); }

test('browser session registration writes a private marker and atomically indexes only exact ownership', async t => {
  const { root, indexFile } = await fixture(t);
  const current = createBrowserSession(root);
  const owner = JSON.parse(await readFile(path.join(current.path, marker), 'utf8'));
  assert.deepEqual(owner, { schemaVersion: 1, ...entry(current) });
  assert.equal(current.pid, process.pid);
  assert.equal(path.dirname(current.path), root);
  assert.deepEqual(await reconcileBrowserSessions({ indexFile, current }), { warnings: [] });
  assert.deepEqual(JSON.parse(await readFile(indexFile, 'utf8')), { schemaVersion: 1, entries: [entry(current)] });
});

test('restart recovers one dead owned directory, preserves unindexed directories and is idempotent', async t => {
  const { root, indexFile } = await fixture(t);
  const stale = await markDead(createBrowserSession(root));
  const unindexed = await markDead(createBrowserSession(root));
  const current = createBrowserSession(root);
  await writeFile(path.join(stale.path, 'Cookies'), 'disposable credential cache');
  await writeIndex(indexFile, [entry(stale)]);
  assert.deepEqual(await reconcileBrowserSessions({ indexFile, current }), { warnings: [] });
  await assert.rejects(access(stale.path), { code: 'ENOENT' });
  await access(unindexed.path); await access(current.path);
  assert.deepEqual(await reconcileBrowserSessions({ indexFile, current }), { warnings: [] });
  assert.deepEqual(JSON.parse(await readFile(indexFile, 'utf8')).entries, [entry(current)]);
});

test('normal exit removes only the current marked cache and later reconciliation drops its missing entry', async t => {
  const { root, indexFile } = await fixture(t);
  const current = createBrowserSession(root);
  await reconcileBrowserSessions({ indexFile, current });
  assert.deepEqual(destroyBrowserSession(current), { removed: true, warnings: [] });
  assert.deepEqual(destroyBrowserSession(current), { removed: true, warnings: [] });
  const next = createBrowserSession(root);
  await reconcileBrowserSessions({ indexFile, current: next });
  assert.deepEqual(JSON.parse(await readFile(indexFile, 'utf8')).entries, [entry(next)]);
});

test('live owner and mismatching marker/app identity are preserved with a review warning', async t => {
  const { root, indexFile } = await fixture(t);
  const current = createBrowserSession(root);
  const live = createBrowserSession(root);
  const wrongNonce = await markDead(createBrowserSession(root));
  const wrongApp = await markDead(createBrowserSession(root, { appId: 'another.app' }));
  await writeIndex(indexFile, [entry(live), { ...entry(wrongNonce), nonce: current.nonce }, entry(wrongApp)]);
  const result = await reconcileBrowserSessions({ indexFile, current });
  assert.equal(result.warnings.length, 3);
  for (const value of [live, wrongNonce, wrongApp, current]) await access(value.path);
  assert.equal(JSON.parse(await readFile(indexFile, 'utf8')).entries.length, 4);
});

test('an outside directory, symbolic link and missing marker never authorize deletion', async t => {
  const { root, indexFile } = await fixture(t);
  const outsideRoot = realpathSync(await mkdtemp(path.join(tmpdir(), 'playbook-other-session-test-')));
  t.after(() => rm(outsideRoot, { recursive: true, force: true }));
  const current = createBrowserSession(root), outside = await markDead(createBrowserSession(outsideRoot));
  const missing = await markDead(createBrowserSession(root));
  await rm(path.join(missing.path, marker));
  const link = path.join(root, 'playbook-browser-link'); await symlink(outside.path, link);
  await writeIndex(indexFile, [entry(outside), { ...entry(outside), path: link }, entry(missing)]);
  const result = await reconcileBrowserSessions({ indexFile, current });
  assert.equal(result.warnings.length, 3);
  for (const filename of [outside.path, link, missing.path]) await access(filename);
});

test('corrupt index is preserved and cannot authorize scanning or recovery', async t => {
  const { root, indexFile } = await fixture(t);
  const current = createBrowserSession(root), stale = await markDead(createBrowserSession(root));
  const invalid = '{"entries": [broken]'; await writeFile(indexFile, invalid);
  assert.equal((await reconcileBrowserSessions({ indexFile, current })).warnings.length, 1);
  assert.equal(await readFile(indexFile, 'utf8'), invalid);
  await access(stale.path); await access(current.path);
});

test('normal exit refuses a changed owner marker or another owner PID', async t => {
  const { root } = await fixture(t);
  const changed = createBrowserSession(root), other = await markDead(createBrowserSession(root));
  await writeFile(path.join(changed.path, marker), JSON.stringify({ schemaVersion: 1, ...entry(changed), nonce: other.nonce }));
  assert.equal(destroyBrowserSession(changed).removed, false);
  assert.equal(destroyBrowserSession(other).removed, false);
  await access(changed.path); await access(other.path);
});
