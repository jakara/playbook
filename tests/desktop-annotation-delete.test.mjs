import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { atomicJSON } from '../desktop/lifecycle.mjs';

for (const file of ['desktop/main.mjs', 'integrations/dsh/server.mjs']) {
  const source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
  const start = source.indexOf('async function deleteAnnotation(');
  const deletion = source.slice(start, source.indexOf('\nasync function ', start + 1));
  test(`${file}: deletion is scoped to one run, updates live pins and survives disk reload`, async t => {
    const root = await mkdtemp(path.join(tmpdir(), 'playbook-delete-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const activeRun = { id: 'current', state: 'paused', annotations: [{ id: 'one' }, { id: 'two' }] };
    const historical = { id: 'old', state: 'completed', annotations: [{ id: 'old-note' }] };
    const messages = [];
    const context = vm.createContext({ runs: [structuredClone(activeRun), historical], activeRun, structuredClone,
      persistQueue: Promise.resolve(), runsFile: path.join(root, 'runs.json'), atomicJSON, publish() {},
      worker: { postMessage: value => messages.push(value), send: value => messages.push(value) },
    });
    vm.runInContext(deletion, context);
    await assert.rejects(vm.runInContext("deleteAnnotation({runId:'current', annotationId:'old-note'})", context), /批注不存在/);
    assert.equal(context.activeRun.annotations.length, 2);
    await Promise.all([
      vm.runInContext("deleteAnnotation({runId:'current', annotationId:'one'})", context),
      vm.runInContext("deleteAnnotation({runId:'old', annotationId:'old-note'})", context),
    ]);
    const saved = JSON.parse(await readFile(context.runsFile, 'utf8'));
    assert.deepEqual(saved[0], { ...activeRun, annotations: [{ id: 'two' }] });
    assert.equal(saved[1].state, 'completed'); assert.deepEqual(saved[1].annotations, []);
    assert.deepEqual(activeRun.annotations.map(item => item.id), ['two']);
    assert.equal(messages.length, 1); assert.equal(messages[0].command, 'annotation-remove');
    assert.equal(messages[0].annotationId, 'one');
    await assert.rejects(vm.runInContext("deleteAnnotation({runId:'current', annotationId:'one'})", context), /批注不存在/);
  });
}
