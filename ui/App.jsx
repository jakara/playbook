import React, { useEffect, useRef, useState } from 'react';
import PlaybookMark from './PlaybookMark.jsx';
import NarrationToggle from './NarrationToggle.jsx';

const EMPTY = { workspaces: [], runs: [], activeRun: null, skill: { frameworks: [] } };
const RUN_LABELS = { preparing: '准备中', playing: '播放中', pausing: '正在暂停', paused: '已暂停', waiting: '交给你操作', stopping: '正在停止', cleaning: '释放资源中', recovering: '恢复释放中', stopped: '已停止', completed: '已完成', failed: '运行失败', exporting: '正在生成 PPTX' };
const ACTIVE = ['preparing', 'playing', 'pausing', 'paused', 'waiting', 'stopping', 'exporting', 'cleaning', 'recovering'];
const PREVIEW_LABELS = { new: '可以安装', installed: '已是当前版本', update: '可以更新', modified: '已有内容已修改', symlink: '目标为符号链接', conflict: '目标存在其他内容' };

function Icon({ name, size = 20, ...props }) {
  if (name === 'book') return <PlaybookMark size={size} {...props} />;
  const paths = {
    library: <><rect x="3.5" y="4" width="5" height="16" rx="1.5" /><rect x="11" y="4" width="4" height="16" rx="1.5" /><path d="m18 5 3 14" /></>,
    play: <path d="m9 5 11 7-11 7z" />,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    history: <><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" /><path d="M12 8v5l3 2" /></>,
    skill: <><path d="m12 3 8.5 5v9L12 22l-8.5-5V8zM3.5 8 12 13l8.5-5M12 13v9" /><path d="m8 5.3 8.5 5" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    arrow: <path d="m9 5 7 7-7 7" />,
    external: <><path d="M14 4h6v6M20 4 10 14" /><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4" /></>,
    annotation: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    cross: <path d="m6 6 12 12M18 6 6 18" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v.2" /></>,
    script: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6" /><path d="M8 13h8M8 17h5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    refresh: <><path d="M20 10a8 8 0 0 0-14-5L3 8M3 3v5h5M4 14a8 8 0 0 0 14 5l3-3M21 21v-5h-5" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" /><path d="m8 12 3 3 5-6" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.info}</svg>;
}

function display(value, fallback = '未说明') {
  if (value == null || value === '') return fallback;
  if (Array.isArray(value)) return value.length ? value.map(v => typeof v === 'string' ? v : v.title || v.name || String(v)).join('、') : fallback;
  if (typeof value === 'object') return value.title || value.name || value.description || JSON.stringify(value);
  return String(value);
}
const DATA_LABELS = { real: '实际服务', fixture: '受控样例', mock: '模拟接口' };
const EFFECT_LABELS = { 'read-only': '只读操作', writes: '会写入数据' };
const REPLAY_LABELS = { safe: '可以重复播放', 'reset-required': '重播前需重置环境', 'single-run': '仅运行一次' };
function date(value, full = false) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', ...(full ? { year: 'numeric' } : {}), hour: '2-digit', minute: '2-digit' });
}
function duration(run) {
  if (!run?.startedAt || !run.finishedAt) return '进行中';
  const secs = Math.max(0, Math.round((new Date(run.finishedAt) - new Date(run.startedAt)) / 1000));
  return secs < 60 ? `${secs} 秒` : `${Math.floor(secs / 60)} 分 ${secs % 60} 秒`;
}
function Status({ state }) { return <span className={`status status-${state}`}><span />{RUN_LABELS[state] || state}</span>; }
function Empty({ icon = 'library', title, children, action }) { return <div className="empty"><div className="empty-icon"><Icon name={icon} size={30} /></div><h3>{title}</h3><p>{children}</p>{action}</div>; }
function Button({ icon, children, className = '', ...props }) { return <button className={`button ${className}`} {...props}>{icon && <Icon name={icon} size={17} />}{children}</button>; }

export default function App() {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState('library');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [collapsedFolders, setCollapsedFolders] = useState(new Set());
  const [profileChoice, setProfileChoice] = useState({ key: '', value: '' });
  const [browserChoice, setBrowserChoice] = useState('');
  const [selectedRun, setSelectedRun] = useState(null);
  const [pending, setPending] = useState('');
  const [notice, setNotice] = useState(null);
  const [removal, setRemoval] = useState(null);
  const api = window.playbook;
  const workspaces = data.workspaces || [];
  const entries = workspaces.flatMap(workspace => {
    const result = [];
    const covered = new Set();
    for (const book of workspace.books || []) {
      const bookItem = { workspace, entry: book, kind: 'book', key: `${workspace.id}:book:${book.id}`, entryId: book.id, book };
      result.push(bookItem);
      for (const section of book.sections || []) {
        const sectionKey = section.key || `${book.id}/${section.id}`;
        result.push({ workspace, entry: section, kind: 'section', key: `${workspace.id}:section:${sectionKey}`, entryId: sectionKey, book, section });
        for (const id of section.scripts || []) {
          const script = workspace.items?.find(item => item.id === id);
          if (!script) continue;
          covered.add(id);
          result.push({ workspace, entry: script, kind: 'script', key: `${workspace.id}:script:${sectionKey}:${id}`, entryId: id, book, section });
        }
      }
    }
    for (const script of workspace.items || []) if (!covered.has(script.id)) result.push({ workspace, entry: script, kind: 'script', key: `${workspace.id}:script:${script.id}`, entryId: script.id });
    return result;
  });
  const active = data.activeRun;
  const busyRun = active && ACTIVE.includes(active.state);
  const narrationToggle = <NarrationToggle enabled={data.narrationEnabled !== false} onChange={enabled => act('narration', () => api.setNarrationEnabled(enabled))} disabled={!!pending || (busyRun && active.mode === 'pptx')} />;
  const filtered = entries.filter(item => {
    const scripts = item.kind === 'script' ? [item.entry] : entryScripts(item);
    const search = [item.entry.title, item.entry.summary, item.book?.title, item.section?.title, ...(item.entry.tags || []), ...(item.kind === 'book' ? item.entry.sections || [] : []).flatMap(section => [section.title, section.summary]), ...scripts.flatMap(script => [script.title, script.summary, ...(script.tags || []), ...(script.requirements?.roles || [])]), item.workspace.name].join(' ').toLocaleLowerCase();
    return (filter === 'all' || item.workspace.id === filter) && search.includes(query.trim().toLocaleLowerCase());
  });
  const current = entries.find(entry => entry.key === selected) || null;
  const bookItem = current?.book ? entries.find(item => item.kind === 'book' && item.workspace.id === current.workspace.id && item.entry.id === current.book.id) : null;
  const sectionItem = bookItem ? entries.find(item => item.kind === 'section' && item.workspace.id === bookItem.workspace.id && item.book.id === bookItem.entry.id && item.entry.id === (current.section?.id || bookItem.entry.sections?.[0]?.id)) : null;
  const profileKey = bookItem?.key || current?.key || '';
  const profile = profileChoice.key === profileKey ? profileChoice.value : bookItem?.entry.defaultProfileId || current?.entry.defaultProfileId || current?.workspace.profiles?.[0]?.id || '';
  const setProfile = value => setProfileChoice({ key: profileKey, value });
  const rootItems = filtered.filter(item => item.kind === 'book' || (item.kind === 'script' && !item.book));
  const showList = () => { setSelected(null); setPage('library'); };
  const openItem = key => { setSelected(key); setPage('library'); };
  const runs = [...(data.runs || [])].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const historyRun = runs.find(run => run.id === selectedRun) || runs[0];
  const needsReview = runs.filter(run => ['unknown', 'failed'].includes(run.cleanup?.status));

  useEffect(() => {
    if (!api) { setLoading(false); return; }
    let mounted = true;
    const receive = value => { if (mounted && value) { setData(value); setLoading(false); } };
    let unsubscribe;
    try { unsubscribe = api.onState(receive); } catch (error) { setNotice({ type: 'error', text: `无法订阅桌面状态：${error.message}` }); }
    api.getState().then(receive).catch(error => { if (mounted) { setNotice({ type: 'error', text: `无法载入项目：${error.message}` }); setLoading(false); } });
    return () => { mounted = false; if (typeof unsubscribe === 'function') unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!api?.setPlaybackSelection) return;
    if (!current) { api.setPlaybackSelection(null).catch(() => {}); return; }
    api.setPlaybackSelection({ workspaceId: current.workspace.id, entryId: current.entryId, kind: current.kind, profileId: profile || current.entry.defaultProfileId || undefined, browser: browserChoice || undefined }).catch(error => setNotice({ type: 'error', text: `无法同步播放选择：${error.message}` }));
  }, [current?.key, current?.entry.defaultProfileId, profile, browserChoice]);

  async function act(name, fn, success) {
    if (pending) return;
    setPending(name);
    try { const result = await fn(); if (success) setNotice({ type: 'success', text: success }); return result; }
    catch (error) { setNotice({ type: 'error', text: error?.message || String(error) }); }
    finally { setPending(''); }
  }
  async function addWorkspace() {
    await act('add', async () => { await api.addWorkspace(); setData(await api.getState()); });
  }
  function removeWorkspace(workspace) {
    if (pending || busyRun) return;
    setNotice(null); setRemoval({ kind: 'workspace', workspaceId: workspace.id, name: workspace.name });
  }
  function removeBook(item) {
    if (pending || busyRun) return;
    setNotice(null); setRemoval({ kind: 'book', workspaceId: item.workspace.id, bookId: item.entry.id, name: item.entry.title, builtin: item.workspace.builtin, workspaceName: item.workspace.name, manifestHash: item.workspace.manifestHash });
  }
  async function confirmRemoval() {
    if (!removal || pending || busyRun) return;
    const target = removal;
    await act(target.kind === 'book' ? 'remove-book' : 'remove-workspace', async () => {
      if (target.kind === 'book') {
        const result = await api.removeBook({ workspaceId: target.workspaceId, bookId: target.bookId, manifestHash: target.manifestHash });
        setData(result.state); setSelected(null); setPage('library');
        setNotice({ type: 'success', text: '已删除 Book“' + target.name + '”。脚本、运行方式和运行记录已保留。', backupPath: result.backupPath });
      } else {
        await api.removeWorkspace(target.workspaceId); setData(await api.getState());
        if (filter === target.workspaceId) setFilter('all');
        if (current?.workspace.id === target.workspaceId) { setSelected(null); setPage('library'); }
        setNotice({ type: 'success', text: '已移出项目“' + target.name + '”，原文件夹中的文件已保留。' });
      }
      setRemoval(null);
    });
  }
  async function refreshWorkspace(workspace) {
    await act('refresh', async () => {
      const next = await api.refreshWorkspace(workspace?.id); setData(next);
      if (filter !== 'all' && !next.workspaces?.some(item => item.id === filter)) setFilter('all');
      if (current) {
        const updated = next.workspaces?.find(item => item.id === current.workspace.id);
        const book = updated?.books?.find(item => item.id === current.book?.id);
        const section = book?.sections?.find(item => item.id === current.section?.id);
        const exists = current.kind === 'book' ? !!book : current.kind === 'section' ? !!section : !!updated?.items?.some(item => item.id === current.entryId) && (!current.book || section?.scripts?.includes(current.entryId));
        if (!exists) setSelected(null);
      }
      setNotice({ type: 'success', text: workspace ? '已从磁盘刷新“' + workspace.name + '”。' : '已从磁盘刷新全部项目。' });
    });
  }
  async function play(item, selectedProfile) {
    setSelected(item.key);
    await act('play', async () => {
      await api.play({ workspaceId: item.workspace.id, entryId: item.entryId, kind: item.kind, profileId: selectedProfile || (current?.key === item.key ? profile : item.entry.defaultProfileId) || undefined, browser: browserChoice || undefined });
      setData(await api.getState()); setPage('run');
    });
  }
  async function exportPptx(item, selectedProfile) {
    await act('export', async () => {
      const result = await api.exportPptx({ workspaceId: item.workspace.id, entryId: item.entryId, kind: item.kind, profileId: selectedProfile || profile || item.entry.defaultProfileId || undefined });
      if (result.canceled) return;
      setData(await api.getState()); setPage('run');
    });
  }
  const openExport = (run, reveal = false) => act('open-export', () => api.openExport({ runId: run.id, reveal }));
  const recoverRun = run => act(`recover:${run.id}`, async () => {
    const result = await api.recoverRun({ runId: run.id });
    setSelectedRun(result.runId || run.id); setData(await api.getState()); setPage('history');
  });
  function copyContext(item, run) {
    const payload = run ? { workspaceId: run.workspaceId, entryId: run.entryId, runId: run.id } : { workspaceId: item.workspace.id, entryId: item.entryId, kind: item.kind };
    return act('copy', () => api.copyContext(payload), '已复制上下文，可粘贴给你的智能体。');
  }
  const names = { library: ['项目', '按 Book、Section 和脚本浏览，选择一个流程或按顺序播放全部。'], run: ['正在播放', '查看当前进度，并在需要时暂停或停止。'], history: ['运行记录', '回看每次播放结果，将反馈交给你的智能体。'], skills: ['Skill 安装', '为你的智能体安装 Playbook 创作、维护与测试转换能力。'] };

  if (!api) return <div className="bridge-missing"><div className="brand-icon"><Icon name="book" size={34} /></div><h1>请在 Playbook 桌面应用中打开</h1><p>此界面需要桌面应用提供本地项目和播放能力。</p><span>当前页面未连接桌面服务</span></div>;
  if (data.embedded?.visible) return <EmbeddedPlayer narrationToggle={narrationToggle} run={active} annotationMode={data.annotationMode} pending={pending} error={notice?.type === 'error' ? notice.text : ''} active={data.embedded.active} onBack={() => act('embedded-back', () => api.showEmbedded(false))} control={command => act(command, () => api.control(command))} onAnnotate={() => act('annotate', () => api.annotate())} />;
  return <div className={`app-shell ${page === 'library' && current ? 'book-open' : ''}`}>
    <aside className="sidebar">
      <div className="traffic-space" />
      <div className="brand"><div className="brand-icon"><Icon name="book" size={24} /></div><div>Playbook<span>the show must go on</span></div></div>
      <nav aria-label="主导航">
        {[
          ['library', 'folder', '项目'], ['run', 'play', '正在播放'], ['history', 'history', '运行记录'], ['skills', 'skill', 'Skill 安装'],
        ].map(([id, icon, label]) => <button key={id} className={`nav-item ${page === id ? 'is-active' : ''}`} aria-label={label} title={label} onClick={() => id === 'library' ? showList() : setPage(id)} aria-current={page === id ? 'page' : undefined}><Icon name={icon} size={19} /><span>{label}</span>{id === 'run' && busyRun && <i className={`live-dot ${active.state === 'paused' ? 'paused' : ''}`} />}</button>)}
      </nav>
      <div className="sidebar-projects"><div className="sidebar-label"><span>项目文件夹</span><button className="icon-button" title="添加项目文件夹" aria-label="添加项目" disabled={!!pending} onClick={addWorkspace}><Icon name="plus" size={17} /></button></div>
        <button className={`project-item ${filter === 'all' && page === 'library' ? 'is-selected' : ''}`} onClick={() => { setFilter('all'); setQuery(''); showList(); }}><Icon name="book" size={17} /><span>全部 Book</span></button>
        <div className="project-scroll" role="tree" aria-label="项目与 Book">{workspaces.map(workspace => <div className="project-folder" role="treeitem" aria-expanded={!collapsedFolders.has(workspace.id)} aria-label={workspace.name} key={workspace.id}>
          <div className={`project-row ${filter === workspace.id && page === 'library' ? 'is-selected' : ''}`}><button className="project-item" aria-label={`打开文件夹 ${workspace.name}`} onClick={() => { setFilter(workspace.id); setQuery(''); showList(); setCollapsedFolders(previous => { const next = new Set(previous); if (next.has(workspace.id)) next.delete(workspace.id); else next.add(workspace.id); return next; }); }} title={workspace.path}><Icon name="arrow" size={11} className={collapsedFolders.has(workspace.id) ? 'folder-chevron' : 'folder-chevron expanded'} /><Icon name="folder" size={15} /><span>{workspace.name}</span>{workspace.error && <span className="project-error" title={workspace.error}>!</span>}</button><button className="remove-project icon-button" title="移出项目（保留原文件）" aria-label={`移出项目 ${workspace.name}`} onClick={() => removeWorkspace(workspace)} disabled={!!pending || busyRun}><Icon name="cross" size={13} /></button></div>
          {!collapsedFolders.has(workspace.id) && <div className="folder-books" role="group">{(workspace.books || []).map(book => { const item = entries.find(entry => entry.workspace.id === workspace.id && entry.kind === 'book' && entry.entryId === book.id); return <button role="treeitem" aria-label={`打开 Book ${book.title}`} aria-selected={bookItem?.key === item?.key && page === 'library'} className={`folder-book ${bookItem?.key === item?.key && page === 'library' ? 'selected' : ''}`} title={book.title} key={book.id} onClick={() => { setFilter(workspace.id); setQuery(''); openItem(item.key); }}><span>{book.title}</span></button>; })}</div>}
        </div>)}</div>
        {!workspaces.length && <p className="sidebar-empty">添加文件夹<br />浏览其中的 Book</p>}
      </div>
      <div className="sidebar-footer"><div className="read-only-mark"><Icon name="shield" size={16} /><span>内容由你的智能体维护</span></div><small className="app-version" aria-label="应用版本">Playbook · v{data.appVersion || '—'}</small></div>
    </aside>

    <main className="main-shell">
      <div className="titlebar-drag">{data.tutorial && <span className={"tutorial-banner" + (data.tutorialLiveSkill ? " live-skill" : "")} role="note">{data.tutorialLiveSkill ? "现在的 Skill 操作为真实安装，请核对位置后自行点击" : "独立练习 · 不修改真实项目、安装目录或运行记录"}</span>}</div>
      <header className={`page-header ${page === 'library' && current ? 'compact-header' : ''}`}><div>{!(page === 'library' && current) && <div className="eyebrow">你的操作手册</div>}<h1>{page === 'library' ? current ? current.workspace.name : 'Book' : names[page][0]}</h1>{!(page === 'library' && current) && <p>{page === 'library' ? '选择一个 Book，开始查看和播放。' : names[page][1]}</p>}</div><div className="header-actions">{narrationToggle}{page === 'library' && <><Button icon="refresh" onClick={() => refreshWorkspace(current?.workspace)} disabled={!!pending}>{pending === 'refresh' ? '正在刷新…' : '从磁盘刷新'}</Button>{bookItem && <Button className="danger-quiet" icon="cross" aria-label={'删除 Book ' + bookItem.entry.title} title="删除此 Book，保留脚本与运行记录" onClick={() => removeBook(bookItem)} disabled={!!pending || busyRun}>删除 Book</Button>}</>}{page === 'library' && (current ? <Button className="back-list" icon="arrow" onClick={showList}>返回 Book 列表</Button> : <Button icon="plus" onClick={addWorkspace} disabled={!!pending}>添加项目</Button>)}{page === 'history' && <span className="header-count">{runs.length} 次运行</span>}{page === 'skills' && <span className="version-pill">随包版本 {data.skill?.version || '—'}</span>}</div></header>
      {data.runtimeWarnings?.length > 0 && <div className="notice notice-error" role="alert">{data.runtimeWarnings.join('；')}</div>}
      {notice && <div className={`notice notice-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}><Icon name={notice.type === 'error' ? 'info' : 'check'} size={18} /><span>{notice.text}{notice.backupPath && <details className="notice-backup"><summary>查看备份位置</summary><code>{notice.backupPath}</code></details>}</span><button className="icon-button" aria-label="关闭提示" onClick={() => setNotice(null)}><Icon name="cross" size={16} /></button></div>}
      {page === 'library' && needsReview.length > 0 && <div className="notice notice-error" role="alert"><Icon name="info" size={18} /><span>有 {needsReview.length} 条资源释放回执需要核对。</span><Button icon="history" onClick={() => { setSelectedRun(needsReview[0].id); setPage('history'); }}>查看待核对记录</Button></div>}
      {loading ? <div className="loading-state"><span className="spinner" />正在载入项目…</div> : <>
      {page === 'library' && (current ? <section className="book-detail-page" aria-label="Book 内容">
        {bookItem ? <BookView item={bookItem} sectionItem={sectionItem} scriptItem={current.kind === 'script' ? current : null} entries={entries} onSelect={openItem} onPlay={play} onExport={exportPptx} profile={profile} setProfile={setProfile} browserChoice={browserChoice} setBrowserChoice={setBrowserChoice} pending={pending} busyRun={busyRun} shortcut={data.playbackShortcut} onCopy={copyContext} onReveal={item => act('reveal', () => api.reveal({ workspaceId: item.workspace.id, entryId: item.entryId, kind: item.kind }))} /> : <EntryDetail item={current} profile={profile} setProfile={setProfile} browserChoice={browserChoice} setBrowserChoice={setBrowserChoice} onPlay={() => play(current)} onExport={() => exportPptx(current)} onSelect={openItem} entries={entries} shortcut={data.playbackShortcut} pending={pending} busyRun={busyRun} onCopy={() => copyContext(current)} onReveal={() => act('reveal', () => api.reveal({ workspaceId: current.workspace.id, entryId: current.entryId, kind: current.kind }))} />}
      </section> : <>
        <section className="library-toolbar"><label className="search-box"><Icon name="search" size={18} /><input aria-label="搜索 Book、Section、脚本、标签或角色" placeholder="搜索 Book、Section、脚本…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button className="icon-button" aria-label="清除搜索" onClick={() => setQuery('')}><Icon name="cross" size={14} /></button>}</label><select className="project-select" aria-label="筛选项目" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">全部项目</option>{workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></section>
        <section className="book-library" aria-label="Book 列表"><div className="book-cards">{rootItems.map(item => item.kind === 'book' ? <article className="book-list-card" key={item.key}><button className="book-card-open" aria-label={`查看 Book ${item.entry.title}`} onClick={() => openItem(item.key)}><span className="book-cover"><Icon name="book" size={29} /></span><span className="book-card-copy"><small>{item.entry.sections.length} 个 Section · {entryScripts(item).length} 个脚本</small><strong>{item.entry.title}</strong><span>{item.entry.summary || '查看内容与播放顺序'}</span></span><Icon name="arrow" size={18} /></button><button className="book-card-play" aria-label={`播放整个 Book ${item.entry.title}`} disabled={!!pending || busyRun} onClick={() => play(item)}><Icon name="play" size={13} />播放全部</button><button className="book-card-delete" aria-label={'删除 Book ' + item.entry.title} title="删除此 Book，保留脚本与运行记录" onClick={() => removeBook(item)} disabled={!!pending || busyRun}><Icon name="cross" size={13} />删除 Book</button></article> : <ScriptCard key={item.key} item={item} selected={false} onSelect={() => openItem(item.key)} />)}</div>
          {!rootItems.length && <Empty title={entries.length ? '没有匹配的内容' : '文件夹里还没有 Book'}>{entries.length ? '试试其他关键词，或切换左侧文件夹。' : '使用你的智能体维护文件夹中的 Book，回到这里查看。'}</Empty>}
          {workspaces.filter(workspace => (filter === 'all' || workspace.id === filter) && workspace.error).map(workspace => <div className="inline-error" key={workspace.id}><Icon name="info" size={18} /><div><strong>{workspace.name} 暂时无法读取</strong><p>{workspace.error}</p></div></div>)}
        </section>
      </>)}
      {page === 'run' && <div className="run-page">{active ? <RunDetail run={active} annotationMode={data.annotationMode} onAnnotate={() => act('annotate', () => api.annotate())} onCopyAnnotation={annotation => act('copy-annotation', () => api.copyAnnotation({ runId: active.id, annotationId: annotation.id }), '已复制批注，可粘贴给智能体。')} onDeleteAnnotation={annotation => act('delete-annotation', () => api.deleteAnnotation({ runId: active.id, annotationId: annotation.id }), '批注已删除。')} onShowEmbedded={data.embedded?.active ? () => act('embedded-show', () => api.showEmbedded(true)) : undefined} entries={entries} onCopy={() => copyContext(null, active)} pending={pending} busyRun={busyRun} onRecover={() => recoverRun(active)} control={command => act(command, () => api.control(command))} onOpenExport={reveal => openExport(active, reveal)} onHistory={() => { setSelectedRun(active.id); setPage('history'); }} onReplay={() => act('replay', async () => { await api.play({ workspaceId: active.workspaceId, entryId: active.entryId, kind: active.kind, profileId: active.profileId, browser: browserChoice || undefined }); setData(await api.getState()); })} /> : <Empty icon="play" title="准备好，就开始播放">从项目选择一个 Book、Section 或脚本，按既定步骤执行。</Empty>}{!active && <div className="empty-action"><Button className="primary" icon="library" onClick={() => setPage('library')}>前往项目</Button></div>}</div>}
      {page === 'history' && <div className="history-split"><section className="history-list">{runs.map(run => <button className={`history-card ${historyRun?.id === run.id ? 'selected' : ''}`} key={run.id} onClick={() => setSelectedRun(run.id)} aria-label={`查看运行记录 ${run.title}`}><div className={`run-result-icon ${run.state}`}><Icon name={run.state === 'completed' ? 'check' : run.state === 'failed' ? 'info' : ACTIVE.includes(run.state) ? 'play' : 'stop'} size={18} /></div><div><h3>{run.title}</h3><p>{date(run.startedAt)}<span>·</span>{run.profileName || '默认运行方式'}</p><Status state={run.state} /></div><Icon name="arrow" className="card-chevron" size={16} /></button>)}{!runs.length && <Empty icon="history" title="还没有运行记录">完成一次播放后，结果和反馈会保存在这里。</Empty>}</section><section className="history-detail">{historyRun ? <RunDetail compact run={historyRun} onCopyAnnotation={annotation => act('copy-annotation', () => api.copyAnnotation({ runId: historyRun.id, annotationId: annotation.id }), '已复制批注，可粘贴给智能体。')} onDeleteAnnotation={annotation => act('delete-annotation', () => api.deleteAnnotation({ runId: historyRun.id, annotationId: annotation.id }), '批注已删除。')} onOpenExport={reveal => openExport(historyRun, reveal)} entries={entries} pending={pending} busyRun={busyRun} onRecover={() => recoverRun(historyRun)} onCopy={() => copyContext(null, historyRun)} /> : <div className="history-empty"><Icon name="history" size={42} /><p>每一次运行，都有记录</p></div>}</section></div>}
      {page === 'skills' && <SkillPage key={data.tutorialLiveSkill ? 'live-skill' : 'practice-skill'} api={api} data={data} onRefresh={async () => setData(await api.getState())} notify={setNotice} />}
      </>}
    </main>
    {removal && <RemovalDialog target={removal} pending={!!pending} blocked={!!busyRun} error={notice?.type === 'error' ? notice.text : ''} onCancel={() => setRemoval(null)} onConfirm={confirmRemoval} />}
  </div>;
}


function RemovalDialog({ target, pending, blocked, error, onCancel, onConfirm }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement, dialog = dialogRef.current;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
      else document.querySelector('.header-actions button')?.focus();
    };
  }, []);
  const book = target.kind === 'book';
  function trapTab(event) {
    if (event.key !== 'Tab') return;
    const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
    const first = buttons[0], last = buttons.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <dialog className="removal-dialog" ref={dialogRef} onKeyDown={trapTab} aria-labelledby="removal-title" aria-describedby="removal-impact" onCancel={event => { event.preventDefault(); if (!pending) onCancel(); }}>
    <div className="removal-icon"><Icon name={book ? 'book' : 'folder'} size={24} /></div>
    <h2 id="removal-title">{book ? '删除 Book' : '移出项目'}</h2>
    <p className="removal-target">{target.name}</p>{book && <small className="removal-project">{target.workspaceName}</small>}
    <p id="removal-impact">{book ? target.builtin ? '此 Book 会从 Playbook 中删除，删除状态保存在本机。随包文件和运行记录会保留，设置会先备份。' : '此 Book 及其章节编排将从项目中删除。脚本、运行方式和运行记录会保留，原清单会先备份。' : '仅将这个项目移出 Playbook。原文件夹和其中的文件会保留，之后可通过“添加项目”重新加入。'}</p>
    {blocked && <p className="removal-warning" role="status">请先结束当前播放，再执行此操作。</p>}
    {error && <p className="removal-error" role="alert">{error}</p>}
    <div className="removal-actions"><Button onClick={onCancel} disabled={pending} autoFocus>取消</Button><Button className="danger" onClick={onConfirm} disabled={pending || blocked}>{pending ? '正在处理…' : book ? '删除 Book' : '移出项目'}</Button></div>
  </dialog>;
}

function BrowserChoice({ value, onChange, disabled }) {
  if (window.playbookDsh) return <span className="browser-choice" aria-label="播放位置">DSH 页签内播放</span>;
  return <select className="browser-choice" aria-label="播放位置" value={value || ''} onChange={event => onChange(event.target.value)} disabled={disabled}><option value="">自动 · 按脚本设置</option><option value="embedded">内置浏览器</option><option value="external">外部浏览器</option></select>;
}

function interactionOutcome(outcome) {
  return ({ 'timed-out': '倒计时结束，未确认操作', continued: '用户选择继续播放', continue: '用户选择继续播放', resumed: '用户选择继续播放', timeout: '倒计时结束，未确认操作', timedout: '倒计时结束，未确认操作', timedOut: '倒计时结束，未确认操作', stopped: '等待已中断', cancelled: '等待已中断', canceled: '等待已中断' })[outcome] || '等待已结束，请核对实际操作';
}

function InteractionPrompt({ interaction = {}, compact = false }) {
  interaction ||= {};
  const timing = interaction.remainingMs == null ? '完成后请点继续播放' : interaction.paused ? '倒计时已暂停' : Math.ceil(Math.max(0, interaction.remainingMs) / 1000) + ' 秒后继续';
  return <div className={'interaction-prompt' + (compact ? ' compact' : '')} role="status"><strong>交给你操作</strong><p>{interaction.prompt || '你可以先操作当前页面，再继续演示。'}</p><small>{interaction.busy ? '正在选择文件或安装，请等待操作结束后再继续' : timing}</small></div>;
}

function EmbeddedPlayer({ run, active, pending, error, onBack, control, onAnnotate, annotationMode, narrationToggle }) {
  const waiting = run?.state === 'waiting';
  const paused = ['paused', 'pausing'].includes(run?.state);
  const releasing = ['cleaning', 'recovering'].includes(run?.state);
  const canControl = ['playing', 'paused', 'waiting'].includes(run?.state);
  const caption = error || (waiting ? run.interaction?.prompt : run?.state === 'cleaning' ? '正在释放资源，结束后保存回执' : run?.state === 'recovering' ? '正在恢复资源释放' : run?.stepTitle) || '正在准备演示…';
  return <main className="embedded-player" aria-label="内置演示播放器">
    <div className="embedded-titlebar"><span><PlaybookMark size={14} />Playbook · the show must go on</span></div>
    <header className={'embedded-toolbar' + (waiting ? ' is-waiting' : '')}>
      <button className="embedded-back" onClick={onBack} disabled={!!pending} aria-label="返回项目"><Icon name="arrow" size={14} />返回项目</button>
      <div className="embedded-heading"><small>{run?.title || '内置演示'} · {run?.completed || 0} / {run?.total || 0}</small><strong>{waiting ? '交给你操作' : RUN_LABELS[run?.state] || '内置播放'}</strong></div>
      <div className="embedded-caption" aria-live="polite"><p title={caption}>{caption}</p>{waiting && <small>{run.interaction?.busy ? '正在选择文件或安装，请等待操作结束' : run.interaction?.remainingMs == null ? '完成后请点继续播放' : run.interaction?.paused ? '倒计时已暂停' : Math.ceil(Math.max(0, run.interaction.remainingMs) / 1000) + ' 秒后继续'}</small>}</div>
      <div className="embedded-controls">{narrationToggle}<Button className="primary" icon={waiting || paused ? 'play' : 'pause'} onClick={() => control(waiting || paused ? 'resume' : 'pause')} disabled={!!pending || !canControl || (waiting && run.interaction?.busy)}>{waiting || paused ? '继续播放' : '暂停播放'}</Button>{run?.state === 'paused' && <Button icon="annotation" onClick={onAnnotate} disabled={!!pending}>{annotationMode ? '退出批注' : '添加批注'}</Button>}{waiting && run.interaction?.remainingMs != null && <Button icon="pause" onClick={() => control('pause')} disabled={!!pending || run.interaction?.paused}>{run.interaction?.paused ? '倒计时已暂停' : '暂停倒计时'}</Button>}<Button icon="stop" onClick={() => control('stop')} disabled={!!pending || !run || !ACTIVE.includes(run.state) || run.state === 'stopping' || run.stopRequested}>{run?.stopRequested ? '已请求停止' : releasing ? '请求停止' : '停止'}</Button></div>
    </header>
    <div className="embedded-page-space">{window.playbookDsh && active && <BrowserStream interactive={waiting || paused} />}{!active && <div className="embedded-finished"><Icon name="book" size={36} /><h2>{run?.state === 'completed' ? '演示已完成' : '内置页面已关闭'}</h2><p>返回项目查看运行结果或开始下一次播放。</p><Button onClick={onBack}>返回项目</Button></div>}</div>
  </main>;
}

function BrowserStream({ interactive }) {
  const [frameUrl, setFrameUrl] = useState('');
  const lastMove = useRef(0);
  useEffect(() => {
    let mounted = true;
    const update = () => { if (mounted) setFrameUrl(window.playbookDsh.frameUrl()); };
    update();
    const timer = setInterval(update, 180);
    return () => { mounted = false; clearInterval(timer); };
  }, []);
  const point = event => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1440, (event.clientX - box.left) / box.width * 1440)), y: Math.max(0, Math.min(900, (event.clientY - box.top) / box.height * 900)) };
  };
  const send = value => { void window.playbookDsh.input(value).catch(() => {}); };
  const pointer = (type, event) => {
    if (!interactive) return;
    if (type === 'move' && Date.now() - lastMove.current < 45) return;
    if (type === 'move') lastMove.current = Date.now();
    if (type === 'down') event.currentTarget.focus();
    send({ type, ...point(event), button: ['left', 'middle', 'right'][event.button] || 'left' });
  };
  const key = event => {
    if (!interactive || event.isComposing) return;
    const named = { ' ': 'Space', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown' };
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) send({ type: 'text', text: event.key });
    else if (/^(Enter|Tab|Escape|Backspace|Delete|Home|End|PageUp|PageDown|ArrowLeft|ArrowRight|ArrowUp|ArrowDown)$/.test(event.key)) send({ type: 'key', key: named[event.key] || event.key });
    else return;
    event.preventDefault();
  };
  return <div className="dsh-browser-stage"><div className="dsh-browser-screen" tabIndex={interactive ? 0 : -1} role="application" aria-label="Playbook 受控页面" onPointerMove={event => pointer('move', event)} onPointerDown={event => pointer('down', event)} onPointerUp={event => pointer('up', event)} onWheel={event => interactive && send({ type: 'wheel', ...point(event), deltaX: event.deltaX, deltaY: event.deltaY })} onKeyDown={key} onCompositionEnd={event => interactive && send({ type: 'text', text: event.data })} onContextMenu={event => event.preventDefault()}><img src={frameUrl} draggable="false" alt="演示页面实时画面" /></div>{interactive && <div className="dsh-browser-hint">可在画面中操作当前页面</div>}</div>;
}

function ExportButton({ label, ...props }) {
  return <Button icon="external" aria-label={`回放并导出 ${label} PPTX`} {...props}>导出 PPTX</Button>;
}

function BookView({ item, sectionItem, scriptItem, entries, onSelect, onPlay, onExport, profile, setProfile, browserChoice, setBrowserChoice, pending, busyRun, shortcut, onCopy, onReveal }) {
  const sections = entries.filter(entry => entry.kind === 'section' && entry.workspace.id === item.workspace.id && entry.book.id === item.entry.id);
  const scripts = entries.filter(entry => entry.kind === 'script' && entry.workspace.id === item.workspace.id && entry.book?.id === item.entry.id && entry.section?.id === sectionItem?.entry.id);
  const [focusedTab, setFocusedTab] = useState(null);
  const activeIndex = sections.findIndex(entry => entry.key === sectionItem?.key);
  function tabKey(event, index) {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % sections.length;
    else if (event.key === 'ArrowLeft') next = (index + sections.length - 1) % sections.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = sections.length - 1;
    else return;
    event.preventDefault(); onSelect(sections[next].key); setFocusedTab(sections[next].key);
  }
  useEffect(() => {
    if (focusedTab) document.getElementById(`section-tab-${encodeURIComponent(focusedTab)}`)?.focus();
  }, [focusedTab]);
  return <>
    <div className="book-overview"><div className="book-overview-copy"><span className="entry-kind">Book</span><h2>{item.entry.title}</h2>{item.entry.summary && <p>{item.entry.summary}</p>}</div><div className="book-overview-actions"><label htmlFor="book-profile">运行方式</label><select id="book-profile" value={profile} onChange={event => setProfile(event.target.value)} disabled={!!pending || busyRun}>{item.workspace.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.title}</option>)}</select><BrowserChoice value={browserChoice} onChange={setBrowserChoice} disabled={!!pending || busyRun} /><Button className="primary" icon="play" aria-label={`播放整个 Book ${item.entry.title}`} onClick={() => onPlay(item, profile)} disabled={!!pending || busyRun}>播放全部</Button><ExportButton label="Book" onClick={() => onExport(item, profile)} disabled={!!pending || busyRun} /><button className="icon-button" aria-label="在文件夹中显示 Book" title="在文件夹中显示" onClick={() => onReveal(item)}><Icon name="external" size={17} /></button></div></div>
    <p className="export-hint">导出会重新执行所选流程，按讲解节奏自动换页，并嵌入语音和演讲者备注。</p>
    <div className="section-tabs" role="tablist" aria-label="Book Sections">{sections.map((section, index) => <button role="tab" key={section.key} id={`section-tab-${encodeURIComponent(section.key)}`} aria-controls="book-section-panel" aria-selected={index === activeIndex} tabIndex={index === activeIndex ? 0 : -1} onClick={() => onSelect(section.key)} onKeyDown={event => tabKey(event, index)}>{section.entry.title}</button>)}</div>
    <section className="section-panel" id="book-section-panel" role="tabpanel" aria-labelledby={sectionItem ? `section-tab-${encodeURIComponent(sectionItem.key)}` : undefined}>
      {scriptItem ? <><div className="script-breadcrumb"><button onClick={() => onSelect(sectionItem.key)}><Icon name="arrow" size={12} />{sectionItem.entry.title}</button><span>/</span><span>{scriptItem.entry.title}</span></div><EntryDetail embedded item={scriptItem} profile={profile} setProfile={setProfile} browserChoice={browserChoice} setBrowserChoice={setBrowserChoice} onPlay={() => onPlay(scriptItem, profile)} onExport={() => onExport(scriptItem, profile)} onSelect={onSelect} entries={entries} pending={pending} busyRun={busyRun} onCopy={() => onCopy(scriptItem)} onReveal={() => onReveal(scriptItem)} /></> : <>
        <div className="section-overview"><div><h3>{sectionItem?.entry.title}</h3>{sectionItem?.entry.summary && <p>{sectionItem.entry.summary}</p>}<span>{scripts.length} 个脚本 · {sectionItem ? entrySteps(sectionItem).length : 0} 步</span></div><div className="export-actions"><ExportButton label="Section" onClick={() => onExport(sectionItem, profile)} disabled={!!pending || busyRun || !sectionItem} /><Button icon="play" aria-label={`播放整个 Section ${sectionItem?.entry.title}`} onClick={() => onPlay(sectionItem, profile)} disabled={!!pending || busyRun || !sectionItem}>播放本节</Button></div></div>
        <div className="section-script-list" aria-label="本节脚本">{scripts.map((script, index) => <article className="section-script-row" key={script.key}><span className="script-order">{String(index + 1).padStart(2, '0')}</span><button className="script-open" aria-label={`查看脚本 ${script.entry.title}`} onClick={() => onSelect(script.key)}><strong>{script.entry.title}</strong><p>{script.entry.summary}</p><small>{script.entry.steps.length} 步</small></button><Button icon="play" aria-label={`播放脚本 ${script.entry.title}`} onClick={() => onPlay(script, profile)} disabled={!!pending || busyRun || script.entry.valid === false}>播放</Button><button className="icon-button" aria-label={`查看步骤 ${script.entry.title}`} title="查看步骤" onClick={() => onSelect(script.key)}><Icon name="arrow" size={14} /></button></article>)}</div>
      </>}
      <div className="book-view-footer"><Button className="quiet" icon="copy" onClick={() => onCopy(item)}>复制 Book 修改上下文</Button>{shortcut && <span><kbd>{shortcut.label}</kbd> 全局播放 / 暂停</span>}</div>
    </section>
  </>;
}

function entryScripts(item) {
  const ids = item.kind === 'book' ? (item.entry.sections || []).flatMap(section => section.scripts || []) : item.entry.scripts || [];
  return ids.map(id => item.workspace.items?.find(script => script.id === id)).filter(Boolean);
}
function entrySteps(item) {
  if (!item) return [];
  if (item.kind === 'script') return item.entry.steps || [];
  const sections = item.kind === 'book' ? item.entry.sections || [] : [item.entry];
  return sections.flatMap(section => (section.scripts || []).flatMap(id => {
    const script = item.workspace.items?.find(script => script.id === id);
    return (script?.steps || []).map(step => ({ ...step, scriptTitle: script.title, sectionTitle: section.title }));
  }));
}
function ScriptCard({ item, selected, onSelect }) {
  return <button className={`entry-card ${selected ? 'selected' : ''}`} aria-label={`查看脚本 ${item.entry.title}`} aria-pressed={selected} onClick={onSelect}><div className="entry-icon script"><Icon name="script" size={20} /></div><div className="entry-card-body"><div className="entry-card-meta">{item.entry.steps?.length || 0} 个步骤</div><h3>{item.entry.title}</h3><p>{item.entry.summary || '暂无内容说明'}</p>{((item.entry.tags || []).length > 0 || item.entry.valid === false) && <div className="tag-row">{(item.entry.tags || []).slice(0, 3).map(tag => <span className="tag" key={tag}>{tag}</span>)}{item.entry.valid === false && <span className="tag tag-error">需要修复</span>}</div>}</div><Icon className="card-chevron" name="arrow" size={15} /></button>;
}
function EntryDetail({ item, profile, setProfile, browserChoice, setBrowserChoice, onPlay, onExport, onSelect, entries, shortcut, pending, busyRun, onCopy, onReveal, embedded = false }) {
  const { entry, workspace, kind } = item;
  const profiles = workspace.profiles || [];
  const scripts = kind === 'script' ? [entry] : entryScripts(item);
  const steps = entrySteps(item);
  const requirements = entry.requirements || {};
  const children = entries.filter(child => child.workspace.id === workspace.id && (kind === 'book' ? child.kind === 'section' && child.book.id === entry.id : kind === 'section' ? child.kind === 'script' && child.book?.id === item.book?.id && child.section?.id === entry.id : false));
  return <><div className="detail-heading"><span className={`entry-kind ${kind}`}><Icon name={kind === 'book' ? 'book' : kind === 'section' ? 'library' : 'script'} size={15} />{kind === 'book' ? 'Book' : kind === 'section' ? 'Section' : '操作脚本'}</span><button className="icon-button" title="在文件夹中显示" aria-label="在文件夹中显示" onClick={onReveal} disabled={!!pending}><Icon name="external" size={17} /></button></div><div className="detail-intro"><h2>{entry.title}</h2><p>{entry.summary || '暂无内容说明'}</p><div className="detail-project"><Icon name="folder" size={14} />{workspace.name}{kind !== 'book' && item.book && <><Icon name="arrow" size={10} /><span>{item.book.title}</span></>}{kind === 'script' && item.section && <><Icon name="arrow" size={10} /><span>{item.section.title}</span></>}</div></div>
    <div className="play-setup">{!embedded && <><label htmlFor="run-profile">运行方式</label><select id="run-profile" value={profile} onChange={event => setProfile(event.target.value)} disabled={!!pending || busyRun}>{profiles.length ? profiles.map(item => <option key={item.id} value={item.id}>{item.title}</option>) : <option value="">默认方式</option>}</select><BrowserChoice value={browserChoice} onChange={setBrowserChoice} disabled={!!pending || busyRun} /></>}<Button icon="play" className="primary play-button" aria-label={kind === 'book' ? `播放全部 Book ${entry.title}` : kind === 'section' ? `播放全部 Section ${entry.title}` : '播放脚本'} onClick={onPlay} disabled={!!pending || busyRun || entry.valid === false}>{pending === 'play' ? '正在准备…' : kind === 'script' ? '播放脚本' : '播放全部'}</Button><ExportButton label="脚本" onClick={onExport} disabled={!!pending || busyRun || entry.valid === false} />{!embedded && <p className="export-hint">导出会重新执行流程，嵌入语音并按讲解节奏自动换页；讲解文字写入演讲者备注。</p>}{kind !== 'script' && <p className="field-hint">按既定顺序播放 {scripts.length} 个脚本，共 {steps.length} 步。</p>}{shortcut && <div className={`shortcut-hint ${shortcut.registered ? '' : 'unavailable'}`}><kbd>{shortcut.label || shortcut.accelerator}</kbd><span>{shortcut.registered ? '全局播放 / 暂停' : '全局快捷键暂不可用'}</span></div>}{busyRun && <p className="field-hint">当前播放结束后，可以开始下一次。</p>}{entry.valid === false && <p className="field-error">{entry.error || '此条目暂时无法播放，请交给智能体修复。'}</p>}</div>
    {kind === 'script' && <div className="requirements"><div><span>数据环境</span><strong>{DATA_LABELS[requirements.dataMode] || display(requirements.dataMode)}</strong></div><div><span>操作影响</span><strong>{EFFECT_LABELS[requirements.effects] || display(requirements.effects)}</strong></div><div><span>重复播放</span><strong>{REPLAY_LABELS[requirements.replay] || display(requirements.replay)}</strong></div>{requirements.roles?.length > 0 && <div><span>使用角色</span><strong>{display(requirements.roles)}</strong></div>}<div><span>语音讲解</span><strong>{entry.narration?.enabled === false ? '按脚本设置' : '跟随客户端开关'}</strong></div>{entry.redactions?.length > 0 && <div><span>画面打码</span><strong>{entry.redactions.length} 组区域</strong></div>}</div>}
    {children.length > 0 && <section className="composition-section"><div className="section-label"><h3>{kind === 'book' ? 'Section 顺序' : '脚本顺序'}</h3><span>{children.length} 个{kind === 'book' ? ' Section' : '脚本'}</span></div><ol className="composition-list">{children.map((child, index) => <li key={child.key}><button onClick={() => onSelect(child.key)} aria-label={`打开${child.kind === 'section' ? ' Section' : '脚本'} ${child.entry.title}`}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{child.entry.title}</strong><small>{child.kind === 'section' ? `${child.entry.scripts?.length || 0} 个脚本` : `${child.entry.steps?.length || 0} 步`}</small></div><Icon name="arrow" size={13} /></button></li>)}</ol></section>}
    <section className="steps-section"><div className="section-label"><h3>{kind === 'script' ? '操作步骤' : '全部步骤'}</h3><span>{steps.length} 步</span></div><ol className="step-list">{steps.map((step, index) => <li key={`${step.id}-${index}`}><span className="step-number">{String(index + 1).padStart(2, '0')}</span><div>{step.scriptTitle && <small>{kind === 'book' && step.sectionTitle ? `${step.sectionTitle} · ` : ''}{step.scriptTitle}</small>}<h4>{step.title}</h4>{step.explain && <p>{step.explain}</p>}</div></li>)}</ol>{!steps.length && <p className="muted small">暂无可展示的步骤。</p>}</section>
    <div className="detail-footer"><Button className="quiet" icon="copy" onClick={onCopy} disabled={!!pending}>复制给智能体的修改上下文</Button></div></>;
}

function RunDetail({ run, entries, onCopy, pending, control, compact, onHistory, onReplay, onOpenExport, onRecover, busyRun, onShowEmbedded, onAnnotate, annotationMode, onCopyAnnotation, onDeleteAnnotation }) {
  const item = entries.find(item => item.workspace.id === run.workspaceId && item.entryId === run.entryId && item.kind === run.kind);
  const legacyWorkspace = entries.find(item => item.workspace.id === run.workspaceId)?.workspace;
  const legacyDemo = run.kind === 'demo' ? legacyWorkspace?.demos?.find(demo => demo.id === run.entryId) : null;
  const steps = run.steps || (legacyDemo ? (legacyDemo.scripts || []).flatMap(id => legacyWorkspace.items.find(script => script.id === id)?.steps || []) : entrySteps(item));
  const total = run.total || steps.length;
  const count = run.state === 'completed' ? total : Math.min(total, Number(run.completed) || 0);
  const percent = total ? Math.round(count / total * 100) : run.state === 'completed' ? 100 : 0;
  const releasing = ['cleaning', 'recovering'].includes(run.state);
  const executionError = run.executionError || ((!run.executionStatus || run.executionStatus === 'unknown') ? run.error : null);
  const summary = run.state === 'waiting' ? '交给你操作，自动演示正在等待' : releasing ? run.state === 'recovering' ? '正在恢复资源释放，结束后保存回执' : '正在释放资源，结束后保存回执' : run.state === 'completed' ? run.exported ? 'PPTX 已导出' : '全部步骤已完成' : run.state === 'failed' ? '本次播放未完成' : run.state === 'stopping' ? '已请求停止，等待执行结束和资源释放' : run.state === 'stopped' ? '后续操作已停止，资源回执见下方' : run.stepTitle || (run.state === 'preparing' ? '正在准备运行环境' : '等待下一步');
  return <div className={`run-detail ${compact ? 'compact' : ''}`}><div className="run-title-row"><div><span className="entry-kind"><Icon name={run.kind === 'book' ? 'book' : run.kind === 'section' ? 'library' : 'script'} size={15} />{run.mode === 'pptx' ? 'PPTX 导出' : run.kind === 'book' ? 'Book 播放' : run.kind === 'section' ? 'Section 播放' : run.kind === 'demo' ? '批量播放' : '脚本播放'}</span><h2>{run.title}</h2><p>{item?.workspace.name || '项目'}<span>·</span>{run.profileName || '默认运行方式'}</p></div><Status state={run.state} /></div>
    <div className="run-progress"><div><strong>{summary}</strong><span>{count} / {total} 步</span></div><div className="progress-track" role="progressbar" aria-label="播放进度" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${percent}%` }} /></div>{!compact && control && <div className="run-controls">{run.state === 'waiting' ? <><Button icon="play" className="primary" onClick={() => control('resume')} disabled={!!pending || run.interaction?.busy}>继续播放</Button>{run.interaction?.remainingMs != null && <Button icon="pause" onClick={() => control('pause')} disabled={!!pending || run.interaction?.paused}>{run.interaction?.paused ? '倒计时已暂停' : '暂停倒计时'}</Button>}</> : run.state === 'paused' ? <Button icon="play" className="primary" onClick={() => control('resume')} disabled={!!pending}>继续播放</Button> : <Button icon="pause" className="primary" onClick={() => control('pause')} disabled={!!pending || run.state !== 'playing'}>{run.state === 'pausing' ? '正在暂停…' : '暂停播放'}</Button>}{run.state === 'paused' && onAnnotate && <Button icon="annotation" onClick={onAnnotate} disabled={!!pending}>{annotationMode ? '退出批注' : '添加批注'}</Button>}<Button icon="stop" onClick={() => control('stop')} disabled={!!pending || !ACTIVE.includes(run.state) || run.state === 'stopping' || run.stopRequested}>{run.stopRequested || run.state === 'stopping' ? '已请求停止' : releasing ? '请求停止播放' : '停止播放'}</Button>{onShowEmbedded && <Button icon="book" onClick={onShowEmbedded} disabled={!!pending}>查看内置演示</Button>}{!ACTIVE.includes(run.state) && onReplay && <Button icon="play" onClick={onReplay} disabled={!!pending || busyRun}>从头再播</Button>}{!ACTIVE.includes(run.state) && <Button className="quiet" icon="history" onClick={onHistory}>查看运行记录</Button>}</div>}</div>
    {run.state === 'waiting' && <InteractionPrompt interaction={run.interaction} />}
    {run.exported?.path && run.state === 'completed' && <div className="export-result" role="status"><div><strong>PPTX 已保存 · {run.exported.slides} 页</strong><p>{Math.round(run.exported.durationMs / 1000)} 秒 · {run.exported.audioSlides} 页语音 · 含演讲者备注</p><small>{run.exported.path}</small></div><div className="export-actions"><Button icon="external" onClick={() => onOpenExport(false)} disabled={!!pending}>打开 PPTX</Button><Button icon="folder" onClick={() => onOpenExport(true)} disabled={!!pending}>在文件夹中显示</Button></div></div>}
    {run.sourceChanged && <div className="run-callout"><Icon name="info" size={18} /><p>源文件已更新，本次继续使用启动时的内容。更改将在下一次播放生效。</p></div>}
    {executionError && <RunError title="执行遇到问题" error={executionError} />}
    <CleanupStatus run={run} pending={pending} busyRun={busyRun} onRecover={onRecover} />
    {!!run.annotations?.length && <section className="run-annotations"><div className="section-label"><h3>页面批注</h3><span>{run.annotations.length} 条</span></div><ol>{run.annotations.map(annotation => <li key={annotation.id}><div><strong>{annotation.playbook?.stepTitle || `第 ${annotation.playbook?.index || '?'} 步`}</strong><p>{annotation.body}</p><small>{annotation.page?.title || annotation.page?.url} · {annotation.element?.selector}</small></div><div className="annotation-actions"><Button icon="copy" onClick={() => onCopyAnnotation?.(annotation)} disabled={!!pending || !onCopyAnnotation}>复制给智能体</Button><Button className="danger-quiet" aria-label={`删除批注：${annotation.body.slice(0, 40)}`} onClick={() => onDeleteAnnotation?.(annotation)} disabled={!!pending || !onDeleteAnnotation}>删除批注</Button></div></li>)}</ol></section>}
    {run.recoveryError && <RunError title="恢复释放遇到问题" error={run.recoveryError} />}
    {run.lateErrors?.length > 0 && <RunError title="退出后收到的错误" error={run.lateErrors.join('\n')} />}
    <div className="run-meta"><div><span>开始时间</span><strong>{date(run.startedAt, true)}</strong></div><div><span>{run.finishedAt ? '运行耗时' : '运行状态'}</span><strong>{run.finishedAt ? duration(run) : RUN_LABELS[run.state]}</strong></div>{run.finishedAt && <div><span>结束时间</span><strong>{date(run.finishedAt, true)}</strong></div>}</div>
    <section className="run-steps"><div className="section-label"><h3>步骤进度</h3><span>{total} 个步骤</span></div><ol>{steps.map((step, index) => { const done = run.state === 'completed' || index < count; const current = !done && (run.index > 0 ? index + 1 === run.index : step.id === run.stepId); return <li key={`${step.id}-${index}`} className={`${done ? 'done' : ''} ${current ? 'current' : ''}`}><span className="run-step-icon">{done ? <Icon name="check" size={15} /> : current && run.state === 'playing' ? <span className="tiny-pulse" /> : index + 1}</span><div>{step.sectionTitle && <div className="run-step-section">{step.sectionTitle}{step.scriptTitle ? ` · ${step.scriptTitle}` : ''}</div>}<h4>{step.title}</h4>{step.explain && <p>{step.explain}</p>}</div><small>{done ? '已完成' : current ? RUN_LABELS[run.state] : '待执行'}</small></li>; })}</ol>{!steps.length && <p className="muted small">此条目的原始内容暂不可用，运行结果仍保留在记录中。</p>}</section>
    {run.manualInteractions?.length > 0 && <section className="interaction-records" aria-label="手动操作记录"><div className="section-label"><h3>手动操作记录</h3><span>仅记录等待的结束方式</span></div><ol>{run.manualInteractions.map((record, index) => <li key={(record.stepId || '') + '-' + index}><strong>{record.prompt || steps.find(step => step.id === record.stepId && (!step.flowId || step.flowId === record.flowId))?.title || '手动操作'}</strong><span>{interactionOutcome(record.outcome)}</span>{record.finishedAt && <small>{date(record.finishedAt)}</small>}</li>)}</ol><p>继续播放或倒计时结束不代表操作已成功；实际操作结果请核对页面或安装回执。</p></section>}
    <div className="run-bottom"><Button icon="copy" onClick={onCopy} disabled={!!pending}>复制给智能体的{run.state === 'failed' ? '错误' : '运行'}上下文</Button><span>复制后，粘贴到你使用的智能体中。</span></div></div>;
}


function RunError({ title, error }) {
  return <div className="run-error" role="alert"><Icon name="info" size={20} /><div><h3>{title}</h3><p>{typeof error === 'string' ? error : error.message || display(error)}</p><span>复制运行上下文，交给你的智能体定位和核对。</span></div></div>;
}

function CleanupStatus({ run, pending, busyRun, onRecover }) {
  const status = run.cleanup?.status;
  const labels = { 'not-required': '尚未登记资源释放责任', pending: '等待释放资源', running: '正在释放资源，结束后保存回执', succeeded: '资源释放已完成', failed: '资源释放失败，需人工核对', unknown: '资源释放结果未知，需人工核对' };
  const warning = !status || ['failed', 'unknown'].includes(status);
  return <section className={`cleanup-status${warning ? ' needs-review' : ''}`} aria-label="资源释放回执" aria-live="polite">
    <div className="cleanup-heading"><Icon name={warning ? 'info' : status === 'succeeded' ? 'check' : 'shield'} size={18} /><strong>{labels[status] || '未记录，需按原 Profile 人工核对'}</strong></div>
    {['pending', 'running'].includes(status) && <p>释放完成前不会启动下一段。停止请求不会跳过正在进行的资源释放。</p>}
    {status === 'unknown' && <p>进程退出或响应中断，现有回执不能确认资源是否已释放。</p>}{status === 'unknown' && !run.canRecover && <p>本条记录没有完整的恢复声明，请按原 Profile 人工核对；应用不会扫描或猜测资源。</p>}
    {(run.cleanup?.errors || []).map((error, index) => <div className="cleanup-error" role="alert" key={`${error.scopeId || ''}:${error.id || ''}:${index}`}><strong>{error.status === 'unknown' ? '释放结果未知' : '释放遇到问题'}{error.id ? ` · ${error.id}` : ''}</strong><p>{error.message || '未返回详细信息，请核对原 Profile 的资源状态。'}</p></div>)}
    {run.canRecover && onRecover && !busyRun && <div className="cleanup-recover"><Button icon="refresh" onClick={onRecover} disabled={!!pending}>{pending === `recover:${run.id}` ? '正在请求恢复…' : '恢复资源释放'}</Button><p>仅调用原 Profile 声明的精确资源恢复入口，不会重新播放脚本。原运行结果和错误会保留。</p></div>}
  </section>;
}

function SkillPage({ api, data, onRefresh, notify }) {
  const frameworks = data.skill?.frameworks || [];
  const [framework, setFramework] = useState(frameworks[0]?.id || '');
  const [scope, setScope] = useState('user');
  const [projectRoot, setProjectRoot] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState('');
  const [replace, setReplace] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const serial = useRef(0);
  const params = { framework, scope, ...(scope === 'project' ? { projectRoot } : {}) };
  const paramsKey = JSON.stringify(params);
  const canPreview = !!framework && (scope === 'user' || !!projectRoot);
  const needsReplace = ['modified', 'conflict'].includes(preview?.status);
  const blocked = !preview || preview.paramsKey !== paramsKey || ['installed', 'symlink'].includes(preview.status) || (needsReplace && !replace);

  useEffect(() => { if (!framework && frameworks.length) setFramework(frameworks[0].id); }, [frameworks.length]);
  useEffect(() => { setReceipt(null); refreshPreview(); }, [framework, scope, projectRoot]);
  async function chooseProject() {
    setChoosing(true); setError('');
    try { const selected = await api.chooseSkillProject(); if (selected) setProjectRoot(selected); }
    catch (error) { setError(error?.message || String(error)); }
    finally { setChoosing(false); }
  }
  async function refreshPreview() {
    const token = ++serial.current;
    setPreview(null); setError(''); setReplace(false);
    if (!canPreview) { setLoading(false); return; }
    setLoading(true);
    try { const result = await api.skillPreview(params); if (token === serial.current) setPreview({ ...result, paramsKey }); }
    catch (error) { if (token === serial.current) setError(error?.message || String(error)); }
    finally { if (token === serial.current) setLoading(false); }
  }
  async function install() {
    if (blocked || loading || installing || choosing) return;
    setInstalling(true); setError(''); setReceipt(null);
    try {
      const result = await api.skillInstall({ ...params, replace: preview.status === 'update' || (needsReplace && replace) });
      if (result?.practiceOnly) {
        notify({ type: 'success', text: '练习预览已完成，没有写入文件。请返回 Playbook 主界面安装 Skill。' });
        return;
      }
      setReceipt(result); await onRefresh(); await refreshPreview();
      notify({ type: 'success', text: 'Skill 文件已安装并校验。请在智能体中重新加载或开启新会话验证。' });
    } catch (error) { await refreshPreview(); setError(error?.message || String(error)); }
    finally { setInstalling(false); }
  }
  const actionLabel = preview?.status === 'installed' ? '已安装当前版本' : preview?.status === 'update' ? '备份并更新 Skill' : needsReplace ? '备份并替换 Skill' : '安装 Skill';
  return <div className="skill-page"><div className="skill-main"><section className="skill-intro"><div className="skill-art"><Icon name="skill" size={30} /></div><div><span className="eyebrow">给你的智能体</span><h2>{data.skill?.name || 'playbook-wright'}</h2><p>用 $playbook-wright 创作、维护演示和转换 Playwright TC，兼容旧 $playbook-playwright。</p></div></section>
    <section className="install-form"><div className="section-label"><h3>选择安装位置</h3><span>安装前请核对目标目录</span></div><div className="form-row"><label htmlFor="skill-framework">使用的框架</label><select id="skill-framework" value={framework} onChange={event => setFramework(event.target.value)} disabled={installing || choosing}>{frameworks.length ? frameworks.map(item => <option key={item.id} value={item.id}>{item.name}</option>) : <option value="">暂无可用框架</option>}</select></div><fieldset className="scope-field"><legend>作用范围</legend><div className="scope-options"><label className={scope === 'user' ? 'chosen' : ''}><input type="radio" name="skill-scope" value="user" checked={scope === 'user'} disabled={installing || choosing} onChange={() => setScope('user')} /><span><strong>个人</strong><small>用于这个框架的所有项目</small></span></label><label className={scope === 'project' ? 'chosen' : ''}><input type="radio" name="skill-scope" value="project" checked={scope === 'project'} disabled={installing || choosing} onChange={() => setScope('project')} /><span><strong>指定项目</strong><small>只用于选定的项目</small></span></label></div></fieldset>{scope === 'project' && <div className="form-row"><label htmlFor="skill-project">项目文件夹</label><div className="project-picker"><input id="skill-project" value={projectRoot} readOnly placeholder="请选择智能体使用的项目文件夹" /><Button icon="folder" onClick={chooseProject} disabled={installing || choosing}>{choosing ? '正在选择…' : projectRoot ? '更换文件夹' : '选择文件夹'}</Button></div><p className="form-hint">请选择智能体打开的项目文件夹；不必先添加到 Playbook，也不需要已有 Book。</p></div>}
    <div className="preview-heading"><h4>安装目标</h4><button className="text-button" onClick={refreshPreview} disabled={!canPreview || loading || installing || choosing}><Icon name="refresh" size={14} />{loading ? '正在查看…' : '重新查看目标'}</button></div><div className={`install-preview ${error ? 'has-error' : ''}`} aria-live="polite">{loading ? <div className="preview-loading"><span className="spinner" />正在检查目标位置…</div> : preview ? <><div className="preview-status"><span className={`preview-badge ${preview.status}`}>{PREVIEW_LABELS[preview.status] || preview.status}</span><span>{preview.fileCount != null ? `${preview.fileCount} 个文件` : ''}</span></div><p className="preview-message">主入口 $playbook-wright</p><p className="target-path">{preview.targetDir}</p><dl><div><dt>随包版本</dt><dd>{preview.version || data.skill?.version || '—'}</dd></div><div><dt>主入口已安装版本</dt><dd>{preview.installedVersion || '尚未安装'}</dd></div></dl>{preview.message && <p className="preview-message">{preview.message}</p>}{preview.targets?.slice(1).map(target => <div className="compat-target" key={target.name}><strong>兼容入口 ${target.name} · {PREVIEW_LABELS[target.status]}</strong><p className="target-path">{target.targetDir}</p><small>已安装版本：{target.installedVersion || '尚未安装'}</small></div>)}</> : <p className="muted">{canPreview ? '安装目标暂不可用。' : scope === 'project' ? '先选择项目文件夹以查看安装位置。' : '请选择使用的框架。'}</p>}</div>
    {error && <div className="install-error" role="alert"><Icon name="info" size={17} />{error}</div>}{needsReplace && <label className="replace-check"><input type="checkbox" checked={replace} disabled={installing || choosing} onChange={event => setReplace(event.target.checked)} /><span>先备份再替换已有内容<small>原内容将保留备份，确认后再安装随包 Skill。</small></span></label>}{preview?.status === 'update' && <p className="backup-hint"><Icon name="shield" size={15} />更新前会备份现有 Skill。</p>}{preview?.status === 'symlink' && <p className="field-error">目标是符号链接，无法在此处安装。请调整安装位置后重试。</p>}{receipt && <div className="install-preview"><strong>文件已安装，智能体加载状态待验证</strong><p className="preview-message">在智能体中重新加载或开启新会话，调用 $playbook-wright；旧 $playbook-playwright 也可使用。</p>{receipt.backups?.map(backup => <div key={backup.path}><small>{backup.name} 原内容备份位置</small><p className="target-path">{backup.path}</p></div>)}</div>}<div className="install-actions"><Button icon={installing ? 'clock' : preview?.status === 'installed' ? 'check' : 'skill'} className="primary" onClick={install} disabled={blocked || loading || installing || choosing}>{installing ? '正在安装…' : actionLabel}</Button><span>只有点击安装后才会写入目标目录。</span></div></section></div>
    <aside className="skill-aside"><h3>你的创作流程</h3><div className="creation-step"><span>1</span><div><h4>在智能体中创作</h4><p>使用随包 Skill 描述演示需求，生成、维护脚本或复用已有 Playwright 测试。</p></div></div><div className="creation-step"><span>2</span><div><h4>在 Playbook 中播放</h4><p>打开项目，查看内容，选择运行方式并播放。</p></div></div><div className="creation-step"><span>3</span><div><h4>带着反馈继续完善</h4><p>复制运行上下文，交给智能体修改，再回来验证。</p></div></div><div className="skill-note"><Icon name="shield" size={20} /><p>Playbook 只展示和播放项目内容，不在这里编辑脚本。</p></div></aside></div>;
}
