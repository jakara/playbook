import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, utilityProcess, globalShortcut } from 'electron';
import { readFile, mkdir, writeFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { createBrowserSession, reconcileBrowserSessions, destroyBrowserSession } from './browser-sessions.mjs';
import { createEmbeddedBrowser } from './embedded-browser.mjs';
import { randomUUID, createHash } from 'node:crypto';
import { readWorkspace, inside, selection, snapshot, removeBookFromManifest, saveStepText } from './library.mjs';
import { FRAMEWORKS, SKILL_NAMES, targetFor, inspectSkillBundle, installSkillBundle } from './skill-installer.mjs';
import { createPlaybackControl } from './playback-control.mjs';
import { commitPptx } from './pptx.mjs';
import { atomicJSON, safeError, terminal, cleanupSummary, settledCleanup, interrupted, recoveryHandle } from './lifecycle.mjs';
import { createAnnotation, formatAnnotation } from './annotation-format.mjs';

app.setName('Playbook');
const browserSession = createBrowserSession();
const browserSessionDir = browserSession.path;
process.on('exit', () => destroyBrowserSession(browserSession));
app.setPath('sessionData', browserSessionDir);
app.commandLine.appendSwitch('remote-debugging-port', '0');
app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (process.env.PLAYBOOK_USER_DATA) app.setPath('userData', path.resolve(process.env.PLAYBOOK_USER_DATA));
if (!app.requestSingleInstanceLock()) { destroyBrowserSession(browserSession); app.exit(0); }
app.on('second-instance', () => { window?.show(); });
const appRoot = app.getAppPath();
const starter = path.join(appRoot, 'examples/starter');
const tutorial = path.join(appRoot, 'examples/tutorial');
const builtins = [tutorial, starter];
const builtinKeys = new Map([[tutorial, 'tutorial'], [starter, 'starter']]);
const builtinKey = directory => builtinKeys.get(directory);
const dataDir = app.getPath('userData');
const skillDir = path.join(appRoot, 'skills/playbook-wright');
const skillVersion = app.getVersion();
const skillProjects = new Set();
let window, settings = { schemaVersion: 1, roots: [] }, workspaces = [], runs = [], activeRun = null;
let worker = null, launchBusy = false, quitting = false, refreshTask = null;
let playbackControl, playbackSelection, controlIntent, embeddedBrowser, annotationMode = false;
const tutorialActions = new Set();
let manualWindow = false;
let runtimeWarnings = [];
const shortcut = { accelerator: 'CommandOrControl+Alt+P', label: process.platform === 'darwin' ? '⌘⌥P' : 'Ctrl+Alt+P', registered: false };
const settingsFile = path.join(dataDir, 'settings.json');
const runsFile = path.join(dataDir, 'runs.json');
let persistQueue = Promise.resolve(), shutdownTask, exitReady = false, runGuard;
const completionWaiters = new Set();
const codeHash = bytes => createHash('sha256').update(bytes).digest('hex');
const processAlive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; } };
const reviewNeeded = run => terminal(run.state) && run.cleanup && !settledCleanup(run.cleanup.status);
const recoveryAvailable = run => run.cleanupScopes?.some(scope => !settledCleanup(scope.status)) && run.cleanupScopes.filter(scope => !settledCleanup(scope.status)).every(scope => scope.recoveryVersion && scope.entries.length && scope.entries.every(entry => settledCleanup(entry.status) || Object.hasOwn(entry, 'handle')));

function viewState() {
  return { runtimeWarnings, annotationMode, embedded: embeddedBrowser?.state() || { active: false, visible: false }, appVersion: app.getVersion(), workspaces: workspaces.map(workspace => ({ ...workspace, builtin: builtins.includes(workspace.path), profiles: workspace.profiles.map(({ id, title, dataMode }) => ({ id, title, dataMode })) })),
    runs: [...runs.filter(reviewNeeded), ...runs.filter(run => !reviewNeeded(run)).slice(0, 100)].map(run => ({ ...run, canRecover: Boolean(recoveryAvailable(run)) })), activeRun: activeRun ? { ...activeRun, canRecover: Boolean(recoveryAvailable(activeRun)) } : null, playbackShortcut: shortcut, playbackControl: playbackControl?.state(), skill: { name: SKILL_NAMES[0], compatibilityName: SKILL_NAMES[1], version: skillVersion, frameworks: FRAMEWORKS.map(({ id, name }) => ({ id, name })) } };
}
function publish() { if (window && !window.isDestroyed()) window.webContents.send('playbook:state', viewState()); playbackControl?.publish(); }
async function saveSettings(next = settings) {
  let before;
  try { before = await readFile(settingsFile); }
  catch (error) { if (error.code !== 'ENOENT') throw error; before = Buffer.from(JSON.stringify(settings, null, 2)); }
  const backupPath = path.join(dataDir, 'backups', `settings-${Date.now()}-${randomUUID()}.json`);
  await mkdir(path.dirname(backupPath), { recursive: true });
  await writeFile(backupPath, before, { flag: 'wx', mode: 0o600, flush: true });
  if (!(await readFile(backupPath)).equals(before)) throw new Error('设置备份核验失败');
  await atomicJSON(settingsFile, next); settings = next;
  return { backupPath };
}
async function refresh(force = false) {
  if (refreshTask) {
    if (!force) return refreshTask;
    await refreshTask; return refresh();
  }
  refreshTask = (async () => {
    const roots = [...new Set([...builtins, ...settings.roots])];
    const discovered = await Promise.all(roots.map(async root => {
      try { return await readWorkspace(root); }
      catch { return { id: root, name: path.basename(root), path: root, items: [], books: [], demos: [], profiles: [], error: '项目目录已不可访问', token: 'missing' }; }
    }));
    const visible = discovered.filter(workspace => !(settings.hiddenBuiltins || []).includes(builtinKey(workspace.path))).map(workspace => {
      const key = builtinKey(workspace.path), removed = settings.hiddenBuiltinBooks?.[key] || [];
      return key ? { ...workspace, builtinKey: key, books: workspace.books.filter(book => !removed.includes(book.id)) } : workspace;
    });
    const next = [...new Map(visible.map(workspace => [workspace.id, workspace])).values()];
    if (JSON.stringify(next) !== JSON.stringify(workspaces)) {
      workspaces = next;
      if (activeRun && !terminal(activeRun.state)) {
        const source = next.find(item => item.id === activeRun.workspaceId);
        if (source?.token !== activeRun.sourceToken) activeRun.sourceChanged = true;
      }
      publish();
    }
  })().finally(() => { refreshTask = null; });
  return refreshTask;
}
async function record(update) {
  if (!activeRun) return;
  Object.assign(activeRun, update);
  if (terminal(activeRun.state)) {
    activeRun.finishedAt ||= new Date().toISOString();
    clearTimeout(runGuard);
    if (controlIntent?.runId === activeRun.id) controlIntent = null;
  }
  runs = [structuredClone(activeRun), ...runs.filter(run => run.id !== activeRun.id)];
  publish();
  const bytes = structuredClone(runs);
  // Serialize snapshots so a slower earlier write cannot replace a newer cleanup receipt.
  const saved = persistQueue.then(() => atomicJSON(runsFile, bytes));
  persistQueue = saved.catch(() => {}); await saved;
  if (terminal(activeRun.state)) for (const resolve of completionWaiters) resolve();
}
async function recordLate({ scope, update } = {}) {
  const messages = [update?.executionError, update?.error, ...(update?.cleanup?.errors || []).map(error => error.message), ...(scope?.entries || []).map(entry => entry.error)].filter(Boolean).map(error => safeError(error));
  if (messages.length || scope) await record({ lateErrors: [...new Set([...(activeRun.lateErrors || []), ...messages])], ...(scope ? { lateCleanupScopes: [...(activeRun.lateCleanupScopes || []), scope] } : {}) });
}
function guardRun(milliseconds, message) {
  clearTimeout(runGuard);
  const runId = activeRun?.id, guardedWorker = worker;
  runGuard = setTimeout(() => {
    if (activeRun?.id !== runId || terminal(activeRun.state)) return;
    void record(interrupted(activeRun, message)).then(() => { try { guardedWorker?.kill(); } catch {} }).catch(() => {});
  }, milliseconds);
}
async function disposeWorker() {
  if (!worker) { embeddedBrowser?.dispose(); return; }
  if (activeRun && !terminal(activeRun.state)) throw new Error('资源释放仍未结束，不能替换运行器');
  const old = worker; worker = null;
  const exited = new Promise(resolve => old.once('exit', resolve));
  try { old.postMessage({ command: 'close' }); } catch {}
  let timer;
  await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 5000); })]); clearTimeout(timer);
  try { old.kill(); } catch {}
  embeddedBrowser?.dispose();
}
function attachWorker(child, intent, { outputDir, pptxDestination, recovering = false } = {}) {
  const runId = activeRun.id;
  let messages = Promise.resolve();
  child.once('spawn', () => { if (activeRun?.id === runId) void record({ workerPid: child.pid }); });
  child.on('message', message => {
    messages = messages.then(async () => {
      if (activeRun?.id !== runId) return;
      const acknowledge = (error, result) => { try { child.postMessage({ type: 'ack', requestId: message.requestId, result, ...(error ? { error: safeError(error) } : {}) }); } catch {} };
      try {
        if (message.type === 'embedded-page') {
          if (intent.stopped || terminal(activeRun.state) || activeRun.browser !== 'embedded' || !activeRun.flowIds.includes(message.flowId)) throw new Error('This run cannot create an embedded page');
          const result = await embeddedBrowser.newPage(runId, activeRun.workspacePath === tutorial && activeRun.profileId === 'playbook-tutorial');
          acknowledge(null, result); return;
        }
        if (message.type === 'embedded-focus') { embeddedBrowser?.focus(); acknowledge(); return; }
        if (message.type === 'manual-start') {
          if (intent.stopped || terminal(activeRun.state) || !activeRun.steps.some(step => step.flowId === message.flowId && step.id === message.stepId && step.interaction?.mode === 'manual')) throw new Error('Manual step does not match this run');
          manualWindow = true;
          await record({ state: 'waiting', interaction: { ...message.interaction, flowId: message.flowId, stepId: message.stepId } }); acknowledge(); return;
        }
        if (message.type === 'manual-end') {
          manualWindow = false; await Promise.allSettled([...tutorialActions]);
          await record({ ...(!terminal(activeRun.state) ? { state: intent.stopped ? 'stopping' : 'playing' } : {}), interaction: null, manualInteractions: [...(activeRun.manualInteractions || []), { flowId: message.flowId, stepId: message.stepId, ...message.result, finishedAt: new Date().toISOString() }] }); acknowledge(); return;
        }
        if (message.type === 'execution-error') { await record({ executionError: safeError(message.error), executionStatus: 'failed' }); acknowledge(); return; }
        if (message.type === 'annotation-mode') { annotationMode = Boolean(message.active) && activeRun.state === 'paused'; publish(); return; }
        if (message.type === 'annotation-save') {
          if (worker !== child || activeRun.state !== 'paused' || !intent.paused || !annotationMode || activeRun.mode === 'pptx') throw new Error('仅能在当前演示暂停批注时保存');
          if (message.stepId !== activeRun.stepId || message.flowId !== activeRun.flowId) throw new Error('批注步骤已变化，请重新选择元素');
          const annotation = createAnnotation(message.annotation, activeRun);
          await record({ annotations: [...(activeRun.annotations || []), annotation] });
          acknowledge(null, { annotation, prompt: formatAnnotation(annotation) }); return;
        }
        if (message.type === 'step-text-save') {
          if (worker !== child || activeRun.state !== 'paused' || !intent.paused || intent.stopped || activeRun.mode !== 'play') throw new Error('仅能在当前演示暂停时编辑文字');
          if (message.stepId !== activeRun.stepId || message.flowId !== activeRun.flowId) throw new Error('当前步骤已变化，请重新暂停后编辑');
          const source = activeRun.scriptSources?.find(item => item.id === message.flowId);
          if (!source) throw new Error('当前脚本源文件不存在');
          const saved = await saveStepText({ workspaceDir: activeRun.workspacePath, file: source.file, expectedHash: source.hash,
            flowId: message.flowId, stepId: message.stepId, title: message.title, explain: message.explain,
            backupDir: path.join(dataDir, 'backups', 'step-text') });
          source.hash = saved.hash;
          const step = activeRun.steps.find(item => item.flowId === message.flowId && item.id === message.stepId);
          if (step) { step.title = message.title; step.explain = message.explain; }
          await record({ stepTitle: message.title, sourceChanged: true, textEdits: [...(activeRun.textEdits || []),
            { flowId: message.flowId, stepId: message.stepId, savedAt: new Date().toISOString(), backupPath: saved.backupPath }] });
          await refresh();
          acknowledge(null, { title: message.title, explain: message.explain }); return;
        }
        if (message.type === 'limits') { await record({ lifecycle: message.limits }); acknowledge(); return; }
        if (message.type === 'scope') {
          const scope = structuredClone(message.scope);
          if (scope.runId !== runId || !activeRun.flowIds.includes(scope.flowId) || !scope.scopeId.startsWith(runId + '.') || !Array.isArray(scope.entries)) throw new Error('清理回执与本轮不匹配');
          for (const entry of scope.entries) { if (Object.hasOwn(entry, 'handle')) recoveryHandle(entry.handle); if (entry.error) entry.error = safeError(entry.error); }
          if (terminal(activeRun.state)) { await recordLate({ scope }); acknowledge(new Error('Run already settled; no new preparation may begin')); return; }
          const scopes = [...(activeRun.cleanupScopes || [])]; const index = scopes.findIndex(item => item.scopeId === scope.scopeId);
          const wasCleaning = index >= 0 && scopes[index].status === 'running';
          if (index < 0) scopes.push(scope); else scopes[index] = scope;
          if (!terminal(activeRun.state)) {
            const cleanup = cleanupSummary(scopes);
            if (scope.status === 'running') guardRun(Math.max(1, scope.deadline - Date.now()) + 2000, '清理预算耗尽且未收到回执，资源结果未知');
            else { clearTimeout(runGuard); if (intent.stopped) guardRun(wasCleaning ? 10000 : Math.max(1, intent.stopDeadline - Date.now()), wasCleaning ? '清理已结束但最终回执未确认，需核对本轮结果' : '停止后执行未确认结束，清理结果未知'); }
            await record({ cleanupScopes: scopes, cleanup, ...(scope.status === 'running' ? { state: 'cleaning', stepTitle: recovering ? '正在恢复资源释放…' : '正在释放本轮资源…' } : {}) });
          }
          acknowledge(); return;
        }
        if (message.type === 'final') {
          const update = { ...message.update };
          if (terminal(activeRun.state)) {
            await recordLate({ update });
            acknowledge(); return;
          }
          if (intent.stopped && update.state === 'completed') { update.state = settledCleanup(update.cleanup?.status) ? 'stopped' : 'failed'; update.executionStatus = 'stopped'; update.stopRequested = true; }
          if (pptxDestination && update.state === 'completed') {
            if (!update.exported) throw new Error('运行器未生成 PPTX');
            let saved;
            const committed = await commitPptx(path.join(outputDir, 'export/deck.pptx'), pptxDestination, () => intent.stopped || quitting,
              () => { saved = record({ ...update, exported: { ...update.exported, path: pptxDestination } }); });
            if (committed) await saved; else await record({ ...update, state: 'stopped', exported: undefined, stopRequested: true });
          } else await record(update);
          acknowledge(); return;
        }
        if (message.type === 'state') {
          if (terminal(message.update.state)) {
            await recordLate({ update: message.update });
            return; // Only an acknowledged final receipt can settle a run.
          }
          if (!terminal(activeRun.state)) {
            const update = { ...message.update };
            if (update.interaction && tutorialActions.size) update.interaction.busy = true;
            if (activeRun.cleanup?.status === 'running') update.state = 'cleaning';
            else if (intent.stopped) update.state = 'stopping';
            await record(update);
          }
        }
        if (message.type === 'receipt-error' && !terminal(activeRun.state)) await record(interrupted(activeRun, '运行器未能保存最终清理回执，需核对资源'));
      } catch (error) {
        acknowledge(error);
        if (!terminal(activeRun.state)) await record({ ...interrupted(activeRun), error: safeError(error) });
      }
    }).catch(() => {});
  });
  child.on('exit', code => {
    if (worker === child) worker = null;
    annotationMode = false; publish();
    void messages.then(async () => {
      if (activeRun?.id === runId && !terminal(activeRun.state)) await record(interrupted(activeRun, `运行器已退出（${code}），清理结果未知`));
      if (activeRun?.id === runId && activeRun.state !== 'completed') embeddedBrowser?.show(false);
    });
  });
  child.stdout?.resume(); child.stderr?.resume();
}
async function shutdown() {
  if (shutdownTask) return shutdownTask;
  quitting = true;
  shutdownTask = (async () => {
    if (activeRun && !terminal(activeRun.state)) {
      await control('stop');
      while (activeRun && !terminal(activeRun.state)) await new Promise(resolve => { completionWaiters.add(resolve); }).finally(() => completionWaiters.clear());
    }
    await Promise.allSettled([...tutorialActions]);
    await persistQueue; await disposeWorker(); exitReady = true; app.quit();
  })();
  return shutdownTask;
}
async function recoverRun({ runId }) {
  if (quitting || launchBusy || activeRun && !terminal(activeRun.state)) throw new Error('请先等待当前执行和资源释放结束');
  const run = runs.find(item => item.id === runId);
  if (!run) throw new Error('运行记录不存在');
  if (settledCleanup(run.cleanup?.status)) return { runId, alreadyRecovered: true };
  if (!recoveryAvailable(run)) throw new Error('此 Profile 未声明完整的精确恢复句柄，请人工核对本轮资源');
  launchBusy = true;
  try {
    if (worker?.pid === run.workerPid && activeRun?.id === runId && terminal(activeRun.state)) await disposeWorker();
    if (!/^[0-9a-f-]{36}$/.test(run.id)) throw new Error('恢复 run 标识无效');
    if (run.workerPid && processAlive(run.workerPid)) throw new Error('原运行器仍存活，不能并发恢复；请等待其结束或人工核对');
    if (run.lifecycleVersion !== 1) throw new Error('恢复回执版本不受支持，请人工核对');
    if (run.appVersion !== app.getVersion()) throw new Error('应用代码版本已变化，请人工核对后迁移恢复声明');
    const workspace = await readWorkspace(run.workspacePath);
    if (workspace.id !== run.workspaceId || workspace.path !== run.workspacePath || workspace.token !== run.sourceToken) throw new Error('工作区或 Profile 源码已变化，请人工核对后迁移恢复声明');
    for (const [index, scope] of run.cleanupScopes.entries()) {
      if (scope.runId !== run.id || scope.scopeId !== `${run.id}.${index}` || scope.flowId !== run.flowIds[index] || new Set(scope.entries.map(entry => entry.id)).size !== scope.entries.length) throw new Error('清理回执与原 run 或脚本范围不一致');
      for (const entry of scope.entries) if (Object.hasOwn(entry, 'handle')) recoveryHandle(entry.handle);
    }
    const selected = selection(workspace, run.entryId, run.kind, run.profileId);
    if (selected.profile.file !== run.profileFile || selected.items.map(item => item.id).join('|') !== run.flowIds.join('|')) throw new Error('Profile 或脚本顺序与原 run 不匹配');
    const outputDir = path.join(dataDir, 'cache', run.id), bundle = path.join(outputDir, 'flow.mjs');
    if (codeHash(await readFile(bundle)) !== run.bundleHash) throw new Error('原运行快照校验失败，请人工核对');
    await disposeWorker();
    if (quitting) throw new Error('应用正在退出，未启动资源恢复');
    activeRun = structuredClone(run);
    const intent = { runId, stopped: false, paused: false, ready: true }; controlIntent = intent;
    const child = utilityProcess.fork(path.join(appRoot, 'build/runner.cjs'), [], { cwd: outputDir, stdio: 'pipe', serviceName: 'Playbook 清理恢复' });
    worker = child; attachWorker(child, intent, { recovering: true });
    await record({ state: 'recovering', recoveryStartedAt: new Date().toISOString(), workerPid: child.pid, recoveryError: null });
    child.postMessage({ command: 'recover', config: { bundle, appRoot, runId, profileId: run.profileId, workspaceDir: workspace.path, parameters: selected.profile.parameters, scopes: run.cleanupScopes } });
    return { runId };
  } catch (error) {
    const recoveryError = safeError(error);
    if (activeRun?.id === runId) {
      await record(terminal(activeRun.state) ? { recoveryError } : { ...interrupted(activeRun), recoveryError });
      await disposeWorker();
    } else { runs = runs.map(item => item.id === runId ? { ...item, recoveryError } : item); await persistQueue; await atomicJSON(runsFile, runs); publish(); }
    throw error;
  } finally { launchBusy = false; }
}
async function play({ workspaceId, entryId, kind = 'script', profileId, browser: browserPreference }, pptxDestination = null) {
  if (quitting || launchBusy || (activeRun && !terminal(activeRun.state))) throw new Error('请先停止当前演示');
  if (tutorialActions.size) throw new Error('Please wait for the active file operation');
  if (browserPreference !== undefined && !['embedded', 'external'].includes(browserPreference)) throw new Error('Invalid playback browser');
  launchBusy = true;
  try {
    await disposeWorker(); await refresh();
    if (quitting) throw new Error('应用正在退出，未启动新的演示');
    const workspace = workspaces.find(item => item.id === workspaceId);
    if (!workspace) throw new Error('项目尚未登记');
    if (!['script', 'book', 'section', 'demo'].includes(kind)) throw new Error('播放类型无效');
    const selected = selection(workspace, entryId, kind, profileId);
    if (pptxDestination && selected.items.some(item => item.steps.some(step => step.interaction))) throw new Error('含手动操作的流程不能直接导出 PPTX，请先让智能体制作已授权的自动演示副本');
    const playbackBrowser = pptxDestination ? 'external' : browserPreference || (selected.items.some(item => item.playback?.browser === 'embedded') ? 'embedded' : 'external');
    if (selected.items.some(item => item.requirements.replay === 'single-run' && runs.some(run => run.workspaceId === workspaceId && run.profileId === selected.profile.id && run.executing && run.flowIds?.includes(item.id)))) throw new Error('此流程未声明可重播的恢复方案。请先让智能体核对数据状态并完善恢复策略。');
    activeRun = { id: randomUUID(), title: selected.title, workspaceId, entryId, kind, profileId: selected.profile.id, mode: pptxDestination ? 'pptx' : 'play', browser: playbackBrowser,
      profileName: selected.profile.title, lifecycleVersion: 1, workspacePath: workspace.path, profileFile: selected.profile.file, appVersion: app.getVersion(), cleanup: { status: 'not-required', errors: [] }, cleanupScopes: [], state: 'preparing', total: selected.items.reduce((sum, item) => sum + item.steps.length, 0),
      index: 0, completed: 0, startedAt: new Date().toISOString(), sourceToken: workspace.token, sourceChanged: false, flowIds: selected.items.map(item => item.id),
      steps: selected.items.flatMap(item => item.steps.map(step => ({ ...step, flowId: item.id, scriptTitle: item.title, sectionTitle: item.sectionTitle, bookTitle: item.bookTitle }))),
      scriptSources: selected.items.map(item => ({ id: item.id, file: item.file, hash: item.hash })) };
    const intent = { runId: activeRun.id, paused: false, stopped: false, ready: false };
    controlIntent = intent;
    await record({});
    try {
      const outputDir = path.join(dataDir, 'cache', activeRun.id);
      const built = await snapshot({ workspace, ...selected, outputDir, appRoot });
      const latest = await readWorkspace(workspace.path);
      if (latest.token !== workspace.token) throw new Error('脚本正在更新，请刷新后再播放');
      if (intent.stopped) { if (!terminal(activeRun.state)) await record({ state: 'stopped' }); return { runId: intent.runId }; }
      activeRun.snapshotHash = built.snapshotHash; activeRun.bundleHash = codeHash(await readFile(built.bundle));
      let embedded;
      if (playbackBrowser === 'embedded') { await embeddedBrowser.start(activeRun.id); embedded = { endpoint: await embeddedBrowser.endpoint() }; }
      const runId = activeRun.id;
      const child = utilityProcess.fork(path.join(appRoot, 'build/runner.cjs'), [], { cwd: outputDir, stdio: 'pipe', serviceName: 'Playbook 演示运行器' });
      worker = child;
      attachWorker(child, intent, { outputDir, pptxDestination });
      // Commit the execution claim before any profile or business code can start.
      await record({ executing: true, workerPid: child.pid });
      if (intent.stopped) { if (!terminal(activeRun.state)) await record({ state: 'stopped', cleanup: { status: 'not-required', errors: [] } }); await disposeWorker(); return { runId }; }
      child.postMessage({ command: 'start', config: { ...built, appRoot, embedded, runId, title: selected.title,
        segments: selected.items.map(item => ({ flowId: item.id, scriptTitle: item.title, sectionTitle: item.sectionTitle, bookTitle: item.bookTitle })),
        profileId: selected.profile.id, dataMode: selected.profile.dataMode, parameters: selected.profile.parameters, workspaceDir: workspace.path,
        captureDir: process.env.PLAYBOOK_TEST_CAPTURE === '1' ? path.join(dataDir, 'evidence', runId) : null,
        exportDir: pptxDestination ? path.join(outputDir, 'export') : null,
        pace: process.env.PLAYBOOK_TEST_PACE ? Math.max(.02, Number(process.env.PLAYBOOK_TEST_PACE)) : 1,
        headless: process.env.PLAYBOOK_TEST_HEADLESS === '1', paused: intent.paused } });
      intent.ready = true;
      return { runId };
    } catch (error) {
      if (intent.stopped) { if (!terminal(activeRun.state)) await record({ state: 'stopped' }); return { runId: intent.runId }; }
      await record({ state: 'failed', error: safeError(error) }); throw new Error(safeError(error));
    }
  } finally { launchBusy = false; }
}

async function installOptions(input) {
  if (!['user', 'project'].includes(input.scope) || !FRAMEWORKS.some(item => item.id === input.framework)) throw new Error('请选择支持的框架和安装范围');
  if (input.scope === 'project') {
    if (!skillProjects.has(input.projectRoot)) throw new Error('请先选择要安装 Skill 的项目文件夹');
    if (!(await stat(input.projectRoot)).isDirectory() || await realpath(input.projectRoot) !== input.projectRoot) throw new Error('项目文件夹已改变，请重新选择');
  }
  return { sourceDir: skillDir, version: skillVersion, targetDir: targetFor({ framework: input.framework, scope: input.scope, home: homedir(), projectRoot: input.projectRoot }), backupRoot: path.join(dataDir, 'backups/skills') };
}

async function chooseSkillProject() {
  const result = await dialog.showOpenDialog(window, { title: '选择智能体使用的项目文件夹', properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths.length) return null;
  const root = await realpath(result.filePaths[0]);
  if (!(await stat(root)).isDirectory()) throw new Error('请选择项目文件夹');
  if ((await Promise.all(builtins.map(directory => realpath(directory)))).includes(root)) throw new Error('内置教程和样例不作安装目标，请选择自己的项目文件夹');
  skillProjects.add(root);
  return root;
}
function tutorialOwner(event) {
  return embeddedBrowser?.owns(event.sender) && event.senderFrame === event.sender.mainFrame
    && new URL(event.sender.getURL()).origin === 'http://playbook.tutorial'
    && activeRun?.workspacePath === tutorial && activeRun.profileId === 'playbook-tutorial';
}
async function tutorialAction(event, name, input) {
  if (!tutorialOwner(event)) throw new Error('此页面不能使用教程安装接口');
  if (name === 'skillPreview') return inspectSkillBundle(await installOptions(input));
  if (!manualWindow || activeRun.state !== 'waiting' || activeRun.interaction?.stepId !== 'install-now' || activeRun.interaction?.flowId !== 'tutorial.skill') throw new Error('请在教程的手动安装步骤中操作');
  if (!(await event.sender.executeJavaScript('navigator.userActivation.isActive'))) throw new Error('请亲自点击选择目录或安装按钮');
  const runId = activeRun.id;
  let resolveTask;
  const task = new Promise(resolve => { resolveTask = resolve; });
  tutorialActions.add(task);
  try {
    if (!worker) throw new Error('The tutorial has ended');
    worker.postMessage({ command: 'interaction-busy', busy: true });
    await record({ interaction: { ...activeRun.interaction, busy: true } });
    if (!manualWindow || activeRun?.id !== runId || activeRun.state !== 'waiting') throw new Error('The manual step has ended');
    const result = name === 'chooseSkillProject' ? await chooseSkillProject()
      : await installSkillBundle({ ...await installOptions(input), replace: input.replace === true });
    if (name === 'skillInstall') await record({ manualActions: [...(activeRun.manualActions || []), { runId, stepId: 'install-now', action: 'skillInstall', status: 'succeeded', at: new Date().toISOString() }] });
    return result;
  } catch (error) {
    if (name === 'skillInstall' && activeRun?.id === runId) await record({ manualActions: [...(activeRun.manualActions || []), { runId, stepId: 'install-now', action: 'skillInstall', status: 'failed', error: safeError(error), at: new Date().toISOString() }] });
    throw new Error(safeError(error));
  } finally {
    tutorialActions.delete(task); resolveTask();
    if (activeRun?.id === runId) {
      try { worker?.postMessage({ command: 'interaction-busy', busy: tutorialActions.size > 0 }); } catch {}
      if (activeRun.interaction) await record({ interaction: { ...activeRun.interaction, busy: tutorialActions.size > 0 } });
    }
  }
}

function handle(name, action, allowControl = false) {
  ipcMain.handle(`playbook:${name}`, async (event, input) => {
    const owner = event.sender === window?.webContents ? window : allowControl && event.sender === playbackControl?.window.webContents ? playbackControl.window : null;
    if (!owner || event.senderFrame !== owner.webContents.mainFrame) throw new Error('此窗口不能请求该操作');
    try { return await action(input); } catch (error) { throw new Error(safeError(error)); }
  });
}

async function control(command) {
  if (['exporting', 'cleaning', 'recovering'].includes(activeRun?.state) && ['pause', 'resume', 'toggle'].includes(command)) return;
  if (command === 'toggle') {
    if (activeRun && !terminal(activeRun.state)) {
      if (['stopping', 'cleaning'].includes(activeRun.state)) return;
      if (activeRun.state === 'waiting') return control('resume');
      const paused = controlIntent?.runId === activeRun.id ? controlIntent.paused : ['paused', 'pausing'].includes(activeRun.state);
      return control(paused ? 'resume' : 'pause');
    }
    const target = playbackSelection || (activeRun && { workspaceId: activeRun.workspaceId, entryId: activeRun.entryId, kind: activeRun.kind, profileId: activeRun.profileId, browser: activeRun.browser });
    if (target) return play(target);
    window?.show(); return;
  }
  if (command === 'replay') {
    if (!activeRun || !terminal(activeRun.state)) return;
    return play({ workspaceId: activeRun.workspaceId, entryId: activeRun.entryId, kind: activeRun.kind, profileId: activeRun.profileId, browser: activeRun.browser });
  }
  if (!['pause', 'resume', 'stop'].includes(command) || !activeRun || terminal(activeRun.state) || activeRun.state === 'stopping') return;
  const intent = controlIntent?.runId === activeRun.id ? controlIntent : (controlIntent = { runId: activeRun.id, paused: false, stopped: false, ready: Boolean(worker) });
  if (command === 'pause' || command === 'resume') {
    if (activeRun.interaction?.busy && command === 'resume') return;
    if (command === 'resume' && annotationMode) { annotationMode = false; worker?.postMessage({ command: 'annotation-cancel' }); publish(); }
    const manual = activeRun.state === 'waiting';
    intent.paused = command === 'pause';
    if (intent.ready && worker) worker.postMessage({ command });
    if (manual) await record({ state: 'waiting', interaction: { ...activeRun.interaction, paused: intent.paused } });
    else if (intent.paused) await record({ state: 'pausing' });
    else if (!intent.ready) await record({ state: 'preparing' });
    return;
  }
  if (command === 'stop') {
    if (annotationMode) { annotationMode = false; worker?.postMessage({ command: 'annotation-cancel' }); publish(); }
    intent.stopped = true; intent.paused = false; intent.stopRequestedAt ||= new Date().toISOString(); intent.stopDeadline ||= Date.now() + (activeRun.lifecycle?.stopTimeoutMs || 30000);
    if (intent.ready && worker) worker.postMessage({ command });
    await record({ state: activeRun.cleanup?.status === 'running' ? 'cleaning' : 'stopping', stopRequested: true, stopRequestedAt: intent.stopRequestedAt });
    if (activeRun.cleanup?.status !== 'running') guardRun(Math.max(1, intent.stopDeadline - Date.now()), '停止宽限耗尽，业务执行和资源释放结果未知');
  }
}

function toggleAnnotation() {
  if (!activeRun || activeRun.state !== 'paused' || activeRun.mode === 'pptx' || !worker || !controlIntent?.paused) throw new Error('请先暂停正在播放的演示');
  annotationMode = !annotationMode;
  worker.postMessage({ command: annotationMode ? 'annotation-start' : 'annotation-cancel' });
  publish();
  return { active: annotationMode };
}

app.whenReady().then(async () => {
  await mkdir(dataDir, { recursive: true });
  ({ warnings: runtimeWarnings } = await reconcileBrowserSessions({ indexFile: path.join(dataDir, 'browser-sessions.json'), current: browserSession }));
  const checkAt = process.argv.indexOf('--check-workspace');
  if (checkAt >= 0) {
    try {
      const workspace = await readWorkspace(path.resolve(process.argv[checkAt + 1] || '.'));
      if (workspace.error || workspace.items.some(item => !item.valid)) throw new Error(workspace.error || '存在无效脚本');
      for (const item of workspace.items) await snapshot({ workspace, ...selection(workspace, item.id, 'script'), outputDir: path.join(dataDir, 'checks', randomUUID()), appRoot });
      console.log(JSON.stringify({ valid: true, scripts: workspace.items.length, books: workspace.books.length, sections: workspace.books.reduce((sum, book) => sum + book.sections.length, 0), checks: ['static-metadata', 'references', 'bundle'], typecheck: 'not-run', browser: 'not-run' })); destroyBrowserSession(browserSession); app.exit(0);
    } catch (error) { console.log(JSON.stringify({ valid: false, error: safeError(error) })); destroyBrowserSession(browserSession); app.exit(1); }
    return;
  }
  try {
    const saved = JSON.parse(await readFile(settingsFile, 'utf8'));
    if (saved.schemaVersion !== 1 || !Array.isArray(saved.roots)
      || saved.hiddenBuiltins !== undefined && (!Array.isArray(saved.hiddenBuiltins) || saved.hiddenBuiltins.some(id => typeof id !== 'string'))
      || saved.hiddenBuiltinBooks !== undefined && (!saved.hiddenBuiltinBooks || Array.isArray(saved.hiddenBuiltinBooks) || typeof saved.hiddenBuiltinBooks !== 'object'
        || Object.values(saved.hiddenBuiltinBooks).some(ids => !Array.isArray(ids) || ids.some(id => typeof id !== 'string')))) throw new Error('Invalid settings');
    settings = saved;
  }
  catch (error) { if (error.code !== 'ENOENT') { dialog.showErrorBox('Playbook 设置无法读取', '原设置已保留。请检查用户数据目录中的 settings.json 后重试。'); app.quit(); return; } }
  try { const savedRuns = JSON.parse(await readFile(runsFile, 'utf8')); if (Array.isArray(savedRuns)) { runs = savedRuns.map(run => terminal(run.state) ? run : { ...run, ...interrupted(run, '上次应用异常结束，执行与资源释放结果需核对') }); await atomicJSON(runsFile, runs); } } catch (error) { if (error.code !== 'ENOENT') { dialog.showErrorBox('运行记录无法读取', '原记录已保留，请先核对 runs.json；本次不会启动业务。'); app.quit(); return; } }
  if (process.env.PLAYBOOK_WORKSPACE) settings.roots = [...new Set([...settings.roots, path.resolve(process.env.PLAYBOOK_WORKSPACE)])];
  await refresh();
  window = new BrowserWindow({ width: 1320, height: 880, minWidth: 1000, minHeight: 700, title: 'Playbook', backgroundColor: '#f5f6f4', titleBarStyle: 'hiddenInset',
    webPreferences: { preload: path.join(appRoot, 'build/preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, partition: 'playbook-shell' } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('close', event => { if (!exitReady) { event.preventDefault(); void shutdown(); } });
  window.on('closed', () => { window = null; });
  window.webContents.on('render-process-gone', () => { void shutdown(); });
  embeddedBrowser = createEmbeddedBrowser({ window, appRoot, dataDir, sessionDir: browserSessionDir, onChange: publish, onCrash: () => { void control('stop'); } });
  playbackControl = createPlaybackControl({ appRoot, getRun: () => activeRun, getAnnotationMode: () => annotationMode, shortcut, onVisibilityChange: publish, isEmbeddedVisible: () => embeddedBrowser?.state().visible });
  shortcut.registered = globalShortcut.register(shortcut.accelerator, () => {
    playbackControl.pulse();
    void control('toggle').catch(error => { shortcut.error = safeError(error); publish(); window?.show(); });
  });
  if (!shortcut.registered) shortcut.error = '快捷键未能注册，可能已被其他应用占用；仍可使用播放按钮。';
  handle('showEmbedded', value => { if (typeof value !== 'boolean') throw new Error('Invalid embedded view state'); return embeddedBrowser.show(value); });
  handle('getState', () => viewState());
  handle('playbackState', () => playbackControl.state(), true);
  handle('collapseControl', value => playbackControl.setCollapsed(value), true);
  handle('annotate', toggleAnnotation, true);
  handle('copyAnnotation', ({ runId, annotationId }) => {
    const run = runs.find(item => item.id === runId);
    const annotation = run?.annotations?.find(item => item.id === annotationId);
    if (!annotation) throw new Error('批注不存在');
    clipboard.writeText(formatAnnotation(annotation));
    return { copied: true };
  });
  handle('addWorkspace', async () => {
    const result = await dialog.showOpenDialog(window, { title: '选择包含 .playbook.json 的业务项目', properties: ['openDirectory'] });
    if (!result.canceled) {
      const root = await realpath(result.filePaths[0]), key = builtinKey(root);
      await saveSettings({ ...settings, roots: [...new Set([...settings.roots, root])], hiddenBuiltins: (settings.hiddenBuiltins || []).filter(id => id !== key) });
      await refresh(true);
    }
    return viewState();
  });

  handle('refreshWorkspace', async id => {
    if (id !== undefined && (typeof id !== 'string' || !workspaces.some(workspace => workspace.id === id))) throw new Error('项目尚未登记');
    await refresh(true); return viewState();
  });
  handle('removeWorkspace', async id => {
    if (quitting || launchBusy || activeRun && !terminal(activeRun.state)) throw new Error('请先等待播放和资源释放结束');
    const workspace = workspaces.find(item => item.id === id);
    if (!workspace) throw new Error('项目尚未登记');
    launchBusy = true;
    try {
      const paths = await Promise.all(settings.roots.map(async root => { try { return await realpath(root); } catch { return path.resolve(root); } }));
      await saveSettings({ ...settings, roots: settings.roots.filter((_, index) => paths[index] !== workspace.path),
        ...(builtinKey(workspace.path) ? { hiddenBuiltins: [...new Set([...(settings.hiddenBuiltins || []), builtinKey(workspace.path)])] } : {}) });
      if (playbackSelection?.workspaceId === id) playbackSelection = null;
      await refresh(true); return viewState();
    } finally { launchBusy = false; }
  });
  handle('removeBook', async input => {
    if (quitting || launchBusy || activeRun && !terminal(activeRun.state)) throw new Error('请先等待播放和资源释放结束');
    const workspace = workspaces.find(item => item.id === input?.workspaceId);
    if (!workspace) throw new Error('项目尚未登记');
    if (runs.some(run => run.workspaceId === workspace.id && reviewNeeded(run))) throw new Error('该项目仍有待核对的资源清理记录，请先完成清理核对再删除 Book');
    launchBusy = true;
    try {
      const latest = await readWorkspace(workspace.path);
      if (latest.error || latest.id !== workspace.id) throw new Error(latest.error || '项目目录已变化，请从磁盘刷新');
      if (!workspace.books.some(book => book.id === input.bookId) || !latest.books.some(book => book.id === input.bookId)) throw new Error('Book 已不存在，请从磁盘刷新');
      const key = builtinKey(workspace.path);
      let result;
      if (key) {
        if (latest.manifestHash !== input.manifestHash) throw new Error('清单已更新，请从磁盘刷新后重新确认删除');
        result = { ...await saveSettings({ ...settings, hiddenBuiltinBooks: { ...settings.hiddenBuiltinBooks,
          [key]: [...new Set([...(settings.hiddenBuiltinBooks?.[key] || []), input.bookId])] } }), localOnly: true };
      } else result = await removeBookFromManifest({ workspaceDir: workspace.path, bookId: input.bookId, expectedHash: input.manifestHash,
        backupDir: path.join(dataDir, 'backups', 'books', workspace.id) });
      if (playbackSelection?.workspaceId === workspace.id) playbackSelection = null;
      await refresh(true); return { ...result, state: viewState() };
    } finally { launchBusy = false; }
  });
  handle('play', play);
  handle('recoverRun', recoverRun);
  handle('exportPptx', async input => {
    if (quitting || launchBusy || (activeRun && !terminal(activeRun.state))) throw new Error('请先停止当前演示');
    const workspace = workspaces.find(item => item.id === input?.workspaceId);
    if (!workspace) throw new Error('项目尚未登记');
    const selected = selection(workspace, input.entryId, input.kind, input.profileId);
    if (selected.items.some(item => item.steps.some(step => step.interaction))) throw new Error('含手动操作的流程需要先制作自动演示副本，再导出 PPTX');
    const name = selected.title.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').slice(0, 120) || 'Playbook';
    const destination = await dialog.showSaveDialog(window, { title: '回放并导出 PPTX', defaultPath: path.join(app.getPath('documents'), `${name}.pptx`), filters: [{ name: 'PowerPoint 演示文稿', extensions: ['pptx'] }], properties: ['createDirectory', 'showOverwriteConfirmation'] });
    if (destination.canceled || !destination.filePath) return { canceled: true };
    if (!/\.pptx$/i.test(destination.filePath)) throw new Error('文件名需以 .pptx 结尾，请重新选择保存位置');
    return play(input, destination.filePath);
  });
  handle('openExport', async ({ runId, reveal = false }) => {
    const run = runs.find(item => item.id === runId);
    if (run?.state !== 'completed' || !run.exported?.path) throw new Error('此记录没有已完成的 PPTX 文件');
    if (!(await stat(run.exported.path)).isFile()) throw new Error('PPTX 文件已移动或删除');
    if (reveal) shell.showItemInFolder(run.exported.path);
    else { const error = await shell.openPath(run.exported.path); if (error) throw new Error('PPTX 无法打开，请在文件夹中查看'); }
  });
  handle('setPlaybackSelection', input => {
    if (input === null) { playbackSelection = null; return; }
    const workspace = workspaces.find(item => item.id === input?.workspaceId);
    if (!workspace) throw new Error('项目不存在');
    selection(workspace, input.entryId, input.kind, input.profileId);
    if (input.browser !== undefined && !['embedded', 'external'].includes(input.browser)) throw new Error('Invalid playback browser');
    playbackSelection = { workspaceId: input.workspaceId, entryId: input.entryId, kind: input.kind, profileId: input.profileId, browser: input.browser };
  });
  handle('control', control, true);
  handle('copyContext', async input => {
    const workspace = workspaces.find(item => item.id === input.workspaceId);
    const run = runs.find(item => item.id === input.runId);
    const item = workspace?.items.find(item => item.id === input.entryId);
    clipboard.writeText(`请使用 $playbook-wright 帮我检查或调整下面的演示。保留业务动作、断言与数据边界。\n${JSON.stringify({ workspace: workspace?.path, manifest: '.playbook.json', kind: input.kind || 'script', entryId: input.entryId, script: item?.file, flowId: item?.id, run, skillVersion }, null, 2)}\n我的需求：`);
  });
  handle('reveal', async input => {
    const workspace = workspaces.find(item => item.id === input.workspaceId);
    if (!workspace) throw new Error('项目不存在');
    const item = workspace.items.find(item => item.id === input.entryId);
    shell.showItemInFolder(item ? await inside(workspace.path, item.file) : path.join(workspace.path, '.playbook.json'));
  });
  handle('chooseSkillProject', chooseSkillProject);
  handle('skillPreview', async input => inspectSkillBundle(await installOptions(input)));
  handle('skillInstall', async input => installSkillBundle({ ...await installOptions(input), replace: input.replace === true }));
  for (const name of ['chooseSkillProject', 'skillPreview', 'skillInstall']) ipcMain.handle('playbook:tutorial-' + name, (event, input) => tutorialAction(event, name, input));
  await playbackControl.ready;
  await window.loadFile(path.join(appRoot, 'build/ui/index.html'));
  setInterval(() => void refresh().catch(() => {}), 1400).unref();
});
app.on('before-quit', event => {
  if (!exitReady) { event.preventDefault(); void shutdown(); }
});
app.on('window-all-closed', () => { if (exitReady) app.quit(); else void shutdown(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); playbackControl?.dispose(); destroyBrowserSession(browserSession); });
