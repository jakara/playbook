import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { MessageChannel } from 'node:worker_threads';

const source = await readFile(new URL('../integrations/dsh/bridge.js', import.meta.url), 'utf8');
const client = await readFile(new URL('../integrations/dsh/client.js', import.meta.url), 'utf8');

function bridge(picked) {
  const calls = [], requests = [];
  const window = {
    __PLAYBOOK_DSH_TOKEN: 'test-session',
    prompt() { throw new Error('Cross-origin iframe dialogs are blocked'); },
    addEventListener() {},
    parent: { postMessage(message, target, [port]) {
      requests.push({ message, target });
      port.postMessage({ ready: true });
      port.postMessage(picked);
      port.close();
    } },
  };
  vm.runInNewContext(source, {
    window, document: { documentElement: { dataset: {} } }, MessageChannel, setTimeout, clearTimeout,
    EventSource: class { addEventListener() {} },
    fetch: async (url, options) => {
      calls.push({ url, input: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ result: url.endsWith('getState') ? { workspaces: [] } : 'selected' }) };
    },
  });
  return { api: window.playbook, calls, requests };
}

test('adding a project requests the host directory picker and submits its selected path', async () => {
  const { api, calls, requests } = bridge({ path: '/example/中文 project' });
  await api.addWorkspace();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].message.type, 'playbook:choose-directory');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/addWorkspace');
  assert.deepEqual(calls[0].input, { path: '/example/中文 project' });
});

test('Skill project selection uses the same host picker', async () => {
  const { api, calls } = bridge({ path: '/example/project' });
  await api.chooseSkillProject();
  assert.equal(calls[0].url, '/api/chooseSkillProject');
  assert.deepEqual(calls[0].input, { path: '/example/project' });
});

test('cancelling a directory choice makes no project changes', async () => {
  const { api, calls } = bridge({ path: null });
  await api.addWorkspace();
  assert.ok(calls.every(call => call.url.endsWith('getState')));
  assert.equal(await api.chooseSkillProject(), null);
});

test('picker failures are surfaced and never submit a path', async () => {
  const { api, calls } = bridge({ error: '目录选择器暂时不可用' });
  await assert.rejects(api.addWorkspace(), /目录选择器暂时不可用/);
  assert.equal(calls.length, 0);
});

function host(t, desktop) {
  const origin = 'http://127.0.0.1:54321';
  const contentWindow = {}, listeners = new Map(), cleanups = [], calls = [];
  let component, plugin;
  const React = {
    useState: () => [{ url: origin + '/' }, () => {}],
    useReducer: () => [0, () => {}],
    useRef: () => ({ current: { contentWindow } }),
    useEffect: effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
    createElement() {},
  };
  const window = {
    __ModuleLoader__: { load: definition => { plugin = definition.factory(() => React); } },
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: name => listeners.delete(name),
    ...(desktop ? { __DSH_DIRECTORY_PICKER__: { pick: async () => { calls.push('desktop'); return '/chosen'; } } } : {}),
  };
  vm.runInNewContext(client, { window, URL, AbortController, fetch: () => new Promise(() => {}) });
  plugin.apply({
    effect: effect => effect(), on: () => () => {},
    slots: { inject: (name, effect) => effect(), register: (entry, render) => { if (entry.name === 'main') component = render; } },
    uiWorkspace: { pickDirectory: async () => { calls.push('web'); return '/chosen'; } },
  });
  component();
  t.after(() => cleanups.reverse().forEach(cleanup => cleanup()));
  const messages = [];
  const event = {
    source: contentWindow, origin, data: { type: 'playbook:choose-directory' },
    ports: [{ postMessage: message => messages.push(message), close() {} }],
  };
  return { calls, messages, send: overrides => listeners.get('message')({ ...event, ...overrides }) };
}

for (const desktop of [true, false]) test(`host opens its ${desktop ? 'desktop' : 'web'} picker only for the owned iframe`, async t => {
  const fixture = host(t, desktop);
  fixture.send({ origin: 'https://untrusted.invalid' });
  fixture.send({ source: {} });
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.messages.length, 0);
  fixture.send();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(fixture.calls, [desktop ? 'desktop' : 'web']);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.messages)), [{ ready: true }, { path: '/chosen' }]);
});
