import http from 'node:http'
import path from 'node:path'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { fork } from 'node:child_process'
import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'

const root = process.env.PLAYBOOK_DSH_ROOT || path.join(import.meta.dirname, 'runtime')
const library = await import(pathToFileURL(path.join(root, 'desktop/library.mjs')).href)
const lifecycle = await import(pathToFileURL(path.join(root, 'desktop/lifecycle.mjs')).href)
const annotations = await import(pathToFileURL(path.join(root, 'desktop/annotation-format.mjs')).href)
const skillInstaller = await import(pathToFileURL(path.join(root, 'desktop/skill-installer.mjs')).href)
const pptx = await import(pathToFileURL(path.join(root, 'desktop/pptx.mjs')).href)
const { readWorkspace, selection, snapshot, removeBookFromManifest, inside, saveStepText } = library
const { atomicJSON, safeError, terminal, cleanupSummary, settledCleanup, interrupted, recoveryHandle } = lifecycle
const { createAnnotation, formatAnnotation } = annotations
const { FRAMEWORKS, SKILL_NAMES, targetFor, inspectSkillBundle, installSkillBundle } = skillInstaller
const { commitPptx } = pptx
const dataDir = process.env.PLAYBOOK_DSH_DATA || path.join(process.env.DSH_HOME || path.join(homedir(), '.dsh'), 'playbook')
const port = 43188
const settingsFile = path.join(dataDir, 'settings.json')
const runsFile = path.join(dataDir, 'runs.json')
const tutorial = path.join(root, 'examples/tutorial')
const authToken = randomBytes(32).toString('base64url')
const subscribers = new Set()
let settings = { schemaVersion: 1, roots: [] }, workspaces = [], runs = [], activeRun = null
let worker, intent, launching = false, frame = null, streamActive = false, streamVisible = false, annotationMode = false
let currentAudio = null
let persistQueue = Promise.resolve(), messageQueue = Promise.resolve(), runGuard, refreshTask, server
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version
const skillVersion = version
const reviewNeeded = run => terminal(run.state) && run.cleanup && !settledCleanup(run.cleanup.status)
const recoveryAvailable = run => run.cleanupScopes?.some(scope => !settledCleanup(scope.status)) && run.cleanupScopes.filter(scope => !settledCleanup(scope.status)).every(scope => scope.recoveryVersion && scope.entries.length && scope.entries.every(entry => settledCleanup(entry.status) || Object.hasOwn(entry, 'handle')))
const codeHash = bytes => createHash('sha256').update(bytes).digest('hex')
const processAlive = pid => { try { process.kill(pid, 0); return true } catch (error) { return error.code !== 'ESRCH' } }

function viewState() {
  return { runtimeWarnings: [], annotationMode, embedded: { active: streamActive, visible: streamVisible }, appVersion: version,
    workspaces: workspaces.map(item => ({ ...item, builtin: item.path === tutorial, profiles: item.profiles.map(({ id, title, dataMode }) => ({ id, title, dataMode })) })),
    runs: [...runs.filter(reviewNeeded), ...runs.filter(run => !reviewNeeded(run)).slice(0, 100)].map(run => ({ ...run, canRecover: Boolean(recoveryAvailable(run)) })),
    activeRun: activeRun ? { ...activeRun, canRecover: Boolean(recoveryAvailable(activeRun)) } : null,
    playbackShortcut: null, skill: { name: SKILL_NAMES[0], compatibilityName: SKILL_NAMES[1], version: skillVersion, frameworks: FRAMEWORKS.map(({ id, name }) => ({ id, name })) } }
}
function publish() {
  const event = `event: state\ndata: ${JSON.stringify(viewState())}\n\n`
  for (const res of subscribers) { try { res.write(event) } catch { subscribers.delete(res) } }
}
function publishAudio(message) {
  if (message.action === 'play') currentAudio = message.source
  if (message.action === 'stop') currentAudio = null
  const event = `event: audio\ndata: ${JSON.stringify(message)}\n\n`
  for (const res of subscribers) { try { res.write(event) } catch { subscribers.delete(res) } }
}
async function saveSettings(next) {
  const before = await readFile(settingsFile).catch(error => error.code === 'ENOENT' ? Buffer.from(JSON.stringify(settings)) : Promise.reject(error))
  const backupPath = path.join(dataDir, 'backups', `settings-${Date.now()}-${randomUUID()}.json`)
  await mkdir(path.dirname(backupPath), { recursive: true })
  await writeFile(backupPath, before, { flag: 'wx', mode: 0o600, flush: true })
  if (!(await readFile(backupPath)).equals(before)) throw new Error('设置备份核验失败')
  await atomicJSON(settingsFile, next)
  settings = next
  return { backupPath }
}
async function refresh(force = false) {
  if (refreshTask) { if (!force) return refreshTask; await refreshTask }
  refreshTask = (async () => {
    const roots = [...new Set([tutorial, ...settings.roots.filter(directory => directory !== path.join(root, 'examples/starter'))])]
    const discovered = await Promise.all(roots.map(async directory => {
      try { return await readWorkspace(directory) }
      catch { return { id: directory, path: directory, name: path.basename(directory), items: [], books: [], demos: [], profiles: [], error: '项目目录已不可访问', token: 'missing' } }
    }))
    const next = discovered.filter(item => !(item.path === tutorial && settings.hiddenTutorial))
    if (activeRun && !terminal(activeRun.state)) {
      const source = next.find(item => item.id === activeRun.workspaceId)
      if (source?.token !== activeRun.sourceToken) activeRun.sourceChanged = true
    }
    if (JSON.stringify(next) !== JSON.stringify(workspaces)) { workspaces = next; publish() }
  })().finally(() => { refreshTask = null })
  return refreshTask
}
async function record(update) {
  if (!activeRun) return
  Object.assign(activeRun, update)
  if (terminal(activeRun.state)) {
    activeRun.finishedAt ||= new Date().toISOString()
    clearTimeout(runGuard)
    if (intent?.runId === activeRun.id) intent = null
    streamActive = false
  }
  runs = [structuredClone(activeRun), ...runs.filter(run => run.id !== activeRun.id)]
  publish()
  const bytes = structuredClone(runs)
  const saved = persistQueue.then(() => atomicJSON(runsFile, bytes))
  persistQueue = saved.catch(() => {})
  await saved
}
function guardRun(ms, reason) {
  clearTimeout(runGuard)
  const runId = activeRun?.id, currentWorker = worker
  runGuard = setTimeout(() => {
    if (activeRun?.id !== runId || terminal(activeRun.state)) return
    void record(interrupted(activeRun, reason)).then(() => currentWorker?.kill()).catch(() => {})
  }, ms)
}
async function disposeWorker() {
  if (!worker) return
  if (activeRun && !terminal(activeRun.state)) throw new Error('资源释放仍未结束，不能替换运行器')
  const old = worker; worker = null
  const exited = new Promise(resolve => old.once('exit', resolve))
  if (old.connected) { try { old.send({ command: 'close' }, () => {}) } catch {} }
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))])
  old.kill()
}
function attachWorker(child, { outputDir, pptxDestination, recovering = false } = {}) {
  const runId = activeRun.id
  child.on('message', message => {
    messageQueue = messageQueue.then(async () => {
      if (activeRun?.id !== runId) return
      const ack = (error, result) => { try { child.send({ type: 'ack', requestId: message.requestId, result, ...(error ? { error: safeError(error) } : {}) }) } catch {} }
      try {
        if (message.type === 'stream-frame') { frame = Buffer.from(message.data, 'base64'); return }
        if (message.type === 'stream-audio') { publishAudio(message); return }
        if (message.type === 'stream-ready') { streamActive = true; streamVisible = true; publish(); return }
        if (message.type === 'annotation-mode') { annotationMode = Boolean(message.active) && activeRun.state === 'paused'; publish(); return }
        if (message.type === 'annotation-save') {
          if (activeRun.state !== 'paused' || !intent?.paused || !annotationMode || message.stepId !== activeRun.stepId || message.flowId !== activeRun.flowId) throw new Error('批注步骤已变化')
          const annotation = createAnnotation(message.annotation, activeRun)
          await record({ annotations: [...(activeRun.annotations || []), annotation] })
          ack(null, { annotation, prompt: formatAnnotation(annotation) }); return
        }
        if (message.type === 'step-text-save') {
          if (worker !== child || activeRun.state !== 'paused' || !intent?.paused || intent.stopped || activeRun.mode !== 'play') throw new Error('仅能在当前演示暂停时编辑文字')
          if (message.stepId !== activeRun.stepId || message.flowId !== activeRun.flowId) throw new Error('当前步骤已变化，请重新暂停后编辑')
          const source = activeRun.scriptSources?.find(item => item.id === message.flowId)
          if (!source) throw new Error('当前脚本源文件不存在')
          const saved = await saveStepText({ workspaceDir: activeRun.workspacePath, file: source.file, expectedHash: source.hash,
            flowId: message.flowId, stepId: message.stepId, title: message.title, explain: message.explain,
            backupDir: path.join(dataDir, 'backups', 'step-text') })
          source.hash = saved.hash
          const step = activeRun.steps.find(item => item.flowId === message.flowId && item.id === message.stepId)
          if (step) { step.title = message.title; step.explain = message.explain }
          await record({ stepTitle: message.title, sourceChanged: true, textEdits: [...(activeRun.textEdits || []),
            { flowId: message.flowId, stepId: message.stepId, savedAt: new Date().toISOString(), backupPath: saved.backupPath }] })
          await refresh()
          ack(null, { title: message.title, explain: message.explain }); return
        }
        if (message.type === 'limits') { await record({ lifecycle: message.limits }); ack(); return }
        if (message.type === 'scope') {
          const scope = structuredClone(message.scope)
          if (scope.runId !== runId || !activeRun.flowIds.includes(scope.flowId) || !scope.scopeId.startsWith(runId + '.') || !Array.isArray(scope.entries)) throw new Error('清理回执与本轮不匹配')
          for (const entry of scope.entries) { if (Object.hasOwn(entry, 'handle')) recoveryHandle(entry.handle); if (entry.error) entry.error = safeError(entry.error) }
          if (terminal(activeRun.state)) { ack(new Error('Run already settled')); return }
          const scopes = [...(activeRun.cleanupScopes || [])], index = scopes.findIndex(item => item.scopeId === scope.scopeId)
          if (index < 0) scopes.push(scope); else scopes[index] = scope
          const cleanup = cleanupSummary(scopes)
          if (scope.status === 'running') guardRun(Math.max(1, scope.deadline - Date.now()) + 2000, '清理预算耗尽且未收到回执，资源结果未知')
          else if (intent?.stopped) guardRun(Math.max(1, intent.stopDeadline - Date.now()), '停止后执行未确认结束，清理结果未知')
          else clearTimeout(runGuard)
          await record({ cleanupScopes: scopes, cleanup, ...(scope.status === 'running' ? { state: 'cleaning', stepTitle: recovering ? '正在恢复资源释放…' : '正在释放本轮资源…' } : {}) })
          ack(); return
        }
        if (message.type === 'execution-error') { await record({ executionError: safeError(message.error), executionStatus: 'failed' }); ack(); return }
        if (message.type === 'manual-start') {
          if (intent?.stopped || !activeRun.steps.some(step => step.flowId === message.flowId && step.id === message.stepId && step.interaction?.mode === 'manual')) throw new Error('Manual step does not match this run')
          await record({ state: 'waiting', interaction: { ...message.interaction, flowId: message.flowId, stepId: message.stepId } }); ack(); return
        }
        if (message.type === 'manual-end') { await record({ state: intent?.stopped ? 'stopping' : 'playing', interaction: null, manualInteractions: [...(activeRun.manualInteractions || []), { flowId: message.flowId, stepId: message.stepId, ...message.result, finishedAt: new Date().toISOString() }] }); ack(); return }
        if (message.type === 'final') {
          if (terminal(activeRun.state)) { ack(); return }
          const update = { ...message.update }
          if (intent?.stopped && update.state === 'completed') { update.state = settledCleanup(update.cleanup?.status) ? 'stopped' : 'failed'; update.executionStatus = 'stopped'; update.stopRequested = true }
          if (pptxDestination && update.state === 'completed') {
            if (!update.exported) throw new Error('运行器未生成 PPTX')
            await mkdir(path.dirname(pptxDestination), { recursive: true })
            const committed = await commitPptx(path.join(outputDir, 'export/deck.pptx'), pptxDestination, () => intent?.stopped)
            await record(committed ? { ...update, exported: { ...update.exported, path: pptxDestination } } : { ...update, state: 'stopped', exported: undefined, stopRequested: true })
          } else await record(update)
          ack(); return
        }
        if (message.type === 'state' && !terminal(activeRun.state)) {
          const update = { ...message.update }
          if (activeRun.cleanup?.status === 'running') update.state = 'cleaning'
          else if (intent?.stopped) update.state = 'stopping'
          if (Object.entries(update).some(([key, value]) => JSON.stringify(activeRun[key]) !== JSON.stringify(value))) await record(update)
        }
      } catch (error) {
        ack(error)
        if (!terminal(activeRun.state)) await record({ ...interrupted(activeRun), error: safeError(error) })
      }
    }).catch(error => console.error('[playbook-dsh] worker message:', safeError(error)))
  })
  child.on('exit', code => {
    if (worker === child) worker = null
    annotationMode = false; streamActive = false; publish()
    void messageQueue.then(async () => { if (activeRun?.id === runId && !terminal(activeRun.state)) await record(interrupted(activeRun, `运行器已退出（${code}），清理结果未知`)) })
  })
  child.stdout?.resume(); child.stderr?.on('data', bytes => console.error('[playbook-dsh runner]', bytes.toString().slice(0, 2000)))
}
async function play(input, exportRequested = false) {
  if (launching || (activeRun && !terminal(activeRun.state))) throw new Error('请先停止当前演示')
  launching = true
  try {
    await disposeWorker(); await refresh(true)
    const workspace = workspaces.find(item => item.id === input.workspaceId)
    if (!workspace) throw new Error('项目尚未登记')
    const kind = input.kind || 'script', selected = selection(workspace, input.entryId, kind, input.profileId)
    if (exportRequested && selected.items.some(item => item.steps.some(step => step.interaction))) throw new Error('含手动操作的流程需要先制作自动演示副本，再导出 PPTX')
    if (selected.items.some(item => item.requirements.replay === 'single-run' && runs.some(run => run.workspaceId === workspace.id && run.profileId === selected.profile.id && run.executing && run.flowIds?.includes(item.id)))) throw new Error('此流程未声明可重播的恢复方案')
    activeRun = { id: randomUUID(), title: selected.title, workspaceId: workspace.id, entryId: input.entryId, kind, profileId: selected.profile.id, mode: exportRequested ? 'pptx' : 'play', browser: exportRequested ? 'external' : 'embedded',
      profileName: selected.profile.title, lifecycleVersion: 1, workspacePath: workspace.path, profileFile: selected.profile.file, appVersion: version,
      cleanup: { status: 'not-required', errors: [] }, cleanupScopes: [], state: 'preparing', total: selected.items.reduce((sum, item) => sum + item.steps.length, 0), index: 0, completed: 0,
      startedAt: new Date().toISOString(), sourceToken: workspace.token, sourceChanged: false, flowIds: selected.items.map(item => item.id),
      steps: selected.items.flatMap(item => item.steps.map(step => ({ ...step, flowId: item.id, scriptTitle: item.title, sectionTitle: item.sectionTitle, bookTitle: item.bookTitle }))),
      scriptSources: selected.items.map(item => ({ id: item.id, file: item.file, hash: item.hash })) }
    intent = { runId: activeRun.id, paused: false, stopped: false, ready: false }
    frame = null; currentAudio = null; streamActive = false; streamVisible = !exportRequested
    await record({})
    try {
      const outputDir = path.join(dataDir, 'cache', activeRun.id)
      const pptxDestination = exportRequested ? path.join(dataDir, 'exports', `${activeRun.id}.pptx`) : null
      const built = await snapshot({ workspace, ...selected, outputDir, appRoot: root })
      if ((await readWorkspace(workspace.path)).token !== workspace.token) throw new Error('脚本正在更新，请刷新后再播放')
      activeRun.snapshotHash = built.snapshotHash; activeRun.bundleHash = codeHash(await readFile(built.bundle))
      const runId = activeRun.id
      const child = fork(path.join(root, 'desktop/runner.mjs'), [], { cwd: outputDir, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
      worker = child; attachWorker(child, { outputDir, pptxDestination })
      await record({ executing: true, workerPid: child.pid })
      child.send({ command: 'start', config: { ...built, appRoot: root, runId, title: selected.title, stream: !exportRequested,
        segments: selected.items.map(item => ({ flowId: item.id, scriptTitle: item.title, sectionTitle: item.sectionTitle, bookTitle: item.bookTitle })),
        profileId: selected.profile.id, dataMode: selected.profile.dataMode, parameters: selected.profile.parameters, workspaceDir: workspace.path,
        captureDir: null, exportDir: exportRequested ? path.join(outputDir, 'export') : null, pace: Number(process.env.PLAYBOOK_TEST_PACE) || 1, headless: true, paused: intent.paused } })
      intent.ready = true
      return { runId }
    } catch (error) { await record({ state: 'failed', error: safeError(error) }); throw error }
  } finally { launching = false }
}
async function recoverRun({ runId } = {}) {
  if (launching || activeRun && !terminal(activeRun.state)) throw new Error('请先等待当前执行和资源释放结束')
  const run = runs.find(item => item.id === runId)
  if (!run) throw new Error('运行记录不存在')
  if (settledCleanup(run.cleanup?.status)) return { runId, alreadyRecovered: true }
  if (!recoveryAvailable(run)) throw new Error('此 Profile 未声明完整的精确恢复句柄，请人工核对本轮资源')
  launching = true
  try {
    if (worker?.pid === run.workerPid && activeRun?.id === runId) await disposeWorker()
    if (!/^[0-9a-f-]{36}$/.test(run.id)) throw new Error('恢复 run 标识无效')
    if (run.workerPid && processAlive(run.workerPid)) throw new Error('原运行器仍存活，不能并发恢复')
    if (run.lifecycleVersion !== 1 || run.appVersion !== version) throw new Error('恢复回执版本或应用版本不匹配')
    const workspace = await readWorkspace(run.workspacePath)
    if (workspace.id !== run.workspaceId || workspace.path !== run.workspacePath || workspace.token !== run.sourceToken) throw new Error('工作区或 Profile 源码已变化')
    for (const [index, scope] of run.cleanupScopes.entries()) {
      if (scope.runId !== run.id || scope.scopeId !== `${run.id}.${index}` || scope.flowId !== run.flowIds[index] || new Set(scope.entries.map(entry => entry.id)).size !== scope.entries.length) throw new Error('清理回执与原 run 不一致')
      for (const entry of scope.entries) if (Object.hasOwn(entry, 'handle')) recoveryHandle(entry.handle)
    }
    const selected = selection(workspace, run.entryId, run.kind, run.profileId)
    if (selected.profile.file !== run.profileFile || selected.items.map(item => item.id).join('|') !== run.flowIds.join('|')) throw new Error('Profile 或脚本顺序已变化')
    const outputDir = path.join(dataDir, 'cache', run.id), bundle = path.join(outputDir, 'flow.mjs')
    if (codeHash(await readFile(bundle)) !== run.bundleHash) throw new Error('原运行快照校验失败')
    await disposeWorker()
    activeRun = structuredClone(run)
    intent = { runId, stopped: false, paused: false, ready: true }
    const child = fork(path.join(root, 'desktop/runner.mjs'), [], { cwd: outputDir, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
    worker = child; attachWorker(child, { outputDir, recovering: true })
    await record({ state: 'recovering', recoveryStartedAt: new Date().toISOString(), workerPid: child.pid, recoveryError: null })
    child.send({ command: 'recover', config: { bundle, appRoot: root, runId, profileId: run.profileId, workspaceDir: workspace.path, parameters: selected.profile.parameters, scopes: run.cleanupScopes } })
    return { runId }
  } catch (error) {
    const recoveryError = safeError(error)
    if (activeRun?.id === runId) { await record(terminal(activeRun.state) ? { recoveryError } : { ...interrupted(activeRun), recoveryError }); await disposeWorker().catch(() => {}) }
    else { runs = runs.map(item => item.id === runId ? { ...item, recoveryError } : item); await atomicJSON(runsFile, runs); publish() }
    throw error
  } finally { launching = false }
}
async function control(command) {
  if (command === 'toggle') command = activeRun && !terminal(activeRun.state) && !['paused', 'pausing'].includes(activeRun.state) ? 'pause' : 'resume'
  if (command === 'replay' && activeRun && terminal(activeRun.state)) return play({ workspaceId: activeRun.workspaceId, entryId: activeRun.entryId, kind: activeRun.kind, profileId: activeRun.profileId })
  if (!['pause', 'resume', 'stop'].includes(command) || !activeRun || terminal(activeRun.state) || activeRun.state === 'stopping') return
  if (command === 'pause' || command === 'resume') {
    if (activeRun.interaction?.busy && command === 'resume') return
    if (command === 'resume' && annotationMode) { annotationMode = false; worker?.send({ command: 'annotation-cancel' }); publish() }
    intent.paused = command === 'pause'
    if (intent.ready) worker?.send({ command })
    if (activeRun.state === 'waiting') await record({ interaction: { ...activeRun.interaction, paused: intent.paused } })
    else if (intent.paused) await record({ state: 'pausing' })
    else if (!intent.ready) await record({ state: 'preparing' })
    return
  }
  intent.stopped = true; intent.paused = false
  intent.stopRequestedAt ||= new Date().toISOString(); intent.stopDeadline ||= Date.now() + (activeRun.lifecycle?.stopTimeoutMs || 30000)
  if (intent.ready) worker?.send({ command: 'stop' })
  await record({ state: activeRun.cleanup?.status === 'running' ? 'cleaning' : 'stopping', stopRequested: true, stopRequestedAt: intent.stopRequestedAt })
  if (activeRun.cleanup?.status !== 'running') guardRun(Math.max(1, intent.stopDeadline - Date.now()), '停止宽限耗尽，业务执行和资源释放结果未知')
}
async function command(method, input) {
  if (method === 'getState') return viewState()
  if (method === 'refreshWorkspace') { await refresh(true); return viewState() }
  if (method === 'addWorkspace') {
    const directory = await realpath(input?.path || '')
    if (!(await stat(directory)).isDirectory()) throw new Error('请选择项目文件夹')
    await readWorkspace(directory)
    await saveSettings({ ...settings, roots: [...new Set([...settings.roots, directory])], ...(directory === tutorial ? { hiddenTutorial: false } : {}) })
    await refresh(true); return viewState()
  }
  if (method === 'removeWorkspace') {
    if (launching || activeRun && !terminal(activeRun.state)) throw new Error('请先等待播放和资源释放结束')
    const workspace = workspaces.find(item => item.id === input)
    if (!workspace) throw new Error('项目尚未登记')
    await saveSettings({ ...settings, roots: settings.roots.filter(item => item !== workspace.path), ...(workspace.path === tutorial ? { hiddenTutorial: true } : {}) })
    await refresh(true); return viewState()
  }
  if (method === 'removeBook') {
    if (launching || activeRun && !terminal(activeRun.state)) throw new Error('请先等待播放和资源释放结束')
    const workspace = workspaces.find(item => item.id === input?.workspaceId)
    if (!workspace || workspace.path === tutorial) throw new Error('内置项目不能在 DSH 中删除 Book')
    if (runs.some(run => run.workspaceId === workspace.id && reviewNeeded(run))) throw new Error('该项目仍有待核对的资源清理记录')
    const latest = await readWorkspace(workspace.path)
    if (!latest.books.some(book => book.id === input.bookId)) throw new Error('Book 已不存在')
    const result = await removeBookFromManifest({ workspaceDir: workspace.path, bookId: input.bookId, expectedHash: input.manifestHash, backupDir: path.join(dataDir, 'backups', 'books', workspace.id) })
    await refresh(true); return { ...result, state: viewState() }
  }
  if (method === 'play') return play(input)
  if (method === 'exportPptx') return play(input, true)
  if (method === 'recoverRun') return recoverRun(input)
  if (method === 'control') return control(input)
  if (method === 'showEmbedded') { streamVisible = Boolean(input); publish(); return { visible: streamVisible } }
  if (method === 'annotate') {
    if (!activeRun || activeRun.state !== 'paused' || !intent?.paused || !worker) throw new Error('请先暂停正在播放的演示')
    annotationMode = !annotationMode
    worker.send({ command: annotationMode ? 'annotation-start' : 'annotation-cancel' }); publish(); return { active: annotationMode }
  }
  if (method === 'copyAnnotation') {
    const annotation = runs.find(item => item.id === input?.runId)?.annotations?.find(item => item.id === input?.annotationId)
    if (!annotation) throw new Error('批注不存在')
    return { text: formatAnnotation(annotation) }
  }
  if (method === 'copyContext') {
    const workspace = workspaces.find(item => item.id === input?.workspaceId)
    const run = runs.find(item => item.id === input?.runId)
    const item = workspace?.items.find(item => item.id === input?.entryId)
    return { text: `请使用 $playbook-wright 帮我检查或调整下面的演示。保留业务动作、断言与数据边界。\n${JSON.stringify({ workspace: workspace?.path, manifest: '.playbook.json', kind: input.kind || 'script', entryId: input.entryId, script: item?.file, flowId: item?.id, run, skillVersion }, null, 2)}\n我的需求：` }
  }
  if (method === 'reveal') {
    const workspace = workspaces.find(item => item.id === input?.workspaceId)
    if (!workspace) throw new Error('项目不存在')
    const item = workspace.items.find(item => item.id === input.entryId)
    const target = item ? await inside(workspace.path, item.file) : path.join(workspace.path, '.playbook.json')
    if (process.platform === 'darwin') await new Promise((resolve, reject) => execFile('/usr/bin/open', ['-R', target], error => error ? reject(error) : resolve()))
    return { path: target }
  }
  if (method === 'openExport') {
    const run = runs.find(item => item.id === input?.runId)
    if (run?.state !== 'completed' || !run.exported?.path || !(await stat(run.exported.path)).isFile()) throw new Error('此记录没有已完成的 PPTX 文件')
    if (input.reveal && process.platform === 'darwin') await new Promise((resolve, reject) => execFile('/usr/bin/open', ['-R', run.exported.path], error => error ? reject(error) : resolve()))
    return { path: run.exported.path, download: `/export/${run.id}?token=${encodeURIComponent(authToken)}` }
  }
  if (method === 'chooseSkillProject') {
    const directory = await realpath(input?.path || '')
    if (!(await stat(directory)).isDirectory()) throw new Error('请选择项目文件夹')
    if (directory === tutorial) throw new Error('内置教程不能作为 Skill 安装目标')
    return directory
  }
  if (method === 'skillPreview' || method === 'skillInstall') {
    if (!['user', 'project'].includes(input?.scope) || !FRAMEWORKS.some(item => item.id === input?.framework)) throw new Error('请选择支持的框架和安装范围')
    let projectRoot
    if (input.scope === 'project') {
      projectRoot = await realpath(input.projectRoot || '')
      if (!(await stat(projectRoot)).isDirectory() || projectRoot === tutorial) throw new Error('请选择有效的项目文件夹')
    }
    const options = { sourceDir: path.join(root, 'skills/playbook-wright'), version: skillVersion,
      targetDir: targetFor({ framework: input.framework, scope: input.scope, home: homedir(), projectRoot }), backupRoot: path.join(dataDir, 'backups/skills') }
    return method === 'skillPreview' ? inspectSkillBundle(options) : installSkillBundle({ ...options, replace: input.replace === true })
  }
  if (method === 'streamInput') { if (worker && streamActive) worker.send({ command: 'stream-input', config: input }); return null }
  if (method === 'setPlaybackSelection') return null
  throw new Error(`DSH 版暂不支持 ${method}`)
}
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)) }
async function request(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${port}`)
  if (req.method === 'GET' && url.pathname === '/') {
    const html = await readFile(path.join(root, 'build/ui/index.html'), 'utf8')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
    const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'" />`
    res.end(html.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, policy).replace('</head>', `<script>window.__PLAYBOOK_DSH_TOKEN=${JSON.stringify(authToken)};</script><script src="/bridge.js"></script></head>`))
    return
  }
  if (req.method === 'GET' && url.pathname === '/bridge.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(await readFile(path.join(import.meta.dirname, 'bridge.js'))); return
  }
  if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
    const name = path.basename(url.pathname)
    const file = path.join(root, 'build/ui/assets', name)
    const bytes = await readFile(file)
    res.writeHead(200, { 'Content-Type': name.endsWith('.css') ? 'text/css' : 'text/javascript', 'Cache-Control': 'private, max-age=3600' }); res.end(bytes); return
  }
  const authenticated = req.headers['x-playbook-token'] === authToken || url.searchParams.get('token') === authToken
  if (!authenticated) { json(res, 403, { error: '无效的本地播放会话' }); return }
  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
    subscribers.add(res); res.write(`event: state\ndata: ${JSON.stringify(viewState())}\n\n`)
    if (currentAudio) res.write(`event: audio\ndata: ${JSON.stringify({ action: 'play', source: currentAudio })}\n\n`)
    req.on('close', () => subscribers.delete(res)); return
  }
  if (req.method === 'GET' && url.pathname === '/frame') {
    if (!frame) { res.writeHead(204, { 'Cache-Control': 'no-store' }); res.end(); return }
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }); res.end(frame); return
  }
  if (req.method === 'GET' && url.pathname.startsWith('/export/')) {
    const runId = path.basename(url.pathname)
    const run = runs.find(item => item.id === runId)
    if (run?.state !== 'completed' || !run.exported?.path) { json(res, 404, { error: 'PPTX 不存在' }); return }
    const bytes = await readFile(run.exported.path)
    res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'Content-Disposition': `attachment; filename="Playbook-${runId}.pptx"`, 'Cache-Control': 'no-store' })
    res.end(bytes); return
  }
  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    if (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}`) { json(res, 403, { error: '来源不匹配' }); return }
    if (!req.headers['content-type']?.startsWith('application/json')) { json(res, 415, { error: '只接受 JSON' }); return }
    let body = ''
    for await (const chunk of req) { body += chunk; if (body.length > 100000) throw new Error('请求过大') }
    const result = await command(url.pathname.slice('/api/'.length), JSON.parse(body || 'null'))
    json(res, 200, { result }); return
  }
  json(res, 404, { error: 'Not found' })
}
export async function startServer() {
  await mkdir(dataDir, { recursive: true })
  try { const loaded = JSON.parse(await readFile(settingsFile, 'utf8')); if (loaded.schemaVersion === 1 && Array.isArray(loaded.roots)) settings = loaded } catch {}
  try { const loaded = JSON.parse(await readFile(runsFile, 'utf8')); if (Array.isArray(loaded)) runs = loaded } catch {}
  runs = runs.map(run => terminal(run.state) ? run : interrupted(run, 'DSH 上次退出时演示未结束，资源结果需核对'))
  await atomicJSON(runsFile, runs)
  await refresh()
  server = http.createServer((req, res) => { void request(req, res).catch(error => json(res, 400, { error: safeError(error) })) })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  console.log(`[playbook-dsh] http://127.0.0.1:${port}`)
  const refresher = setInterval(() => void refresh().catch(error => console.error('[playbook-dsh refresh]', safeError(error))), 1500)
  refresher.unref()
  return async () => {
    clearInterval(refresher)
    if (activeRun && !terminal(activeRun.state)) await control('stop')
    const started = Date.now()
    while (activeRun && !terminal(activeRun.state) && Date.now() - started < 35000) await new Promise(resolve => setTimeout(resolve, 100))
    if (activeRun && !terminal(activeRun.state)) await record(interrupted(activeRun, 'DSH 关闭时清理未确认'))
    await disposeWorker().catch(() => {})
    for (const res of subscribers) res.end()
    await new Promise(resolve => server.close(resolve))
  }
}
