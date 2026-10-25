import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import vm from 'node:vm';

const main = await readFile(new URL('../desktop/main.mjs', import.meta.url), 'utf8');
const runner = await readFile(new URL('../desktop/runner.mjs', import.meta.url), 'utf8');
const controlSource = main.slice(main.indexOf('async function control(command)'), main.indexOf('\napp.whenReady()'));
const playSource = main.slice(main.indexOf('async function play('), main.search(/\n(?:async )?function installOptions/));

function mainContext(extra = {}) {
  const messages = [];
  const context = vm.createContext({
    messages, activeRun: { id: 'run', state: 'playing' }, worker: { postMessage: message => messages.push(message) },
    controlIntent: { runId: 'run', paused: false, stopped: false, ready: true },
    terminal: state => ['completed', 'failed', 'stopped'].includes(state),
    quitting: false, tutorialActions: new Set(), guardRun: () => {}, setTimeout: () => {}, disposeWorker: async () => {}, playbackSelection: null, window: null,
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

test('PPTX packaging ignores pause/toggle but still accepts stop', async () => {
  const context = mainContext({ activeRun: { id: 'run', state: 'exporting' } });
  for (const command of ['pause', 'resume', 'toggle']) await vm.runInContext(`control('${command}')`, context);
  assert.equal(context.activeRun.state, 'exporting'); assert.equal(context.messages.length, 0);
  await vm.runInContext("control('stop')", context);
  assert.equal(context.activeRun.state, 'stopping'); assert.equal(context.messages[0].command, 'stop');
});

test('waiting toggle means continue and keeps the manual state until runner acknowledgement', async () => {
  const context = mainContext({ activeRun: { id: 'run', state: 'waiting', interaction: { prompt: 'Try now', busy: false, paused: false } } });
  await vm.runInContext("control('toggle')", context);
  assert.deepEqual(context.messages.map(message => message.command), ['resume']);
  assert.equal(context.activeRun.state, 'waiting');
  assert.equal(context.activeRun.interaction.paused, false);
  assert.equal(context.controlIntent.paused, false);
});

test('busy manual file operation rejects resume/toggle but still permits stop', async () => {
  const context = mainContext({ activeRun: { id: 'run', state: 'waiting', interaction: { busy: true, paused: false } } });
  for (const command of ['resume', 'toggle']) await vm.runInContext(`control('${command}')`, context);
  assert.equal(context.messages.length, 0);
  assert.equal(context.activeRun.state, 'waiting');
  assert.equal(context.activeRun.interaction.busy, true);
  await vm.runInContext("control('stop')", context);
  assert.equal(context.activeRun.state, 'stopping');
  assert.equal(context.messages[0].command, 'stop');
});

test('manual pause preserves waiting state and can be explicitly continued', async () => {
  const context = mainContext({ activeRun: { id: 'run', state: 'waiting', interaction: { busy: false, paused: false } } });
  await vm.runInContext("control('pause')", context);
  assert.equal(context.activeRun.state, 'waiting');
  assert.equal(context.activeRun.interaction.paused, true);
  await vm.runInContext("control('toggle')", context);
  assert.deepEqual(context.messages.map(message => message.command), ['pause', 'resume']);
  assert.equal(context.activeRun.interaction.paused, false);
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
    safeError: error => String(error.message || error), app: {getVersion:()=> '0.5.0'}, codeHash:()=> 'bundlehash', readFile:async()=>'', attachWorker:()=>{},
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
  const context = vm.createContext({ paused: true, pauseVersion: 0, running: true, stopped: false, closing: false, packaging: false,
    activeScope:null, manualGate: null, foreground: () => focusPending, state: async () => {}, change: () => {}, process: {},
  });
  vm.runInContext(runner.slice(runner.indexOf('async function commandHandler('), runner.indexOf('\nreceive(message')), context);
  const resume = vm.runInContext("commandHandler({command:'resume'})", context);
  await vm.runInContext("commandHandler({command:'pause'})", context);
  focused(); await resume;
  assert.equal(context.paused, true);
});

test('manual resume cannot continue while a real file operation is busy', async () => {
  let focusCalls = 0, continuations = 0;
  const gate = { busy: true, resume: () => { continuations++; } };
  const context = vm.createContext({ manualGate: gate, paused: false, pauseVersion: 0, running: true, stopped: false, closing: false, packaging: false,
    activeScope: null, foreground: async () => { focusCalls++; }, state: async () => {}, change: () => {}, process: {},
  });
  vm.runInContext(runner.slice(runner.indexOf('async function commandHandler('), runner.indexOf('\nreceive(message')), context);
  await vm.runInContext("commandHandler({command:'resume'})", context);
  assert.equal(focusCalls, 0);
  assert.equal(continuations, 0);
});

test('a newer manual pause wins while continue is awaiting browser activation', async () => {
  let focused, continuations = 0;
  const focusPending = new Promise(resolve => { focused = resolve; });
  const gate = { busy: false, paused: false, update() {}, state: () => ({}), resume: () => { continuations++; } };
  const context = vm.createContext({ manualGate: gate, current: { interaction: {} }, Date, paused: false, pauseVersion: 0, running: true, stopped: false, closing: false, packaging: false,
    activeScope: null, foreground: () => focusPending, state: async () => {}, change: () => {}, process: {},
  });
  vm.runInContext(runner.slice(runner.indexOf('async function commandHandler('), runner.indexOf('\nreceive(message')), context);
  const resume = vm.runInContext("commandHandler({command:'resume'})", context);
  await vm.runInContext("commandHandler({command:'pause'})", context);
  focused(); await resume;
  assert.equal(gate.paused, true);
  assert.equal(continuations, 0);
});

test('stopping during manual browser activation never resumes a stale handoff', async () => {
  let focused, continuations = 0, cancelled = 0;
  const focusPending = new Promise(resolve => { focused = resolve; });
  const gate = { busy: false, resume: () => { continuations++; } };
  const context = vm.createContext({ manualGate: gate, current: { interaction: {} }, paused: false, pauseVersion: 0, running: true, stopped: false, closing: false, packaging: false,
    activeScope: null, foreground: () => focusPending, state: async () => {}, stopVoice: async () => {}, ui: async method => { if (method === 'cancel') cancelled++; }, change: () => {}, process: {}, executionAbort: null, narrationAbort: null,
  });
  vm.runInContext(runner.slice(runner.indexOf('async function commandHandler('), runner.indexOf('\nreceive(message')), context);
  const resume = vm.runInContext("commandHandler({command:'resume'})", context);
  await vm.runInContext("commandHandler({command:'stop'})", context);
  focused(); await resume;
  assert.equal(context.stopped, true);
  assert.equal(continuations, 0);
  assert.equal(cancelled, 1);
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

test('Quit during old-worker disposal cannot start a new Profile after the quit intent', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const context = mainContext({ launchBusy: false, activeRun: { id: 'previous', state: 'completed' }, disposeWorker: () => gate, refresh: async () => {} });
  vm.runInContext(playSource, context);
  const playing = vm.runInContext("play({workspaceId:'workspace',entryId:'flow'})", context);
  context.quitting = true; release();
  await assert.rejects(playing, /正在退出/);
  assert.equal(context.activeRun.id, 'previous');
  assert.equal(context.messages.length, 0);
  assert.equal(context.launchBusy, false);
});

test('unresolved cleanup remains visible beyond the 100 recent history rows', () => {
  const data = vm.createContext({ runs: [...Array.from({ length: 110 }, (_, index) => ({ id: `done-${index}`, state: 'completed' })), { id: 'old-pending', state: 'failed', cleanup: { status: 'unknown' } }],
    terminal: state => ['completed', 'failed', 'stopped'].includes(state), settledCleanup: status => ['succeeded', 'not-required'].includes(status) });
  const predicate = main.slice(main.indexOf('const reviewNeeded ='), main.indexOf('const recoveryAvailable ='));
  vm.runInContext(`${predicate}\nglobalThis.visible = [...runs.filter(reviewNeeded), ...runs.filter(run => !reviewNeeded(run)).slice(0, 100)];`, data);
  assert.equal(data.visible.length, 101);
  assert.equal(data.visible[0].id, 'old-pending');
  assert.equal(data.runs.length, 111);
});

test('a late compilation result cannot overwrite a timed-out failed run with stopped', async () => {
  const pending = await preparingRun();
  await vm.runInContext("control('stop')", pending.context);
  pending.context.activeRun.state = 'failed';
  pending.context.activeRun.cleanup = { status: 'unknown' };
  pending.context.activeRun.error = 'Stop deadline exceeded';
  pending.release(); await pending.result;
  assert.equal(pending.context.activeRun.state, 'failed');
  assert.equal(pending.context.activeRun.cleanup.status, 'unknown');
  assert.equal(pending.context.activeRun.error, 'Stop deadline exceeded');
  assert.equal(pending.forks(), 0);
});

test('explicit disk refresh waits for an in-flight scan and rereads the changed source', async () => {
  const source = main.slice(main.indexOf('async function refresh('), main.indexOf('\nasync function record('));
  let releaseFirst, enteredFirst, reads = 0, title = 'before';
  const gate = new Promise(resolve => { releaseFirst = resolve; });
  const entered = new Promise(resolve => { enteredFirst = resolve; });
  const context = vm.createContext({
    refreshTask: null, builtins: ['/fixture'], builtinKey: () => undefined, settings: { roots: [] }, workspaces: [], activeRun: null,
    publish() {}, path, terminal: () => false,
    readWorkspace: async () => { const name = title; reads++; if (reads === 1) { enteredFirst(); await gate; } return { id: 'fixture', name }; },
  });
  vm.runInContext(source, context);
  const first = vm.runInContext('refresh()', context); await entered;
  title = 'after';
  const forced = vm.runInContext('refresh(true)', context); releaseFirst();
  await Promise.all([first, forced]);
  assert.equal(reads, 2);
  assert.equal(context.workspaces[0].name, 'after');
});

test('built-in removal state survives refresh and a different installation directory', async () => {
  const source = main.slice(main.indexOf('async function refresh('), main.indexOf('\nasync function record('));
  for (const prefix of ['/old-install', '/new-install']) {
    const context = vm.createContext({
      refreshTask: null, builtins: [prefix + '/tutorial', prefix + '/starter'], workspaces: [], activeRun: null,
      settings: { roots: [], hiddenBuiltins: ['starter'], hiddenBuiltinBooks: { tutorial: ['removed'] } },
      builtinKey: directory => directory?.split('/').at(-1),
      publish() {}, path, terminal: () => false,
      readWorkspace: async directory => ({ id: directory, path: directory, books: [{ id: 'removed' }, { id: 'keep' }], items: [{ id: 'retained-script' }], token: 'disk-source' }),
    });
    vm.runInContext(source, context); await vm.runInContext('refresh()', context);
    assert.equal(context.workspaces.length, 1);
    assert.equal(context.workspaces[0].builtinKey, 'tutorial');
    assert.deepEqual(Array.from(context.workspaces[0].books, book => book.id), ['keep']);
    assert.equal(context.workspaces[0].items[0].id, 'retained-script');
    assert.equal(context.workspaces[0].token, 'disk-source');
  }
});
