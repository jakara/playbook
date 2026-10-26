import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtemp, cp, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'playbook-text-edit-desktop-')));
const project = path.join(temp, 'project');
const userData = path.join(temp, 'app-data');
const signal = path.join(temp, 'signal.txt');
let app;
try {
  await cp(path.join(root, 'examples/starter'), project, { recursive: true });
  const manifestFile = path.join(project, '.playbook.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  manifest.profiles[0].parameters.textEditSignal = signal;
  await writeFile(manifestFile, JSON.stringify(manifest));
  const profileFile = path.join(project, 'profiles/local.profile.ts');
  const originalProfile = await readFile(profileFile, 'utf8');
  const observer = `
    let ready = false, done = false, busy = false;
    const timer = setInterval(async () => {
      if (busy || done || page.isClosed()) return;
      busy = true;
      try {
        const view = await page.evaluate(() => window.playbookGuide?.inspect());
        if (!view?.popoverVisible) return;
        if (!ready) { ready = true; await writeSignal(parameters.textEditSignal, 'ready'); }
        if (view.phase !== 'paused') return;
        await page.locator('.ygd-edit-button:visible').click();
        const form = page.locator('.ygd-text-editor form:visible');
        await form.locator('input').fill('落盘后的课程说明');
        await form.locator('textarea').fill('这段说明来自暂停时的弹窗编辑。');
        await form.locator('button[type="submit"]').click();
        await page.getByText('落盘后的课程说明', { exact: true }).waitFor({ timeout: 8000 });
        done = true; await writeSignal(parameters.textEditSignal, 'saved');
      } catch (error) { done = true; await writeSignal(parameters.textEditSignal, 'error:' + error.message); }
      finally { busy = false; }
    }, 100);
    return { context: { page }, async release() { clearInterval(timer); } };`;
  assert.ok(originalProfile.includes('return { context: { page } };'));
  await writeFile(profileFile, `import { writeFile as writeSignal } from 'node:fs/promises';\n` +
    originalProfile.replace('return { context: { page } };', observer));
  const env = { ...process.env, PLAYBOOK_USER_DATA: userData, PLAYBOOK_WORKSPACE: project,
    PLAYBOOK_TEST_HEADLESS: '1', PLAYBOOK_TEST_PACE: '.5' };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [root], env, timeout: 30000 });
  await app.firstWindow();
  const page = await (async () => {
    for (let attempt = 0; attempt < 150; attempt++) {
      for (const candidate of app.windows()) if (await candidate.evaluate(() => Boolean(window.playbook)).catch(() => false)) return candidate;
      await sleep(100);
    }
    throw new Error('Playbook 主窗口未就绪');
  })();
  const state = () => page.evaluate(() => window.playbook.getState());
  const control = command => page.evaluate(value => window.playbook.control(value), command);
  const until = async (predicate, timeout = 30000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const value = await predicate(); if (value) return value; await sleep(100); }
    throw new Error('等待播放状态超时：' + JSON.stringify((await state()).workspaces.map(item => ({ path: item.path, error: item.error }))));
  };
  const workspace = await until(async () => (await state()).workspaces.find(item => item.path === project));
  assert.equal(workspace.error, undefined);
  await page.evaluate(input => window.playbook.play(input), { workspaceId: workspace.id, entryId: 'starter.overview', kind: 'script', browser: 'external' });
  await until(async () => (await readFile(signal, 'utf8').catch(() => '')) === 'ready', 45000);
  await control('pause');
  await until(async () => (await state()).activeRun?.state === 'paused');
  const result = await until(async () => {
    const value = await readFile(signal, 'utf8').catch(() => '');
    if (value.startsWith('error:')) throw new Error(value);
    return value === 'saved';
  }, 20000);
  assert.equal(result, true);
  const run = (await state()).activeRun;
  assert.equal(run.textEdits?.length, 1);
  const file = path.join(project, 'flows/overview.playbook.ts');
  const written = await readFile(file, 'utf8');
  assert.ok(written.includes('落盘后的课程说明'));
  assert.ok(written.includes('这段说明来自暂停时的弹窗编辑。'));
  await control('stop');
  await until(async () => (await state()).activeRun?.state === 'stopped');
  await page.evaluate(input => window.playbook.play(input), { workspaceId: workspace.id, entryId: 'starter.overview', kind: 'script', browser: 'external' });
  const replay = await until(async () => (await state()).activeRun?.steps?.some(step => step.title === '落盘后的课程说明'));
  assert.ok(replay);
  await control('stop');
  await until(async () => (await state()).activeRun?.state === 'stopped');
  console.log('text-edit desktop smoke: paused popup saved to source, recorded edit, replay loaded saved text');
} finally {
  await app?.close();
  await rm(temp, { recursive: true, force: true });
}
