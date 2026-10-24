import { WebContentsView, session } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

export function createEmbeddedBrowser({ window, appRoot, dataDir, sessionDir, onChange, onCrash }) {
  const views = new Set();
  let current, visible = false, ownerRun;
  function layout() {
    if (!current || window.isDestroyed()) return;
    const { width, height } = window.getContentBounds();
    current.setBounds({ x: 0, y: 118, width, height: Math.max(1, height - 118) });
  }
  const state = () => ({ active: Boolean(current), visible: Boolean(current && visible) });
  function show(value) {
    visible = Boolean(value);
    for (const view of views) view.setVisible(view === current && visible);
    layout(); onChange();
    if (visible) { window.show(); current?.webContents.focus(); }
    return state();
  }
  function dispose() {
    for (const view of views) {
      try { window.contentView.removeChildView(view); } catch {}
      if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false });
    }
    views.clear(); current = null; visible = false; ownerRun = null; onChange();
  }
  async function start(runId) {
    dispose(); ownerRun = runId;
    // The default browser session uses a fresh, owned temporary sessionData directory.
    // Shell/control renderers have their own in-memory partition.
    await session.defaultSession.clearStorageData();
    await session.defaultSession.clearCache();
  }
  async function newPage(runId, tutorial = false) {
    if (ownerRun !== runId) throw new Error('内置浏览器与本轮播放不匹配');
    if (current) current.setVisible(false);
    const view = new WebContentsView({ webPreferences: {
      sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
      ...(tutorial ? { preload: path.join(appRoot, 'build/tutorial-preload.cjs') } : {}),
    } });
    views.add(view); current = view;
    window.contentView.addChildView(view); layout(); view.setVisible(true); visible = true; onChange();
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    view.webContents.on('render-process-gone', () => onCrash());
    view.webContents.on('destroyed', () => {
      views.delete(view);
      if (current === view) { current = null; visible = false; onChange(); }
    });
    await view.webContents.loadURL('about:blank');
    return { targetId: view.webContents.getOrCreateDevToolsTargetId() };
  }
  async function endpoint() {
    const expected = window.webContents.getOrCreateDevToolsTargetId();
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const [port, socket] = (await readFile(path.join(sessionDir, 'DevToolsActivePort'), 'utf8').catch(() => readFile(path.join(dataDir, 'DevToolsActivePort'), 'utf8'))).trim().split('\n');
        if (!/^\d+$/.test(port) || !/^\/devtools\/browser\/[a-f0-9-]+$/i.test(socket)) throw new Error('Invalid CDP endpoint');
        const origin = 'http://127.0.0.1:' + port;
        const targets = await (await fetch(origin + '/json/list', { signal: AbortSignal.timeout(1000) })).json();
        if (targets.some(target => target.id === expected)) return 'ws://127.0.0.1:' + port + socket;
      } catch {}
      await sleep(50);
    }
    throw new Error('客户端内置浏览器未能建立连接，请重新打开应用');
  }
  window.on('resize', layout);
  return { state, show, start, newPage, endpoint, dispose,
    owns(contents) { return [...views].some(view => view.webContents === contents); },
    focus() { if (current) show(true); },
  };
}
