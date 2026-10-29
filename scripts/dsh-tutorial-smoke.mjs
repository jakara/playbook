import assert from 'node:assert/strict';
import { mkdtemp, rm, realpath, mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const runtime = path.join(root, 'integrations/dsh/runtime');
const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'playbook-dsh-tutorial-')));
let stop;
try {
  process.env.PLAYBOOK_DSH_ROOT = runtime;
  process.env.PLAYBOOK_DSH_DATA = path.join(temp, 'data');
  process.env.PLAYBOOK_TEST_PACE = '.08';
  await mkdir(process.env.PLAYBOOK_DSH_DATA, { recursive: true });
  await writeFile(path.join(process.env.PLAYBOOK_DSH_DATA, 'settings.json'), JSON.stringify({ schemaVersion: 1, roots: [], narrationEnabled: false }));
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
  const state = await api('getState');
  assert.deepEqual(state.workspaces.map(item => item.name), ['Playbook 内置教程']);
  const tutorial = state.workspaces[0];
  assert.equal(tutorial.builtin, true);
  assert.deepEqual(tutorial.books.map(book => book.title), ['Playbook 使用教程']);
  assert.deepEqual(tutorial.items.map(item => [item.id, item.valid]), [
    ['tutorial.browse', true], ['tutorial.playback', true], ['tutorial.skill', true],
  ]);
  for (const [entryId, expectedSteps] of [['tutorial.browse', 8], ['tutorial.skill', 7]]) {
    await api('play', { workspaceId: tutorial.id, entryId, kind: 'script' });
    const deadline = Date.now() + 120000;
    let run;
    while (Date.now() < deadline) {
      run = (await api('getState')).activeRun;
      if (['completed', 'failed', 'stopped', 'interrupted'].includes(run?.state)) break;
      await sleep(150);
    }
    assert.equal(run?.state, 'completed', JSON.stringify({ entryId, state: run?.state, error: run?.error, executionError: run?.executionError }));
    assert.equal(run.completed, expectedSteps);
    const exitDeadline = Date.now() + 5000;
    const workerAlive = () => { try { process.kill(run.workerPid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
    while (workerAlive() && Date.now() < exitDeadline) await sleep(50);
    assert.equal(workerAlive(), false, 'completed streaming playback must release its browser and exit its worker');
  }
  console.log('DSH tutorial smoke: only Playbook tutorial listed; browse and Skill lessons completed in packaged runtime');
} finally {
  await stop?.();
  await rm(temp, { recursive: true, force: true });
}
