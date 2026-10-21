import { BrowserWindow, screen, powerMonitor } from 'electron';
import path from 'node:path';

const playing = run => run && ['preparing', 'playing', 'paused', 'pausing', 'stopping', 'exporting'].includes(run.state);

export function createPlaybackControl({ appRoot, getRun, shortcut, onVisibilityChange }) {
  const window = new BrowserWindow({ title: 'Playbook 播放控制', width: 800, height: 104, show: false,
    frame: false, transparent: true, hasShadow: false, resizable: false, movable: true,
    focusable: false, skipTaskbar: true, fullscreenable: false, acceptFirstMouse: true,
    webPreferences: { preload: path.join(appRoot, 'build/control-preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
  window.setAlwaysOnTop(true, 'floating');
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  let point = screen.getCursorScreenPoint(), lastMovement = -Infinity, pulseAt = -Infinity, disposed = false;
  let collapsed = false, positioned = false;
  const state = () => {
    const run = getRun();
    return { visible: !window.isDestroyed() && window.isVisible(), collapsed, shortcut,
      run: run ? Object.fromEntries(['id', 'title', 'state', 'total', 'completed', 'index', 'stepTitle', 'sectionTitle'].map(key => [key, run[key]])) : null };
  };
  const publish = () => { if (!window.isDestroyed()) window.webContents.send('playbook:control-state', state()); };
  function position() {
    if (disposed || window.isDestroyed()) return;
    const old = window.getBounds();
    const area = (positioned ? screen.getDisplayMatching(old) : screen.getDisplayNearestPoint(point)).workArea;
    const width = Math.min(collapsed ? 300 : 800, area.width - 32), height = collapsed ? 80 : 104;
    const bounds = {
      x: Math.round(positioned ? Math.max(area.x + 16, Math.min(old.x, area.x + area.width - width - 16)) : area.x + (area.width - width) / 2),
      y: Math.round(positioned ? Math.max(area.y + 16, Math.min(old.y, area.y + area.height - height - 16)) : area.y + area.height - height - 16),
      width, height,
    };
    positioned = true;
    if (Object.keys(bounds).some(key => old[key] !== bounds[key])) window.setBounds(bounds);
  }
  // Reposition only for first display, explicit resizing, completed drags or display changes.
  // Pointer activity must never pull a user-positioned control bar back to the bottom.
  window.on('moved', position);
  screen.on('display-metrics-changed', position);
  screen.on('display-removed', position);
  function poll() {
    if (disposed || window.isDestroyed()) return;
    const next = screen.getCursorScreenPoint(), now = Date.now();
    if (next.x !== point.x || next.y !== point.y) lastMovement = now;
    point = next;
    // System idle observes mouse/keyboard activity without recording keys or installing hooks.
    const show = Boolean(playing(getRun()) && (powerMonitor.getSystemIdleTime() < 3 || now - lastMovement < 3000 || now - pulseAt < 3000));
    if (show !== window.isVisible()) {
      if (show) { position(); window.showInactive(); } else window.hide();
      publish(); onVisibilityChange();
    }
  }
  const ready = window.loadFile(path.join(appRoot, 'build/ui/index.html'));
  const interval = setInterval(poll, 150); interval.unref();
  return { window, state, publish, ready, pulse() { pulseAt = Date.now(); poll(); },
    setCollapsed(value) {
      if (typeof value !== 'boolean') throw new Error('播放栏显示状态无效');
      collapsed = value; position(); publish(); onVisibilityChange();
      return state();
    },
    dispose() {
      disposed = true; clearInterval(interval);
      screen.removeListener('display-metrics-changed', position); screen.removeListener('display-removed', position);
      if (!window.isDestroyed()) window.destroy();
    } };
}
