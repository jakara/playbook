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
  const api = {
    getState: () => lastState ? Promise.resolve(lastState) : invoke('getState'),
    onState(callback) { listeners.add(callback); if (lastState) callback(lastState); return () => listeners.delete(callback) },
    async addWorkspace() { const directory = window.prompt('请输入包含 .playbook.json 的项目文件夹绝对路径'); return directory ? invoke('addWorkspace', { path: directory }) : api.getState() },
    removeWorkspace: input => invoke('removeWorkspace', input),
    removeBook: input => invoke('removeBook', input),
    refreshWorkspace: input => invoke('refreshWorkspace', input),
    play: input => invoke('play', input),
    control: input => invoke('control', input),
    showEmbedded: input => invoke('showEmbedded', input),
    annotate: () => invoke('annotate'),
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
    async chooseSkillProject() { const directory = window.prompt('请输入智能体使用的项目文件夹绝对路径'); return directory ? invoke('chooseSkillProject', { path: directory }) : null },
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
