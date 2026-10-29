import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const root = process.cwd(), temp = await mkdtemp('/private/tmp/playbook-narration-desktop-');
const project = path.join(temp, 'project'), data = path.join(temp, 'data');
const evidence = path.join(root, 'artifacts', `narration-desktop-${Date.now()}`);
await Promise.all([mkdir(project), mkdir(data), mkdir(evidence, { recursive: true })]);
await writeFile(path.join(project, '.playbook.json'), JSON.stringify({ schemaVersion: 1, title: '默认系统旁白',
  profiles: [{ id: 'local', title: '本地样本', file: 'local.profile.ts', dataMode: 'fixture', parameters: {} }],
  scripts: [{ file: 'voice.playbook.ts', profile: 'local' }],
  books: [{ id: 'voice-book', title: '未配置旁白的 Book', sections: [{ id: 'one', title: '样本', scripts: ['voice-flow'] }] }],
}));
await writeFile(path.join(project, 'local.profile.ts'), `
import {defineProfile} from '@playbook/core';
export default defineProfile({schemaVersion:1,id:'local',title:'本地样本',roles:[],dataMode:'fixture',
async prepare({page}){
  await page.route('http://voice.fixture/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<html lang="zh"><head><title>语音测试</title></head><body style="font:20px system-ui;padding:70px"><h1>默认旁白</h1><button id="action" onclick="window.businessClicks=(window.businessClicks||0)+1">查看课程</button></body></html>'}));
  await page.goto('http://voice.fixture/'); return {context:{page}};
}});`);
await writeFile(path.join(project, 'voice.playbook.ts'), `
import {definePlaybook} from '@playbook/core';
import {expect} from '@playwright/test';
export default definePlaybook({schemaVersion:1,id:'voice-flow',title:'语音',summary:'开始',playback:{browser:'embedded'},
requirements:{dataMode:'fixture',effects:'read-only',replay:'safe',roles:[]},
presentation:{openingMs:0,defaultHoldMs:0,cursorMoveMs:150},
steps:[{id:'listen',title:'查看课程',explain:'请听完这段系统语音，然后查看课程。',target:({page})=>page.locator('#action'),
async run({page}){
  const voice=await page.evaluate(()=>window.playbookNarration.inspect());
  if(voice.kind==='tts' && !['ended','stopped'].includes(voice.state))throw new Error('旁白尚未结束就执行了业务动作');
  await page.locator('#action').click();
},async verify({page}){expect(await page.evaluate(()=>window.businessClicks)).toBe(1);}},
{id:'silent',title:'显式静音',explain:'此步骤不朗读。',narration:false,async run(){},async verify(){}}]});`);
const env = { ...process.env, PLAYBOOK_USER_DATA: data, PLAYBOOK_WORKSPACE: project, PLAYBOOK_TEST_PACE: '.1' };
delete env.ELECTRON_RUN_AS_NODE;
let app, main;
const result = { evidence, temp };
async function launch() {
  app = await electron.launch({ args: [root], env, timeout: 25000 });
  main = null;
  const deadline = Date.now() + 20000;
  while (!main && Date.now() < deadline) {
    for (const candidate of app.windows()) {
      if (await candidate.evaluate(() => Boolean(window.playbook)).catch(() => false)) { main = candidate; break; }
    }
    if (!main) await sleep(100);
  }
  assert.ok(main, '未找到 Playbook 主窗口');
  await main.getByRole('switch', { name: '语音讲解' }).waitFor();
}
const state = () => main.evaluate(() => window.playbook.getState());
async function until(predicate) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const value = await state();
    if (value.activeRun?.state === 'failed') throw new Error(value.activeRun.error || '演示失败');
    if (await predicate(value)) return value;
    await sleep(75);
  }
  throw new Error('等待语音状态超时');
}
try {
  await launch();
  assert.equal((await state()).narrationEnabled, true);
  const workspace = (await state()).workspaces.find(item => item.path === project);
  const play = () => main.evaluate(input => window.playbook.play(input), { workspaceId: workspace.id, entryId: 'voice-book', kind: 'book', browser: 'embedded' });
  await play();
  await until(value => value.activeRun?.stepId === 'listen');
  const business = app.windows().find(item => item.url() === 'http://voice.fixture/'); assert.ok(business);
  await business.waitForFunction(() => window.playbookNarration?.inspect().kind === 'tts' && window.playbookNarration.inspect().state === 'playing' && window.playbookNarration.inspect().time > .15);
  await main.getByRole('button', { name: '暂停播放', exact: true }).click();
  await until(value => value.activeRun?.state === 'paused');
  await business.waitForFunction(() => window.playbookNarration.inspect().state === 'paused');
  const before = await business.evaluate(() => window.playbookNarration.inspect());
  await sleep(350);
  const after = await business.evaluate(() => window.playbookNarration.inspect());
  assert.ok(Math.abs(before.time - after.time) < .08);
  await main.screenshot({ path: path.join(evidence, '01-paused-with-switch.png') });
  await main.getByRole('button', { name: '继续播放', exact: true }).click();
  await until(value => value.activeRun?.state === 'completed');
  assert.equal(await business.evaluate(() => window.businessClicks), 1);
  const ended = await business.evaluate(() => window.playbookNarration.inspect());
  assert.equal(ended.kind, 'tts'); assert.equal(ended.state, 'ended');
  result.ttsWaitsForCompletion = true;
  await main.evaluate(() => window.playbook.showEmbedded(false));
  await play();
  await until(value => value.activeRun?.stepId === 'listen');
  const next = app.windows().find(item => item.url() === 'http://voice.fixture/' && item !== business); assert.ok(next);
  await next.waitForFunction(() => window.playbookNarration?.inspect().state === 'playing' && window.playbookNarration.inspect().time > .15);
  await main.getByRole('switch', { name: '语音讲解' }).click();
  await until(value => value.narrationEnabled === false);
  await next.waitForFunction(() => window.playbookNarration.inspect().state === 'stopped');
  await until(value => value.activeRun?.state === 'completed');
  assert.equal(await next.evaluate(() => window.businessClicks), 1);
  result.muteStopsCurrentSpeech = true;
  await app.close(); app = null;
  assert.equal(JSON.parse(await readFile(path.join(data, 'settings.json'), 'utf8')).narrationEnabled, false);
  await launch();
  assert.equal((await state()).narrationEnabled, false);
  assert.equal(await main.getByRole('switch', { name: '语音讲解' }).getAttribute('aria-checked'), 'false');
  await play();
  await until(value => value.activeRun?.state === 'completed');
  const silent = app.windows().find(item => item.url() === 'http://voice.fixture/'); assert.ok(silent);
  assert.equal((await silent.evaluate(() => window.playbookNarration.inspect())).kind, undefined);
  assert.equal(await silent.evaluate(() => window.businessClicks), 1);
  await main.getByRole('switch', { name: '语音讲解' }).click();
  await until(value => value.narrationEnabled === true);
  await main.screenshot({ path: path.join(evidence, '02-switch-restored.png') });
  result.preferenceSurvivesRestart = true; result.passed = true;
} catch (error) { result.passed = false; result.error = error.stack; process.exitCode = 1; }
finally {
  await app?.close().catch(() => {});
  await writeFile(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
