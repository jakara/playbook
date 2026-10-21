import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(process.env.PLAYBOOK_PRESENTATION_APP_ROOT || process.cwd());
const output = path.join(root, 'artifacts', `v03-presentation-smoke-${Date.now()}`);
const workspaceDir = path.join(output, 'business-fixture');
await mkdir(path.join(workspaceDir, 'audio'), { recursive: true });
const { readWorkspace, selection, snapshot } = await import(pathToFileURL(path.join(root, 'desktop/library.mjs')).href);
const { narrationSource } = await import(pathToFileURL(path.join(root, 'desktop/narration.mjs')).href);
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
const checks = {
  realChineseRecording: false, defaultFeatherGradient: false, recordingAdvances: false,
  pauseFreezesAudio: false, resumeAdvancesAudio: false, recordingEndsBeforeAction: false,
  ttsEndsBeforeAction: false, coveredTargetClickable: false, coverFollowsScroll: false,
  coverFollowsReplacement: false, nativeDialogCovered: false, labelsDoNotCopyText: false,
  newDocumentCovered: false, blurApplied: false, completedFiveActions: false,
  stoppedVoiceAndNoActions: false, audioErrorBlocksActions: false,
};
const results = [], setup = {}, failures = [];
let server;
const html = page => `<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>Playbook synthetic presentation ${page}</title>
<style>body{margin:0;padding:32px;font:20px system-ui;background:#eef3ef;color:#19362a}button{font:inherit;padding:12px 24px;margin:12px 0;cursor:pointer}.logo{font-size:32px;font-weight:700;width:260px}.private-secret{background:#fff2ca;border:1px solid #dbbd61;padding:12px;box-sizing:border-box}#covered-action{width:360px;height:60px}#sensitive-block{margin-top:390px;width:480px;height:72px}.tail{height:1600px}dialog{padding:40px;border:1px solid #879c8b;border-radius:16px}dialog::backdrop{background:#0005}#dialog-secret{display:block;width:420px}</style>
<div class="logo">SYNTHETIC LOGO</div><h1>${page === 'next' ? '新文档中的打码' : '演示呈现综合验证'}</h1>
<p>受控样例，不连接业务服务或真实客户资料。</p>
<button id="covered-action" class="private-secret" onclick="document.querySelector('#counter').textContent=String(Number(document.querySelector('#counter').textContent)+1)">PRIVATE-TEXT-DO-NOT-COPY</button>
<p>原始业务断言计数：<strong id="counter">0</strong></p><button id="controls">布局与弹窗检查</button>
<div id="sensitive-block" class="private-secret">SYNTHETIC-SENSITIVE-DATA</div><div class="tail"></div>
<dialog id="modal"><h2>原生 Dialog</h2><button id="dialog-secret" class="private-secret" onclick="this.dataset.clicked='yes'">DIALOG-PRIVATE-DO-NOT-COPY</button><button id="close-modal" onclick="this.closest('dialog').close()">关闭</button></dialog></html>`;

const profileSource = `
import assert from 'node:assert/strict';
import path from 'node:path';
import {defineProfile} from '@playbook/core';
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
export default defineProfile({schemaVersion:1,id:'presentation-qa',title:'Synthetic presentation QA',dataMode:'fixture',roles:[],
  async prepare({page,parameters}) {
    await page.setViewportSize({width:1440,height:960});
    await page.goto(parameters.url);
    const context = {page,parameters,actions:0,pausedAt:null};
    context.qa = (stage,details={}) => process.send?.({type:'qa',scenario:parameters.scenario,stage,...details});
    context.assertCover = async selector => {
      await page.waitForFunction(selector => {
        const element=document.querySelector(selector), privacy=window.playbookPrivacy?.inspect();
        if (!element || !privacy || getComputedStyle(element).opacity!=='0') return false;
        const box=element.getBoundingClientRect(), left=Math.max(0,box.left-2), top=Math.max(0,box.top-2);
        const right=Math.min(innerWidth,box.right+2), bottom=Math.min(innerHeight,box.bottom+2);
        return right>left && bottom>top && privacy.covers.some(cover=>cover.rule===0 && Math.abs(cover.left-left)<1 && Math.abs(cover.top-top)<1 && Math.abs(cover.width-(right-left))<1 && Math.abs(cover.height-(bottom-top))<1);
      },selector);
      const evidence=await page.evaluate(selector=>{
        const element=document.querySelector(selector), box=element.getBoundingClientRect();
        return {selector,opacity:getComputedStyle(element).opacity,box:{x:box.x,y:box.y,width:box.width,height:box.height},privacy:window.playbookPrivacy.inspect(),labelText:document.querySelector('#playbook-redactions').textContent,topLayer:document.querySelector('#playbook-redactions').matches(':popover-open')};
      },selector);
      assert.equal(evidence.labelText,'','Masks must not copy page text into their labels');
      assert.equal(evidence.topLayer,true);
      return evidence;
    };
    let busy=false, firstVoice=false, pauseObserved=false, resumeObserved=false, timer;
    timer=setInterval(async()=>{
      if(busy || page.isClosed()) return;
      busy=true;
      try {
        const voice=await page.evaluate(()=>window.playbookNarration?.inspect());
        if (!voice) return;
        if (!firstVoice && voice.kind==='file' && voice.state==='playing' && voice.time>.18) {
          firstVoice=true;context.qa('recording-playing',{voice});
        }
        if (parameters.scenario==='success' && !pauseObserved && voice.state==='paused') {
          pauseObserved=true;const before=voice; await sleep(650);
          const after=await page.evaluate(()=>window.playbookNarration.inspect());
          assert.equal(after.state,'paused');assert.equal(after.paused,true);assert.ok(Math.abs(after.time-before.time)<.035,'Paused audio currentTime must freeze');
          context.pausedAt=after.time;context.qa('pause-frozen',{before,after});
        }
        if (context.pausedAt!==null && !resumeObserved && voice.state==='playing' && voice.time>context.pausedAt+.15) {
          resumeObserved=true;context.qa('recording-resumed',{voice,pausedAt:context.pausedAt});
        }
      } catch(error) {context.qa('monitor-error',{error:error.message});}
      finally {busy=false;}
    },60);
    return {context,async release(){
      clearInterval(timer);
      let voice;
      try {voice=await page.evaluate(()=>window.playbookNarration?.inspect());}catch{}
      context.qa('released',{actions:context.actions,voice});
      if(!page.isClosed()) await page.screenshot({path:path.join(parameters.evidenceDir,'release.png')}).catch(()=>{});
    }};
  }
});`;

const successSource = `
import assert from 'node:assert/strict';
import path from 'node:path';
import {definePlaybook} from '@playbook/core';
export default definePlaybook({schemaVersion:1,id:'presentation.success',title:'柔边、打码与语音联动',summary:'真实 Chrome 与合成业务样例；录音来自本机中文语音。',
  requirements:{dataMode:'fixture',effects:'read-only',replay:'safe',roles:[]},
  presentation:{openingMs:0,defaultHoldMs:0,cursorMoveMs:150},
  narration:{enabled:true,voice:'Tingting',rate:220,opening:false},
  redactions:[{selector:'.private-secret',mode:'cover'},{selector:'.logo',mode:'blur',blurPx:12}],
  steps:[{
    id:'recorded-action',title:'跟随录音介绍',explain:'录音结束后点击被保护的业务按钮。',narration:{audio:'audio/recording.wav'},target:({page})=>page.locator('#covered-action'),
    async run(context){
      const {page}=context,voice=await page.evaluate(()=>window.playbookNarration.inspect());
      assert.equal(voice.kind,'file');assert.equal(voice.state,'ended');assert.ok(voice.time>1);assert.ok(Math.abs(voice.time-voice.duration)<.1);
      const feather=await page.evaluate(()=>({inspect:window.playbookGuide.inspect(),radius:Number(document.querySelector('#ygd-hole').getAttribute('r')),fill:document.querySelector('#ygd-hole').getAttribute('fill'),offset:document.querySelector('#ygd-feather-inner').getAttribute('offset'),gradient:Boolean(document.querySelector('radialGradient#ygd-feather'))}));
      assert.equal(feather.inspect.spotlightFeather,24);assert.equal(feather.radius,105);assert.equal(feather.fill,'url(#ygd-feather)');assert.equal(feather.gradient,true);assert.ok(Math.abs(Number.parseFloat(feather.offset)-(1-24/105)*100)<.001);
      const cover=await context.assertCover('#covered-action');
      assert.equal(await page.locator('.logo').evaluate(element=>getComputedStyle(element).filter),'blur(12px)');
      await page.locator('#covered-action').click();assert.equal(await page.locator('#counter').textContent(),'1');context.actions++;
      context.qa('recording-action',{voice,feather,cover,actions:context.actions});
    },async verify({page}){assert.equal(await page.locator('#counter').textContent(),'1');}
  },{
    id:'automatic-speech',title:'自动中文旁白',explain:'这是自动语音讲解。讲解结束后，系统继续下一步。',target:({page})=>page.locator('#controls'),
    async run(context){const voice=await context.page.evaluate(()=>window.playbookNarration.inspect());assert.equal(voice.kind,'tts');assert.equal(voice.state,'ended');assert.ok(voice.time>.5);context.actions++;context.qa('tts-action',{voice,actions:context.actions});},async verify(){}
  },{
    id:'privacy-reflow',title:'打码跟随布局与弹窗',explain:'滚动、替换组件和原生弹窗不会移除保护。',narration:false,target:({page})=>page.locator('#controls'),
    async run(context){
      const {page}=context;const before=await context.assertCover('#sensitive-block');
      await page.evaluate(()=>scrollTo(0,400));const scrolled=await context.assertCover('#sensitive-block');assert.ok(Math.abs(before.box.y-scrolled.box.y)>300);
      await page.evaluate(()=>{const old=document.querySelector('#sensitive-block');const replacement=old.cloneNode();replacement.textContent='REPLACED-PRIVATE-DO-NOT-COPY';old.replaceWith(replacement);if(getComputedStyle(replacement).opacity!=='0')throw new Error('Replacement flashed unmasked text');});
      const replaced=await context.assertCover('#sensitive-block');
      await page.screenshot({path:path.join(context.parameters.evidenceDir,'03-scroll-and-replacement.png')});
      await page.locator('#modal').evaluate(element=>element.showModal());const dialog=await context.assertCover('#dialog-secret');
      await page.screenshot({path:path.join(context.parameters.evidenceDir,'04-native-dialog.png')});
      await page.locator('#dialog-secret').click();assert.equal(await page.locator('#dialog-secret').getAttribute('data-clicked'),'yes');
      await page.locator('#close-modal').click();await page.evaluate(()=>scrollTo(0,0));context.actions++;
      context.qa('privacy-reflow',{before,scrolled,replaced,dialog,actions:context.actions});
    },async verify({page}){assert.equal(await page.locator('#modal').evaluate(element=>element.open),false);}
  },{
    id:'navigate',title:'切换文档',explain:'跨文档导航后仍继续保护指定区域。',narration:false,target:({page})=>page.locator('#controls'),
    async run(context){await context.page.goto(context.parameters.url+'/next');const cover=await context.assertCover('#covered-action');context.actions++;await context.page.screenshot({path:path.join(context.parameters.evidenceDir,'05-new-document.png')});context.qa('new-document',{cover,actions:context.actions});},
    async verify(context){assert.ok(context.page.url().endsWith('/next'));await context.assertCover('#covered-action');}
  },{
    id:'navigated-action',title:'继续操作新页面',explain:'保留原有点击和业务断言。',narration:false,target:({page})=>page.locator('#covered-action'),
    async run(context){await context.page.locator('#covered-action').click();context.actions++;context.qa('final-action',{actions:context.actions});},
    async verify({page}){assert.equal(await page.locator('#counter').textContent(),'1');}
  }]
});`;
const interruptedSource = (id, audio) => `
import {definePlaybook} from '@playbook/core';
export default definePlaybook({schemaVersion:1,id:${JSON.stringify(id)},title:'语音中断保护',summary:'受控样例',
  requirements:{dataMode:'fixture',effects:'read-only',replay:'safe',roles:[]},presentation:{openingMs:0,defaultHoldMs:0,cursorMoveMs:150},narration:{enabled:true,opening:false},
  steps:[{id:'voice',title:'语音播放',explain:'语音未完成不能执行动作。',narration:{audio:${JSON.stringify(audio)}},target:({page})=>page.locator('#controls'),async run(context){context.actions++;context.qa('unexpected-action',{actions:context.actions});},async verify(){}},
    {id:'later',title:'后续动作',explain:'停止或失败后不得执行。',narration:false,async run(context){context.actions++;context.qa('unexpected-action',{actions:context.actions});},async verify(){}}]
});`;

async function bounded(promise, milliseconds) {
  let timer;
  try {return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Operation timed out')),milliseconds);})]);}
  finally {clearTimeout(timer);}
}

async function runScenario(name, built, expectedState) {
  const evidenceDir=path.join(output,name);await mkdir(evidenceDir,{recursive:true});
  const events=[];let child,exited=false,stdout='',stderr='',terminal,released,failure,exitCode;
  let settle,reject;const outcome=new Promise((resolve,no)=>{settle=resolve;reject=no;});
  const log=(direction,message)=>events.push({at:new Date().toISOString(),direction,message});
  const send=message=>{log('parent-to-runner',message);if(child.connected)child.send(message);};
  try {
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    child=fork(path.join(root,'build/runner.cjs'),[],{cwd:evidenceDir,env,stdio:['ignore','pipe','pipe','ipc']});
    const exit=once(child,'exit').then(([code])=>{exited=true;exitCode=code;return code;});
    child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});
    child.on('error',reject);
    child.on('exit',code=>{if(!terminal)reject(new Error('Runner exited before terminal state ('+code+')'));});
    child.on('message',message=>{
      log('runner-to-parent',message);
      if(message.type==='qa') {
        if(message.stage==='monitor-error')reject(new Error(message.error));
        if(message.stage==='unexpected-action')reject(new Error('A blocked business action ran'));
        if(message.stage==='recording-playing') {
          if(name==='success'){checks.recordingAdvances=message.voice.time>.18;send({command:'pause'});}
          if(name==='stop')send({command:'stop'});
        }
        if(message.stage==='pause-frozen'){checks.pauseFreezesAudio=true;send({command:'resume'});}
        if(message.stage==='recording-resumed')checks.resumeAdvancesAudio=message.voice.time>message.pausedAt+.15;
        if(message.stage==='recording-action'){
          checks.defaultFeatherGradient=true;checks.recordingEndsBeforeAction=true;checks.coveredTargetClickable=message.actions===1;checks.blurApplied=true;checks.labelsDoNotCopyText=message.cover.labelText==='';
        }
        if(message.stage==='tts-action')checks.ttsEndsBeforeAction=true;
        if(message.stage==='privacy-reflow'){
          checks.coverFollowsScroll=true;checks.coverFollowsReplacement=true;checks.nativeDialogCovered=true;
          checks.labelsDoNotCopyText&&=message.replaced.labelText===''&&message.dialog.labelText==='';
        }
        if(message.stage==='new-document')checks.newDocumentCovered=true;
        if(message.stage==='final-action')checks.completedFiveActions=message.actions===5;
        if(message.stage==='released')released=message;
      }
      if(message.type==='state'&&['completed','stopped','failed'].includes(message.update.state)){
        terminal=message.update;settle(message.update);
      }
    });
    send({command:'start',config:{bundle:built.bundle,audioAssets:built.audioAssets,appRoot:root,workspaceDir,runId:'presentation-'+name,title:'Presentation smoke '+name,profileId:'presentation-qa',dataMode:'fixture',parameters:{url:setup.url,scenario:name,evidenceDir},headless:false,pace:.03,captureDir:path.join(evidenceDir,'captures')}});
    await bounded(outcome,45000);
    assert.equal(terminal.state,expectedState,terminal.error||'Unexpected runner result');
    assert.ok(released,'Profile release must record final media and business state');
    if(name==='success'){
      assert.equal(terminal.completed,5);assert.equal(released.actions,5);
      for(const [name,passed]of Object.entries(checks).filter(([key])=>!['stoppedVoiceAndNoActions','audioErrorBlocksActions'].includes(key)))assert.equal(passed,true,name);
    }
    if(name==='stop'){
      assert.equal(released.actions,0);assert.equal(released.voice.state,'stopped');assert.equal(released.voice.paused,true);assert.equal(released.voice.duration,null);checks.stoppedVoiceAndNoActions=true;
    }
    if(name==='error'){
      assert.equal(released.actions,0);assert.equal(released.voice.state,'failed');assert.match(terminal.error,/语音播放失败/);checks.audioErrorBlocksActions=true;
    }
    send({command:'close'});assert.equal(await bounded(exit,8000),0);
  } catch(error){failure={message:error.message,stack:error.stack};failures.push({scenario:name,...failure});}
  finally {
    if(child&&!exited){if(child.connected)send({command:'close'});try{await bounded(once(child,'exit'),3000);}catch{}if(!exited)child.kill();}
    const result={name,passed:!failure,terminal,released,failure,exitCode,snapshotHash:built.snapshotHash,audioAssets:built.audioAssets,events};
    results.push(result);await writeFile(path.join(evidenceDir,'result.json'),JSON.stringify(result,null,2));
    await writeFile(path.join(evidenceDir,'runner.stdout.log'),stdout);await writeFile(path.join(evidenceDir,'runner.stderr.log'),stderr);
  }
}

try {
  server=createServer((request,response)=>{response.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});response.end(html(request.url?.endsWith('/next')?'next':'initial'));});
  server.listen(0,'127.0.0.1');await once(server,'listening');setup.url='http://127.0.0.1:'+server.address().port;
  setup.recordingText='欢迎体验自动演示。系统会介绍功能，并在讲解完成后继续操作。';
  setup.recordingVoice='Tingting';setup.recordingRate=220;
  const recording=await narrationSource({clip:{text:setup.recordingText},options:{voice:setup.recordingVoice,rate:setup.recordingRate},cacheDir:path.join(output,'recording-generation')});
  const bytes=Buffer.from(recording.dataUrl.split(',')[1],'base64');
  assert.equal(recording.kind,'tts');assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');assert.ok(bytes.length>10000);assert.ok(bytes.subarray(44).some(value=>value!==0));
  await writeFile(path.join(workspaceDir,'audio/recording.wav'),bytes);setup.recordingBytes=bytes.length;checks.realChineseRecording=true;
  await writeFile(path.join(workspaceDir,'audio/corrupt.wav'),'This deliberately corrupt WAV must fail real Chrome decoding.');
  await writeFile(path.join(workspaceDir,'profile.ts'),profileSource);
  await writeFile(path.join(workspaceDir,'success.ts'),successSource);
  await writeFile(path.join(workspaceDir,'stop.ts'),interruptedSource('presentation.stop','audio/recording.wav'));
  await writeFile(path.join(workspaceDir,'error.ts'),interruptedSource('presentation.error','audio/corrupt.wav'));
  await writeFile(path.join(workspaceDir,'.playbook.json'),JSON.stringify({schemaVersion:1,title:'Presentation synthetic QA',profiles:[{id:'presentation-qa',file:'profile.ts',dataMode:'fixture'}],scripts:['success','stop','error'].map(name=>({file:name+'.ts',profile:'presentation-qa'}))},null,2));
  const workspace=await readWorkspace(workspaceDir);assert.equal(workspace.error,undefined);assert.ok(workspace.items.every(item=>item.valid),JSON.stringify(workspace.items));
  for(const [name,state]of [['success','completed'],['stop','stopped'],['error','failed']]){
    const built=await snapshot({workspace,...selection(workspace,'presentation.'+name,'script'),outputDir:path.join(output,name,'snapshot'),appRoot:root});
    assert.ok(Object.values(built.audioAssets).every(file=>file.startsWith(path.join(output,name,'snapshot/audio/'))));
    await runScenario(name,built,state);
  }
} catch(error){failures.push({scenario:'setup',message:error.message,stack:error.stack});}
finally {
  if(server)await new Promise(resolve=>server.close(resolve));
  const passed=failures.length===0&&Object.values(checks).every(Boolean);
  await writeFile(path.join(output,'result.json'),JSON.stringify({passed,version,checks,setup,failures,results:results.map(({events,...result})=>result),scope:'Real Chrome with an isolated HTTP fixture and compiled SDK flows. Uses real local Chinese TTS WAV, copied into workspace and frozen by library.snapshot; verifies browser Audio time and lifecycle, real DOM privacy behavior and original Playwright clicks/assertions. Does not verify speaker audibility or a human listener\'s language/voice-quality acceptance. Each run has a new evidence directory; earlier failures are retained.'},null,2));
  console.log(JSON.stringify({passed,checks,output,failures:failures.map(({scenario,message})=>({scenario,message}))},null,2));
  if(!passed)process.exitCode=1;
}
