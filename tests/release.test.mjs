import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseVersion, compareVersions, releaseFiles, stageRelease, validateDistribution } from '../scripts/stage-release.mjs';
import { olderSeriesReleases, publishRelease, verifyUploadedAssets, githubClient } from '../scripts/release.mjs';

const commit = 'a'.repeat(40), otherCommit = 'b'.repeat(40);
async function write(root, name, value) { await mkdir(path.dirname(path.join(root, name)), { recursive: true }); await writeFile(path.join(root, name), value); }
async function fixture(t, version = '0.7.1', stage = true) {
  const root = await mkdtemp(path.join(tmpdir(), 'playbook-release-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await write(root, 'package.json', JSON.stringify({ version }));
  if (!stage) return { root };
  for (const name of releaseFiles.slice(0, 2)) await write(root, `release/${name}`, `disposable fixture: ${name}`);
  for (const name of ['playbook-wright', 'playbook-playwright']) await write(root, `skills/${name}/SKILL.md`, `name: ${name}\n`);
  await write(root, 'skills/playbook-wright/scripts/install.sh', '#!/bin/sh\nprintf "fixture"\n');
  await write(root, 'build/install-skill.cjs', 'console.log("fixture installer");\n');
  const staged = await stageRelease({ root, commit });
  return { root, staged, built: await validateDistribution(staged.directory, { version, commit }) };
}
const rel = (id, tag, extra = {}) => ({ id, tag_name: tag, draft: false, prerelease: false, assets: [], target_commitish: commit, ...extra });
function fakeGithub(initial = [], failure) {
  const events = [], releases = structuredClone(initial), refs = new Map();
  const github = {
    events, releases, refs,
    async listReleases() { events.push('list'); return structuredClone(releases); },
    async tagCommit(tag) {
      events.push(`tag:${tag}`);
      if (failure === 'published-tag' && releases.some(item => item.tag_name === tag && !item.draft)) return otherCommit;
      return refs.get(tag) || null;
    },
    async createDraft(body) {
      events.push('create'); if (failure === 'create') throw new Error('create failed');
      const created = { id: 100, assets: [], ...body }; releases.push(created); return structuredClone(created);
    },
    async uploadAssets(tag, files) {
      events.push('upload'); if (failure === 'upload') throw new Error('upload failed');
      const item = releases.find(release => release.tag_name === tag);
      item.assets = files.map((file, index) => ({ id: index + 1, name: file.name, size: file.size, digest: `sha256:${failure === 'checksum' && !index ? '0'.repeat(64) : file.sha256}` }));
    },
    async getRelease(id) { events.push('get'); return structuredClone(releases.find(item => item.id === id)); },
    async publishDraft(id, body) {
      events.push('publish'); if (failure === 'publish') throw new Error('publish failed');
      const item = releases.find(release => release.id === id); Object.assign(item, body); refs.set(item.tag_name, item.target_commitish); return structuredClone(item);
    },
    async deleteRelease(id) { events.push(`delete:${id}`); const index = releases.findIndex(item => item.id === id); releases.splice(index, 1); },
    async assetHash() { throw new Error('Unexpected digest fallback'); },
  };
  return github;
}

test('release series parses stable numeric versions and compares numbers instead of strings', () => {
  assert.deepEqual(parseVersion('v0.7.10'), { version: '0.7.10', tag: 'v0.7.10', series: '0.7', major: 0, minor: 7, patch: 10 });
  assert.ok(compareVersions(parseVersion('0.7.10'), parseVersion('0.7.9')) > 0);
  assert.ok(compareVersions(parseVersion('1.0.0'), parseVersion('0.99.99')) > 0);
  for (const value of ['0.7', 'v1', '01.0.0', '0.7.0-beta.1', '0.7.0+build', 'latest', '', '0.7.-1']) assert.throws(() => parseVersion(value));
});

test('staging contains app files, safe bounded Skill roots, installer and complete checksums', async t => {
  const { root, staged, built } = await fixture(t);
  assert.deepEqual((await readdir(staged.directory)).sort(), [...releaseFiles].sort());
  assert.equal(built.manifest.version, '0.7.1'); assert.equal(built.manifest.commit, commit);
  assert.deepEqual([built.manifest.platform, built.manifest.arch, built.manifest.unsigned], ['darwin', 'arm64', true]);
  const archive = path.join(staged.directory, 'playbook-skills.tar.gz');
  const names = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
  assert.ok(names.includes('install-skill.cjs'));
  for (const name of names) assert.ok(!name.startsWith('/') && !name.split('/').includes('..') && /^(?:skills\/playbook-(?:wright|playwright)(?:\/|$)|install-skill\.cjs$)/.test(name), name);
  const extracted = path.join(root, 'extracted'); await mkdir(extracted);
  execFileSync('tar', ['-xzf', archive, '-C', extracted]);
  assert.equal(await readFile(path.join(extracted, 'install-skill.cjs'), 'utf8'), await readFile(path.join(root, 'build/install-skill.cjs'), 'utf8'));
  assert.equal((await readFile(path.join(staged.directory, 'SHA256SUMS'), 'utf8')).trim().split('\n').length, 5);
});

test('staging rejects linked Skill files and leaves a prior complete distribution intact', async t => {
  const { root, staged } = await fixture(t);
  const before = await readFile(path.join(staged.directory, 'release.json'), 'utf8');
  await symlink(path.join(root, 'package.json'), path.join(root, 'skills/playbook-wright/linked.json'));
  await assert.rejects(stageRelease({ root, commit }), /symbolic links/);
  assert.equal(await readFile(path.join(staged.directory, 'release.json'), 'utf8'), before);
  assert.ok(!(await readdir(root)).some(name => name.startsWith('.distribution-')));
});

test('release bundle excludes private professional Skills and unrelated historical files', async t => {
  const { root } = await fixture(t);
  await write(root, '.private/skills/playbook-wright/references/professional.md', 'private fixture that must never be distributed');
  await write(root, 'artifacts/old-skill/SKILL.md', 'historical fixture that must never be distributed');
  const staged = await stageRelease({ root, commit });
  const names = execFileSync('tar', ['-tzf', path.join(staged.directory, 'playbook-skills.tar.gz')], { encoding: 'utf8' });
  assert.doesNotMatch(names, /\.private|professional|artifacts|old-skill/);
  const packed = execFileSync('tar', ['-xOzf', path.join(staged.directory, 'playbook-skills.tar.gz')], { encoding: 'utf8' });
  assert.doesNotMatch(packed, /private fixture|historical fixture/);
});

test('distribution validation catches changed bytes and foreign build identity', async t => {
  const { root, staged } = await fixture(t);
  await assert.rejects(validateDistribution(staged.directory, { version: '0.7.2' }), /manifest/);
  await assert.rejects(validateDistribution(staged.directory, { commit: otherCommit }), /manifest/);
  await write(root, 'distribution/install.sh', 'changed');
  await assert.rejects(validateDistribution(staged.directory), /checksum mismatch/);
});

test('a successful patch verifies and publishes first, then removes only lower patches in that series', async t => {
  const { root } = await fixture(t, '0.7.2');
  const github = fakeGithub([rel(1, 'v0.7.0'), rel(2, 'v0.7.1'), rel(3, 'v0.6.9'), rel(4, 'v1.0.0'), rel(5, 'nightly')]);
  github.refs.set('v0.7.0', otherCommit);
  const result = await publishRelease({ root, github });
  assert.deepEqual(result, { status: 'published', tag: 'v0.7.2', latest: false, deleted: ['v0.7.0', 'v0.7.1'] });
  assert.ok(github.events.indexOf('get') < github.events.indexOf('publish'));
  assert.ok(github.events.indexOf('publish') < github.events.indexOf('delete:1'));
  assert.deepEqual(github.releases.map(item => item.tag_name).sort(), ['nightly', 'v0.6.9', 'v0.7.2', 'v1.0.0']);
  assert.equal(github.refs.get('v0.7.0'), otherCommit, 'release pruning must preserve old Git tags');
});

test('a new major/minor series preserves all previous series and can become latest', async t => {
  const { root } = await fixture(t, '1.0.0');
  const github = fakeGithub([rel(1, 'v0.7.9'), rel(2, 'v0.8.0')]);
  const result = await publishRelease({ root, github });
  assert.equal(result.latest, true); assert.deepEqual(result.deleted, []);
  assert.equal(github.releases.length, 3);
  assert.deepEqual(olderSeriesReleases([rel(1, 'v0.7.9'), rel(2, 'v1.0.1')], parseVersion('1.0.0')), []);
});

test('downgrading a series does not publish over or delete a newer patch', async t => {
  const { root } = await fixture(t, '0.7.1', false);
  const github = fakeGithub([rel(1, 'v0.7.2'), rel(2, 'v0.7.0')]);
  const result = await publishRelease({ root, github });
  assert.equal(result.status, 'superseded'); assert.deepEqual(github.events, ['list']);
  assert.equal(github.releases.length, 2);
});

test('ordinary same-version push skips a published release even when the current commit changed', async t => {
  const { root } = await fixture(t, '0.7.1', false);
  const github = fakeGithub([rel(1, 'v0.7.1', { target_commitish: otherCommit })]);
  const result = await publishRelease({ root, github, commit });
  assert.equal(result.status, 'skipped'); assert.deepEqual(github.events, ['list']);
});

test('retrying the same failed draft re-uploads and verifies assets without creating another release', async t => {
  const { root } = await fixture(t);
  const github = fakeGithub([rel(1, 'v0.7.0'), rel(100, 'v0.7.1', { draft: true })]);
  const result = await publishRelease({ root, github });
  assert.equal(result.status, 'published'); assert.ok(!github.events.includes('create'));
  assert.equal(github.releases.length, 1); assert.equal(github.releases[0].assets.length, 6);
});

test('an immutable tag or draft belonging to another commit requires a new version', async t => {
  for (const mismatch of ['tag', 'draft']) await t.test(mismatch, async t => {
    const { root } = await fixture(t);
    const github = fakeGithub([rel(1, 'v0.7.0'), ...(mismatch === 'draft' ? [rel(100, 'v0.7.1', { draft: true, target_commitish: otherCommit })] : [])]);
    if (mismatch === 'tag') github.refs.set('v0.7.1', otherCommit);
    await assert.rejects(publishRelease({ root, github }), /different commit|another commit/);
    assert.ok(!github.events.includes('upload')); assert.ok(!github.events.some(event => event.startsWith('delete:')));
  });
});

test('creation, upload, checksum, publication and final tag failures never delete the older release', async t => {
  for (const failure of ['create', 'upload', 'checksum', 'publish', 'published-tag']) await t.test(failure, async t => {
    const { root } = await fixture(t);
    const github = fakeGithub([rel(1, 'v0.7.0')], failure);
    await assert.rejects(publishRelease({ root, github }));
    assert.ok(github.releases.some(item => item.id === 1));
    assert.ok(!github.events.some(event => event.startsWith('delete:')));
  });
});

test('remote assets without API digests are downloaded and hashed; wrong names/sizes are rejected', async t => {
  const { built } = await fixture(t);
  const release = { tag_name: 'v0.7.1', assets: built.files.map(file => ({ name: file.name, size: file.size })) };
  const downloads = [];
  await verifyUploadedAssets(release, built.files, { async assetHash(tag, asset) { downloads.push([tag, asset.name]); return built.files.find(file => file.name === asset.name).sha256; } });
  assert.equal(downloads.length, 6);
  release.assets[0].size++;
  await assert.rejects(verifyUploadedAssets(release, built.files, {}), /size mismatch/);
  release.assets[0].name = '../escape';
  await assert.rejects(verifyUploadedAssets(release, built.files, {}), /unexpected assets/);
});

test('GitHub adapter paginates and only deletes release objects, never tags', async () => {
  const calls = [];
  const github = githubClient('jakara/playbook', (args, body) => {
    calls.push({ args, body });
    if (args[1].endsWith('&page=1')) return JSON.stringify(Array.from({ length: 100 }, (_, index) => rel(index, `v0.7.${index}`)));
    if (args[1].endsWith('&page=2')) return JSON.stringify([rel(101, 'v1.0.0')]);
    return '';
  });
  assert.equal((await github.listReleases()).length, 101);
  await github.deleteRelease(9);
  assert.deepEqual(calls[2].args, ['api', 'repos/jakara/playbook/releases/9', '--method', 'DELETE']);
});

test('series pruning preserves draft and prerelease evidence', () => {
  const releases = [rel(1, 'v0.7.0'), rel(2, 'v0.7.1', { draft: true }), rel(3, 'v0.7.2', { prerelease: true })];
  assert.deepEqual(olderSeriesReleases(releases, parseVersion('0.7.3')).map(item => item.id), [1]);
});
