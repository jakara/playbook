import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { FRAMEWORKS, targetFor, inspectSkill, installSkill } from '../desktop/skill-installer.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'playbook-installer-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, 'source');
  const targetDir = targetFor({ framework: 'codex', scope: 'user', home: path.join(root, 'home') });
  const backupRoot = path.join(root, 'backups');
  await fs.mkdir(path.join(sourceDir, 'references'), { recursive: true });
  await fs.writeFile(path.join(sourceDir, 'SKILL.md'), '---\nname: playbook-playwright\n---\nVersion one\n');
  await fs.writeFile(path.join(sourceDir, 'references', 'contract.md'), 'contract one\n');
  return { root, sourceDir, targetDir, backupRoot, version: '0.1.0' };
}

const read = file => fs.readFile(file, 'utf8');
const exists = async file => { try { await fs.lstat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };

test('official framework directories and supported scopes are explicit', () => {
  assert.deepEqual(FRAMEWORKS.map(item => item.id), ['codex', 'claude-code']);
  for (const framework of FRAMEWORKS) {
    const folder = framework.id === 'codex' ? '.agents' : '.claude';
    assert.equal(targetFor({ framework: framework.id, scope: 'user', home: '/example/home' }), `/example/home/${folder}/skills/playbook-playwright`);
    assert.equal(targetFor({ framework: framework.id, scope: 'project', projectRoot: '/example/project' }), `/example/project/${folder}/skills/playbook-playwright`);
    assert.match(framework.documentationUrl, /^https:\/\//);
  }
  assert.throws(() => targetFor({ framework: 'unknown', scope: 'user' }), { code: 'INVALID_FRAMEWORK' });
  assert.throws(() => targetFor({ framework: 'codex', scope: 'global' }), { code: 'INVALID_SCOPE' });
  assert.throws(() => targetFor({ framework: 'codex', scope: 'project', projectRoot: 'relative' }), { code: 'INVALID_PATH' });
});

test('first install records hashes, is idempotent, and leaves other skills untouched', async t => {
  const options = await fixture(t);
  const other = path.join(path.dirname(options.targetDir), 'other-skill', 'SKILL.md');
  await fs.mkdir(path.dirname(other), { recursive: true });
  await fs.writeFile(other, 'user-owned skill');
  const initial = await inspectSkill(options);
  assert.equal(initial.status, 'new');
  assert.equal(initial.fileCount, 2);
  const result = await installSkill(options);
  assert.equal(result.status, 'installed');
  assert.equal(result.backupPath, undefined);
  const markerPath = path.join(options.targetDir, '.playbook-install.json');
  const markerText = await read(markerPath);
  const marker = JSON.parse(markerText);
  assert.equal(marker.version, '0.1.0');
  assert.match(marker.files['SKILL.md'], /^[a-f0-9]{64}$/);
  assert.equal((await inspectSkill(options)).status, 'installed');
  assert.equal((await inspectSkill(options)).installedVersion, '0.1.0');
  await installSkill(options);
  assert.equal(await read(markerPath), markerText);
  assert.equal(await read(other), 'user-owned skill');
  assert.equal(await exists(options.backupRoot), false);
});

test('clean version update requires replace and produces a restorable full backup', async t => {
  const options = await fixture(t);
  await installSkill(options);
  const oldSkill = await read(path.join(options.targetDir, 'SKILL.md'));
  await fs.writeFile(path.join(options.sourceDir, 'SKILL.md'), 'Version two\n');
  await fs.unlink(path.join(options.sourceDir, 'references', 'contract.md'));
  await fs.writeFile(path.join(options.sourceDir, 'new.md'), 'new file');
  const update = { ...options, version: '0.2.0' };
  assert.equal((await inspectSkill(update)).status, 'update');
  await assert.rejects(installSkill(update), { code: 'REPLACE_REQUIRED' });
  assert.equal(await read(path.join(options.targetDir, 'SKILL.md')), oldSkill);
  const result = await installSkill({ ...update, replace: true });
  assert.equal(await read(path.join(result.backupPath, 'SKILL.md')), oldSkill);
  assert.equal(JSON.parse(await read(path.join(result.backupPath, '.playbook-install.json'))).version, '0.1.0');
  assert.equal(await exists(path.join(options.targetDir, 'references', 'contract.md')), false);
  assert.equal((await inspectSkill(update)).status, 'installed');
  const restored = path.join(options.root, 'restored', 'playbook-playwright');
  await fs.cp(result.backupPath, restored, { recursive: true });
  assert.equal(await read(path.join(restored, 'SKILL.md')), oldSkill);
  assert.equal(await read(path.join(restored, 'references', 'contract.md')), 'contract one\n');
});

test('local edits require replace, are backed up, and unknown files survive', async t => {
  const options = await fixture(t);
  await installSkill(options);
  await fs.writeFile(path.join(options.targetDir, 'SKILL.md'), 'local edit');
  await fs.writeFile(path.join(options.targetDir, 'local-note.txt'), 'keep me');
  assert.equal((await inspectSkill(options)).status, 'modified');
  await assert.rejects(installSkill(options), { code: 'REPLACE_REQUIRED' });
  assert.equal(await read(path.join(options.targetDir, 'SKILL.md')), 'local edit');
  const result = await installSkill({ ...options, replace: true });
  assert.equal(await read(path.join(result.backupPath, 'SKILL.md')), 'local edit');
  assert.equal(await read(path.join(options.targetDir, 'local-note.txt')), 'keep me');
  assert.match(result.message, /保留 1 个额外文件/);
  assert.equal(await read(path.join(options.targetDir, 'SKILL.md')), await read(path.join(options.sourceDir, 'SKILL.md')));
});

test('unowned directory conflicts are explicit and unknown content remains recoverable', async t => {
  const options = await fixture(t);
  await fs.mkdir(path.join(options.targetDir, 'references', 'nested'), { recursive: true });
  await fs.writeFile(path.join(options.targetDir, 'SKILL.md'), 'unowned skill');
  await fs.writeFile(path.join(options.targetDir, 'references', 'nested', 'custom.txt'), 'custom content');
  assert.equal((await inspectSkill(options)).status, 'conflict');
  await assert.rejects(installSkill(options), { code: 'REPLACE_REQUIRED' });
  const result = await installSkill({ ...options, replace: true });
  assert.equal(await read(path.join(result.backupPath, 'SKILL.md')), 'unowned skill');
  assert.equal(await read(path.join(options.targetDir, 'references', 'nested', 'custom.txt')), 'custom content');
  assert.match(result.message, /同名冲突文件已保留在备份/);
});

test('an existing regular file can only be replaced after its readable backup', async t => {
  const options = await fixture(t);
  await fs.mkdir(path.dirname(options.targetDir), { recursive: true });
  await fs.writeFile(options.targetDir, 'original regular file');
  assert.equal((await inspectSkill(options)).status, 'conflict');
  await assert.rejects(installSkill(options), { code: 'REPLACE_REQUIRED' });
  const result = await installSkill({ ...options, replace: true });
  assert.equal(await read(result.backupPath), 'original regular file');
  assert.equal((await fs.stat(options.targetDir)).isDirectory(), true);
});

test('root and dangling target symlinks are never replaced', async t => {
  for (const dangling of [false, true]) {
    const options = await fixture(t);
    const destination = path.join(options.root, 'linked-destination');
    if (!dangling) await fs.mkdir(destination);
    await fs.mkdir(path.dirname(options.targetDir), { recursive: true });
    await fs.symlink(destination, options.targetDir, 'dir');
    assert.equal((await inspectSkill(options)).status, 'symlink');
    await assert.rejects(installSkill({ ...options, replace: true }), { code: 'SYMLINK' });
    assert.equal(await fs.readlink(options.targetDir), destination);
    if (!dangling) assert.deepEqual(await fs.readdir(destination), []);
  }
});

test('internal target links and source links cannot redirect writes or reads', async t => {
  const options = await fixture(t);
  await installSkill(options);
  const outside = path.join(options.root, 'outside.txt');
  await fs.writeFile(outside, 'outside');
  const targetLink = path.join(options.targetDir, 'external.txt');
  await fs.symlink(outside, targetLink);
  assert.equal((await inspectSkill(options)).status, 'symlink');
  await assert.rejects(installSkill({ ...options, replace: true }), { code: 'SYMLINK' });
  await fs.unlink(targetLink);
  await fs.symlink(outside, path.join(options.sourceDir, 'external.txt'));
  await assert.rejects(inspectSkill(options), { code: 'SYMLINK' });
  await assert.rejects(installSkill(options), { code: 'SYMLINK' });
  const sourceLink = path.join(options.root, 'source-link');
  await fs.symlink(options.sourceDir, sourceLink, 'dir');
  await assert.rejects(inspectSkill({ ...options, sourceDir: sourceLink }), { code: 'SYMLINK' });
  assert.equal(await read(outside), 'outside');
});

test('invalid metadata cannot direct the installer outside the skill', async t => {
  const options = await fixture(t);
  await installSkill(options);
  const marker = JSON.parse(await read(path.join(options.targetDir, '.playbook-install.json')));
  marker.files['../../outside'] = '0'.repeat(64);
  await fs.writeFile(path.join(options.targetDir, '.playbook-install.json'), JSON.stringify(marker));
  assert.equal((await inspectSkill(options)).status, 'conflict');
  await assert.rejects(installSkill(options), { code: 'REPLACE_REQUIRED' });
});

test('backup failure prevents replacement and leaves no install lock or staging tree', async t => {
  const options = await fixture(t);
  await installSkill(options);
  await fs.writeFile(path.join(options.targetDir, 'SKILL.md'), 'local original');
  await fs.writeFile(options.backupRoot, 'not a directory');
  await assert.rejects(installSkill({ ...options, replace: true }), { code: 'INVALID_BACKUP' });
  assert.equal(await read(path.join(options.targetDir, 'SKILL.md')), 'local original');
  assert.equal(await exists(`${options.targetDir}.playbook-lock`), false);
  assert.deepEqual((await fs.readdir(path.dirname(options.targetDir))).filter(name => name.includes('-stage-')), []);
});

test('a failed transaction rename restores the original installation', async t => {
  const options = await fixture(t);
  await installSkill(options);
  const oldSkill = await read(path.join(options.targetDir, 'SKILL.md'));
  await fs.writeFile(path.join(options.sourceDir, 'SKILL.md'), 'replacement');
  const rename = fs.rename;
  const hook = t.mock.method(fs, 'rename', async (from, to) => {
    if (path.basename(from).startsWith('.playbook-playwright-stage-') && to === options.targetDir) throw Object.assign(new Error('simulated commit failure'), { code: 'EIO' });
    return rename(from, to);
  });
  await assert.rejects(installSkill({ ...options, version: '0.2.0', replace: true }), /simulated commit failure/);
  hook.mock.restore();
  assert.equal(await read(path.join(options.targetDir, 'SKILL.md')), oldSkill);
  assert.equal((await inspectSkill(options)).status, 'update');
  assert.equal((await inspectSkill(options)).installedVersion, '0.1.0');
  const containers = await fs.readdir(options.backupRoot);
  assert.equal(await read(path.join(options.backupRoot, containers[0], 'original', 'SKILL.md')), oldSkill);
  assert.equal(await exists(`${options.targetDir}.playbook-lock`), false);
});

test('post-swap verification failure restores originals and retains failed candidate evidence', async t => {
  const options = await fixture(t);
  await installSkill(options);
  const oldSkill = await read(path.join(options.targetDir, 'SKILL.md'));
  await fs.writeFile(path.join(options.sourceDir, 'SKILL.md'), 'replacement');
  const rename = fs.rename;
  const open = fs.open;
  let failNextRead = false;
  const renameHook = t.mock.method(fs, 'rename', async (from, to) => {
    await rename(from, to);
    if (path.basename(from).startsWith('.playbook-playwright-stage-') && to === options.targetDir) failNextRead = true;
  });
  const openHook = t.mock.method(fs, 'open', async (file, ...args) => {
    if (failNextRead && file === path.join(options.targetDir, 'SKILL.md')) {
      failNextRead = false;
      throw Object.assign(new Error('simulated verification read failure'), { code: 'EIO' });
    }
    return open(file, ...args);
  });
  await assert.rejects(installSkill({ ...options, version: '0.2.0', replace: true }), /原目录已恢复/);
  renameHook.mock.restore();
  openHook.mock.restore();
  assert.equal(await read(path.join(options.targetDir, 'SKILL.md')), oldSkill);
  const transaction = (await fs.readdir(path.dirname(options.targetDir))).find(name => name.includes('-transaction-'));
  assert.equal(await read(path.join(path.dirname(options.targetDir), transaction, 'failed-install', 'SKILL.md')), 'replacement');
});

test('concurrent install locks and overlapping paths leave the target untouched', async t => {
  const options = await fixture(t);
  await fs.mkdir(`${options.targetDir}.playbook-lock`, { recursive: true });
  await assert.rejects(installSkill(options), { code: 'INSTALL_BUSY' });
  assert.equal(await exists(options.targetDir), false);
  assert.equal(await exists(`${options.targetDir}.playbook-lock`), true);
  await fs.rm(`${options.targetDir}.playbook-lock`, { recursive: true });
  await assert.rejects(installSkill({ ...options, targetDir: path.join(options.sourceDir, 'playbook-playwright') }), { code: 'PATH_OVERLAP' });
  await installSkill(options);
  await fs.writeFile(path.join(options.targetDir, 'SKILL.md'), 'changed');
  await assert.rejects(installSkill({ ...options, backupRoot: options.targetDir, replace: true }), { code: 'PATH_OVERLAP' });
  assert.equal(await read(path.join(options.targetDir, 'SKILL.md')), 'changed');
});

test('the shipped skill bundle installs and verifies in a temporary user directory', async t => {
  const options = await fixture(t);
  options.sourceDir = path.resolve(import.meta.dirname, '../skills/playbook-playwright');
  const result = await installSkill(options);
  assert.equal(result.status, 'installed');
  assert.equal((await inspectSkill(options)).status, 'installed');
  assert.ok((await inspectSkill(options)).fileCount >= 2);
  assert.equal(await read(path.join(options.targetDir, 'SKILL.md')), await read(path.join(options.sourceDir, 'SKILL.md')));
});
