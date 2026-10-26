// Isolated practice UI; only a user-authorized manual step can access the limited Skill bridge.
export const practiceBridge = String.raw`
(() => {
  const state = window.__playbookTutorialSeed;
  delete window.__playbookTutorialSeed;
  const listeners = new Set();
  const clone = value => structuredClone(value);
  const publish = () => { for (const listener of listeners) listener(clone(state)); };
  const workspace = () => state.workspaces[0];
  const audit = window.__playbookTutorialAudit = [];
  const note = name => audit.push(name);
  const noWrite = async () => { throw new Error('这里是独立练习环境，不会安装文件或打开真实项目。'); };
  const message = text => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', '交给智能体的练习说明');
    dialog.style.cssText = 'width:min(680px,85vw);padding:32px;border:1px solid #d7e2d2;border-radius:14px;color:#35503b;background:#f9fcf5;box-shadow:0 25px 100px #163d3944';
    const heading = document.createElement('h2'); heading.textContent = '把需求交给自己的智能体';
    const body = document.createElement('pre'); body.textContent = text;
    body.style.cssText = 'white-space:pre-wrap;font:15px/1.9 -apple-system,sans-serif;margin:24px 0';
    const close = document.createElement('button'); close.textContent = '返回练习';
    close.style.cssText = 'background:#187866;color:white;border:0;border-radius:6px;padding:10px 20px;font:14px -apple-system,sans-serif';
    close.onclick = () => { dialog.close(); dialog.remove(); };
    dialog.append(heading,body,close); document.body.append(dialog); dialog.showModal();
  };
  addEventListener('playbook:interaction', event => {
    if (event.detail?.phase === 'start' && window.playbookTutorial) { state.tutorialLiveSkill = true; note('real-skill-handoff'); publish(); }
  });
  window.playbook = Object.freeze({
    async getState() { return clone(state); },
    onState(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    async setPlaybackSelection() {},
    async refreshWorkspace() { note('refresh-practice'); return clone(state); },
    async removeBook(input) {
      note('remove-practice-book');
      const project = state.workspaces.find(item => item.id === input.workspaceId);
      if (project) project.books = project.books.filter(book => book.id !== input.bookId);
      publish(); return { state: clone(state), backupPath: '/练习/清单备份.json' };
    },
    async addWorkspace() {
      note('add-project');
      if (!state.workspaces.some(item => item.id === 'practice-added')) {
        state.workspaces.push({ ...clone(workspace()), id:'practice-added', name:'新建练习项目', path:'/练习/新建练习项目', books:[], items:[] });
      }
      publish();
    },
    async removeWorkspace(id) { state.workspaces = state.workspaces.filter(item => item.id !== id); publish(); },
    async play(input) {
      note('play-' + input.kind);
      const project = workspace(), book = project.books[0];
      const ids = input.kind === 'script' ? [input.entryId] : (input.kind === 'section' ? book.sections.filter(section => section.key === input.entryId) : book.sections).flatMap(section => section.scripts);
      const scripts = ids.map(id => project.items.find(item => item.id === id));
      const steps = scripts.flatMap(script => script.steps);
      const run = {
        id:'practice-run-' + (state.runs.length + 1), workspaceId:project.id, entryId:input.entryId, kind:input.kind,
        title:input.kind === 'book' ? book.title : input.kind === 'section' ? book.sections.find(section => section.key === input.entryId).title : scripts[0].title,
        profileId:'practice', profileName:'练习播放状态 · 不执行其他演示', state:'playing', completed:0, index:1,
        stepId:steps[0].id, stepTitle:steps[0].title, total:steps.length, steps, flowIds:ids,
        startedAt:new Date().toISOString(), cleanup:{status:'not-required',errors:[]}
      };
      state.runs.unshift(run); state.activeRun = run; publish(); return {runId:run.id};
    },
    async control(command) {
      note(command);
      const run = state.activeRun;
      if (!run) return;
      if (command === 'pause') run.state = 'paused';
      if (command === 'resume') run.state = 'playing';
      if (command === 'stop') {
        run.state = 'stopped'; run.executionStatus = 'stopped'; run.stopRequested = true;
        run.finishedAt = new Date().toISOString(); run.cleanup = {status:'succeeded', errors:[]};
      }
      publish();
    },
    async copyContext() {
      note('copy-context-preview');
      message('练习预览，不写入系统剪贴板。\n\n实际使用时，将复制的运行上下文粘贴给自己的智能体，并说明：\n\n$playbook-wright 请帮我完善这个演示的讲解与节奏，保留原有动作、断言和数据边界。\n\n先检查脚本和 Profile，再回到 Playbook 播放验证。');
    },
    async chooseSkillProject() { if (state.tutorialLiveSkill && window.playbookTutorial) return window.playbookTutorial.chooseSkillProject(); note('choose-skill-project'); return '/练习/我的演示项目'; },
    async skillPreview(input) {
      if (state.tutorialLiveSkill && window.playbookTutorial) return window.playbookTutorial.skillPreview(input);
      note('skill-preview');
      const directory = input.framework === 'claude-code' ? '.claude/skills' : '.agents/skills';
      const base = input.scope === 'project' ? input.projectRoot : '/练习/个人目录';
      const target = name => ({name, targetDir:base + '/' + directory + '/' + name, status:'new', installedVersion:null});
      return { ...target('playbook-wright'), version:state.skill.version, fileCount:state.skill.fileCount,
        message:'练习预览：这里的路径与安装状态为示例，未读写你的电脑。', targets:[target('playbook-wright'),target('playbook-playwright')] };
    },
    async skillInstall(input) { if (state.tutorialLiveSkill && window.playbookTutorial) return window.playbookTutorial.skillInstall(input); note('skill-install-practice'); return { practiceOnly: true }; }, reveal:noWrite, openExport:noWrite, recoverRun:noWrite,
    async exportPptx() { note('export-preview-cancel'); return {canceled:true}; }
  });
})();
`;
