import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, utilityProcess, globalShortcut } from 'electron';
import { readFile, mkdir, writeFile, copyFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { readWorkspace, inside, selection, snapshot } from './library.mjs';
import { FRAMEWORKS, targetFor, inspectSkill, installSkill } from './skill-installer.mjs';
import { createPlaybackControl } from './playback-control.mjs';

app.setName('Playbook');
if (process.env.PLAYBOOK_USER_DATA) app.setPath('userData', path.resolve(process.env.PLAYBOOK_USER_DATA));
const appRoot = app.getAppPath();
const starter = path.join(appRoot, 'examples/starter');
const dataDir = app.getPath('userData');
const skillDir = path.join(appRoot, 'skills/playbook-playwright');
const skillVersion = '0.4.0';
let window, settings = { schemaVersion: 1, roots: [] }, workspaces = [], runs = [], activeRun = null;
let worker = null, launchBusy = false, quitting = false, refreshBusy = false;
let playbackControl, playbackSelection;
const shortcut = { accelerator: 'CommandOrControl+Alt+P', label: process.platform === 'darwin' ? '⌘⌥P' : 'Ctrl+Alt+P', registered: false };
const settingsFile = path.join(dataDir, 'settings.json');
const runsFile = path.join(dataDir, 'runs.json');
const terminal = state => ['completed', 'failed', 'stopped'].includes(state);
const safeError = error => String(error?.message || error).replace(/\x1b\[[0-9;]*m/g, '').replace(/(password|token|secret|authorization|cookie)(["'\s:=]+)[^\s,}\n]+/gi, '$1$2[已隐藏]').slice(0, 1600);

function viewState() {
  return { workspaces: workspaces.map(workspace => ({ ...workspace, profiles: workspace.profiles.map(({ id, title, dataMode }) => ({ id, title, dataMode })) })),
    runs: runs.slice(0, 100), activeRun, playbackShortcut: shortcut, playbackControl: playbackControl?.state(), skill: { version: skillVersion, frameworks: FRAMEWORKS.map(({ id, name }) => ({ id, name })) } };
}
function publish() { if (window && !window.isDestroyed()) window.webContents.send('playbook:state', viewState()); playbackControl?.publish(); }
async function atomicJSON(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 }); await rename(temp, file);
}
async function saveSettings() {
  try {
    await readFile(settingsFile);
    const backup = path.join(dataDir, 'backups', `settings-${Date.now()}.json`); await mkdir(path.dirname(backup), { recursive: true });
    await copyFile(settingsFile, backup);
    if (!(await readFile(backup)).equals(await readFile(settingsFile))) throw new Error('设置备份核验失败');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await atomicJSON(settingsFile, settings);
}
async function refresh() {
  if (refreshBusy) return;
  refreshBusy = true;
  try {
    const roots = [...new Set([starter, ...settings.roots])];
    const discovered = await Promise.all(roots.map(async root => {
      try { return await readWorkspace(root); }
      catch { return { id: root, name: path.basename(root), path: root, items: [], books: [], demos: [], profiles: [], error: '项目目录已不可访问', token: 'missing' }; }
    }));
    const next = [...new Map(discovered.map(workspace => [workspace.id, workspace])).values()];
    if (JSON.stringify(next) !== JSON.stringify(workspaces)) {
      workspaces = next;
      if (activeRun && !terminal(activeRun.state)) {
        const source = next.find(item => item.id === activeRun.workspaceId);
        if (source?.token !== activeRun.sourceToken) activeRun.sourceChanged = true;
      }
      publish();
    }
  } finally { refreshBusy = false; }
}
async function record(update) {
  if (!activeRun) return;
  Object.assign(activeRun, update);
  if (terminal(activeRun.state)) activeRun.finishedAt ||= new Date().toISOString();
  // Retain all durable records: single-run protection must outlive the UI's 100-row view.
  runs = [structuredClone(activeRun), ...runs.filter(run => run.id !== activeRun.id)];
  publish();
  if (terminal(activeRun.state) || update.executing === true) await atomicJSON(runsFile, runs);
}
async function disposeWorker() {
  if (!worker) return;
  const old = worker; worker = null;
  old.postMessage({ command: 'close' });
  await Promise.race([new Promise(resolve => old.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 8000))]);
  try { old.kill(); } catch {}
}
async function play({ workspaceId, entryId, kind = 'script', profileId }) {
  if (launchBusy || (activeRun && !terminal(activeRun.state))) throw new Error('请先停止当前演示');
  launchBusy = true;
  try {
    await disposeWorker(); await refresh();
    const workspace = workspaces.find(item => item.id === workspaceId);
    if (!workspace) throw new Error('项目尚未登记');
    if (!['script', 'book', 'section', 'demo'].includes(kind)) throw new Error('播放类型无效');
    const selected = selection(workspace, entryId, kind, profileId);
    if (selected.items.some(item => item.requirements.replay === 'single-run' && runs.some(run => run.workspaceId === workspaceId && run.profileId === selected.profile.id && run.executing && run.flowIds?.includes(item.id)))) throw new Error('此流程未声明可重播的恢复方案。请先让智能体核对数据状态并完善恢复策略。');
    activeRun = { id: randomUUID(), title: selected.title, workspaceId, entryId, kind, profileId: selected.profile.id,
      profileName: selected.profile.title, state: 'preparing', total: selected.items.reduce((sum, item) => sum + item.steps.length, 0),
      index: 0, completed: 0, startedAt: new Date().toISOString(), sourceToken: workspace.token, sourceChanged: false, flowIds: selected.items.map(item => item.id),
      steps: selected.items.flatMap(item => item.steps.map(step => ({ ...step, scriptTitle: item.title, sectionTitle: item.sectionTitle, bookTitle: item.bookTitle }))) };
    await record({});
    try {
      const outputDir = path.join(dataDir, 'cache', activeRun.id);
      const built = await snapshot({ workspace, ...selected, outputDir, appRoot });
      const latest = await readWorkspace(workspace.path);
      if (latest.token !== workspace.token) throw new Error('脚本正在更新，请刷新后再播放');
      activeRun.snapshotHash = built.snapshotHash;
      const runId = activeRun.id;
      const child = utilityProcess.fork(path.join(appRoot, 'build/runner.cjs'), [], { cwd: outputDir, stdio: 'pipe', serviceName: 'Playbook 演示运行器' });
      worker = child;
      child.on('message', async message => {
        if (activeRun?.id !== runId) return;
        if (message.type === 'state') await record(message.update);
        if (message.type === 'replay' && terminal(activeRun.state)) {
          void play({ workspaceId, entryId, kind, profileId: selected.profile.id }).catch(error => record({ state: 'failed', error: safeError(error) }));
        }
      });
      child.on('exit', code => {
        if (activeRun?.id === runId && !terminal(activeRun.state)) void record({ state: activeRun.state === 'stopping' ? 'stopped' : 'failed', error: activeRun.state === 'stopping' ? undefined : `运行器已退出（${code}）` });
      });
      // Script stdout can contain private values. Do not forward it to the UI/logs.
      child.stdout?.resume(); child.stderr?.resume();
      // Commit the execution claim before any profile or business code can start.
      await record({ executing: true });
      child.postMessage({ command: 'start', config: { ...built, appRoot, runId, title: selected.title,
        segments: selected.items.map(item => ({ flowId: item.id, scriptTitle: item.title, sectionTitle: item.sectionTitle, bookTitle: item.bookTitle })),
        profileId: selected.profile.id, dataMode: selected.profile.dataMode, parameters: selected.profile.parameters, workspaceDir: workspace.path,
        captureDir: process.env.PLAYBOOK_TEST_CAPTURE === '1' ? path.join(dataDir, 'evidence', runId) : null,
        pace: process.env.PLAYBOOK_TEST_PACE ? Math.max(.02, Number(process.env.PLAYBOOK_TEST_PACE)) : 1,
        headless: process.env.PLAYBOOK_TEST_HEADLESS === '1' } });
      return { runId };
    } catch (error) { await record({ state: 'failed', error: safeError(error) }); throw new Error(safeError(error)); }
  } finally { launchBusy = false; }
}

function installOptions(input) {
  if (!['user', 'project'].includes(input.scope) || !FRAMEWORKS.some(item => item.id === input.framework)) throw new Error('请选择支持的框架和安装范围');
  const workspace = workspaces.find(item => item.id === input.workspaceId);
  if (input.scope === 'project' && (!workspace || workspace.path === starter)) throw new Error('项目安装请选择你自己的业务目录，内置样例不作安装目标');
  return { sourceDir: skillDir, version: skillVersion, targetDir: targetFor({ framework: input.framework, scope: input.scope, home: homedir(), projectRoot: workspace?.path }), backupRoot: path.join(dataDir, 'backups/skills') };
}
function handle(name, action, allowControl = false) {
  ipcMain.handle(`playbook:${name}`, async (event, input) => {
    const owner = event.sender === window?.webContents ? window : allowControl && event.sender === playbackControl?.window.webContents ? playbackControl.window : null;
    if (!owner || event.senderFrame !== owner.webContents.mainFrame) throw new Error('此窗口不能请求该操作');
    try { return await action(input); } catch (error) { throw new Error(safeError(error)); }
  });
}

async function control(command) {
  if (command === 'toggle') {
    if (activeRun && !terminal(activeRun.state)) return control(activeRun.state === 'paused' ? 'resume' : 'pause');
    const target = playbackSelection || (activeRun && { workspaceId: activeRun.workspaceId, entryId: activeRun.entryId, kind: activeRun.kind, profileId: activeRun.profileId });
    if (target) return play(target);
    window?.show(); return;
  }
  if (command === 'replay') {
    if (!activeRun || !terminal(activeRun.state)) return;
    return play({ workspaceId: activeRun.workspaceId, entryId: activeRun.entryId, kind: activeRun.kind, profileId: activeRun.profileId });
  }
  if (!['pause', 'resume', 'stop'].includes(command) || !worker || !activeRun || terminal(activeRun.state)) return;
  worker.postMessage({ command });
  if (command === 'stop') {
    await record({ state: 'stopping' }); const runId = activeRun.id;
    setTimeout(() => { if (activeRun?.id === runId && activeRun.state === 'stopping') { void disposeWorker(); void record({ state: 'stopped' }); } }, 8000);
  }
}

app.whenReady().then(async () => {
  await mkdir(dataDir, { recursive: true });
  const checkAt = process.argv.indexOf('--check-workspace');
  if (checkAt >= 0) {
    try {
      const workspace = await readWorkspace(path.resolve(process.argv[checkAt + 1] || '.'));
      if (workspace.error || workspace.items.some(item => !item.valid)) throw new Error(workspace.error || '存在无效脚本');
      for (const item of workspace.items) await snapshot({ workspace, ...selection(workspace, item.id, 'script'), outputDir: path.join(dataDir, 'checks', randomUUID()), appRoot });
      console.log(JSON.stringify({ valid: true, scripts: workspace.items.length, books: workspace.books.length, sections: workspace.books.reduce((sum, book) => sum + book.sections.length, 0), checks: ['static-metadata', 'references', 'bundle'], typecheck: 'not-run', browser: 'not-run' })); app.exit(0);
    } catch (error) { console.log(JSON.stringify({ valid: false, error: safeError(error) })); app.exit(1); }
    return;
  }
  try { const saved = JSON.parse(await readFile(settingsFile, 'utf8')); if (saved.schemaVersion !== 1 || !Array.isArray(saved.roots)) throw new Error('Invalid settings'); settings = saved; }
  catch (error) { if (error.code !== 'ENOENT') { dialog.showErrorBox('Playbook 设置无法读取', '原设置已保留。请检查用户数据目录中的 settings.json 后重试。'); app.quit(); return; } }
  try { const savedRuns = JSON.parse(await readFile(runsFile, 'utf8')); if (Array.isArray(savedRuns)) runs = savedRuns.map(run => terminal(run.state) ? run : { ...run, state: 'failed', error: '上次应用退出前未完成，未自动恢复执行' }); } catch {}
  if (process.env.PLAYBOOK_WORKSPACE) settings.roots = [...new Set([...settings.roots, path.resolve(process.env.PLAYBOOK_WORKSPACE)])];
  await refresh();
  window = new BrowserWindow({ width: 1320, height: 880, minWidth: 1000, minHeight: 700, title: 'Playbook', backgroundColor: '#f5f6f4', titleBarStyle: 'hiddenInset',
    webPreferences: { preload: path.join(appRoot, 'build/preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('closed', () => { window = null; app.quit(); });
  playbackControl = createPlaybackControl({ appRoot, getRun: () => activeRun, shortcut, onVisibilityChange: publish });
  shortcut.registered = globalShortcut.register(shortcut.accelerator, () => {
    playbackControl.pulse();
    void control('toggle').catch(error => { shortcut.error = safeError(error); publish(); window?.show(); });
  });
  if (!shortcut.registered) shortcut.error = '快捷键未能注册，可能已被其他应用占用；仍可使用播放按钮。';
  handle('getState', () => viewState());
  handle('playbackState', () => playbackControl.state(), true);
  handle('addWorkspace', async () => {
    const result = await dialog.showOpenDialog(window, { title: '选择包含 .playbook.json 的业务项目', properties: ['openDirectory'] });
    if (!result.canceled) { settings.roots = [...new Set([...settings.roots, result.filePaths[0]])]; await saveSettings(); await refresh(); }
    return viewState();
  });
  handle('removeWorkspace', async id => { const workspace = workspaces.find(item => item.id === id); if (workspace?.path === starter) throw new Error('内置样例用于验证播放器，不能移除'); settings.roots = settings.roots.filter(root => root !== workspace?.path); await saveSettings(); await refresh(); return viewState(); });
  handle('play', play);
  handle('setPlaybackSelection', input => {
    if (input === null) { playbackSelection = null; return; }
    const workspace = workspaces.find(item => item.id === input?.workspaceId);
    if (!workspace) throw new Error('项目不存在');
    selection(workspace, input.entryId, input.kind, input.profileId);
    playbackSelection = { workspaceId: input.workspaceId, entryId: input.entryId, kind: input.kind, profileId: input.profileId };
  });
  handle('control', control, true);
  handle('copyContext', async input => {
    const workspace = workspaces.find(item => item.id === input.workspaceId);
    const run = runs.find(item => item.id === input.runId);
    const item = workspace?.items.find(item => item.id === input.entryId);
    clipboard.writeText(`请使用 $playbook-playwright 帮我检查或调整下面的演示。保留业务动作、断言与数据边界。\n${JSON.stringify({ workspace: workspace?.path, manifest: '.playbook.json', kind: input.kind || 'script', entryId: input.entryId, script: item?.file, flowId: item?.id, run, skillVersion }, null, 2)}\n我的需求：`);
  });
  handle('reveal', async input => {
    const workspace = workspaces.find(item => item.id === input.workspaceId);
    if (!workspace) throw new Error('项目不存在');
    const item = workspace.items.find(item => item.id === input.entryId);
    shell.showItemInFolder(item ? await inside(workspace.path, item.file) : path.join(workspace.path, '.playbook.json'));
  });
  handle('skillPreview', input => inspectSkill(installOptions(input)));
  handle('skillInstall', input => installSkill({ ...installOptions(input), replace: input.replace === true }));
  await playbackControl.ready;
  await window.loadFile(path.join(appRoot, 'build/ui/index.html'));
  setInterval(() => void refresh().catch(() => {}), 1400).unref();
});
app.on('before-quit', event => {
  if (!quitting && worker) { event.preventDefault(); quitting = true; void disposeWorker().finally(() => app.quit()); }
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { globalShortcut.unregisterAll(); playbackControl?.dispose(); });
