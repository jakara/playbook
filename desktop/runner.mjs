import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { narrationSource } from './narration.mjs';
import { capturePptxScene, writePptx } from './pptx.mjs';
import { ManualInteraction } from './interaction.mjs';
import { CleanupScope, cleanupSummary, settledCleanup, safeError, budgets } from './lifecycle.mjs';

const send = message => process.parentPort ? process.parentPort.postMessage(message) : process.send?.(message);
const receive = callback => process.parentPort ? process.parentPort.on('message', event => callback(event.data)) : process.on('message', callback);
const change = update => send({ type: 'state', update });
class Stopped extends Error {}
let browser, page, running = false, stopped = false, paused = false, inOperation = false, closing = false, pauseVersion = 0;
let position = { x: 900, y: 600 }, current = {}, config;
let narrationAbort, executionAbort, activeScope, manualGate, currentFlowId;
const pendingRequests = new Map();
function request(type, value) {
  const requestId = `${process.pid}-${Date.now()}-${Math.random()}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pendingRequests.delete(requestId); reject(new Error('清理回执未能持久保存，结果需核对')); }, 10000);
    pendingRequests.set(requestId, { resolve, reject, timer }); send({ type, requestId, ...value });
  });
}
let packaging = false, scenes = [];
const visualChecks = [];

async function slide(kind, title, notes, durationMs, source) {
  if (!config.exportDir) return;
  await checkpoint();
  scenes.push({ ...await capturePptxScene({ page, dir: config.exportDir, index: scenes.length + 1, title, notes, durationMs, source, clean: kind === 'result' }), kind });
  await checkpoint();
}
const transcript = (clip, fallback) => clip && typeof clip.text === 'string' ? clip.text : fallback;

async function capture(name) {
  if (!config.captureDir) return;
  await mkdir(config.captureDir, { recursive: true });
  await page.screenshot({ path: path.join(config.captureDir, `${name}.png`) });
  const details = await page.evaluate(() => ({ ...window.playbookGuide?.inspect(), privacy: window.playbookPrivacy?.inspect(), narration: window.playbookNarration?.inspect(), arrow: Boolean(document.querySelector('.driver-popover-arrow')), toolbarPresent: Boolean(document.querySelector('#ygd-toolbar')), rootParent: document.querySelector('#ygd-root')?.parentElement.tagName }));
  visualChecks.push({ name, ...details });
  await writeFile(path.join(config.captureDir, 'visual-checks.json'), JSON.stringify(visualChecks, null, 2));
}

async function ui(method, value) {
  if (page && !page.isClosed()) await page.evaluate(({ method, value }) => {
    if (method === 'state') window.playbookNarration?.state(value);
    return window.playbookGuide?.[method](value);
  }, { method, value });
}
async function voiceSource(flow, clip, fallback) {
  if (clip === false || (!flow.narration?.enabled && !clip)) return null;
  await checkpoint();
  const source = await narrationSource({ clip, fallback, options: flow.narration, audioAssets: config.audioAssets,
    cacheDir: path.join(path.dirname(config.bundle), 'narration'), signal: narrationAbort.signal });
  await checkpoint();
  return source;
}
function startVoice(source) {
  if (!source) return async () => {};
  const task = page.evaluate(value => window.playbookNarration.play(value), source).then(() => null, error => error);
  return async () => { const error = await task; if (error) throw error; };
}
async function stopVoice() {
  if (page && !page.isClosed()) await page.evaluate(() => window.playbookNarration?.stop()).catch(() => {});
}
async function foreground() {
  if (!page || page.isClosed()) return;
  if (config.embedded) { await request('embedded-focus', {}); return; }
  if (!config.headless) {
    let session;
    try {
      session = await page.context().newCDPSession(page);
      const { windowId } = await session.send('Browser.getWindowForTarget');
      const { bounds } = await session.send('Browser.getWindowBounds', { windowId });
      if (bounds.windowState === 'minimized') await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    } catch { /* BringToFront remains available when native bounds are unsupported. */ }
    finally { await session?.detach().catch(() => {}); }
  }
  await page.bringToFront();
}
async function state() {
  const phase = activeScope?.receipt.status === 'running' ? 'cleaning' : stopped ? 'stopping' : packaging ? 'exporting' : manualGate ? 'waiting' : paused ? inOperation ? 'pausing' : 'paused' : 'playing';
  change({ state: phase, ...current }); await ui('state', { phase, title: current.stepTitle || config.title, count: `${current.index || 0} / ${current.total || 0}`, progress: current.total ? current.completed / current.total * 100 : 0 });
}
async function checkpoint() {
  if (stopped || closing || page?.isClosed()) throw new Stopped();
  while (paused) { await state(); await sleep(80); if (stopped || closing || page?.isClosed()) throw new Stopped(); }
}
async function wait(ms) {
  let remaining = ms * config.pace;
  while (remaining > 0) { await checkpoint(); const part = Math.min(60, remaining); await sleep(part); remaining -= part; }
  await checkpoint();
}
async function inject() {
  if (await page.evaluate(() => Boolean(window.playbookGuide))) return;
  const from = relative => path.join(config.appRoot, relative);
  await page.addStyleTag({ content: await readFile(from('node_modules/driver.js/dist/driver.css'), 'utf8') });
  await page.addStyleTag({ content: await readFile(from('desktop/presentation/guide.css'), 'utf8') });
  await page.addScriptTag({ content: await readFile(from('node_modules/driver.js/dist/driver.js.iife.js'), 'utf8') });
  await page.addScriptTag({ content: await readFile(from('desktop/presentation/guide.js'), 'utf8') });
  await page.addScriptTag({ content: await readFile(from('desktop/presentation/narration.js'), 'utf8') });
  await ui('place', position);
}
async function moveTo(target, duration) {
  const box = await target.boundingBox();
  if (!box) throw new Error('演示目标已不可见');
  const start = position, end = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const frames = Math.max(8, Math.round(30 * config.pace));
  for (let index = 1; index <= frames; index++) {
    await checkpoint(); const t = index / frames, eased = t * t * (3 - 2 * t);
    position = { x: start.x + (end.x - start.x) * eased, y: start.y + (end.y - start.y) * eased };
    await ui('place', position); await page.mouse.move(position.x, position.y); await wait(duration / frames);
  }
}

async function embeddedContext() {
  browser = await chromium.connectOverCDP(config.embedded.endpoint, { timeout: 15000 });
  const context = browser.contexts()[0];
  const allPages = context.pages.bind(context), owned = new Set();
  context.pages = () => [...owned].filter(item => !item.isClosed());
  context.newPage = async () => {
    const { targetId } = await request('embedded-page', { flowId: currentFlowId });
    for (let attempt = 0; attempt < 100; attempt++) {
      for (const candidate of allPages()) {
        let session;
        try {
          session = await context.newCDPSession(candidate);
          const { targetInfo } = await session.send('Target.getTargetInfo');
          if (targetInfo.targetId === targetId) { await session.send('Page.setBypassCSP', { enabled: true }); await session.send('Emulation.setLocaleOverride', { locale: 'zh-CN' }); const ownedSession = session; candidate.once('close', () => { void ownedSession.detach().catch(() => {}); }); session = null; owned.add(candidate); return candidate; }
        } finally { await session?.detach().catch(() => {}); }
      }
      await sleep(50);
    }
    throw new Error('内置页面未能连接到播放器');
  };
  context.close = async () => { for (const item of owned) await item.close().catch(() => {}); };
  return context;
}
function listenManualInput() {
  if (window.__playbookManualInput) { window.__playbookManualInput.active = true; return; }
  const value = window.__playbookManualInput = { active: true, at: Date.now() };
  const activity = event => { if (value.active && event.isTrusted) value.at = Date.now(); };
  addEventListener('pointerdown', activity, true); addEventListener('keydown', activity, true);
}
async function manualStep(step) {
  await ui('interactive');
  const gate = manualGate = new ManualInteraction(step.interaction);
  const flowId = currentFlowId, stepId = step.id;
  const info = () => ({ ...gate.state(), flowId, stepId });
  current.interaction = info();
  let result;
  await request('manual-start', { flowId, stepId, interaction: info() });
  try {
    await page.addInitScript(listenManualInput); await page.evaluate(listenManualInput);
    await page.evaluate(() => dispatchEvent(new CustomEvent('playbook:interaction', { detail: { phase: 'start' } })));
    let signature;
    while (!gate.outcome) {
      if (stopped || closing || page.isClosed()) throw new Stopped();
      const activityAt = await page.evaluate(() => window.__playbookManualInput?.at || 0).catch(() => 0);
      gate.update(Date.now(), activityAt);
      const next = JSON.stringify([Math.ceil((gate.remainingMs || 0) / 1000),gate.busy,gate.paused]);
      if (signature !== next) { signature = next; current.interaction = info(); await state(); }
      if (!gate.outcome) await sleep(80);
    }
    result = gate.result();
    if (gate.outcome === 'timed-out' && gate.onTimeout === 'fail') throw new Error('等待手动操作超时，尚未确认该步骤完成');
    return result;
  } finally {
    result ||= { outcome: 'cancelled', elapsedMs: Date.now() - gate.startedAt };
    await page.evaluate(() => {
      if (window.__playbookManualInput) window.__playbookManualInput.active = false;
      dispatchEvent(new CustomEvent('playbook:interaction', { detail: { phase: 'end' } }));
    }).catch(() => {});
    manualGate = null; current.interaction = null;
    await request('manual-end', { flowId, stepId, result });
  }
}

async function run(input) {
  config = input; running = true; stopped = false; paused = Boolean(input.paused); pauseVersion = 0;
  packaging = false; scenes = []; manualGate = null;
  narrationAbort = new AbortController();
  let preparing = true, finalUpdate, executionError;
  executionAbort = new AbortController();
  const scopes = [];
  try {
    const { flows, profile } = await import(pathToFileURL(config.bundle).href);
    await request('limits', { limits: budgets(profile) });
    if (!flows.length || typeof profile.prepare !== 'function' || profile.id !== config.profileId || profile.dataMode !== config.dataMode) throw new Error('Profile 与清单不一致');
    for (const flow of flows) {
      if (flow.schemaVersion !== 1 || flow.requirements.dataMode !== profile.dataMode || flow.requirements.roles.some(role => !profile.roles?.includes(role))) throw new Error('脚本的环境或角色要求不满足');
      if (flow.requirements.replay === 'reset-required' && profile.resetBeforeRun !== true) throw new Error('此流程需要已验证的环境重置，Profile 尚未声明 resetBeforeRun');
    }
    inOperation = true;
    if (config.exportDir && flows.some(flow => flow.steps.some(step => step.interaction))) throw new Error('Manual steps require an automatic presentation copy before PPTX export');
    let context;
    if (config.embedded) context = await embeddedContext();
    else {
      browser = await chromium.launch({ channel: 'chrome', headless: config.headless, args: ['--start-maximized', '--autoplay-policy=no-user-gesture-required'] });
      context = await browser.newContext({ viewport: config.exportDir ? { width: 1440, height: 810 } : config.headless ? { width: 1440, height: 960 } : null, locale: 'zh-CN', bypassCSP: true });
    }
    inOperation = false; await checkpoint();
    const total = flows.reduce((count, flow) => count + flow.steps.length, 0);
    let completed = 0;
    for (const [flowIndex, flow] of flows.entries()) {
      const segment = config.segments?.[flowIndex] || {}; currentFlowId = flow.id;
      preparing = true;
      await checkpoint();
      if (page && !page.isClosed()) await page.close();
      page = await context.newPage(); page.setDefaultTimeout(15000);
      if (flow.redactions?.length) {
        const privacy = `window.__playbookRedactions = ${JSON.stringify(flow.redactions)};\n${await readFile(path.join(config.appRoot, 'desktop/presentation/privacy.js'), 'utf8')}`;
        await page.addInitScript({ content: privacy });
        await page.evaluate(privacy);
      }
      activeScope = new CleanupScope({ runId: config.runId, flowId: flow.id, scopeId: `${config.runId}.${flowIndex}`, profile, parameters: config.parameters,
        persist: async scope => { scopes[flowIndex] = scope; await request('scope', { scope }); } });
      await activeScope.save();
      let segmentError;
      try {
      inOperation = true; change({ executing: true });
      const prepared = await profile.prepare({ page, workspaceDir: config.workspaceDir, parameters: config.parameters,
        signal: executionAbort.signal, runId: config.runId, flowId: flow.id, registerCleanup: (callback, options) => activeScope.register(callback, options) });
      // Capture release before any context validation, even for a malformed return.
      if (prepared?.release !== undefined) await activeScope.register(prepared.release);
      activeScope.receipt.prepared = true; await activeScope.save();
      if (!prepared?.context || prepared.context.page !== page) throw new Error('Profile 必须返回当前演示 page');
      preparing = false; inOperation = false;
      await checkpoint(); await inject();
      const settings = { spotlightRadius: 105, spotlightFeather: 24, overlayOpacity: .56, cursorMoveMs: 900, defaultHoldMs: 2600, openingMs: 2800, ...flow.presentation };
      const openingSource = await voiceSource(flow, flow.narration?.opening, `${flow.title}。${flow.summary}`);
      await ui('configure', settings);
      await ui('center', { eyebrow: `${segment.sectionTitle ? segment.sectionTitle + ' · ' : ''}${config.dataMode === 'real' ? '实际服务' : config.dataMode === 'mock' ? '模拟接口' : '受控样例'} · Playbook`, title: flow.title, description: flow.summary, phase: 'playing' });
      await slide('opening', flow.title, transcript(flow.narration?.opening, `${flow.title}。${flow.summary}`), settings.openingMs, openingSource);
      const openingVoice = startVoice(openingSource);
      await capture(`opening-${flow.id}`);
      current = { ...segment, total, completed, index: completed, stepTitle: flow.title }; await state(); await wait(settings.openingMs); await openingVoice(); await checkpoint();
      let chapter;
      for (const step of flow.steps) {
        await checkpoint(); current = { ...segment, total, completed, index: completed + 1, stepId: step.id, stepTitle: step.title }; await state();
        await inject(); await ui('configure', settings);
        if (step.presentation?.chapter && step.presentation.chapter !== chapter) {
          chapter = step.presentation.chapter;
          await ui('center', { eyebrow: '接下来演示', title: chapter, description: step.title, phase: 'playing' });
          await slide('chapter', chapter, `${chapter}。${step.title}`, Math.min(1800, settings.openingMs));
          await wait(Math.min(1800, settings.openingMs));
        }
        const target = step.target?.(prepared.context);
        const source = await voiceSource(flow, step.narration, step.explain);
        let spoken;
        if (target) {
          if (await target.count() !== 1) throw new Error('目标控件不唯一');
          await target.waitFor({ state: 'visible' });
          await target.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
          await target.evaluate((element, details) => window.playbookGuide.highlight(element, details), { title: step.title, description: step.explain, side: step.presentation?.side, actionLabel: step.interaction ? '手动操作' : '查看', index: completed + 1, total });
          if (config.exportDir) {
            const box = await target.boundingBox();
            if (!box) throw new Error('导出目标已不可见');
            await ui('place', { x: box.x + box.width / 2, y: box.y + box.height / 2 });
            try { await slide('step', step.title, transcript(step.narration, step.explain), (step.presentation?.holdMs ?? settings.defaultHoldMs) + settings.cursorMoveMs + 250, source); }
            finally { await ui('place', position); }
          }
          spoken = startVoice(source);
          await wait(step.presentation?.holdMs ?? settings.defaultHoldMs);
          await moveTo(target, settings.cursorMoveMs);
          await capture(`step-${completed + 1}`);
          if (!step.interaction) { await ui('clickEffect'); await wait(250); }
        } else {
          await ui('center', { eyebrow: '流程说明', title: step.title, description: step.explain, phase: 'playing' });
          await slide('step', step.title, transcript(step.narration, step.explain), step.presentation?.holdMs ?? settings.defaultHoldMs, source);
          spoken = startVoice(source);
          await wait(step.presentation?.holdMs ?? settings.defaultHoldMs);
        }
        await spoken(); await checkpoint();
        await ui('detach');
        if (step.interaction) {
          const interaction = await manualStep(step);
          await checkpoint(); inOperation = true;
          try { await step.verify(prepared.context, { interaction }); }
          finally { inOperation = false; }
        } else {
          inOperation = true;
          try { await step.run(prepared.context); if (stopped || closing) throw new Stopped(); await step.verify(prepared.context); }
          finally { inOperation = false; }
        }
        completed++; current.completed = completed; await state(); await checkpoint();
        await slide('result', `${step.title} · 操作结果`, '', step.presentation?.afterMs ?? 550);
        await wait(step.presentation?.afterMs ?? 550);
      }
      } catch (error) { segmentError = error; if (!(error instanceof Stopped) && error.name !== 'AbortError') { executionError = safeError(error, config.parameters); await request('execution-error', { error: executionError }); } throw error; }
      finally {
        inOperation = false;
        await stopVoice();
        const receipt = await activeScope.release(stopped || closing ? 'stopped' : segmentError ? 'failed' : 'completed');
        if (!settledCleanup(receipt.status) && !segmentError) { const error = new Error('环境释放未完成，请核对本轮资源'); error.cleanupFailure = true; throw error; }
      }
      await checkpoint(); // A stop during release must never become completed or start the next flow.
      activeScope = null;
    }
    await inject();
    await ui('center', { eyebrow: '演示完成', title: '核心流程已演示完成', description: '每个步骤均已通过实际结果检查。\n你可以回到客户端查看运行记录，或从头再播放。', phase: 'done' });
    await capture('complete');
    let exported;
    if (config.exportDir) {
      await slide('closing', '演示完成', '核心流程已演示完成，每个步骤均已通过实际结果检查。', 1800);
      packaging = true; current.stepTitle = '正在生成 PPTX…'; await state();
      exported = await writePptx({ scenes, title: config.title, output: path.join(config.exportDir, 'deck.pptx'), checkpoint });
    }
    finalUpdate = { state: 'completed', completed: total, index: total, total, ...(exported ? { exported } : {}) };
  } catch (error) {
    await stopVoice();
    if (!(error instanceof Stopped) && error.name !== 'AbortError' && !error.cleanupFailure) executionError ||= safeError(error, config.parameters);
    finalUpdate = { state: 'failed' };
  } finally {
    narrationAbort.abort(); await stopVoice();
    const cleanup = cleanupSummary(scopes);
    const cancelled = stopped || closing;
    const state = executionError || !settledCleanup(cleanup.status) ? 'failed' : cancelled ? 'stopped' : finalUpdate?.state === 'completed' ? 'completed' : 'failed';
    const error = [executionError, ...cleanup.errors.map(item => item.message), !settledCleanup(cleanup.status) && !cleanup.errors.length ? '资源释放未完成，需人工核对' : null].filter(Boolean).join('；');
    finalUpdate = { ...finalUpdate, state, stopRequested: cancelled, executionStatus: executionError ? 'failed' : cancelled ? 'stopped' : state === 'completed' ? 'completed' : 'failed',
      ...(executionError ? { executionError } : {}), cleanup, cleanupScopes: scopes, ...(error ? { error } : {}) };
    try {
      if (state !== 'completed') { await inject(); await ui('center', { eyebrow: state === 'stopped' ? '演示已停止' : '本轮需核对', title: state === 'stopped' ? '后续业务操作已停止' : current.stepTitle || '准备环境', description: error || '资源释放已结束，可在客户端查看回执。', phase: state === 'stopped' ? 'stopped' : 'error' }); }
    } catch {}
    running = false; inOperation = false; packaging = false; activeScope = null;
    try { await request('final', { update: finalUpdate }); }
    catch { send({ type: 'receipt-error' }); }
    if (cancelled || state === 'failed') await browser?.close().catch(() => {});
    if (closing) process.exit(0);
  }
}
async function recover(input) {
  config = input; running = true; executionAbort = new AbortController();
  let error;
  const scopes = structuredClone(input.scopes);
  try {
    const { profile } = await import(pathToFileURL(config.bundle).href);
    if (profile.id !== config.profileId || typeof profile.recovery?.recover !== 'function') throw new Error('Profile 没有匹配的恢复入口');
    await request('limits', { limits: budgets(profile) });
    for (const [index, previous] of scopes.entries()) {
      if (settledCleanup(previous.status)) continue;
      if (previous.recoveryVersion !== profile.recovery.version || !previous.entries.length || previous.entries.some(entry => !settledCleanup(entry.status) && !Object.hasOwn(entry, 'handle'))) throw new Error('缺少可核验的恢复声明，请人工核对资源');
      const scope = new CleanupScope({ profile, previous, parameters: config.parameters, persist: async receipt => { scopes[index] = receipt; await request('scope', { scope: receipt }); } });
      scope.workspaceDir = config.workspaceDir; activeScope = scope;
      const receipt = await scope.release('stopped', true);
      if (!settledCleanup(receipt.status)) break;
      if (stopped || closing) break;
    }
  } catch (failure) { error = safeError(failure, config.parameters); }
  finally {
    const cleanup = cleanupSummary(scopes);
    running = false; activeScope = null;
    await request('final', { update: { state: 'failed', cleanupScopes: scopes, cleanup, recoveryError: error || null,
      ...(error ? { error } : {}) } }).catch(() => {});
    if (closing) process.exit(0);
  }
}

async function commandHandler({ command, config: input, busy: inputBusy }) {
  if (command === 'recover' && !running) { void recover(input); return; }
  if (command === 'start' && !running) { void run(input); return; }
  if (command === 'interaction-busy' && manualGate) { if (inputBusy) pauseVersion++; manualGate.setBusy(inputBusy); current.interaction = { ...current.interaction, ...manualGate.state() }; await state(); return; }
  if (command === 'pause' && manualGate) { pauseVersion++; manualGate.update(Date.now()); manualGate.paused = true; current.interaction = { ...current.interaction, ...manualGate.state() }; await state(); return; }
  if (command === 'resume' && manualGate) { const gate = manualGate, requested = ++pauseVersion; if (!gate.busy) { await foreground(); if (manualGate === gate && requested === pauseVersion && !stopped && !closing && !gate.busy) gate.resume(); } return; }
  if (command === 'pause' && running && !packaging && activeScope?.receipt.status !== 'running') { pauseVersion++; paused = true; await state(); }
  if (command === 'resume' && running && !packaging && activeScope?.receipt.status !== 'running') {
    const requested = ++pauseVersion;
    try { await foreground(); }
    catch { change({ warning: '演示窗口未能置前，请检查受控浏览器窗口。' }); }
    if (requested === pauseVersion && !stopped && !closing) { paused = false; await state(); }
  }
  if (command === 'stop' || command === 'close') {
    pauseVersion++; stopped = true; paused = false; closing ||= command === 'close';
    executionAbort?.abort(); narrationAbort?.abort(); await stopVoice();
    if (running) await state();
    else if (closing) { await browser?.close().catch(() => {}); process.exit(0); }
  }
}
receive(message => {
  if (message.type === 'ack') {
    const item = pendingRequests.get(message.requestId);
    if (item) { clearTimeout(item.timer); pendingRequests.delete(message.requestId); message.error ? item.reject(new Error(message.error)) : item.resolve(message.result); }
    return;
  }
  void commandHandler(message).catch(error => {
    // A navigating/closed document must not kill the worker before Profile cleanup.
    try { change({ warning: safeError(error, config?.parameters) }); } catch {}
  });
});
