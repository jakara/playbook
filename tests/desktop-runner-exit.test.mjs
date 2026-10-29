import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

test('a runner loses its parent IPC channel, exits, and releases its open listener', { timeout: 10000 }, async t => {
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    await import(${JSON.stringify(new URL('../desktop/runner.mjs', import.meta.url).href)});
    const { createServer } = await import('node:net');
    const listener = createServer();
    listener.listen(0, '127.0.0.1', () => process.send({ port: listener.address().port }));
  `], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
  let errors = '';
  child.stderr.on('data', bytes => { errors += bytes; });
  const { port } = await Promise.race([
    once(child, 'message').then(([message]) => message),
    once(child, 'exit').then(([code]) => { throw new Error(`runner startup exited ${code}: ${errors}`); }),
  ]);
  const exited = once(child, 'exit');
  child.disconnect();
  const result = await Promise.race([exited, sleep(1500).then(() => null)]);
  assert.ok(result, `runner ${child.pid} remained alive with a listener after parent disconnection: ${errors}`);
  assert.equal(result[0], 1, 'parent loss must not report successful execution');
  const reuse = createServer();
  await new Promise((resolve, reject) => { reuse.once('error', reject); reuse.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => reuse.close(resolve));
});
