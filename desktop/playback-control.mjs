import { BrowserWindow, screen, powerMonitor } from 'electron';
import path from 'node:path';

const playing = run => run && ['preparing', 'playing', 'paused', 'pausing', 'stopping'].includes(run.state);

export function createPlaybackControl({ appRoot, getRun, shortcut, onVisibilityChange }) {
  const window = new BrowserWindow({ title: 'Playbook 播放控制', width: 800, height: 104, show: false,
    frame: false, transparent: true, hasShadow: false, resizable: false, movable: false,
    focusable: false, skipTaskbar: true, fullscreenable: false, acceptFirstMouse: true,
    webPreferences: { preload: path.join(appRoot, 'build/control-preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
  window.setAlwaysOnTop(true, 'floating');
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  let point = screen.getCursorScreenPoint(), lastMovement = -Infinity, pulseAt = -Infinity, disposed = false;
  const state = () => {
    const run = getRun();
    return { visible: !window.isDestroyed() && window.isVisible(), shortcut,
      run: run ? Object.fromEntries(['id', 'title', 'state', 'total', 'completed', 'index', 'stepTitle', 'sectionTitle'].map(key => [key, run[key]])) : null };
  };
  const publish = () => { if (!window.isDestroyed()) window.webContents.send('playbook:control-state', state()); };
  function poll() {
    if (disposed || window.isDestroyed()) return;
    const next = screen.getCursorScreenPoint(), now = Date.now();
    if (next.x !== point.x || next.y !== point.y) lastMovement = now;
    point = next;
    // System idle observes mouse/keyboard activity without recording keys or installing hooks.
    const show = Boolean(playing(getRun()) && (powerMonitor.getSystemIdleTime() < 3 || now - lastMovement < 3000 || now - pulseAt < 3000));
    if (show) {
      const area = screen.getDisplayNearestPoint(point).workArea, width = Math.min(800, area.width - 32);
      const bounds = { x: Math.round(area.x + (area.width - width) / 2), y: area.y + area.height - 120, width, height: 104 };
      const old = window.getBounds();
      if (Object.keys(bounds).some(key => old[key] !== bounds[key])) window.setBounds(bounds);
    }
    if (show !== window.isVisible()) {
      if (show) window.showInactive(); else window.hide();
      publish(); onVisibilityChange();
    }
  }
  const ready = window.loadFile(path.join(appRoot, 'build/ui/index.html'));
  const interval = setInterval(poll, 150); interval.unref();
  return { window, state, publish, ready, pulse() { pulseAt = Date.now(); poll(); },
    dispose() { disposed = true; clearInterval(interval); if (!window.isDestroyed()) window.destroy(); } };
}
