const { contextBridge, ipcRenderer } = require('electron');
const api = {};
for (const method of ['getState', 'addWorkspace', 'removeWorkspace', 'play', 'control', 'copyContext', 'reveal', 'skillPreview', 'skillInstall']) {
  api[method] = input => ipcRenderer.invoke(`playbook:${method}`, input);
}
api.onState = callback => {
  const listener = (_event, state) => callback(state);
  ipcRenderer.on('playbook:state', listener);
  return () => ipcRenderer.removeListener('playbook:state', listener);
};
contextBridge.exposeInMainWorld('playbook', Object.freeze(api));
