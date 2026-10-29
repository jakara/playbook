const { contextBridge, ipcRenderer } = require('electron');
const api = {};
for (const method of ['showEmbedded', 'getState', 'addWorkspace', 'removeWorkspace', 'removeBook', 'refreshWorkspace', 'play', 'recoverRun', 'exportPptx', 'openExport', 'setPlaybackSelection', 'setNarrationEnabled', 'control', 'annotate', 'copyAnnotation', 'deleteAnnotation', 'copyContext', 'reveal', 'chooseSkillProject', 'skillPreview', 'skillInstall']) {
  api[method] = input => ipcRenderer.invoke(`playbook:${method}`, input);
}
api.onState = callback => {
  const listener = (_event, state) => callback(state);
  ipcRenderer.on('playbook:state', listener);
  return () => ipcRenderer.removeListener('playbook:state', listener);
};
contextBridge.exposeInMainWorld('playbook', Object.freeze(api));
