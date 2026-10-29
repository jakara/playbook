(() => {
  const token = window.__PLAYBOOK_DSH_TOKEN
  document.documentElement.dataset.playbookHost = 'dsh'
  const listeners = new Set()
  let inputQueue = Promise.resolve()
  let narration
  let lastState
  const events = new EventSource(`/events?token=${encodeURIComponent(token)}`)
  events.addEventListener('state', event => {
    try { lastState = JSON.parse(event.data); for (const listener of listeners) listener(lastState) } catch (error) { console.error(error) }
  })
  events.addEventListener('audio', event => {
    try {
      const message = JSON.parse(event.data)
      if (message.action === 'play') {
        narration?.pause()
        narration = new Audio(message.source.dataUrl)
        narration.play().catch(error => console.warn('Playbook narration:', error.message))
      } else if (message.action === 'pause') narration?.pause()
      else if (message.action === 'resume') narration?.play().catch(error => console.warn('Playbook narration:', error.message))
      else if (message.action === 'stop') { narration?.pause(); narration = null }
    } catch (error) { console.error(error) }
  })
  async function invoke(method, input) {
    const response = await fetch(`/api/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Playbook-Token': token }, body: JSON.stringify(input ?? null) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || `${method} 失败`)
    return data.result
  }
  function chooseDirectory() {
    if (window.parent === window) return Promise.reject(new Error('请在 DSH 的 Playbook 面板中选择项目文件夹'))
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel()
      const finish = (error, directory) => {
        clearTimeout(timer); channel.port1.close()
        if (error) reject(new Error(error)); else resolve(directory)
      }
      const timer = setTimeout(() => finish('无法连接文件夹选择器，请重新打开 Playbook 面板'), 5000)
      channel.port1.onmessage = ({ data }) => {
        if (data?.ready === true) { clearTimeout(timer); return }
        if (data?.error) finish(data.error)
        else if (data?.path === null || typeof data?.path === 'string') finish(null, data.path)
        else finish('文件夹选择结果无效')
      }
      // The request carries no path or token; the host verifies this iframe before replying on the private port.
      window.parent.postMessage({ type: 'playbook:choose-directory' }, '*', [channel.port2])
    })
  }
  const api = {
    getState: () => lastState ? Promise.resolve(lastState) : invoke('getState'),
    onState(callback) { listeners.add(callback); if (lastState) callback(lastState); return () => listeners.delete(callback) },
    async addWorkspace() { const directory = await chooseDirectory(); return directory ? invoke('addWorkspace', { path: directory }) : api.getState() },
    removeWorkspace: input => invoke('removeWorkspace', input),
    removeBook: input => invoke('removeBook', input),
    refreshWorkspace: input => invoke('refreshWorkspace', input),
    play: input => invoke('play', input),
    control: input => invoke('control', input),
    showEmbedded: input => invoke('showEmbedded', input),
    annotate: () => invoke('annotate'),
    setNarrationEnabled: input => invoke('setNarrationEnabled', input),
    deleteAnnotation: input => invoke('deleteAnnotation', input),
    setPlaybackSelection: input => invoke('setPlaybackSelection', input),
    async copyAnnotation(input) { const { text } = await invoke('copyAnnotation', input); await navigator.clipboard.writeText(text); return { copied: true } },
    async copyContext(input) { const { text } = await invoke('copyContext', input); await navigator.clipboard.writeText(text); return { copied: true } },
    reveal: input => invoke('reveal', input),
    recoverRun: input => invoke('recoverRun', input),
    exportPptx: input => invoke('exportPptx', input),
    async openExport(input) {
      const result = await invoke('openExport', input)
      if (!input.reveal) { const link = document.createElement('a'); link.href = result.download; link.download = ''; document.body.append(link); link.click(); link.remove() }
      return result
    },
    async chooseSkillProject() { const directory = await chooseDirectory(); return directory ? invoke('chooseSkillProject', { path: directory }) : null },
    skillPreview: input => invoke('skillPreview', input),
    skillInstall: input => invoke('skillInstall', input),
  }
  window.playbook = api
  window.playbookDsh = {
    frameUrl: () => `/frame?token=${encodeURIComponent(token)}&t=${Date.now()}`,
    input: value => {
      const sent = inputQueue.then(() => invoke('streamInput', value))
      inputQueue = sent.catch(() => {})
      return sent
    },
  }
  window.addEventListener('pagehide', () => { events.close(); narration?.pause() })
})()
