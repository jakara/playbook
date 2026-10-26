import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright/test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const root = process.cwd();
const output = await mkdtemp('/private/tmp/playbook-text-lifecycle-');
const project = path.join(output, 'project'), data = path.join(output, 'data');
await mkdir(project); await mkdir(data);
await writeFile(path.join(project, '.playbook.json'), JSON.stringify({ schemaVersion: 1, title: '文字定位停止样本',
  profiles: [{ id: 'text-fixture', title: '本地样本', file: 'fixture.profile.ts', dataMode: 'fixture', parameters: {} }],
  scripts: [{ file: 'text.playbook.ts', profile: 'text-fixture' }],
  books: [{ id: 'text-book', title: '文字定位停止', profile: 'text-fixture', sections: [{ id: 'one', title: '样本', scripts: ['text-step'] }] }],
}, null, 2));
await writeFile(path.join(project, 'fixture.profile.ts'), `
import {defineProfile} from '@playbook/core';
import fs from 'node:fs/promises';
import path from 'node:path';
export default defineProfile({schemaVersion:1,id:'text-fixture',title:'本地样本',dataMode:'fixture',roles:[],
async prepare({page,workspaceDir,runId,registerCleanup}){
  const file=path.join(workspaceDir,'events.jsonl');
  const log=event=>fs.appendFile(file,JSON.stringify({runId,...event})+'\\n');
  let timer,busy=false;
  const release=async()=>{clearInterval(timer);const state=await page.evaluate(()=>window.playbookGuide?.inspect()).catch(()=>null);await log({event:'release',textVisible:state?.textVisible??false});};
  await registerCleanup(release,{id:'text-monitor'});
  await page.setContent('<style>body{padding:36px;font:22px/1.6 system-ui}#reading{width:1112px}.tail{height:900px}</style><p id="reading">生成服务尚未配置，可继续手工编写；已有内容已保留。多行文字也必须保持可读。</p><div class="tail"></div>');
  timer=setInterval(async()=>{if(busy||page.isClosed())return;busy=true;try{
    const info=await page.evaluate(()=>{const p=document.querySelector('#reading');p.style.width=p.style.width==='370px'?'1112px':'370px';return window.playbookGuide?.inspect()});
    if(info?.textVisible)await log({event:'text-update',lines:info.textLines.length,first:info.textLines[0]});
  }catch{}finally{busy=false}},60);
  await log({event:'prepared'});
  return {context:{page,log},release};
}});`);
await writeFile(path.join(project, 'text.playbook.ts'), `
import {definePlaybook} from '@playbook/core';
export default definePlaybook({schemaVersion:1,id:'text-step',title:'文字定位停止样本',summary:'本地静态文字',
requirements:{dataMode:'fixture',effects:'read-only',replay:'safe',roles:[]},
presentation:{openingMs:0,cursorMoveMs:150},steps:[{id:'reading',title:'阅读段落',explain:'观察真实文字',
presentation:{spotlight:'text',holdMs:20000,afterMs:3500},target:({page})=>page.locator('#reading'),
async run({log}){await log({event:'run'});},async verify(){}
}]});`);
let app, page; const result = { output, version: JSON.parse(await readFile(path.join(root, 'package.json'))).version };
const events = async () => (await readFile(path.join(project, 'events.jsonl'), 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(JSON.parse);
try {
  const env = { ...process.env, PLAYBOOK_USER_DATA: data, PLAYBOOK_WORKSPACE: project, PLAYBOOK_TEST_HEADLESS: '1', PLAYBOOK_TEST_PACE: '.1', PLAYBOOK_TEST_CAPTURE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [root], env, timeout: 25000 });
  for (let n = 0; n < 100 && !page; n++) {
    for (const candidate of app.windows()) if (await candidate.evaluate(() => Boolean(window.playbook)).catch(() => false)) { page = candidate; break; }
    if (!page) await sleep(100);
  }
  assert.ok(page);
  const state = await page.evaluate(() => window.playbook.getState());
  const workspace = state.workspaces.find(item => item.path === project);
  assert.ok(workspace && workspace.items.every(item => item.valid));
  await page.evaluate(value => window.playbook.play(value), { workspaceId: workspace.id, kind: 'script', entryId: 'text-step', profileId: 'text-fixture' });
  let run;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    run = (await page.evaluate(() => window.playbook.getState())).activeRun;
    const updates = (await events()).filter(item => item.event === 'text-update');
    if (updates.length >= 3 && new Set(updates.map(item => item.lines)).size >= 2) break;
    await sleep(40);
  }
  const updates = (await events()).filter(item => item.event === 'text-update');
  assert.ok(updates.length >= 3 && new Set(updates.map(item => item.lines)).size >= 2, '必须实际在重排期间停止');
  await page.evaluate(() => window.playbook.control('stop'));
  while (Date.now() < deadline) {
    run = (await page.evaluate(() => window.playbook.getState())).activeRun;
    if (run && ['stopped', 'failed', 'completed'].includes(run.state)) break;
    await sleep(50);
  }
  assert.equal(run?.state, 'stopped', JSON.stringify(run));
  assert.equal(run.cleanup?.status, 'succeeded');
  await page.evaluate(() => window.playbook.control('stop'));
  await sleep(120);
  const all = await events();
  assert.equal(all.filter(item => item.event === 'release').length, 1);
  assert.equal(all.find(item => item.event === 'release').textVisible, false);
  assert.equal(all.filter(item => item.event === 'run').length, 0);
  result.status = 'passed'; result.runId = run.id; result.updates = updates.length;
} catch (error) { result.status = 'failed'; result.error = error.stack; process.exitCode = 1; }
finally { await app?.close().catch(() => {}); await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); }
