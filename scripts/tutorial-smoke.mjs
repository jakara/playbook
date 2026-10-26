import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { readWorkspace, selection, snapshot } from '../desktop/library.mjs';

const root = process.cwd(), workspace = await readWorkspace(path.join(root, 'examples/tutorial'));
const output = path.join(root, 'artifacts', 'tutorial-browser-' + Date.now()); await mkdir(output,{recursive:true});
assert.equal(workspace.error,undefined);
assert.equal(workspace.items.length,3); assert.ok(workspace.items.every(item=>item.valid));
const selected = selection(workspace,'playbook-tutorial','book');
assert.deepEqual(selected.items.map(item=>item.id),['tutorial.browse','tutorial.playback','tutorial.skill']);
const built = await snapshot({workspace,...selected,outputDir:await mkdtemp('/private/tmp/playbook-tutorial-bundle-'),appRoot:root});
const {flows,profile} = await import(pathToFileURL(built.bundle).href);
const browser = await chromium.launch({channel:'chrome',headless:true});
const context = await browser.newContext({viewport:{width:1440,height:960}});
const results=[],errors=[];
try {
 for(const flow of flows) {
  const page = await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
  const externalRequests=[]; page.on('requestfailed',req=>{if(!req.url().startsWith('http://playbook.tutorial/')) externalRequests.push(req.url());});
  const prepared = await profile.prepare({page,workspaceDir:workspace.path,parameters:{}});
  assert.equal(prepared.context.page,page);
  for(const step of flow.steps) {
   if(step.target) assert.equal(await step.target(prepared.context).count(),1,flow.id+':'+step.id+' target is unique');
   await step.run(prepared.context); await step.verify(prepared.context);
   await page.screenshot({path:path.join(output,flow.id+'-'+step.id+'.png')});
   results.push(flow.id+':'+step.id);
  }
  if(flow.id==='tutorial.skill') {
   assert.deepEqual(await page.evaluate(()=>window.playbook.skillInstall()), { practiceOnly: true });
   await page.getByLabel('使用的框架',{exact:true}).selectOption('claude-code');
   await page.getByRole('button',{name:'重新查看目标',exact:true}).click();
   await page.getByText('/练习/我的演示项目/.claude/skills/playbook-wright',{exact:true}).waitFor();
  }
  assert.deepEqual(externalRequests,[]);
  await page.close();
 }
 assert.deepEqual(errors,[]);assert.equal(results.length,23);
 await writeFile(path.join(output,'result.json'),JSON.stringify({passed:true,steps:results,errors,scope:'Real headless Chrome, same built React renderer, independent practice fixture. Direct original run/verify; no narration or presentation timing acceptance.'},null,2));
 console.log(JSON.stringify({passed:true,steps:results.length,output}));
} catch(error) {
 await writeFile(path.join(output,'result.json'),JSON.stringify({passed:false,steps:results,errors:[...errors,String(error)]},null,2)); throw error;
} finally {await browser.close();}
