import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, readFile, writeFile, readdir, stat, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
const root=process.cwd(),base=await mkdtemp('/private/tmp/playbook-builtin-removal-'),data=path.join(base,'data'),output=path.join(root,'artifacts/builtin-removal-'+Date.now());
await mkdir(output,{recursive:true});
const originalBundle=path.join(root,'release/mac-arm64/Playbook.app');let bundle=originalBundle;
const env={...process.env,PLAYBOOK_USER_DATA:data};delete env.ELECTRON_RUN_AS_NODE;delete env.PLAYBOOK_WORKSPACE;
const launch=()=>electron.launch({executablePath:path.join(bundle,'Contents/MacOS/Playbook'),args:[],env,timeout:30000});
let app,page;const errors=[],checks=[];
const call=(method,input)=>page.evaluate(({method,input})=>window.playbook[method](input),{method,input});
const state=()=>call('getState');
const refresh=()=>call('refreshWorkspace');
async function open(){app=await launch();page=null;for(let i=0;i<200&&!page;i++){for(const candidate of app.windows())if(await candidate.evaluate(()=>Boolean(window.playbook)).catch(()=>false)){page=candidate;break;}if(!page)await sleep(50);}assert.ok(page);page.on('pageerror',e=>errors.push(e.message));await page.getByRole('button',{name:'添加项目',exact:true}).last().waitFor();}
async function close(){await app?.close();app=null;}
async function removeBook(name){await page.getByRole('button',{name:'删除 Book '+name,exact:true}).click();const dialog=page.getByRole('dialog',{name:'删除 Book',exact:true});await dialog.getByText(/删除状态保存在本机/).waitFor();await dialog.getByRole('button',{name:'删除 Book',exact:true}).click();await dialog.waitFor({state:'detached'});}
async function removeProject(name){await page.getByRole('button',{name:'移出项目 '+name,exact:true}).click();const dialog=page.getByRole('dialog',{name:'移出项目',exact:true});await dialog.getByRole('button',{name:'移出项目',exact:true}).click();await dialog.waitFor({state:'detached'});}
async function addProject(directory){await app.evaluate(({dialog},directory)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]});},directory);await page.getByRole('button',{name:'添加项目',exact:true}).last().click();const title=JSON.parse(await readFile(path.join(directory,'.playbook.json'),'utf8')).title;await page.getByRole('button',{name:'移出项目 '+title,exact:true}).waitFor();return refresh();}
try{
 await open();const initial=await state(),starter=initial.workspaces.find(w=>w.builtinKey==='starter'),tutorial=initial.workspaces.find(w=>w.builtinKey==='tutorial');
 assert.ok(starter&&tutorial);const originals=await Promise.all([starter,tutorial].map(async w=>({file:path.join(w.path,'.playbook.json'),bytes:await readFile(path.join(w.path,'.playbook.json'))})));
 assert.equal(await page.getByRole('button',{name:'删除 Book '+starter.books[0].title,exact:true}).isEnabled(),true);
 assert.equal(await page.getByRole('button',{name:'移出项目 '+starter.name,exact:true}).isEnabled(),true);
 await page.getByRole('button',{name:'删除 Book '+starter.books[0].title,exact:true}).click();await page.getByRole('dialog',{name:'删除 Book',exact:true}).getByRole('button',{name:'取消',exact:true}).click();await assert.rejects(stat(path.join(data,'settings.json')),{code:'ENOENT'});checks.push('builtins-enabled-and-cancel-does-not-write');
 await removeBook(starter.books[0].title);
 let s=await refresh();assert.equal(s.workspaces.find(w=>w.builtinKey==='starter').books.length,0);
 let saved=JSON.parse(await readFile(path.join(data,'settings.json'),'utf8'));assert.deepEqual(saved.hiddenBuiltinBooks.starter,[starter.books[0].id]);
 const backupNames=(await readdir(path.join(data,'backups'))).filter(n=>n.startsWith('settings-'));assert.equal(backupNames.length,1);const backup=JSON.parse(await readFile(path.join(data,'backups',backupNames[0]),'utf8'));assert.deepEqual(backup,{schemaVersion:1,roots:[]});
 for(const original of originals)assert.deepEqual(await readFile(original.file),original.bytes);
 await assert.rejects(call('play',{workspaceId:starter.id,entryId:starter.books[0].id,kind:'book'}),/不存在/);
 checks.push('builtin-book-deletion-persists-with-verified-settings-backup-and-untouched-bundle');
 await removeProject(starter.name);assert.equal((await refresh()).workspaces.some(w=>w.builtinKey==='starter'),false);
 await close();await open();assert.equal((await state()).workspaces.some(w=>w.builtinKey==='starter'),false);checks.push('builtin-project-removal-survives-refresh-and-restart');
 s=await addProject(starter.path);assert.equal(s.workspaces.find(w=>w.builtinKey==='starter').books.length,0);await removeProject(starter.name);checks.push('explicit-readd-keeps-previously-deleted-books-removed');
 await page.getByRole('button',{name:'查看 Book '+tutorial.books[0].title,exact:true}).click();await removeBook(tutorial.books[0].title);assert.equal((await refresh()).workspaces.find(w=>w.builtinKey==='tutorial').books.length,0);await page.screenshot({path:path.join(output,'books-removed.png')});checks.push('tutorial-book-can-be-deleted-from-detail');
 await removeProject(tutorial.name);assert.equal((await refresh()).workspaces.length,0);assert.deepEqual((await state()).runs,[]);
 await close();await open();assert.equal((await refresh()).workspaces.length,0);await page.screenshot({path:path.join(output,'empty-after-restart.png')});checks.push('all-builtins-can-be-removed-without-automatic-restoration');
 for(const original of originals)assert.deepEqual(await readFile(original.file),original.bytes);
 await close();
 const moved=path.join(base,'Relocated Playbook.app');await promisify(execFile)('/bin/cp',['-cR',originalBundle,moved]);bundle=moved;
 await open();assert.equal((await refresh()).workspaces.length,0);
 const movedStarter=path.join(moved,'Contents/Resources/app/examples/starter');
 s=await addProject(movedStarter);assert.equal(s.workspaces.length,1);assert.equal(s.workspaces[0].builtinKey,'starter');assert.equal(s.workspaces[0].books.length,0);await removeProject(starter.name);await close();await open();assert.equal((await refresh()).workspaces.length,0);checks.push('stable-deletion-keys-survive-real-application-relocation');
 assert.deepEqual(errors,[]);await close();await rm(moved,{recursive:true,force:true});
 await writeFile(path.join(output,'result.json'),JSON.stringify({passed:true,checks,errors,base,scope:'Actual packaged Electron UI/IPC, isolated settings and byte-verified unchanged built-in manifests; real app relocation with APFS clone. Folder picker return controlled, no physical picker acceptance claimed.'},null,2));
 console.log(JSON.stringify({passed:true,output,checks:checks.length}));
}catch(error){await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});await writeFile(path.join(output,'result.json'),JSON.stringify({passed:false,checks,errors:[...errors,String(error)],base},null,2));throw error;}
finally{await close().catch(()=>{});}
