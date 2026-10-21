import assert from 'node:assert/strict';
import test from 'node:test';
import { definePlaybook, runPlaybook } from '../dist/index.js';

const book = steps => definePlaybook({
  schemaVersion: 1, id: 'catalog', title: 'Catalog', summary: 'Contract check',
  requirements: { dataMode: 'fixture', effects: 'read-only', replay: 'safe', roles: [] }, steps,
});

test('presentation and test wrappers retain action/assertion order exactly once', async () => {
  const events = [];
  const context = { page: {} };
  const flow = book(['one', 'two'].map(id => ({
    id, title: id, explain: 'Explain',
    run: async received => { assert.equal(received, context); events.push(`run:${id}`); },
    verify: async () => { events.push(`verify:${id}`); },
  })));
  await runPlaybook(flow, context, {
    beforeStep: async step => { events.push(`guide:${step.id}`); },
    afterStep: async step => { events.push(`after:${step.id}`); },
    aroundStep: async (step, execute) => {
      events.push(`open:${step.id}`); await execute(); events.push(`close:${step.id}`);
    },
  });
  assert.deepEqual(events, ['one', 'two'].flatMap(id =>
    [`open:${id}`, `guide:${id}`, `run:${id}`, `verify:${id}`, `after:${id}`, `close:${id}`]));
});

test('a failed business assertion rejects and never executes later steps', async () => {
  const events = [];
  const failure = new Error('Expected published course');
  const flow = book([
    { id: 'one', title: 'one', explain: 'Explain', run: async () => { events.push('action'); },
      verify: async () => { throw failure; } },
    { id: 'two', title: 'two', explain: 'Explain', run: async () => { events.push('later'); },
      verify: async () => {} },
  ]);
  await assert.rejects(runPlaybook(flow, { page: {} }), error => error === failure);
  assert.deepEqual(events, ['action']);
});

test('ambiguous step identifiers are rejected before playback', () => {
  const step = { id: 'same', title: 'Title', explain: 'Explain', run: async () => {}, verify: async () => {} };
  assert.throws(() => book([step, step]), /duplicate/);
});
