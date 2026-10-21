import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.env.PLAYBOOK_RESUME_APP_ROOT || process.cwd());
const output = path.join(root, 'artifacts', `v021-resume-smoke-${Date.now()}`);
await mkdir(output, { recursive: true });
const fixture = path.join(output, 'fixture.mjs');
await writeFile(fixture, `
import assert from 'node:assert/strict';
const boundsFor = async context => {
  const session = await context.page.context().newCDPSession(context.page);
  try { return (await session.send('Browser.getWindowBounds', { windowId: context.windowId })).bounds; }
  finally { await session.detach(); }
};
export const profile = {
  schemaVersion: 1, id: 'resume-smoke', title: 'Synthetic resume QA', dataMode: 'fixture', roles: [],
  async prepare({ page }) {
    await page.setContent('<title>Playbook resume verification</title><h1>Resume verification</h1><p>Synthetic fixture; no business service or account.</p>');
    return { context: { page } };
  },
};
export const flows = [{
  schemaVersion: 1, id: 'resume-window', title: 'Chrome window restoration', summary: 'Synthetic window-state verification',
  requirements: { dataMode: 'fixture', effects: 'read-only', replay: 'safe', roles: [] },
  presentation: { openingMs: 0, defaultHoldMs: 0 },
  steps: [{
    id: 'minimize', title: 'Minimize controlled Chrome', explain: 'Minimize only this test window.', presentation: { afterMs: 0 },
    async run(context) {
      const session = await context.page.context().newCDPSession(context.page);
      try {
        context.windowId = (await session.send('Browser.getWindowForTarget')).windowId;
        const initial = (await session.send('Browser.getWindowBounds', { windowId: context.windowId })).bounds;
        process.send({ type: 'qa', stage: 'initial-window', windowId: context.windowId, bounds: initial });
        if (initial.windowState !== 'normal') {
          await session.send('Browser.setWindowBounds', { windowId: context.windowId, bounds: { windowState: 'normal' } });
          let normalized;
          for (let attempt = 0; attempt < 40; attempt++) {
            normalized = (await session.send('Browser.getWindowBounds', { windowId: context.windowId })).bounds;
            if (normalized.windowState === 'normal') break;
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          process.send({ type: 'qa', stage: 'normalized-window', windowId: context.windowId, bounds: normalized });
          assert.equal(normalized.windowState, 'normal', 'Controlled Chrome must leave its startup maximized state before minimization');
        }
        await session.send('Browser.setWindowBounds', { windowId: context.windowId, bounds: { windowState: 'minimized' } });
      } finally { await session.detach(); }
      let bounds;
      for (let attempt = 0; attempt < 40; attempt++) {
        bounds = await boundsFor(context);
        if (bounds.windowState === 'minimized') break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.equal(bounds.windowState, 'minimized');
      // Wait for the parent to request pause before letting the runner leave this atomic step.
      await new Promise(resolve => {
        const listener = message => { if (message.command === 'qa-minimized-ack') { process.off('message', listener); resolve(); } };
        process.on('message', listener);
        process.send({ type: 'qa', stage: 'minimized', windowId: context.windowId, bounds });
      });
    },
    async verify(context) { assert.equal((await boundsFor(context)).windowState, 'minimized'); },
  }, {
    id: 'restored', title: 'Check resumed window', explain: 'Resume must restore the controlled window before the next action.', presentation: { afterMs: 0 },
    async run(context) {
      const bounds = await boundsFor(context);
      assert.equal(bounds.windowState, 'normal');
      process.send({ type: 'qa', stage: 'restored', windowId: context.windowId, bounds });
    },
    async verify(context) { assert.equal((await boundsFor(context)).windowState, 'normal'); },
  }],
}];
`);

const events = [], checks = { realChromeMinimized: false, pausedAtCheckpoint: false, realChromeRestored: false, resumedRunCompleted: false };
let child, exited = false, exitCode, stdout = '', stderr = '', resolveRun, rejectRun, timeout;
const result = new Promise((resolve, reject) => { resolveRun = resolve; rejectRun = reject; });
const log = (direction, message) => events.push({ at: new Date().toISOString(), direction, message });
const send = message => { log('parent-to-runner', message); child.send(message); };
let resumed = false, failure;
async function boundedExit(promise, milliseconds) {
  let timer;
  try { return await Promise.race([promise.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
try {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  child = fork(path.join(root, 'build/runner.cjs'), [], { cwd: output, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const exit = new Promise(resolve => child.once('exit', code => { exited = true; exitCode = code; resolve(code); }));
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', rejectRun);
  child.on('exit', code => { if (!checks.resumedRunCompleted) rejectRun(new Error(`Runner exited before completion (${code})`)); });
  child.on('message', message => {
    log('runner-to-parent', message);
    if (message.type === 'qa' && message.stage === 'minimized') {
      checks.realChromeMinimized = message.bounds.windowState === 'minimized';
      send({ command: 'pause' });
      send({ command: 'qa-minimized-ack' });
    }
    if (message.type === 'state' && message.update.state === 'paused' && checks.realChromeMinimized && !resumed) {
      checks.pausedAtCheckpoint = true; resumed = true;
      send({ command: 'resume' });
    }
    if (message.type === 'qa' && message.stage === 'restored') checks.realChromeRestored = message.bounds.windowState === 'normal';
    if (message.type === 'state' && message.update.state === 'failed') rejectRun(new Error(message.update.error || 'Runner failed'));
    if (message.type === 'state' && message.update.state === 'completed') {
      checks.resumedRunCompleted = message.update.completed === 2 && message.update.total === 2;
      resolveRun(message.update);
    }
  });
  timeout = setTimeout(() => rejectRun(new Error('Real Chrome resume verification timed out')), 35000);
  send({ command: 'start', config: { bundle: fixture, appRoot: root, workspaceDir: output, runId: 'resume-smoke', title: 'Chrome resume smoke', profileId: 'resume-smoke', dataMode: 'fixture', parameters: {}, headless: false, pace: .03 } });
  await result;
  for (const [name, passed] of Object.entries(checks)) assert.equal(passed, true, name);
  send({ command: 'close' });
  const closed = await boundedExit(exit, 8000);
  assert.equal(closed, true, 'Runner must close its own Chrome and exit');
  assert.equal(exitCode, 0);
} catch (error) {
  failure = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  if (child && !exited) {
    if (child.connected) send({ command: 'close' });
    await boundedExit(new Promise(resolve => child.once('exit', resolve)), 3000);
    if (!exited) child.kill();
  }
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, checks,
    limitation: 'Verifies a real controlled Chrome window minimized -> normal and continued runner execution. Does not verify operating-system foreground focus after switching to another application.',
    failure, events, exitCode }, null, 2));
  await writeFile(path.join(output, 'runner.stdout.log'), stdout);
  await writeFile(path.join(output, 'runner.stderr.log'), stderr);
  console.log(JSON.stringify({ passed: !failure, checks, output, error: failure?.message }));
}
