import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import vm from 'node:vm';

const main = await readFile(new URL('../desktop/main.mjs', import.meta.url), 'utf8');
const runner = await readFile(new URL('../desktop/runner.mjs', import.meta.url), 'utf8');
const controlSource = main.slice(main.indexOf('async function control(command)'), main.indexOf('\napp.whenReady()'));
const playSource = main.slice(main.indexOf('async function play('), main.indexOf('\nfunction installOptions'));

function mainContext(extra = {}) {
  const messages = [];
  const context = vm.createContext({
    messages, activeRun: { id: 'run', state: 'playing' }, worker: { postMessage: message => messages.push(message) },
    controlIntent: { runId: 'run', paused: false, stopped: false, ready: true },
    terminal: state => ['completed', 'failed', 'stopped'].includes(state),
    setTimeout: () => {}, disposeWorker: async () => {}, playbackSelection: null, window: null,
    ...extra,
  });
  vm.runInContext(`async function record(update) {
    Object.assign(activeRun, update);
    if (terminal(activeRun.state)) controlIntent = null;
  }\n${controlSource}`, context);
  return context;
}

test('rapid global toggles alternate requested intent before worker acknowledgement', async () => {
  const context = mainContext();
  await vm.runInContext("control('toggle')", context);
  assert.equal(context.activeRun.state, 'pausing');
  await vm.runInContext("control('toggle')", context);
  assert.deepEqual(context.messages.map(message => message.command), ['pause', 'resume']);
  assert.equal(context.controlIntent.paused, false);
});

async function preparingRun() {
  let release;
  const snapshotReady = new Promise(resolve => { release = resolve; });
  let entered;
  const enteredSnapshot = new Promise(resolve => { entered = resolve; });
  let forks = 0;
  const child = new EventEmitter();
  child.postMessage = message => context.messages.push(message);
  child.stdout = child.stderr = { resume() {} };
  const context = mainContext({
    activeRun: null, worker: null, controlIntent: null, launchBusy: false,
    workspaces: [{ id: 'workspace', path: '/business', token: 'same' }], runs: [],
    refresh: async () => {}, randomUUID: () => 'new-run', path, dataDir: '/app-data', appRoot: '/app', process: { env: {} },
    selection: () => ({ title: 'Sample', profile: { id: 'local', title: 'Local', dataMode: 'fixture', parameters: {} }, items: [{ id: 'flow', title: 'Flow', requirements: { replay: 'safe' }, steps: [] }] }),
    snapshot: async () => { entered(); await snapshotReady; return { bundle: '/snapshot.mjs', snapshotHash: 'snapshot' }; },
    readWorkspace: async () => ({ token: 'same' }),
    utilityProcess: { fork: () => { forks++; return child; } },
    safeError: error => String(error.message || error),
  });
  vm.runInContext(playSource, context);
  const result = vm.runInContext("play({workspaceId:'workspace',entryId:'flow'})", context);
  await enteredSnapshot;
  return { context, result, release, forks: () => forks };
}

test('pause while preparing survives compilation and reaches runner start', async () => {
  const pending = await preparingRun();
  await vm.runInContext("control('toggle')", pending.context);
  assert.equal(pending.context.controlIntent.paused, true);
  assert.equal(pending.context.messages.length, 0);
  pending.release(); await pending.result;
  assert.equal(pending.forks(), 1);
  assert.equal(pending.context.messages[0].command, 'start');
  assert.equal(pending.context.messages[0].config.paused, true);
});

test('stop while preparing cancels before a runner or business code starts', async () => {
  const pending = await preparingRun();
  await vm.runInContext("control('stop')", pending.context);
  assert.equal(pending.context.activeRun.state, 'stopping');
  pending.release(); await pending.result;
  assert.equal(pending.forks(), 0);
  assert.equal(pending.context.activeRun.state, 'stopped');
  assert.equal(pending.context.controlIntent, null);
  assert.equal(pending.context.activeRun.executing, undefined);
});

test('resume restores the controlled minimized Chrome window before bringing its page forward', async () => {
  const calls = [];
  const session = {
    async send(method, input) {
      calls.push({ method, input });
      if (method === 'Browser.getWindowForTarget') return { windowId: 7 };
      if (method === 'Browser.getWindowBounds') return { bounds: { windowState: 'minimized' } };
      return {};
    },
    async detach() { calls.push({ method: 'detach' }); },
  };
  const page = { isClosed: () => false, context: () => ({ newCDPSession: async () => session }), async bringToFront() { calls.push({ method: 'bringToFront' }); } };
  const context = vm.createContext({ page, config: { headless: false } });
  vm.runInContext(runner.slice(runner.indexOf('async function foreground()'), runner.indexOf('async function state()')), context);
  await vm.runInContext('foreground()', context);
  assert.deepEqual(calls.map(call => call.method), ['Browser.getWindowForTarget', 'Browser.getWindowBounds', 'Browser.setWindowBounds', 'detach', 'bringToFront']);
  assert.equal(calls[2].input.windowId, 7);
  assert.equal(calls[2].input.bounds.windowState, 'normal');
});

test('a newer pause wins while resume is awaiting browser activation', async () => {
  let focused;
  const focusPending = new Promise(resolve => { focused = resolve; });
  const context = vm.createContext({ paused: true, pauseVersion: 0, running: true, stopped: false, closing: false,
    foreground: () => focusPending, state: async () => {}, change: () => {}, process: {},
  });
  vm.runInContext(runner.slice(runner.indexOf('async function commandHandler('), runner.indexOf('\nreceive(message')), context);
  const resume = vm.runInContext("commandHandler({command:'resume'})", context);
  await vm.runInContext("commandHandler({command:'pause'})", context);
  focused(); await resume;
  assert.equal(context.paused, true);
});

test('native control preserves user position and collapsed state across mouse activity and idle hiding', async () => {
  let now = 10000, idle = 0, pointer = { x: 400, y: 200 }, poll;
  class NativeWindow extends EventEmitter {
    constructor(options) { super(); this.options = options; this.bounds = { x: 0, y: 0, width: options.width, height: options.height }; this.visible = false; this.destroyed = false; this.webContents = { send() {}, setWindowOpenHandler() {}, on() {} }; }
    setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {}
    getBounds() { return { ...this.bounds }; } setBounds(bounds) { this.bounds = { ...bounds }; }
    isDestroyed() { return this.destroyed; } isVisible() { return this.visible; }
    showInactive() { this.visible = true; } hide() { this.visible = false; }
    async loadFile() {} destroy() { this.destroyed = true; }
  }
  const screen = new EventEmitter();
  const display = { workArea: { x: 0, y: 0, width: 1440, height: 900 } };
  screen.getCursorScreenPoint = () => pointer;
  screen.getDisplayMatching = screen.getDisplayNearestPoint = () => display;
  const context = vm.createContext({ BrowserWindow: NativeWindow, screen, powerMonitor: { getSystemIdleTime: () => idle }, path,
    Date: { now: () => now }, setInterval: fn => { poll = fn; return { unref() {} }; }, clearInterval() {} });
  const source = (await readFile(new URL('../desktop/playback-control.mjs', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '').replace('export function ', 'function ');
  vm.runInContext(`${source}\nglobalThis.control = createPlaybackControl({appRoot:'/app',getRun:()=>({state:'playing'}),shortcut:{},onVisibilityChange:()=>{}})`, context);
  const control = context.control;
  await control.ready; poll();
  assert.equal(control.window.options.movable, true);
  control.window.setBounds({ x: 90, y: 130, width: 800, height: 104 }); control.window.emit('moved');
  pointer = { x: 1300, y: 800 }; now += 200; poll();
  assert.equal(control.window.getBounds().x, 90);
  assert.equal(control.window.getBounds().y, 130);
  control.setCollapsed(true);
  assert.equal(control.window.getBounds().width, 300);
  assert.equal(control.state().collapsed, true);
  idle = 10; now += 4000; poll(); assert.equal(control.state().visible, false);
  idle = 0; poll(); assert.equal(control.state().visible, true);
  assert.equal(control.state().collapsed, true);
  assert.equal(control.window.getBounds().x, 90);
  assert.equal(control.window.getBounds().y, 130);
  control.window.setBounds({ x: 1410, y: 880, width: 300, height: 80 }); control.window.emit('moved');
  assert.equal(control.window.getBounds().x, 1124);
  assert.equal(control.window.getBounds().y, 804);
  control.setCollapsed(false);
  assert.equal(control.window.getBounds().width, 800);
  assert.equal(control.window.getBounds().x, 624);
  control.dispose(); assert.equal(screen.listenerCount('display-removed'), 0);
});
