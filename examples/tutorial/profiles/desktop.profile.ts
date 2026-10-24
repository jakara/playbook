import { readFile, realpath, readdir } from 'node:fs/promises';
import path from 'node:path';
import { defineProfile } from '@playbook/core';
import { practiceBridge } from '../practice/bridge.js';

export default defineProfile({
  schemaVersion: 1, id: 'playbook-tutorial', title: 'Playbook 独立练习环境', dataMode: 'fixture', roles: [],
  async prepare({ page, workspaceDir, signal }) {
    signal?.throwIfAborted();
    const appRoot = path.resolve(workspaceDir, '../..');
    const uiRoot = await realpath(path.join(appRoot, 'build/ui'));
    const { version } = JSON.parse(await readFile(path.join(appRoot, 'package.json'), 'utf8'));
    const skill = await readFile(path.join(appRoot, 'skills/playbook-wright/SKILL.md'), 'utf8');
    const skillVersion = skill.match(/当前安装页 Skill 版本为 \*\*([^*]+)/)?.[1] || '随包版本';
    let skillFileCount = 0;
    for (const name of ['playbook-wright', 'playbook-playwright']) {
      const entries = await readdir(path.join(appRoot, 'skills', name), { recursive: true, withFileTypes: true });
      skillFileCount += entries.filter(entry => entry.isFile()).length;
    }
    const items = [
      { id:'practice.overview', title:'打开工作台', summary:'查看核心功能与当前状态。', steps:[{id:'overview',title:'打开工作台',explain:'进入系统的主要工作入口。'},{id:'check',title:'核对状态',explain:'确认页面反馈符合预期。'}] },
      { id:'practice.result', title:'查看演示结果', summary:'了解结果检查与演示反馈。', steps:[{id:'result',title:'查看结果',explain:'检查关键操作的实际结果。'}] },
    ].map(item => ({...item, file:'练习/' + item.id + '.playbook.ts', tags:['练习'], valid:true, defaultProfileId:'practice',
      requirements:{dataMode:'fixture',effects:'read-only',replay:'safe',roles:[]}}));
    const seed = {
      tutorial:true, appVersion:version, runs:[], activeRun:null,
      playbackShortcut:{accelerator:'CommandOrControl+Alt+P',label:process.platform === 'darwin' ? '⌘⌥P' : 'Ctrl+Alt+P',registered:true},
      skill:{name:'playbook-wright',compatibilityName:'playbook-playwright',version:skillVersion,fileCount:skillFileCount,frameworks:[{id:'codex',name:'Codex'},{id:'claude-code',name:'Claude Code'}]},
      workspaces:[{id:'practice-project',name:'客户演示练习项目',path:'/练习/客户演示项目',token:'practice',items,demos:[],
        profiles:[{id:'practice',title:'独立练习环境',dataMode:'fixture'}],
        books:[{id:'acceptance',title:'核心功能验收',summary:'以练习数据认识 Book、Section 和脚本。',defaultProfileId:'practice',sections:[
          {id:'start',key:'acceptance/start',title:'开始验收',summary:'认识工作台并检查当前状态。',scripts:['practice.overview'],defaultProfileId:'practice'},
          {id:'results',key:'acceptance/results',title:'检查结果',summary:'查看关键操作的结果与反馈。',scripts:['practice.result'],defaultProfileId:'practice'},
        ]}]}],
    };
    await page.addInitScript({content:'window.__playbookTutorialSeed = ' + JSON.stringify(seed) + ';\n' + practiceBridge});
    // Serve the same built renderer, not a second hand-maintained screenshot/mock UI.
    // Every request is intercepted; no local server or desktop configuration is exposed.
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://playbook.tutorial') { await route.abort(); return; }
      try {
        const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
        const filename = await realpath(path.join(uiRoot, relative));
        if (!filename.startsWith(uiRoot + path.sep)) throw new Error('Outside tutorial UI');
        const type = path.extname(filename) === '.js' ? 'text/javascript' : path.extname(filename) === '.css' ? 'text/css' : 'text/html';
        await route.fulfill({body:await readFile(filename),contentType:type});
      } catch { await route.fulfill({status:404,body:'Tutorial asset not found'}); }
    });
    await page.goto('http://playbook.tutorial/index.html');
    await page.getByRole('button', { name:'查看 Book 核心功能验收', exact:true }).waitFor();
    signal?.throwIfAborted();
    return { context: { page } };
  },
});
