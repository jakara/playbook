import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, writeFile, readFile, stat, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const root=process.cwd(), base=await mkdtemp('/private/tmp/playbook-hybrid-'), project=path.join(base,'project'), data=path.join(base,'data');
const output=path.join(root,'artifacts','hybrid-'+Date.now());await mkdir(project);await mkdir(output,{recursive:true});
const cases=[
 ['ten',10000,'continue','if(options?.interaction?.outcome!=="timed-out")throw new Error("Expected timeout receipt");'],
 ['continue',0,'continue','await expect(page.getByLabel("Input")).toHaveValue("learner");if(options?.interaction?.outcome!=="continued")throw new Error("Expected continue");'],
 ['failure',1000,'fail','throw new Error("Verification must not run after required timeout");'],
 ['stop',0,'continue','throw new Error("Verification must not run after stop");'],
 ['shared-first',1000,'continue','await page.context().addCookies([{name:"shared",value:"yes",domain:"manual.fixture",path:"/"}]);'],
 ['strict',1000,'continue','await expect(page.getByLabel("Input")).toBeVisible();'],
];
for(const [id,timeout,onTimeout,verify] of cases){
 await writeFile(path.join(project,id+'.playbook.ts'),"import {definePlaybook} from '@playbook/core';import {expect} from '@playwright/test';export default definePlaybook({schemaVersion:1,id:'"+id+"',title:'"+id+"',summary:'Isolated hybrid fixture',playback:{browser:'embedded'},presentation:{openingMs:0,defaultHoldMs:0,cursorMoveMs:150},requirements:{dataMode:'fixture',effects:'read-only',replay:'safe',roles:[]},steps:[{id:'manual',title:'Your turn',explain:'Fill the field if needed, then continue',interaction:{mode:'manual',prompt:'Your turn',timeoutMs:"+timeout+",onTimeout:'"+onTimeout+"'},target:({page})=>page.getByLabel('Input'),run:async()=>{throw new Error('Manual action was automatically executed');},verify:async({page},options)=>{"+verify+"}}]});");
}
await writeFile(path.join(project,'shared-second.playbook.ts'),"import {definePlaybook} from '@playbook/core';export default definePlaybook({schemaVersion:1,id:'shared-second',title:'shared-second',summary:'Shared browser context',playback:{browser:'embedded'},presentation:{openingMs:0,defaultHoldMs:0},requirements:{dataMode:'fixture',effects:'read-only',replay:'safe',roles:[]},steps:[{id:'verify',title:'Check cookie',explain:'Same session',run:async()=>{},verify:async({page})=>{if(!(await page.context().cookies()).some(c=>c.name==='shared'&&c.value==='yes'))throw new Error('Batch session did not persist');}}]});");
await writeFile(path.join(project,'local.profile.ts'),"import {defineProfile} from '@playbook/core';import {appendFile} from 'node:fs/promises';import path from 'node:path';export default defineProfile({schemaVersion:1,id:'local',title:'Local fixture',roles:[],dataMode:'fixture',async prepare({page,workspaceDir,flowId}){await page.route('http://manual.fixture/**',r=>r.fulfill({headers:flowId==='strict'?{'Content-Security-Policy':\"default-src 'none'; script-src 'none'; style-src 'none'\"}:{},contentType:'text/html',body:'<h1>Manual fixture</h1><label>Input<input aria-label=\"Input\"></label>'}));await page.goto('http://manual.fixture/');return {context:{page},release:async()=>appendFile(path.join(workspaceDir,'release.jsonl'),JSON.stringify({flowId})+'\\n')};}});");
const ids=[...cases.map(c=>c[0]),'shared-second'];
await writeFile(path.join(project,'.playbook.json'),JSON.stringify({schemaVersion:1,title:'Hybrid fixture',profiles:[{id:'local',file:'local.profile.ts',dataMode:'fixture'}],scripts:ids.map(id=>({file:id+'.playbook.ts',profile:'local'})),books:[{id:'shared',title:'Shared fixture',sections:[{id:'one',title:'One',scripts:['shared-first','shared-second']}]}]}));
const env={...process.env,PLAYBOOK_USER_DATA:data,PLAYBOOK_WORKSPACE:project,PLAYBOOK_TEST_PACE:'.02',PLAYBOOK_TEST_CAPTURE:'1',PLAYBOOK_TEST_HEADLESS:'1'};delete env.ELECTRON_RUN_AS_NODE;
const launch=()=>electron.launch({...(process.env.PLAYBOOK_PACKAGED_EXECUTABLE?{executablePath:process.env.PLAYBOOK_PACKAGED_EXECUTABLE,args:[]}:{args:[root]}),env,timeout:30000});
let app=await launch(),main;const errors=[],checks=[];
async function mainPage(){for(let i=0;i<200;i++){for(const p of app.windows())if(await p.evaluate(()=>Boolean(window.playbook)).catch(()=>false))return p;await sleep(50);}throw new Error('No main renderer');}
const state=()=>main.evaluate(()=>window.playbook.getState());
async function until(predicate,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){const s=await state();if(predicate(s))return s;await sleep(60);}throw new Error('Timeout '+JSON.stringify(await state()));}
let workspaceId;
async function play(id,kind='script',browser){await main.evaluate(input=>window.playbook.play(input),{workspaceId,entryId:id,kind,...(browser?{browser}:{})});}
async function finish(expected='completed'){const s=await until(s=>['completed','stopped','failed'].includes(s.activeRun?.state));assert.equal(s.activeRun.state,expected,JSON.stringify(s.activeRun));return s.activeRun;}
try{
 main=await mainPage();main.on('pageerror',e=>errors.push(e.message));workspaceId=(await state()).workspaces.find(w=>w.path===project).id;
 const sessionPath=await app.evaluate(({app})=>app.getPath('sessionData'));
 await play('ten');await until(s=>s.activeRun?.state==='waiting');const start=Date.now();
 await main.screenshot({path:path.join(output,'waiting-shell.png')});
 const ten=await finish();assert.equal(ten.manualInteractions[0].outcome,'timed-out');assert.ok(ten.manualInteractions[0].elapsedMs>=10000);checks.push({name:'default-ten-second-timeout',elapsedMs:ten.manualInteractions[0].elapsedMs,observedMs:Date.now()-start});
 await play('continue');await until(s=>s.activeRun?.state==='waiting');
 const embedded=app.windows().find(p=>p.url()==='http://manual.fixture/');
 assert.ok(embedded);assert.equal(await embedded.evaluate(()=>Boolean(window.playbookTutorial)),false);
 const bounds=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Playbook').contentView.children.map(v=>v.getBounds()));
 assert.ok(bounds.some(b=>b.y===118));assert.equal(await main.locator('.sidebar').count(),0);
 await embedded.getByLabel('Input').click();await embedded.getByLabel('Input').pressSequentially('learner');
 await main.getByRole('button',{name:'返回项目',exact:true}).click();await until(s=>!s.embedded.visible);assert.equal((await state()).activeRun.state,'waiting');
 await main.getByRole('button',{name:'正在播放',exact:true}).click();
 await main.getByRole('button',{name:'查看内置演示',exact:true}).click();await until(s=>s.embedded.visible);
 await main.getByRole('button',{name:'继续播放',exact:true}).click();const continued=await finish();assert.equal(continued.manualInteractions[0].outcome,'continued');checks.push({name:'embedded-human-input-and-continue'});
 await play('strict');await until(s=>s.activeRun?.state==='waiting');const strictPage=app.windows().find(p=>p.url()==='http://manual.fixture/');assert.equal(await strictPage.evaluate(()=>Boolean(window.playbookGuide)),true);assert.equal(await strictPage.locator('#ygd-root').evaluate(e=>e.matches(':popover-open')),false);assert.equal(await strictPage.locator('#ygd-shade').isVisible(),false);assert.equal(await strictPage.locator('#ygd-cursor').isVisible(),false);
 await main.getByRole('button',{name:'暂停倒计时',exact:true}).click();const paused=(await until(s=>s.activeRun.interaction?.paused)).activeRun.interaction.remainingMs;await sleep(1400);assert.equal((await state()).activeRun.state,'waiting');assert.equal((await state()).activeRun.interaction.remainingMs,paused);
 await main.getByRole('button',{name:'继续播放',exact:true}).click();await finish();checks.push({name:'strict-csp-and-pause-countdown'});
 await play('stop');await until(s=>s.activeRun?.state==='waiting');await main.getByRole('button',{name:'停止',exact:true}).click();const stopped=await finish('stopped');assert.equal(stopped.completed,0);assert.equal(stopped.manualInteractions[0].outcome,'cancelled');checks.push({name:'stop-handoff-releases-profile'});
 await play('failure');const failed=await finish('failed');assert.match(failed.executionError,/手动操作超时/);assert.equal(failed.completed,0);checks.push({name:'required-timeout-fails-with-receipt'});
 await play('shared','book');const shared=await finish();assert.equal(shared.completed,2);assert.equal(shared.cleanupScopes.length,2);checks.push({name:'book-shares-cookie-context-and-separate-release'});
 const prior=(await state()).activeRun.id;
 await app.evaluate(({dialog})=>{globalThis.__hybridSaves=0;dialog.showSaveDialog=async()=>{globalThis.__hybridSaves++;return {canceled:true};};});
 await assert.rejects(main.evaluate(input=>window.playbook.exportPptx(input),{workspaceId,entryId:'ten',kind:'script'}),/手动/);assert.equal(await app.evaluate(()=>globalThis.__hybridSaves),0);assert.equal((await state()).activeRun.id,prior);checks.push({name:'manual-pptx-rejected-before-dialog-or-execution'});
 await play('shared-first','script','external');const external=await finish();assert.equal(external.browser,'external');assert.equal((await state()).embedded.active,false);checks.push({name:'external-browser-manual-backward-compatible'});
 const releases=(await readFile(path.join(project,'release.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);assert.ok(releases.some(r=>r.flowId==='stop'));assert.ok(releases.some(r=>r.flowId==='failure'));
 await app.close();app=null;await assert.rejects(stat(sessionPath),{code:'ENOENT'});checks.push({name:'normal-exit-removes-exact-browser-cache'});
 app=await launch();main=await mainPage();const crashedSession=await app.evaluate(({app})=>app.getPath('sessionData'));process.kill(app.process().pid,'SIGKILL');app=null;await sleep(400);await stat(crashedSession);
 app=await launch();main=await mainPage();await assert.rejects(stat(crashedSession),{code:'ENOENT'});assert.deepEqual((await state()).runtimeWarnings,[]);checks.push({name:'restart-reclaims-only-indexed-dead-owned-cache'});
 assert.deepEqual(errors,[]);
 const result={passed:true,checks,errors,base,scope:'Actual Electron WebContentsView + worker, real Playwright input and filesystem; embedded cookie/session, CSP, manual gates and crash cache recovery. System chooser and physical shortcuts not exercised here.'};
 await writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,output,checks:checks.length}));
}catch(error){await writeFile(path.join(output,'result.json'),JSON.stringify({passed:false,checks,errors:[...errors,String(error)],base},null,2));throw error;}
finally{await app?.close().catch(()=>{});}
