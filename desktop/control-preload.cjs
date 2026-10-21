const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('playbookControl', {
  getState: () => ipcRenderer.invoke('playbook:playbackState'),
  control: command => ipcRenderer.invoke('playbook:control', command),
  setCollapsed: value => ipcRenderer.invoke('playbook:collapseControl', value),
  onState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('playbook:control-state', listener);
    return () => ipcRenderer.removeListener('playbook:control-state', listener);
  },
});
