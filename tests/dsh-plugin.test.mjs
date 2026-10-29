import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

test('DSH instances discover separate loopback ports while the old port is occupied, retain auth, and release listeners', { timeout: 30000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'playbook-dsh-test-'));
  const children = [];
  const occupied = createServer();
  t.after(async () => {
    for (const child of children) if (child.exitCode === null) child.kill();
    if (occupied.listening) await new Promise(resolve => occupied.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    occupied.once('error', error => error.code === 'EADDRINUSE' ? resolve() : reject(error));
    occupied.listen(43188, '127.0.0.1', resolve);
  });

  async function start(name) {
    const data = path.join(directory, name);
    await mkdir(data);
    await writeFile(path.join(data, 'runs.json'), JSON.stringify([
      { id: 'old-completed', state: 'completed', title: 'Old completed run', total: 1, completed: 1 },
      { id: 'old-interrupted', state: 'playing', title: 'Old interrupted run', workspacePath: '/retained/project',
        executing: true, steps: [{ id: 'retained-step' }], annotations: [{ id: 'retained-note' }] },
    ]));
    const child = spawn(process.execPath, ['--input-type=module', '-e', `
      import { apply } from ${JSON.stringify(new URL('../integrations/dsh/index.js', import.meta.url).href)};
      const disposers = [];
      let route;
      await apply({
        effect: factory => {
          const effect = factory();
          if (effect && typeof effect.next === 'function') {
            for (const _dispose of effect) { /* Nested effects remain in the test-owned disposal list. */ }
            return () => {};
          }
          disposers.push(effect);
          return effect;
        },
        provide: () => () => {},
        connection: { fetch: { register: value => { route = value; return () => {}; } } },
      });
      const response = await route.fetch();
      process.send({ ...await response.json(), path: route.path, cache: response.headers.get('cache-control') });
      process.once('message', async () => {
        for (const dispose of disposers.reverse()) await dispose();
        process.disconnect();
      });
    `], { cwd: root, env: { ...process.env, PLAYBOOK_DSH_ROOT: root, PLAYBOOK_DSH_DATA: path.join(directory, name) }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    children.push(child);
    let errors = '';
    child.stderr.on('data', bytes => { errors += bytes; });
    const ready = await Promise.race([
      once(child, 'message').then(([message]) => message),
      once(child, 'exit').then(([code]) => { throw new Error(`DSH startup exited ${code}: ${errors}`); }),
    ]);
    assert.equal(ready.path, '/api/playbook/endpoint');
    assert.equal(ready.cache, 'no-store');
    assert.equal(new URL(ready.url).hostname, '127.0.0.1');
    assert.notEqual(new URL(ready.url).port, '43188');
    return { child, ...ready };
  }

  const first = await start('dsh'), second = await start('workraft');
  assert.notEqual(first.url, second.url);
  for (const instance of [first, second]) {
    const html = await (await fetch(instance.url)).text();
    const token = JSON.parse(html.match(/window\.__PLAYBOOK_DSH_TOKEN=("[^"]+")/)?.[1] || 'null');
    assert.ok(token);
    const api = (auth, origin) => fetch(`${instance.url}api/getState`, { method: 'POST', headers: {
      'Content-Type': 'application/json', ...(auth ? { 'X-Playbook-Token': auth } : {}), ...(origin ? { Origin: origin } : {}),
    }, body: 'null' });
    assert.equal((await api()).status, 403);
    assert.equal((await api(token, 'https://example.invalid')).status, 403);
    const response = await api(token, new URL(instance.url).origin);
    assert.equal(response.status, 200);
    const state = (await response.json()).result;
    assert.ok(state.workspaces.some(item => item.builtin));
    const completed = state.runs.find(run => run.id === 'old-completed');
    assert.equal(completed.state, 'completed');
    assert.equal(completed.completed, 1);
    const interrupted = state.runs.find(run => run.id === 'old-interrupted');
    assert.ok(interrupted, 'interrupted run must retain its identity on restart');
    assert.equal(interrupted.state, 'failed');
    assert.equal(interrupted.executionStatus, 'unknown');
    assert.equal(interrupted.workspacePath, '/retained/project');
    assert.deepEqual(interrupted.steps, [{ id: 'retained-step' }]);
    assert.deepEqual(interrupted.annotations, [{ id: 'retained-note' }]);
  }
  const exited = once(first.child, 'exit');
  first.child.send('stop');
  assert.equal((await exited)[0], 0);
  const reuse = createServer();
  await new Promise((resolve, reject) => { reuse.once('error', reject); reuse.listen(Number(new URL(first.url).port), '127.0.0.1', resolve); });
  await new Promise(resolve => reuse.close(resolve));
  assert.equal((await fetch(second.url)).status, 200);
  const secondExited = once(second.child, 'exit');
  second.child.send('stop');
  assert.equal((await secondExited)[0], 0);
});
