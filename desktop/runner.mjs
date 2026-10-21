import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { narrationSource } from './narration.mjs';
import { capturePptxScene, writePptx } from './pptx.mjs';

const send = message => process.parentPort ? process.parentPort.postMessage(message) : process.send?.(message);
const receive = callback => process.parentPort ? process.parentPort.on('message', event => callback(event.data)) : process.on('message', callback);
const change = update => send({ type: 'state', update });
class Stopped extends Error {}
let browser, page, running = false, stopped = false, paused = false, inOperation = false, closing = false, pauseVersion = 0;
let position = { x: 900, y: 600 }, current = {}, config;
let narrationAbort;
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
  const phase = stopped ? 'stopping' : packaging ? 'exporting' : paused ? inOperation ? 'pausing' : 'paused' : 'playing';
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
async function run(input) {
  config = input; running = true; stopped = false; paused = Boolean(input.paused); pauseVersion = 0;
  packaging = false; scenes = [];
  narrationAbort = new AbortController();
  let release, preparing = true, finalUpdate;
  try {
    const { flows, profile } = await import(pathToFileURL(config.bundle).href);
    if (!flows.length || typeof profile.prepare !== 'function' || profile.id !== config.profileId || profile.dataMode !== config.dataMode) throw new Error('Profile 与清单不一致');
    for (const flow of flows) {
      if (flow.schemaVersion !== 1 || flow.requirements.dataMode !== profile.dataMode || flow.requirements.roles.some(role => !profile.roles?.includes(role))) throw new Error('脚本的环境或角色要求不满足');
      if (flow.requirements.replay === 'reset-required' && profile.resetBeforeRun !== true) throw new Error('此流程需要已验证的环境重置，Profile 尚未声明 resetBeforeRun');
    }
    inOperation = true;
    browser = await chromium.launch({ channel: 'chrome', headless: config.headless, args: ['--start-maximized', '--autoplay-policy=no-user-gesture-required'] });
    inOperation = false; await checkpoint();
    const context = await browser.newContext({ viewport: config.exportDir ? { width: 1440, height: 810 } : config.headless ? { width: 1440, height: 960 } : null, locale: 'zh-CN', bypassCSP: true });
    const total = flows.reduce((count, flow) => count + flow.steps.length, 0);
    let completed = 0;
    for (const [flowIndex, flow] of flows.entries()) {
      const segment = config.segments?.[flowIndex] || {};
      preparing = true;
      await checkpoint();
      if (page && !page.isClosed()) await page.close();
      page = await context.newPage(); page.setDefaultTimeout(15000);
      if (flow.redactions?.length) {
        const privacy = `window.__playbookRedactions = ${JSON.stringify(flow.redactions)};\n${await readFile(path.join(config.appRoot, 'desktop/presentation/privacy.js'), 'utf8')}`;
        await page.addInitScript({ content: privacy });
        await page.evaluate(privacy);
      }
      inOperation = true; change({ executing: true });
      const prepared = await profile.prepare({ page, workspaceDir: config.workspaceDir, parameters: config.parameters });
      if (!prepared?.context || prepared.context.page !== page) throw new Error('Profile 必须返回当前演示 page');
      release = prepared.release; preparing = false; inOperation = false;
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
          await target.evaluate((element, details) => window.playbookGuide.highlight(element, details), { title: step.title, description: step.explain, side: step.presentation?.side, index: completed + 1, total });
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
          await ui('clickEffect'); await wait(250);
        } else {
          await ui('center', { eyebrow: '流程说明', title: step.title, description: step.explain, phase: 'playing' });
          await slide('step', step.title, transcript(step.narration, step.explain), step.presentation?.holdMs ?? settings.defaultHoldMs, source);
          spoken = startVoice(source);
          await wait(step.presentation?.holdMs ?? settings.defaultHoldMs);
        }
        await spoken(); await checkpoint();
        await ui('detach');
        inOperation = true;
        try { await step.run(prepared.context); await step.verify(prepared.context); }
        finally { inOperation = false; }
        completed++; current.completed = completed; await state(); await checkpoint();
        await slide('result', `${step.title} · 操作结果`, '', step.presentation?.afterMs ?? 550);
        await wait(step.presentation?.afterMs ?? 550);
      }
      if (release) { const cleanup = release; release = null; await cleanup(); }
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
    const cancelled = stopped || closing || error instanceof Stopped;
    let message = preparing ? '准备环境未完成。请检查 Chrome、Profile、角色与本地连接；登录与私密参数未写入日志。'
      : String(error.message || error).replace(/\x1b\[[0-9;]*m/g, '').replace(/(password|token|secret|authorization|cookie)(["'\s:=]+)[^\s,}\n]+/gi, '$1$2[已隐藏]').slice(0, 1000);
    for (const [key, value] of Object.entries(config.parameters || {})) if (/password|token|secret|cookie/i.test(key) && typeof value === 'string' && value) message = message.split(value).join('[已隐藏]');
    finalUpdate = { state: cancelled ? 'stopped' : 'failed', ...(cancelled ? {} : { error: message }) };
    try { await inject(); await ui('center', { eyebrow: cancelled ? '演示已停止' : '当前步骤未完成', title: cancelled ? '可以从头重新播放' : current.stepTitle || '准备环境', description: cancelled ? '后续操作已停止。已完成的业务操作不会自动撤销。' : message, phase: cancelled ? 'stopped' : 'error' }); } catch {}
  } finally {
    narrationAbort.abort(); await stopVoice();
    if (release) { try { await release(); } catch { finalUpdate = { state: 'failed', error: '环境释放未完成，请核对本轮临时资源' }; } }
    running = false; inOperation = false; packaging = false;
    if (stopped || closing) await browser?.close().catch(() => {});
    if (closing) process.exit(0);
    else if (finalUpdate) change(finalUpdate);
  }
}
async function commandHandler({ command, config: input }) {
  if (command === 'start' && !running) { void run(input); return; }
  if (command === 'pause' && running && !packaging) { pauseVersion++; paused = true; await state(); }
  if (command === 'resume' && running && !packaging) {
    const requested = ++pauseVersion;
    try { await foreground(); }
    catch { change({ warning: '演示窗口未能置前，请检查受控浏览器窗口。' }); }
    if (requested === pauseVersion && !stopped && !closing) { paused = false; await state(); }
  }
  if (command === 'stop') { pauseVersion++; stopped = true; paused = false; narrationAbort?.abort(); await stopVoice(); await state(); setTimeout(() => browser?.close().catch(() => {}), 1800).unref(); }
  if (command === 'close') { pauseVersion++; closing = true; stopped = true; paused = false; narrationAbort?.abort(); await stopVoice(); await browser?.close().catch(() => {}); if (!running) process.exit(0); }
}
receive(message => void commandHandler(message));
