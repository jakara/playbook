import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, mkdir, rm, realpath } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'playbook-text-edit-dsh-')));
const project = path.join(temp, 'project'), dataDir = path.join(temp, 'data');
const signal = path.join(temp, 'signal.txt');
let stop;
try {
  await cp(path.join(root, 'examples/starter'), project, { recursive: true });
  await mkdir(dataDir);
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
        await form.locator('input').fill('DSH 落盘标题');
        await form.locator('textarea').fill('DSH 暂停弹窗写入的说明。');
        await form.locator('button[type="submit"]').click();
        await page.getByText('DSH 落盘标题', { exact: true }).waitFor({ timeout: 8000 });
        done = true; await writeSignal(parameters.textEditSignal, 'saved');
      } catch (error) { done = true; await writeSignal(parameters.textEditSignal, 'error:' + error.message); }
      finally { busy = false; }
    }, 100);
    return { context: { page }, async release() { clearInterval(timer); } };`;
  assert.ok(originalProfile.includes('return { context: { page } };'));
  await writeFile(profileFile, `import { writeFile as writeSignal } from 'node:fs/promises';\n` +
    originalProfile.replace('return { context: { page } };', observer));
  await writeFile(path.join(dataDir, 'settings.json'), JSON.stringify({ schemaVersion: 1, roots: [project] }));
  process.env.PLAYBOOK_DSH_ROOT = root;
  process.env.PLAYBOOK_DSH_DATA = dataDir;
  process.env.PLAYBOOK_TEST_PACE = '.5';
  const handle = await (await import(pathToFileURL(path.join(root, 'integrations/dsh/server.mjs')).href)).startServer();
  stop = handle.stop;
  const base = handle.url.slice(0, -1);
  const html = await (await fetch(base)).text();
  const token = JSON.parse(html.match(/window\.__PLAYBOOK_DSH_TOKEN=("[^"]+")/)?.[1] || 'null');
  assert.ok(token);
  const api = async (method, input) => {
    const response = await fetch(`${base}/api/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Playbook-Token': token }, body: JSON.stringify(input ?? null) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    return body.result;
  };
  const until = async (predicate, timeout = 45000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const value = await predicate(); if (value) return value; await sleep(100); }
    throw new Error('DSH 等待播放状态超时');
  };
  const workspace = await until(async () => (await api('getState')).workspaces.find(item => item.path === project));
  await api('play', { workspaceId: workspace.id, entryId: 'starter.overview', kind: 'script' });
  await until(async () => (await readFile(signal, 'utf8').catch(() => '')) === 'ready');
  await api('control', 'pause');
  await until(async () => (await api('getState')).activeRun?.state === 'paused');
  await until(async () => {
    const value = await readFile(signal, 'utf8').catch(() => '');
    if (value.startsWith('error:')) throw new Error(value);
    return value === 'saved';
  }, 20000);
  const run = (await api('getState')).activeRun;
  assert.equal(run.textEdits?.length, 1);
  const written = await readFile(path.join(project, 'flows/overview.playbook.ts'), 'utf8');
  assert.ok(written.includes('DSH 落盘标题') && written.includes('DSH 暂停弹窗写入的说明。'));
  await api('control', 'stop');
  await until(async () => (await api('getState')).activeRun?.state === 'stopped');
  console.log('text-edit DSH smoke: paused popup saved to source and recorded edit');
} finally {
  await stop?.();
  await rm(temp, { recursive: true, force: true });
}
