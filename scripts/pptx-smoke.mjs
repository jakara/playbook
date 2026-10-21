import { _electron as electron, expect } from 'playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import JSZip from 'jszip';
import { narrationSource } from '../desktop/narration.mjs';

const root = process.cwd(), output = path.join(root, 'artifacts', `pptx-${process.env.PLAYBOOK_PACKAGED_EXECUTABLE ? 'packaged-' : ''}smoke-${Date.now()}`);
const temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'playbook-pptx-smoke-')));
const project = path.join(temporary, 'project'), userData = path.join(temporary, 'data'), log = path.join(output, 'business.jsonl');
await mkdir(project, { recursive: true }); await mkdir(output, { recursive: true });
const checks = {}, errors = []; let launched, page, failure;
const profile = `import {defineProfile} from '@playbook/core';
import {appendFile} from 'node:fs/promises';
export default defineProfile({schemaVersion:1,id:'sample',title:'隔离样例',dataMode:'fixture',roles:[],async prepare({page,parameters}){
await page.setContent('<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><style>body{font:24px -apple-system,sans-serif;margin:0;color:#17382c;background:#eef3ec}header{padding:28px 70px;background:white;display:flex;justify-content:space-between}main{padding:50px 70px}button,input{font:inherit;padding:16px;margin:12px 0}section{padding:24px;background:white;border-radius:16px}#secret{background:#ffe0d0;padding:16px;color:#1b1818}</style><header><strong>Playbook 导出演示</strong><span>受控样例</span></header><main><h1>课程准备工作台</h1><p>截图、语音、讲解和实际操作按同一顺序完成。</p><section><button id="add">预览课程</button><p>已预览：<b id="count">0</b></p><label>搜索课程 <input id="query"></label><button id="search">搜索</button><p id="result">尚未搜索</p><div id="secret">PRIVATE-NEVER-IN-SCREENSHOT</div></section></main></html>');
await page.evaluate(()=>{document.querySelector('#add').onclick=()=>{document.querySelector('#count').textContent=String(Number(document.querySelector('#count').textContent)+1)};document.querySelector('#search').onclick=()=>{document.querySelector('#result').textContent=document.querySelector('#query').value};});
return {context:{page,parameters},async release(){await appendFile(parameters.log,JSON.stringify({count:await page.locator('#count').textContent(),result:await page.locator('#result').textContent()})+'\\n');}};
}});`;
const common = `requirements:{dataMode:'fixture',effects:'read-only',replay:'safe',roles:[]},presentation:{openingMs:400,defaultHoldMs:500,cursorMoveMs:300},redactions:[{selector:'#secret',mode:'cover'}]`;
const first = `import {definePlaybook} from '@playbook/core';import {expect} from '@playwright/test';
export default definePlaybook({schemaVersion:1,id:'export.first',title:'第一段：查看与搜索',summary:'讲解与业务断言一同执行。',${common},narration:{enabled:true,rate:240,opening:{text:'欢迎体验。'}},steps:[
{id:'preview',title:'预览课程',explain:'先查看课程。',narration:{audio:'voice.wav'},presentation:{chapter:'认识课程',afterMs:600},target:({page})=>page.locator('#add'),async run({page}){await page.locator('#add').click();},async verify({page,parameters}){await expect(page.locator('#count')).toHaveText(parameters.fail?'99':'1',{timeout:400});}},
{id:'search',title:'搜索课程',explain:'输入名称，查找课程。',narration:{text:'查找课程。'},presentation:{afterMs:750},target:({page})=>page.locator('#search'),async run({page}){await page.locator('#query').fill('海报设计');await page.locator('#search').click();},async verify({page}){await expect(page.locator('#result')).toHaveText('海报设计');}}]});`;
const second = `import {definePlaybook} from '@playbook/core';import {expect} from '@playwright/test';
export default definePlaybook({schemaVersion:1,id:'export.second',title:'第二段：独立流程',summary:'按 Book 中的顺序继续。',${common},narration:{enabled:false},steps:[{id:'again',title:'重新预览',explain:'每个脚本独立准备环境。',target:({page})=>page.locator('#add'),async run({page}){await page.locator('#add').click();},async verify({page}){await expect(page.locator('#count')).toHaveText('1');}}]});`;
try {
  const voice = await narrationSource({ clip: { text: '先查看课程，讲解完成以后再执行操作。' }, options: { rate: 240 }, cacheDir: path.join(output, 'tts') });
  await writeFile(path.join(project, 'voice.wav'), Buffer.from(voice.dataUrl.split(',')[1], 'base64'));
  await writeFile(path.join(project, 'profile.ts'), profile); await writeFile(path.join(project, 'first.ts'), first); await writeFile(path.join(project, 'second.ts'), second);
  await writeFile(path.join(project, '.playbook.json'), JSON.stringify({ schemaVersion: 1, title: 'PPTX 导出验收',
    profiles: [{ id: 'sample', file: 'profile.ts', title: '正确预期', dataMode: 'fixture', parameters: { log } }, { id: 'broken', file: 'broken.profile.ts', title: '刻意失败', dataMode: 'fixture', parameters: { log, fail: true } }],
    scripts: [{ file: 'first.ts', profile: 'sample' }, { file: 'second.ts', profile: 'sample' }],
    books: [{ id: 'export-book', title: '截图演示 Book', profile: 'sample', sections: [{ id: 'one', title: '核心流程', scripts: ['export.first', 'export.second'] }] }] }, null, 2));
  await writeFile(path.join(project, 'broken.profile.ts'), profile.replace("id:'sample'", "id:'broken'"));
  const env = { ...process.env, PLAYBOOK_USER_DATA: userData, PLAYBOOK_WORKSPACE: project, PLAYBOOK_TEST_HEADLESS: '1', PLAYBOOK_TEST_PACE: '.03' };
  delete env.ELECTRON_RUN_AS_NODE;
  if (process.env.PLAYBOOK_PACKAGED_EXECUTABLE) env.PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
  launched = await electron.launch({ ...(process.env.PLAYBOOK_PACKAGED_EXECUTABLE ? { executablePath: process.env.PLAYBOOK_PACKAGED_EXECUTABLE, args: [] } : { args: [root] }), env, timeout: 25000 });
  for (let attempt = 0; attempt < 100 && !page; attempt++) {
    for (const candidate of launched.windows()) if (await candidate.evaluate(() => Boolean(window.playbook)).catch(() => false)) { page = candidate; break; }
    if (!page) await sleep(50);
  }
  assert.ok(page); page.on('pageerror', error => errors.push(error.message));
  const call = (method, input) => page.evaluate(({ method, input }) => window.playbook[method](input), { method, input });
  const state = () => call('getState');
  async function until(predicate, timeout = 45000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const value = await state(); if (predicate(value)) return value; await sleep(60); }
    throw new Error(`PPTX timeout: ${JSON.stringify((await state()).activeRun)}`);
  }
  const saveDialog = next => launched.evaluate(({ dialog }, result) => { dialog.showSaveDialog = async () => result; }, next);
  const workspace = (await until(value => value.workspaces.some(item => item.path === project))).workspaces.find(item => item.path === project);
  assert.ok(workspace.items.every(item => item.valid), JSON.stringify(workspace.items));
  await page.getByLabel('筛选项目').selectOption(workspace.id);
  await page.getByRole('button', { name: '查看 Book 截图演示 Book', exact: true }).click();
  await expect(page.getByRole('button', { name: '回放并导出 Book PPTX' })).toBeVisible();
  await expect(page.getByRole('button', { name: '回放并导出 Section PPTX' })).toBeVisible();
  await page.screenshot({ path: path.join(output, '01-export-actions.png') });
  await saveDialog({ canceled: true });
  await page.getByRole('button', { name: '回放并导出 Book PPTX' }).click();
  assert.equal((await state()).activeRun, null); checks.cancelDoesNotRun = true;
  const deck = path.join(output, 'playbook-demo.pptx');
  await saveDialog({ canceled: false, filePath: deck });
  await page.getByRole('button', { name: '回放并导出 Book PPTX' }).click();
  await until(value => value.activeRun?.state === 'playing' && value.activeRun.index === 1);
  await call('control', 'pause'); await until(value => value.activeRun?.state === 'paused'); await sleep(200);
  assert.equal((await state()).activeRun.completed, 0); await call('control', 'resume'); checks.pauseResumeDuringExport = true;
  const success = (await until(value => value.activeRun?.state === 'completed' || value.activeRun?.state === 'failed')).activeRun;
  assert.equal(success.state, 'completed', success.error); assert.equal(success.mode, 'pptx');
  assert.equal(success.completed, 3); assert.equal(success.exported.slides, 10); assert.equal(success.exported.audioSlides, 3);
  assert.equal(success.exported.path, deck); checks.bookOrderAndCompletion = true;
  await expect(page.getByRole('button', { name: '打开 PPTX', exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(output, '02-export-completed.png') });
  const zip = await JSZip.loadAsync(await readFile(deck));
  const slideCount = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+.xml$/.test(name)).length;
  assert.equal(slideCount, 10);
  let totalMs = 0, audioSlides = 0; const notes = [], timings = [];
  for (let index = 1; index <= slideCount; index++) {
    const xml = await zip.file(`ppt/slides/slide${index}.xml`).async('string');
    const timing = Number(xml.match(/advTm="(\d+)"/)[1]); totalMs += timing; timings.push(timing);
    notes.push(await zip.file(`ppt/notesSlides/notesSlide${index}.xml`).async('string'));
    if (/<p:stSnd/.test(xml)) {
      const wav = await zip.file(`ppt/media/playbook-${index}.wav`).async('nodebuffer');
      assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.readUInt16LE(20), 1); assert.equal(wav.readUInt16LE(34), 16);
      const duration = Math.ceil(wav.readUInt32LE(40) / wav.readUInt32LE(28) * 1000);
      assert.ok(timing >= duration); assert.ok(wav.subarray(44).some(value => value !== 0)); audioSlides++;
    }
  }
  assert.equal(audioSlides, 3); assert.equal(totalMs, success.exported.durationMs);
  assert.match(notes[0], /欢迎体验。/); assert.match(notes[2], /先查看课程。/); assert.match(notes[4], /查找课程。/);
  assert.match(notes[6], /第二段：独立流程/); assert.equal(timings[3], 600); assert.equal(timings[5], 750);
  assert.equal(timings[2], Math.max(1050, Math.ceil((await zip.file('ppt/media/playbook-3.wav').async('nodebuffer')).readUInt32LE(40) / 44100 * 1000)));
  checks.notesActualAudioAndNominalTimings = true;
  const scenesDir = path.join(userData, 'cache', success.id, 'export');
  for (const index of [1, 3, 4, 5, 6, 8, 9]) await writeFile(path.join(output, `scene-${index}.png`), await readFile(path.join(scenesDir, `${index}.png`)));
  const released = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(released.map(item => [item.count, item.result]), [['1', '海报设计'], ['1', '尚未搜索']]); checks.originalActionsAndRelease = true;
  await page.getByRole('button', { name: '项目', exact: true }).click();
  await page.getByRole('button', { name: '查看 Book 截图演示 Book', exact: true }).click();
  await saveDialog({ canceled: true });
  await page.getByRole('button', { name: '回放并导出 Section PPTX' }).click();
  assert.equal((await state()).activeRun.id, success.id); checks.sectionExportCancellation = true;
  await page.getByRole('button', { name: '查看脚本 第二段：独立流程', exact: true }).click();
  await saveDialog({ canceled: false, filePath: path.join(output, 'silent-script.pptx') });
  await page.getByRole('button', { name: '回放并导出 脚本 PPTX' }).click();
  const single = (await until(value => value.activeRun?.id !== success.id && ['completed', 'failed'].includes(value.activeRun?.state))).activeRun;
  assert.equal(single.state, 'completed', single.error); assert.equal(single.exported.slides, 4); assert.equal(single.exported.audioSlides, 0);
  assert.equal(single.completed, 1); checks.singleScriptAndSilentSlides = true;
  const keep = path.join(output, 'preserved.pptx'); await writeFile(keep, 'existing destination'); await saveDialog({ canceled: false, filePath: keep });
  const target = { workspaceId: workspace.id, entryId: 'export-book', kind: 'book', profileId: 'broken' };
  await call('exportPptx', target);
  const failed = (await until(value => value.activeRun?.state === 'failed')).activeRun;
  assert.equal(failed.completed, 0); assert.equal(failed.exported, undefined); assert.equal(await readFile(keep, 'utf8'), 'existing destination'); checks.failedAssertionPreservesDestination = true;
  await call('exportPptx', { ...target, profileId: 'sample' });
  await until(value => value.activeRun?.state === 'playing' && value.activeRun.index === 1);
  await call('control', 'stop');
  const stopped = (await until(value => value.activeRun?.state === 'stopped')).activeRun;
  assert.equal(stopped.completed, 0); assert.equal(await readFile(keep, 'utf8'), 'existing destination'); checks.stopPreservesDestination = true;
  await page.getByRole('button', { name: '运行记录', exact: true }).click();
  assert.ok((await state()).runs.some(run => run.id === success.id && run.exported.path === deck)); checks.historyRetainsExport = true;
  await writeFile(path.join(output, 'export.json'), JSON.stringify({ success, single, failed, stopped, timings, scenesDir }, null, 2));
  assert.deepEqual(errors, []);
} catch (error) { failure = { message: error.message, stack: error.stack }; if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); }
finally {
  await launched?.close();
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, checks, errors, failure, scope: 'Isolated fixture, real Electron UI + Chrome replay + local Chinese speech. Save dialog selection is controlled; no physical chooser, PowerPoint playback or human audibility acceptance is claimed.' }, null, 2));
  console.log(JSON.stringify({ passed: !failure, checks, output, failure }, null, 2));
  if (failure) process.exitCode = 1;
}
