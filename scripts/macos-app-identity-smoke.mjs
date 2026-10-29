import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { build } from 'esbuild';
import { _electron as electron } from 'playwright';

if (process.platform !== 'darwin') {
  console.log(JSON.stringify({ skipped: 'macOS only' }));
  process.exit(0);
}

const root = process.cwd();
const temp = await mkdtemp('/private/tmp/playbook-macos-identity-');
const evidence = path.join(root, 'artifacts', `macos-app-identity-${Date.now()}`);
await mkdir(path.join(temp, 'build/ui'), { recursive: true });
await mkdir(evidence, { recursive: true });
await writeFile(path.join(temp, 'build/ui/index.html'), '<!doctype html><title>Playback control identity check</title>');
await writeFile(path.join(temp, 'build/control-preload.cjs'), '');
await build({ stdin: { contents: `
  import { app, BrowserWindow } from 'electron';
  import { createPlaybackControl } from ${JSON.stringify(path.join(root, 'desktop/playback-control.mjs'))};
  app.setPath('userData', ${JSON.stringify(path.join(temp, 'data'))});
  app.whenReady().then(() => {
    globalThis.main = new BrowserWindow({ show: false });
    globalThis.createControl = () => {
      globalThis.run = { id: 'identity-check', state: 'waiting' };
      globalThis.control = createPlaybackControl({ appRoot: ${JSON.stringify(temp)}, getRun: () => globalThis.run, shortcut: {}, onVisibilityChange() {} });
      return globalThis.control.ready;
    };
  });
`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile: path.join(temp, 'fixture.cjs') });

const run = promisify(execFile);
async function applicationType(pid) {
  const { stdout } = await run('/usr/bin/lsappinfo', ['list']);
  const block = stdout.split(/(?=^\d+\))/m).find(value => new RegExp(`\\bpid = ${pid} `).test(value));
  return block?.match(/type="([^"]+)"/)?.[1] || 'missing';
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let application;
const result = { evidence, phases: [] };
try {
  application = await electron.launch({ args: [path.join(temp, 'fixture.cjs')], env, timeout: 25000 });
  await application.evaluate(async ({ app }) => { await app.whenReady(); });
  const pid = application.process().pid;
  async function check(phase) {
    await sleep(200);
    const type = await applicationType(pid);
    const dockVisible = await application.evaluate(({ app }) => app.dock.isVisible());
    result.phases.push({ phase, type, dockVisible });
    assert.equal(type, 'Foreground', `${phase}: playback control must not make the whole app a UIElement`);
    assert.equal(dockVisible, true, `${phase}: app must remain in the Dock and application switcher`);
  }
  await check('before-control');
  await application.evaluate(() => globalThis.createControl());
  await check('control-created');
  const shown = await application.evaluate(() => { globalThis.control.pulse(); return { visible: globalThis.control.state().visible, allWorkspaces: globalThis.control.window.isVisibleOnAllWorkspaces() }; });
  assert.equal(shown.visible, true);
  assert.equal(shown.allWorkspaces, true);
  await check('control-visible');
  await application.evaluate(() => { globalThis.control.setCollapsed(true); globalThis.control.setCollapsed(false); globalThis.run = null; globalThis.control.pulse(); });
  assert.equal(await application.evaluate(() => globalThis.control.state().visible), false);
  await check('control-hidden');
  await application.evaluate(() => globalThis.control.dispose());
  await check('control-disposed');
  result.passed = true;
} catch (error) {
  result.passed = false; result.error = error.stack; process.exitCode = 1;
} finally {
  await application?.close().catch(() => {});
  await writeFile(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
  await rm(temp, { recursive: true, force: true });
  console.log(JSON.stringify(result));
}
