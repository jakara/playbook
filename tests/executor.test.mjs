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

test('reference test execution ignores feathering, redactions and all narration options', async () => {
  const events = [];
  const flow = definePlaybook({
    schemaVersion: 1, id: 'presentation-only', title: '演示', summary: '说明',
    requirements: { dataMode: 'fixture', effects: 'read-only', replay: 'safe', roles: [] },
    presentation: { spotlightFeather: 28 },
    redactions: [{ selector: '.secret', mode: 'cover', label: '已隐藏', padding: 4 }],
    narration: { enabled: true, voice: 'Tingting', rate: 180, opening: { text: '开始演示' } },
    steps: [{ id: 'one', title: 'One', explain: 'Explain', narration: { audio: 'audio/does-not-exist.wav' },
      target: () => { throw new Error('A test executor must not inspect presentation targets'); },
      run: async () => { events.push('run'); }, verify: async () => { events.push('verify'); } }],
  });
  await runPlaybook(flow, { page: {} });
  assert.deepEqual(events, ['run', 'verify']);
});

test('new presentation fields validate shape, ranges and audio path boundaries', async t => {
  const base = () => ({ schemaVersion: 1, id: 'valid', title: 'Valid', summary: '',
    requirements: { dataMode: 'fixture', effects: 'read-only', replay: 'safe', roles: [] },
    steps: [{ id: 'one', title: 'One', explain: 'Explain', run: async () => {}, verify: async () => {} }] });
  const cases = [
    ['negative feather', value => { value.presentation = { spotlightFeather: -1 }; }],
    ['large feather', value => { value.presentation = { spotlightFeather: 101 }; }],
    ['nonfinite feather', value => { value.presentation = { spotlightFeather: NaN }; }],
    ['non-numeric feather', value => { value.presentation = { spotlightFeather: '24' }; }],
    ['step feather', value => { value.steps[0].presentation = { spotlightFeather: 24 }; }],
    ['step redactions', value => { value.steps[0].redactions = [{ selector: '.secret' }]; }],
    ['non-list redactions', value => { value.redactions = {}; }],
    ['empty selector', value => { value.redactions = [{ selector: ' ' }]; }],
    ['unknown redaction mode', value => { value.redactions = [{ selector: '.secret', mode: 'pixelate' }]; }],
    ['zero blur', value => { value.redactions = [{ selector: '.secret', blurPx: 0 }]; }],
    ['large blur', value => { value.redactions = [{ selector: '.secret', blurPx: 41 }]; }],
    ['negative padding', value => { value.redactions = [{ selector: '.secret', padding: -1 }]; }],
    ['large padding', value => { value.redactions = [{ selector: '.secret', padding: 41 }]; }],
    ['bad label', value => { value.redactions = [{ selector: '.secret', label: false }]; }],
    ['bad enabled', value => { value.narration = { enabled: 'yes' }; }],
    ['slow rate', value => { value.narration = { rate: 79 }; }],
    ['fast rate', value => { value.narration = { rate: 401 }; }],
    ['fractional rate', value => { value.narration = { rate: 185.5 }; }],
    ['empty voice', value => { value.narration = { voice: '' }; }],
    ['empty opening text', value => { value.narration = { opening: { text: ' ' } }; }],
    ['null narration', value => { value.steps[0].narration = null; }],
    ['ambiguous clip', value => { value.steps[0].narration = { text: 'hello', audio: 'hello.wav' }; }],
    ['empty audio', value => { value.steps[0].narration = { audio: '' }; }],
    ['absolute audio', value => { value.steps[0].narration = { audio: '/tmp/hello.wav' }; }],
    ['outside audio', value => { value.steps[0].narration = { audio: '../hello.wav' }; }],
    ['remote audio', value => { value.steps[0].narration = { audio: 'https://example.com/hello.wav' }; }],
    ['Windows absolute audio', value => { value.steps[0].narration = { audio: 'C:\\hello.wav' }; }],
    ['unsupported audio', value => { value.steps[0].narration = { audio: 'hello.flac' }; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, () => {
    const value = base(); mutate(value); assert.throws(() => definePlaybook(value), undefined, name);
  });
  const valid = base();
  valid.presentation = { spotlightFeather: 0 };
  valid.narration = { enabled: false, opening: false, rate: 80 };
  valid.redactions = [{ selector: '.logo' }, { selector: '.data', mode: 'blur', blurPx: 40, padding: 0 }];
  valid.steps[0].narration = {};
  assert.equal(definePlaybook(valid), valid);
  valid.steps[0].narration = false;
  assert.equal(definePlaybook(valid), valid);
});
