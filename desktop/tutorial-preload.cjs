const { contextBridge, ipcRenderer } = require('electron');
const api = {};
for (const method of ['chooseSkillProject', 'skillPreview', 'skillInstall']) {
  api[method] = input => {
    if (method !== 'skillPreview' && !navigator.userActivation.isActive) {
      return Promise.reject(new Error('请在手动操作时亲自选择目录或点击安装。'));
    }
    return ipcRenderer.invoke('playbook:tutorial-' + method, input);
  };
}
contextBridge.exposeInMainWorld('playbookTutorial', Object.freeze(api));
