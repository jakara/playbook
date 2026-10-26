import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const execute = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const cli = path.join(root, 'desktop/install-skill.mjs');
const helper = path.join(root, 'skills/playbook-wright/scripts/install.sh');
const mac = process.platform === 'darwin' && process.arch === 'arm64';
async function run(file, args, env = {}) {
  try { return { code: 0, ...await execute(file, args, { env: { ...process.env, ...env }, timeout: 30000 }) }; }
  catch (error) { if (typeof error.code !== 'number') throw error; return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
}
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'playbook-bootstrap-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const project = path.join(directory, 'project with spaces');
  const source = path.join(directory, 'skills/playbook-wright');
  await fs.mkdir(project); await fs.mkdir(source, { recursive: true });
  await fs.cp(path.join(root, 'skills'), path.join(directory, 'skills'), { recursive: true });
  return { directory, project, source, env: { PLAYBOOK_USER_DATA: path.join(directory, 'data') },
    args: ['--source-dir', source, '--framework', 'codex', '--scope', 'project', '--project-root', project],
    target: path.join(project, '.agents/skills/playbook-wright/SKILL.md') };
}

async function assertFullSkill(f) {
  const guide = await fs.readFile(f.target, 'utf8');
  assert.equal(guide, await fs.readFile(path.join(root, 'skills/playbook-wright/SKILL.md'), 'utf8'));
  assert.doesNotMatch(guide, /edition:\s*community-bootstrap/, 'the installed entry must load the complete authoring Skill');
  for (const reference of ['authoring.md', 'maintenance.md', 'tc-to-playbook.md', 'playbook-to-tc.md']) {
    assert.ok(guide.includes(`references/${reference}`), `the entry must route to ${reference}`);
  }
  const referenceNames = await fs.readdir(path.join(root, 'skills/playbook-wright/references'));
  for (const required of ['authoring.md', 'contract.md', 'interaction.md', 'lifecycle.md', 'tc-to-playbook.md', 'playbook-to-tc.md']) assert.ok(referenceNames.includes(required), required);
  for (const name of referenceNames) {
    assert.equal(await fs.readFile(path.join(path.dirname(f.target), 'references', name), 'utf8'), await fs.readFile(path.join(root, 'skills/playbook-wright/references', name), 'utf8'));
  }
  assert.equal(await fs.readFile(path.join(f.project, '.agents/skills/playbook-playwright/SKILL.md'), 'utf8'), await fs.readFile(path.join(root, 'skills/playbook-playwright/SKILL.md'), 'utf8'));
}
async function useLegacySkill(f, { version, bootstrap }) {
  await fs.rm(path.join(f.directory, 'skills'), { recursive: true });
  for (const name of ['playbook-wright', 'playbook-playwright']) {
    const directory = path.join(f.directory, 'skills', name); await fs.mkdir(directory, { recursive: true });
    const marker = bootstrap ? 'edition: community-bootstrap\n' : '';
    await fs.writeFile(path.join(directory, 'SKILL.md'), `---\nname: ${name}\n${marker}---\nSkill 版本 **${version}**\nLegacy ${bootstrap ? 'bootstrap' : 'full'} fixture\n`);
    if (!bootstrap && name === 'playbook-wright') {
      await fs.mkdir(path.join(directory, 'references'));
      await fs.writeFile(path.join(directory, 'references/legacy-guide.md'), 'Original full Skill guide\n');
    }
  }
}
async function restoreFullSource(f) {
  await fs.rm(path.join(f.directory, 'skills'), { recursive: true });
  await fs.cp(path.join(root, 'skills'), path.join(f.directory, 'skills'), { recursive: true });
}

test('CLI installs the full Skill and compatibility entry, is idempotent and rejects a relative project', async t => {
  const f = await fixture(t);
  const installed = await run(process.execPath, [cli, ...f.args], f.env);
  assert.equal(installed.code, 0, installed.stderr);
  assert.equal(JSON.parse(installed.stdout).ok, true);
  const metadata = path.join(path.dirname(f.target), '.playbook-install.json');
  const before = await fs.readFile(metadata, 'utf8');
  assert.equal((await run(process.execPath, [cli, ...f.args], f.env)).code, 0);
  assert.equal(await fs.readFile(metadata, 'utf8'), before);
  await assertFullSkill(f);
  const invalid = await run(process.execPath, [cli, ...f.args.slice(0, -1), 'relative'], f.env);
  assert.equal(invalid.code, 1);
  assert.equal(JSON.parse(invalid.stderr).code, 'INVALID_PATH');
});

test('0.7.0 bootstrap and older full Skill both update to the complete managed Skill with verified backups', async t => {
  for (const previous of [{ version: '0.10.0', bootstrap: true }, { version: '0.8.0', bootstrap: false }]) await t.test(previous.bootstrap ? '0.7.0 bootstrap package' : 'older full Skill', async t => {
    const f = await fixture(t); await useLegacySkill(f, previous);
    const first = await run(process.execPath, [cli, ...f.args], f.env);
    assert.equal(first.code, 0, first.stderr);
    const original = await fs.readFile(f.target, 'utf8');
    await restoreFullSource(f);
    const preview = await run(process.execPath, [cli, ...f.args, '--preview'], f.env);
    assert.equal(preview.code, 0, preview.stderr);
    assert.equal(JSON.parse(preview.stdout).status, 'update');
    const updated = await run(process.execPath, [cli, ...f.args], f.env);
    assert.equal(updated.code, 0, updated.stderr);
    const receipt = JSON.parse(updated.stdout);
    assert.equal(receipt.backups.length, 2);
    const backup = receipt.backups.find(item => item.name === 'playbook-wright').path;
    assert.equal(await fs.readFile(path.join(backup, 'SKILL.md'), 'utf8'), original);
    assert.equal(JSON.parse(await fs.readFile(path.join(backup, '.playbook-install.json'), 'utf8')).version, previous.version);
    if (!previous.bootstrap) assert.equal(await fs.readFile(path.join(backup, 'references/legacy-guide.md'), 'utf8'), 'Original full Skill guide\n');
    await assertFullSkill(f);
    const after = await run(process.execPath, [cli, ...f.args, '--preview'], f.env);
    assert.equal(after.code, 0, after.stderr); assert.equal(JSON.parse(after.stdout).status, 'installed');
  });
});

test('CLI protects local modifications and symlinks', async t => {
  const f = await fixture(t);
  assert.equal((await run(process.execPath, [cli, ...f.args], f.env)).code, 0);
  await fs.appendFile(f.target, '\nUser note\n');
  const modified = await run(process.execPath, [cli, ...f.args], f.env);
  assert.equal(modified.code, 1);
  assert.equal(JSON.parse(modified.stderr).code, 'REPLACE_REQUIRED');
  const targetDir = path.dirname(f.target), moved = path.join(f.directory, 'linked-original');
  await fs.rename(targetDir, moved); await fs.symlink(moved, targetDir);
  const rejected = await run(process.execPath, [cli, ...f.args, '--replace'], f.env);
  assert.equal(rejected.code, 1);
  assert.equal(JSON.parse(rejected.stderr).code, 'SYMLINK');
  assert.match(await fs.readFile(f.target, 'utf8'), /User note/);
});

test('modified legacy bootstrap is preserved unless replacement is explicit, then fully backed up', async t => {
  const f = await fixture(t); await useLegacySkill(f, { version: '0.10.0', bootstrap: true });
  assert.equal((await run(process.execPath, [cli, ...f.args], f.env)).code, 0);
  await fs.appendFile(f.target, '\nLocal bootstrap change\n');
  await fs.writeFile(path.join(path.dirname(f.target), 'local-note.txt'), 'Keep this additional file\n');
  const before = await fs.readFile(f.target, 'utf8'); await restoreFullSource(f);
  const blocked = await run(process.execPath, [cli, ...f.args], f.env);
  assert.equal(blocked.code, 1); assert.equal(JSON.parse(blocked.stderr).code, 'REPLACE_REQUIRED');
  assert.equal(await fs.readFile(f.target, 'utf8'), before);
  const installed = await run(process.execPath, [cli, ...f.args, '--replace'], f.env);
  assert.equal(installed.code, 0, installed.stderr);
  const backup = JSON.parse(installed.stdout).backups.find(item => item.name === 'playbook-wright').path;
  assert.equal(await fs.readFile(path.join(backup, 'SKILL.md'), 'utf8'), before);
  assert.equal(await fs.readFile(path.join(backup, 'local-note.txt'), 'utf8'), 'Keep this additional file\n');
  assert.equal(await fs.readFile(path.join(path.dirname(f.target), 'local-note.txt'), 'utf8'), 'Keep this additional file\n');
  await assertFullSkill(f);
});

async function fakeApp(directory, version = '0.6.3') {
  const app = path.join(directory, 'Playbook.app');
  await fs.mkdir(path.join(app, 'Contents/MacOS'), { recursive: true });
  await fs.writeFile(path.join(app, 'Contents/Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.playbook.desktop</string><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundleExecutable</key><string>Playbook</string></dict></plist>`);
  const binary = path.join(app, 'Contents/MacOS/Playbook');
  await fs.writeFile(binary, `#!/bin/bash\nexec '${process.execPath.replaceAll("'", "'\\''")}' "$@"\n`, { mode: 0o755 });
  return app;
}
async function shellFixture(t) {
  const f = await fixture(t);
  const assets = path.join(f.directory, 'assets'), payload = path.join(f.directory, 'payload');
  await fs.mkdir(assets); await fs.mkdir(payload);
  await fs.cp(path.join(f.directory, 'skills'), path.join(payload, 'skills'), { recursive: true });
  await build({ entryPoints: [cli], outfile: path.join(payload, 'install-skill.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent' });
  await execute('tar', ['-czf', path.join(assets, 'playbook-skills.tar.gz'), '-C', payload, 'skills', 'install-skill.cjs'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  const curl = path.join(f.directory, 'fixture-curl');
  await fs.writeFile(curl, '#!/bin/bash\nset -eu\noutput=""\nnext=0\nlast=""\nfor arg in "$@"; do\n if [ "$next" = 1 ]; then output="$arg"; next=0; fi\n if [ "$arg" = --output ]; then next=1; fi\n last="$arg"\ndone\nprintf "%s\\n" "$last" >> "$PLAYBOOK_TEST_ASSETS/requests"\ncase "$last" in https://github.com/jakara/playbook/releases/download/v0.7.0/*) ;; *) exit 22 ;; esac\ncp "$PLAYBOOK_TEST_ASSETS/${last##*/}" "$output"\n', { mode: 0o755 });
  const script = path.join(f.directory, 'fixture-install.sh');
  await fs.writeFile(script, (await fs.readFile(helper, 'utf8')).replace('/usr/bin/curl', `"${curl}"`));
  f.env = { ...f.env, PLAYBOOK_RELEASE_TAG: 'v0.7.0', PLAYBOOK_TEST_ASSETS: assets };
  return { ...f, assets, payload, script };
}
async function checksum(f, names = ['playbook-skills.tar.gz']) {
  const lines = [];
  for (const name of names) lines.push(`${createHash('sha256').update(await fs.readFile(path.join(f.assets, name))).digest('hex')}  ${name}`);
  await fs.writeFile(path.join(f.assets, 'SHA256SUMS'), lines.join('\n') + '\n');
}

test('shell detection never downloads; compatible old app runs downloaded standalone CLI', { skip: !mac }, async t => {
  const f = await shellFixture(t), appDir = path.join(f.directory, 'Applications');
  await fakeApp(appDir); await checksum(f);
  const detected = await run('/bin/bash', [f.script, '--check-app', '--app-dir', appDir], f.env);
  assert.equal(detected.code, 0, detected.stderr);
  assert.match(detected.stdout, /version=0.6.3/);
  await assert.rejects(fs.stat(path.join(f.assets, 'requests')), { code: 'ENOENT' });
  const installed = await run('/bin/bash', [f.script, '--install', '--app-dir', appDir, '--framework', 'codex', '--scope', 'project', '--project-root', f.project], f.env);
  assert.equal(installed.code, 0, installed.stderr);
  await assertFullSkill(f);
  assert.doesNotMatch(await fs.readFile(path.join(f.assets, 'requests'), 'utf8'), /latest|\.zip/);
});

test('shell missing check creates nothing, then verified ZIP installs only in selected directory', { skip: !mac }, async t => {
  const f = await shellFixture(t), appDir = path.join(f.directory, 'custom Applications');
  const absent = await run('/bin/bash', [f.script, '--check-app', '--app-dir', appDir], f.env);
  assert.equal(absent.code, 3);
  await assert.rejects(fs.stat(appDir), { code: 'ENOENT' });
  const app = await fakeApp(path.join(f.directory, 'new-app'), '0.7.0');
  await execute('/usr/bin/ditto', ['-c', '-k', '--keepParent', app, path.join(f.assets, 'Playbook-macos-arm64.zip')]);
  await checksum(f, ['playbook-skills.tar.gz', 'Playbook-macos-arm64.zip']);
  const installed = await run('/bin/bash', [f.script, '--ensure-app', '--app-dir', appDir], f.env);
  assert.equal(installed.code, 0, installed.stderr);
  assert.match(await fs.readFile(path.join(appDir, 'Playbook.app/Contents/Info.plist'), 'utf8'), /0.7.0/);
  assert.deepEqual(await fs.readdir(appDir), ['Playbook.app']);
});

test('shell rejects bad checksum and archive symlink before writing a Skill', { skip: !mac }, async t => {
  const f = await shellFixture(t), appDir = path.join(f.directory, 'Applications');
  await fakeApp(appDir);
  const args = [f.script, '--install', '--app-dir', appDir, '--framework', 'codex', '--scope', 'project', '--project-root', f.project];
  await fs.writeFile(path.join(f.assets, 'SHA256SUMS'), `${'0'.repeat(64)}  playbook-skills.tar.gz\n`);
  assert.equal((await run('/bin/bash', args, f.env)).code, 1);
  await assert.rejects(fs.stat(f.target), { code: 'ENOENT' });
  await fs.symlink('/outside-fixture', path.join(f.payload, 'skills/playbook-wright/unsafe-link'));
  await execute('tar', ['-czf', path.join(f.assets, 'playbook-skills.tar.gz'), '-C', f.payload, 'skills', 'install-skill.cjs'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  await checksum(f);
  assert.equal((await run('/bin/bash', args, f.env)).code, 1);
  await assert.rejects(fs.stat(f.target), { code: 'ENOENT' });
});

test('a destination appearing during app installation is preserved without nesting a bundle', { skip: !mac }, async t => {
  const f = await shellFixture(t), appDir = path.join(f.directory, 'race Applications');
  const app = await fakeApp(path.join(f.directory, 'new-app'), '0.7.0');
  await execute('/usr/bin/ditto', ['-c', '-k', '--keepParent', app, path.join(f.assets, 'Playbook-macos-arm64.zip')]);
  await checksum(f, ['playbook-skills.tar.gz', 'Playbook-macos-arm64.zip']);
  const script = await fs.readFile(f.script, 'utf8');
  const appMove = '/bin/mv -n "$APP_STAGE/Playbook.app" "$APP_DIR/"';
  assert.ok(script.includes(appMove));
  await fs.writeFile(f.script, script.replace(appMove, '/bin/mkdir -p "$APP_DIR/Playbook.app"\n/bin/echo user-owned > "$APP_DIR/Playbook.app/user-marker"\n' + appMove));
  const result = await run('/bin/bash', [f.script, '--ensure-app', '--app-dir', appDir], f.env);
  assert.equal(result.code, 1);
  assert.equal(await fs.readFile(path.join(appDir, 'Playbook.app/user-marker'), 'utf8'), 'user-owned\n');
  await assert.rejects(fs.stat(path.join(appDir, 'Playbook.app/Playbook.app')), { code: 'ENOENT' });
});
