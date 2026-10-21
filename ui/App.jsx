import React, { useEffect, useRef, useState } from 'react';

const EMPTY = { workspaces: [], runs: [], activeRun: null, skill: { frameworks: [] } };
const RUN_LABELS = { preparing: '准备中', playing: '播放中', pausing: '正在暂停', paused: '已暂停', stopping: '正在停止', stopped: '已停止', completed: '已完成', failed: '播放失败' };
const ACTIVE = ['preparing', 'playing', 'pausing', 'paused', 'stopping'];
const PREVIEW_LABELS = { new: '可以安装', installed: '已是当前版本', update: '可以更新', modified: '已有内容已修改', symlink: '目标为符号链接', conflict: '目标存在其他内容' };

function Icon({ name, size = 20, ...props }) {
  const paths = {
    book: <><path d="M4 4.5h6.5A2.5 2.5 0 0 1 13 7v14a3 3 0 0 0-3-2.5H4z" /><path d="M20 4.5h-4.5A2.5 2.5 0 0 0 13 7v14a3 3 0 0 1 3-2.5h4z" /></>,
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
  const [profileChoice, setProfileChoice] = useState({ key: '', value: '' });
  const [selectedRun, setSelectedRun] = useState(null);
  const [pending, setPending] = useState('');
  const [notice, setNotice] = useState(null);
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
  const filtered = entries.filter(item => {
    const scripts = item.kind === 'script' ? [item.entry] : entryScripts(item);
    const search = [item.entry.title, item.entry.summary, item.book?.title, item.section?.title, ...(item.entry.tags || []), ...scripts.flatMap(script => [script.title, ...(script.tags || []), ...(script.requirements?.roles || [])]), item.workspace.name].join(' ').toLocaleLowerCase();
    return (filter === 'all' || item.workspace.id === filter) && search.includes(query.trim().toLocaleLowerCase());
  });
  const current = filtered.find(entry => entry.key === selected) || filtered[0];
  const profile = profileChoice.key === current?.key ? profileChoice.value : current?.entry.defaultProfileId || current?.workspace.profiles?.[0]?.id || '';
  const setProfile = value => setProfileChoice({ key: current?.key || '', value });
  const visibleKeys = new Set(filtered.map(item => item.key));
  const visibleProjects = workspaces.filter(workspace => filter === 'all' || workspace.id === filter);
  const runs = [...(data.runs || [])].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const historyRun = runs.find(run => run.id === selectedRun) || runs[0];

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
    api.setPlaybackSelection({ workspaceId: current.workspace.id, entryId: current.entryId, kind: current.kind, profileId: profile || current.entry.defaultProfileId || undefined }).catch(error => setNotice({ type: 'error', text: `无法同步播放选择：${error.message}` }));
  }, [current?.key, current?.entry.defaultProfileId, profile]);

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
  async function removeWorkspace(workspace) {
    if (!window.confirm(`将“${workspace.name}”移出 Playbook？项目文件会保留在原位置。`)) return;
    await act('remove', async () => { await api.removeWorkspace(workspace.id); setData(await api.getState()); if (filter === workspace.id) setFilter('all'); });
  }
  async function play(item, selectedProfile) {
    setSelected(item.key);
    await act('play', async () => {
      await api.play({ workspaceId: item.workspace.id, entryId: item.entryId, kind: item.kind, profileId: selectedProfile || (current?.key === item.key ? profile : item.entry.defaultProfileId) || undefined });
      setData(await api.getState()); setPage('run');
    });
  }
  function copyContext(item, run) {
    const payload = run ? { workspaceId: run.workspaceId, entryId: run.entryId, runId: run.id } : { workspaceId: item.workspace.id, entryId: item.entryId, kind: item.kind };
    return act('copy', () => api.copyContext(payload), '已复制上下文，可粘贴给你的智能体。');
  }
  const names = { library: ['项目', '按 Book、Section 和脚本浏览，选择一个流程或按顺序播放全部。'], run: ['正在播放', '查看当前进度，并在需要时暂停或停止。'], history: ['运行记录', '回看每次播放结果，将反馈交给你的智能体。'], skills: ['Skill 安装', '为你的智能体安装 Playbook 创作能力。'] };

  if (!api) return <div className="bridge-missing"><div className="brand-icon"><Icon name="book" size={34} /></div><h1>请在 Playbook 桌面应用中打开</h1><p>此界面需要桌面应用提供本地项目和播放能力。</p><span>当前页面未连接桌面服务</span></div>;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="traffic-space" />
      <div className="brand"><div className="brand-icon"><Icon name="book" size={24} /></div><div>Playbook<span>让操作有迹可循</span></div></div>
      <nav aria-label="主导航">
        {[
          ['library', 'folder', '项目'], ['run', 'play', '正在播放'], ['history', 'history', '运行记录'], ['skills', 'skill', 'Skill 安装'],
        ].map(([id, icon, label]) => <button key={id} className={`nav-item ${page === id ? 'is-active' : ''}`} onClick={() => setPage(id)} aria-current={page === id ? 'page' : undefined}><Icon name={icon} size={19} /><span>{label}</span>{id === 'run' && busyRun && <i className={`live-dot ${active.state === 'paused' ? 'paused' : ''}`} />}</button>)}
      </nav>
      <div className="sidebar-projects"><div className="sidebar-label"><span>项目</span><button className="icon-button" title="添加项目" aria-label="添加项目" disabled={!!pending} onClick={addWorkspace}><Icon name="plus" size={17} /></button></div>
        <button className={`project-item ${filter === 'all' && page === 'library' ? 'is-selected' : ''}`} onClick={() => { setFilter('all'); setPage('library'); }}><Icon name="folder" size={17} /><span>全部项目</span><small>{workspaces.length}</small></button>
        <div className="project-scroll">{workspaces.map(workspace => <div className={`project-row ${filter === workspace.id && page === 'library' ? 'is-selected' : ''}`} key={workspace.id}><button className="project-item" onClick={() => { setFilter(workspace.id); setPage('library'); }} title={workspace.path}><span className="project-initial">{workspace.name?.[0] || '项'}</span><span>{workspace.name}</span>{workspace.error && <span className="project-error" title={workspace.error}>!</span>}</button><button className="remove-project icon-button" title={`移出项目 ${workspace.name}`} aria-label={`移出项目 ${workspace.name}`} onClick={() => removeWorkspace(workspace)} disabled={!!pending}><Icon name="cross" size={13} /></button></div>)}</div>
        {!workspaces.length && <p className="sidebar-empty">添加一个项目<br />在这里查看 Book 和脚本</p>}
      </div>
      <div className="sidebar-footer"><div className="read-only-mark"><Icon name="shield" size={16} /><span>内容由你的智能体维护</span></div><small>Playbook · 本地工作空间</small></div>
    </aside>

    <main className="main-shell">
      <div className="titlebar-drag" />
      <header className="page-header"><div><div className="eyebrow">你的操作手册</div><h1>{names[page][0]}</h1><p>{names[page][1]}</p></div><div className="header-actions">{page === 'library' && <Button icon="plus" onClick={addWorkspace} disabled={!!pending}>添加项目</Button>}{page === 'history' && <span className="header-count">{runs.length} 次运行</span>}{page === 'skills' && <span className="version-pill">随包版本 {data.skill?.version || '—'}</span>}</div></header>
      {notice && <div className={`notice notice-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}><Icon name={notice.type === 'error' ? 'info' : 'check'} size={18} /><span>{notice.text}</span><button className="icon-button" aria-label="关闭提示" onClick={() => setNotice(null)}><Icon name="cross" size={16} /></button></div>}
      {loading ? <div className="loading-state"><span className="spinner" />正在载入项目…</div> : <>
      {page === 'library' && <>
        <section className="library-toolbar"><label className="search-box"><Icon name="search" size={18} /><input aria-label="搜索 Book、Section、脚本、标签或角色" placeholder="搜索 Book、Section、脚本…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button className="icon-button" aria-label="清除搜索" onClick={() => setQuery('')}><Icon name="cross" size={14} /></button>}</label><select className="project-select" aria-label="筛选项目" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">全部项目</option>{workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></section>
        <div className="library-split"><section className="entry-column"><div className="list-topline"><div className="hierarchy-label"><span>Book</span><Icon name="arrow" size={12} /><span>Section</span><Icon name="arrow" size={12} /><span>脚本</span></div><span>{filtered.filter(item => item.kind === 'script').length} 个脚本</span></div>
          <div className="entry-list">{visibleProjects.map(workspace => {
            const projectItems = entries.filter(item => item.workspace.id === workspace.id);
            const bookItems = projectItems.filter(item => item.kind === 'book');
            const standalone = projectItems.filter(item => item.kind === 'script' && !item.book && visibleKeys.has(item.key));
            const hasContent = projectItems.some(item => visibleKeys.has(item.key));
            if (!hasContent && !workspace.error) return null;
            return <section className="project-group" key={workspace.id} aria-label={`项目 ${workspace.name}`}><div className="project-group-heading"><Icon name="folder" size={14} /><h2>{workspace.name}</h2></div>{bookItems.map(bookItem => {
              const sectionItems = projectItems.filter(item => item.kind === 'section' && item.book.id === bookItem.entry.id);
              if (!visibleKeys.has(bookItem.key) && !sectionItems.some(sectionItem => visibleKeys.has(sectionItem.key) || projectItems.some(item => item.kind === 'script' && item.book?.id === bookItem.entry.id && item.section?.id === sectionItem.entry.id && visibleKeys.has(item.key)))) return null;
              return <div className="book-group" key={bookItem.key}><div className={`container-heading book-heading ${current?.key === bookItem.key ? 'selected' : ''}`}><button className="container-select" aria-label={`查看 Book ${bookItem.entry.title}`} aria-pressed={current?.key === bookItem.key} onClick={() => setSelected(bookItem.key)}><span className="container-icon"><Icon name="book" size={20} /></span><span><small>Book · {bookItem.entry.sections?.length || 0} 个 Section</small><strong>{bookItem.entry.title}</strong></span></button><button className="container-play" aria-label={`播放整个 Book ${bookItem.entry.title}`} onClick={() => play(bookItem)} disabled={!!pending || busyRun || bookItem.entry.valid === false}><Icon name="play" size={13} /><span>播放全部</span></button></div>
                <div className="book-sections">{sectionItems.map(sectionItem => {
                  const scriptItems = projectItems.filter(item => item.kind === 'script' && item.book?.id === bookItem.entry.id && item.section?.id === sectionItem.entry.id && visibleKeys.has(item.key));
                  if (!visibleKeys.has(sectionItem.key) && !scriptItems.length) return null;
                  return <div className="section-group" key={sectionItem.key}><div className={`container-heading section-heading ${current?.key === sectionItem.key ? 'selected' : ''}`}><button className="container-select" aria-label={`查看 Section ${sectionItem.entry.title}`} aria-pressed={current?.key === sectionItem.key} onClick={() => setSelected(sectionItem.key)}><span className="section-marker" /><span><small>Section · {sectionItem.entry.scripts?.length || 0} 个脚本</small><strong>{sectionItem.entry.title}</strong></span></button><button className="container-play" aria-label={`播放整个 Section ${sectionItem.entry.title}`} onClick={() => play(sectionItem)} disabled={!!pending || busyRun || sectionItem.entry.valid === false}><Icon name="play" size={12} /><span>播放全部</span></button></div><div className="section-scripts">{scriptItems.map(item => <ScriptCard key={item.key} item={item} selected={current?.key === item.key} onSelect={() => setSelected(item.key)} />)}</div></div>;
                })}</div></div>;
            })}{standalone.length > 0 && <div className="standalone-scripts">{bookItems.length > 0 && <h3 className="standalone-label">其他脚本</h3>}{standalone.map(item => <ScriptCard key={item.key} item={item} selected={current?.key === item.key} onSelect={() => setSelected(item.key)} />)}</div>}{workspace.error && <div className="inline-error"><Icon name="info" size={18} /><div><strong>{workspace.name} 暂时无法读取</strong><p>{workspace.error}</p></div></div>}</section>;
          })}
          {!filtered.length && !visibleProjects.some(workspace => workspace.error) && <Empty title={entries.length ? '没有匹配的内容' : '把你的项目放进来'}>{entries.length ? '试试其他关键词，或切换项目。' : '添加包含 Playbook 的项目，Book、Section 和脚本会显示在这里。'}</Empty>}
          </div>
          <div className="library-footnote"><Icon name="info" size={14} /><span>在你的智能体中创作与修改，回到这里查看和播放。</span></div>
        </section><aside className="detail-panel">{current ? <EntryDetail item={current} profile={profile} setProfile={setProfile} onPlay={() => play(current)} onSelect={key => setSelected(key)} entries={entries} shortcut={data.playbackShortcut} pending={pending} busyRun={busyRun} onCopy={() => copyContext(current)} onReveal={() => act('reveal', () => api.reveal({ workspaceId: current.workspace.id, entryId: current.entryId, kind: current.kind }))} /> : <Empty icon="script" title="选择一个 Book、Section 或脚本">内容说明、运行方式和步骤会显示在这里。</Empty>}</aside></div>
      </>}
      {page === 'run' && <div className="run-page">{active ? <RunDetail run={active} entries={entries} onCopy={() => copyContext(null, active)} pending={pending} control={command => act(command, () => api.control(command))} onHistory={() => { setSelectedRun(active.id); setPage('history'); }} onReplay={() => act('replay', async () => { await api.play({ workspaceId: active.workspaceId, entryId: active.entryId, kind: active.kind, profileId: active.profileId }); setData(await api.getState()); })} /> : <Empty icon="play" title="准备好，就开始播放">从项目选择一个 Book、Section 或脚本，按既定步骤执行。</Empty>}{!active && <div className="empty-action"><Button className="primary" icon="library" onClick={() => setPage('library')}>前往项目</Button></div>}</div>}
      {page === 'history' && <div className="history-split"><section className="history-list">{runs.map(run => <button className={`history-card ${historyRun?.id === run.id ? 'selected' : ''}`} key={run.id} onClick={() => setSelectedRun(run.id)} aria-label={`查看运行记录 ${run.title}`}><div className={`run-result-icon ${run.state}`}><Icon name={run.state === 'completed' ? 'check' : run.state === 'failed' ? 'info' : ACTIVE.includes(run.state) ? 'play' : 'stop'} size={18} /></div><div><h3>{run.title}</h3><p>{date(run.startedAt)}<span>·</span>{run.profileName || '默认运行方式'}</p><Status state={run.state} /></div><Icon name="arrow" className="card-chevron" size={16} /></button>)}{!runs.length && <Empty icon="history" title="还没有运行记录">完成一次播放后，结果和反馈会保存在这里。</Empty>}</section><section className="history-detail">{historyRun ? <RunDetail compact run={historyRun} entries={entries} pending={pending} onCopy={() => copyContext(null, historyRun)} /> : <div className="history-empty"><Icon name="history" size={42} /><p>每一次运行，都有记录</p></div>}</section></div>}
      {page === 'skills' && <SkillPage api={api} data={data} onRefresh={async () => setData(await api.getState())} notify={setNotice} />}
      </>}
    </main>
  </div>;
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
function EntryDetail({ item, profile, setProfile, onPlay, onSelect, entries, shortcut, pending, busyRun, onCopy, onReveal }) {
  const { entry, workspace, kind } = item;
  const profiles = workspace.profiles || [];
  const scripts = kind === 'script' ? [entry] : entryScripts(item);
  const steps = entrySteps(item);
  const requirements = entry.requirements || {};
  const children = entries.filter(child => child.workspace.id === workspace.id && (kind === 'book' ? child.kind === 'section' && child.book.id === entry.id : kind === 'section' ? child.kind === 'script' && child.book?.id === item.book?.id && child.section?.id === entry.id : false));
  return <><div className="detail-heading"><span className={`entry-kind ${kind}`}><Icon name={kind === 'book' ? 'book' : kind === 'section' ? 'library' : 'script'} size={15} />{kind === 'book' ? 'Book' : kind === 'section' ? 'Section' : '操作脚本'}</span><button className="icon-button" title="在文件夹中显示" aria-label="在文件夹中显示" onClick={onReveal} disabled={!!pending}><Icon name="external" size={17} /></button></div><div className="detail-intro"><h2>{entry.title}</h2><p>{entry.summary || '暂无内容说明'}</p><div className="detail-project"><Icon name="folder" size={14} />{workspace.name}{kind !== 'book' && item.book && <><Icon name="arrow" size={10} /><span>{item.book.title}</span></>}{kind === 'script' && item.section && <><Icon name="arrow" size={10} /><span>{item.section.title}</span></>}</div></div>
    <div className="play-setup"><label htmlFor="run-profile">运行方式</label><select id="run-profile" value={profile} onChange={event => setProfile(event.target.value)} disabled={!!pending || busyRun}>{profiles.length ? profiles.map(item => <option key={item.id} value={item.id}>{item.title}</option>) : <option value="">默认方式</option>}</select><Button icon="play" className="primary play-button" aria-label={kind === 'book' ? `播放全部 Book ${entry.title}` : kind === 'section' ? `播放全部 Section ${entry.title}` : '播放脚本'} onClick={onPlay} disabled={!!pending || busyRun || entry.valid === false}>{pending === 'play' ? '正在准备…' : kind === 'script' ? '播放脚本' : '播放全部'}</Button>{kind !== 'script' && <p className="field-hint">按既定顺序播放 {scripts.length} 个脚本，共 {steps.length} 步。</p>}{shortcut && <div className={`shortcut-hint ${shortcut.registered ? '' : 'unavailable'}`}><kbd>{shortcut.label || shortcut.accelerator}</kbd><span>{shortcut.registered ? '全局播放 / 暂停' : '全局快捷键暂不可用'}</span></div>}{busyRun && <p className="field-hint">当前播放结束后，可以开始下一次。</p>}{entry.valid === false && <p className="field-error">{entry.error || '此条目暂时无法播放，请交给智能体修复。'}</p>}</div>
    {kind === 'script' && <div className="requirements"><div><span>数据环境</span><strong>{DATA_LABELS[requirements.dataMode] || display(requirements.dataMode)}</strong></div><div><span>操作影响</span><strong>{EFFECT_LABELS[requirements.effects] || display(requirements.effects)}</strong></div><div><span>重复播放</span><strong>{REPLAY_LABELS[requirements.replay] || display(requirements.replay)}</strong></div>{requirements.roles?.length > 0 && <div><span>使用角色</span><strong>{display(requirements.roles)}</strong></div>}</div>}
    {children.length > 0 && <section className="composition-section"><div className="section-label"><h3>{kind === 'book' ? 'Section 顺序' : '脚本顺序'}</h3><span>{children.length} 个{kind === 'book' ? ' Section' : '脚本'}</span></div><ol className="composition-list">{children.map((child, index) => <li key={child.key}><button onClick={() => onSelect(child.key)} aria-label={`打开${child.kind === 'section' ? ' Section' : '脚本'} ${child.entry.title}`}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{child.entry.title}</strong><small>{child.kind === 'section' ? `${child.entry.scripts?.length || 0} 个脚本` : `${child.entry.steps?.length || 0} 步`}</small></div><Icon name="arrow" size={13} /></button></li>)}</ol></section>}
    <section className="steps-section"><div className="section-label"><h3>{kind === 'script' ? '操作步骤' : '全部步骤'}</h3><span>{steps.length} 步</span></div><ol className="step-list">{steps.map((step, index) => <li key={`${step.id}-${index}`}><span className="step-number">{String(index + 1).padStart(2, '0')}</span><div>{step.scriptTitle && <small>{kind === 'book' && step.sectionTitle ? `${step.sectionTitle} · ` : ''}{step.scriptTitle}</small>}<h4>{step.title}</h4>{step.explain && <p>{step.explain}</p>}</div></li>)}</ol>{!steps.length && <p className="muted small">暂无可展示的步骤。</p>}</section>
    <div className="detail-footer"><Button className="quiet" icon="copy" onClick={onCopy} disabled={!!pending}>复制给智能体的修改上下文</Button></div></>;
}

function RunDetail({ run, entries, onCopy, pending, control, compact, onHistory, onReplay }) {
  const item = entries.find(item => item.workspace.id === run.workspaceId && item.entryId === run.entryId && item.kind === run.kind);
  const legacyWorkspace = entries.find(item => item.workspace.id === run.workspaceId)?.workspace;
  const legacyDemo = run.kind === 'demo' ? legacyWorkspace?.demos?.find(demo => demo.id === run.entryId) : null;
  const steps = run.steps || (legacyDemo ? (legacyDemo.scripts || []).flatMap(id => legacyWorkspace.items.find(script => script.id === id)?.steps || []) : entrySteps(item));
  const total = run.total || steps.length;
  const count = run.state === 'completed' ? total : Math.min(total, Number(run.completed) || 0);
  const percent = total ? Math.round(count / total * 100) : run.state === 'completed' ? 100 : 0;
  return <div className={`run-detail ${compact ? 'compact' : ''}`}><div className="run-title-row"><div><span className="entry-kind"><Icon name={run.kind === 'book' ? 'book' : run.kind === 'section' ? 'library' : 'script'} size={15} />{run.kind === 'book' ? 'Book 播放' : run.kind === 'section' ? 'Section 播放' : run.kind === 'demo' ? '批量播放' : '脚本播放'}</span><h2>{run.title}</h2><p>{item?.workspace.name || '项目'}<span>·</span>{run.profileName || '默认运行方式'}</p></div><Status state={run.state} /></div>
    <div className="run-progress"><div><strong>{run.state === 'completed' ? '全部步骤已完成' : run.state === 'failed' ? '本次播放未完成' : run.stepTitle || (run.state === 'preparing' ? '正在准备运行环境' : '等待下一步')} </strong><span>{count} / {total} 步</span></div><div className="progress-track" role="progressbar" aria-label="播放进度" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${percent}%` }} /></div>{!compact && control && <div className="run-controls">{run.state === 'paused' ? <Button icon="play" className="primary" onClick={() => control('resume')} disabled={!!pending}>继续播放</Button> : <Button icon="pause" className="primary" onClick={() => control('pause')} disabled={!!pending || run.state !== 'playing'}>{run.state === 'pausing' ? '正在暂停…' : '暂停播放'}</Button>}<Button icon="stop" onClick={() => control('stop')} disabled={!!pending || !ACTIVE.includes(run.state) || run.state === 'stopping'}>{run.state === 'stopping' ? '正在停止…' : '停止播放'}</Button>{!ACTIVE.includes(run.state) && onReplay && <Button icon="play" onClick={onReplay} disabled={!!pending}>从头再播</Button>}{!ACTIVE.includes(run.state) && <Button className="quiet" icon="history" onClick={onHistory}>查看运行记录</Button>}</div>}</div>
    {run.sourceChanged && <div className="run-callout"><Icon name="info" size={18} /><p>源文件已更新，本次继续使用启动时的内容。更改将在下一次播放生效。</p></div>}
    {run.error && <div className="run-error" role="alert"><Icon name="info" size={20} /><div><h3>播放遇到问题</h3><p>{typeof run.error === 'string' ? run.error : run.error.message || display(run.error)}</p><span>复制错误上下文，交给你的智能体定位和修改。</span></div></div>}
    <div className="run-meta"><div><span>开始时间</span><strong>{date(run.startedAt, true)}</strong></div><div><span>{run.finishedAt ? '运行耗时' : '运行状态'}</span><strong>{run.finishedAt ? duration(run) : RUN_LABELS[run.state]}</strong></div>{run.finishedAt && <div><span>结束时间</span><strong>{date(run.finishedAt, true)}</strong></div>}</div>
    <section className="run-steps"><div className="section-label"><h3>步骤进度</h3><span>{total} 个步骤</span></div><ol>{steps.map((step, index) => { const done = run.state === 'completed' || index < count; const current = !done && (run.index > 0 ? index + 1 === run.index : step.id === run.stepId); return <li key={`${step.id}-${index}`} className={`${done ? 'done' : ''} ${current ? 'current' : ''}`}><span className="run-step-icon">{done ? <Icon name="check" size={15} /> : current && run.state === 'playing' ? <span className="tiny-pulse" /> : index + 1}</span><div>{step.sectionTitle && <div className="run-step-section">{step.sectionTitle}{step.scriptTitle ? ` · ${step.scriptTitle}` : ''}</div>}<h4>{step.title}</h4>{step.explain && <p>{step.explain}</p>}</div><small>{done ? '已完成' : current ? RUN_LABELS[run.state] : '待执行'}</small></li>; })}</ol>{!steps.length && <p className="muted small">此条目的原始内容暂不可用，运行结果仍保留在记录中。</p>}</section>
    <div className="run-bottom"><Button icon="copy" onClick={onCopy} disabled={!!pending}>复制给智能体的{run.state === 'failed' ? '错误' : '运行'}上下文</Button><span>复制后，粘贴到你使用的智能体中。</span></div></div>;
}

function SkillPage({ api, data, onRefresh, notify }) {
  const frameworks = data.skill?.frameworks || [];
  const [framework, setFramework] = useState(frameworks[0]?.id || '');
  const [scope, setScope] = useState('user');
  const [workspaceId, setWorkspaceId] = useState(data.workspaces[0]?.id || '');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState('');
  const [replace, setReplace] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const serial = useRef(0);
  const params = { framework, scope, ...(scope === 'project' ? { workspaceId } : {}) };
  const canPreview = !!framework && (scope === 'user' || !!workspaceId);
  const needsReplace = ['modified', 'conflict'].includes(preview?.status);
  const blocked = !preview || ['installed', 'symlink'].includes(preview.status) || (needsReplace && !replace);

  useEffect(() => { if (!framework && frameworks.length) setFramework(frameworks[0].id); }, [frameworks.length]);
  useEffect(() => { if (!data.workspaces.some(item => item.id === workspaceId)) setWorkspaceId(data.workspaces[0]?.id || ''); }, [data.workspaces, workspaceId]);
  useEffect(() => { refreshPreview(); }, [framework, scope, workspaceId]);
  async function refreshPreview() {
    const token = ++serial.current;
    setPreview(null); setError(''); setReplace(false);
    if (!canPreview) { setLoading(false); return; }
    setLoading(true);
    try { const result = await api.skillPreview(params); if (token === serial.current) setPreview(result); }
    catch (error) { if (token === serial.current) setError(error?.message || String(error)); }
    finally { if (token === serial.current) setLoading(false); }
  }
  async function install() {
    if (blocked || loading || installing) return;
    setInstalling(true); setError('');
    try {
      const result = await api.skillInstall({ ...params, replace: preview.status === 'update' || (needsReplace && replace) });
      setReceipt(result); await onRefresh(); await refreshPreview();
      notify({ type: 'success', text: 'Skill 文件已安装并校验。请在智能体中重新加载或开启新会话验证。' });
    } catch (error) { setError(error?.message || String(error)); }
    finally { setInstalling(false); }
  }
  const actionLabel = preview?.status === 'installed' ? '已安装当前版本' : preview?.status === 'update' ? '备份并更新 Skill' : needsReplace ? '备份并替换 Skill' : '安装 Skill';
  return <div className="skill-page"><div className="skill-main"><section className="skill-intro"><div className="skill-art"><Icon name="skill" size={30} /></div><div><span className="eyebrow">给你的智能体</span><h2>Playbook 创作 Skill</h2><p>由智能体编写和维护操作脚本，Playbook 负责查看、播放和反馈。</p></div></section>
    <section className="install-form"><div className="section-label"><h3>选择安装位置</h3><span>安装前请核对目标目录</span></div><div className="form-row"><label htmlFor="skill-framework">使用的框架</label><select id="skill-framework" value={framework} onChange={event => setFramework(event.target.value)} disabled={installing}>{frameworks.length ? frameworks.map(item => <option key={item.id} value={item.id}>{item.name}</option>) : <option value="">暂无可用框架</option>}</select></div><fieldset className="scope-field"><legend>作用范围</legend><div className="scope-options"><label className={scope === 'user' ? 'chosen' : ''}><input type="radio" name="skill-scope" value="user" checked={scope === 'user'} disabled={installing} onChange={() => setScope('user')} /><span><strong>个人</strong><small>用于这个框架的所有项目</small></span></label><label className={scope === 'project' ? 'chosen' : ''}><input type="radio" name="skill-scope" value="project" checked={scope === 'project'} disabled={installing} onChange={() => setScope('project')} /><span><strong>指定项目</strong><small>只用于选定的项目</small></span></label></div></fieldset>{scope === 'project' && <div className="form-row"><label htmlFor="skill-project">项目</label><select id="skill-project" value={workspaceId} onChange={event => setWorkspaceId(event.target.value)} disabled={installing}>{data.workspaces.length ? data.workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>) : <option value="">请先添加项目</option>}</select></div>}
    <div className="preview-heading"><h4>安装目标</h4><button className="text-button" onClick={refreshPreview} disabled={!canPreview || loading || installing}><Icon name="refresh" size={14} />{loading ? '正在查看…' : '重新查看目标'}</button></div><div className={`install-preview ${error ? 'has-error' : ''}`} aria-live="polite">{loading ? <div className="preview-loading"><span className="spinner" />正在检查目标位置…</div> : preview ? <><div className="preview-status"><span className={`preview-badge ${preview.status}`}>{PREVIEW_LABELS[preview.status] || preview.status}</span><span>{preview.fileCount != null ? `${preview.fileCount} 个文件` : ''}</span></div><p className="target-path">{preview.targetDir}</p><dl><div><dt>随包版本</dt><dd>{preview.version || data.skill?.version || '—'}</dd></div><div><dt>已安装版本</dt><dd>{preview.installedVersion || '尚未安装'}</dd></div></dl>{preview.message && <p className="preview-message">{preview.message}</p>}</> : <p className="muted">{canPreview ? '安装目标暂不可用。' : scope === 'project' ? '先选择一个项目以查看安装位置。' : '请选择使用的框架。'}</p>}</div>
    {error && <div className="install-error" role="alert"><Icon name="info" size={17} />{error}</div>}{needsReplace && <label className="replace-check"><input type="checkbox" checked={replace} disabled={installing} onChange={event => setReplace(event.target.checked)} /><span>先备份再替换已有内容<small>原内容将保留备份，确认后再安装随包 Skill。</small></span></label>}{preview?.status === 'update' && <p className="backup-hint"><Icon name="shield" size={15} />更新前会备份现有 Skill。</p>}{preview?.status === 'symlink' && <p className="field-error">目标是符号链接，无法在此处安装。请调整安装位置后重试。</p>}{receipt && <div className="install-preview"><strong>文件已安装，智能体加载状态待验证</strong><p className="preview-message">在智能体中重新加载或开启新会话，调用 $playbook-playwright。</p>{receipt.backupPath && <><small>原内容备份位置</small><p className="target-path">{receipt.backupPath}</p></>}</div>}<div className="install-actions"><Button icon={installing ? 'clock' : preview?.status === 'installed' ? 'check' : 'skill'} className="primary" onClick={install} disabled={blocked || loading || installing}>{installing ? '正在安装…' : actionLabel}</Button><span>只有点击安装后才会写入目标目录。</span></div></section></div>
    <aside className="skill-aside"><h3>你的创作流程</h3><div className="creation-step"><span>1</span><div><h4>在智能体中创作</h4><p>使用安装好的 Skill，描述你想保留的操作流程。</p></div></div><div className="creation-step"><span>2</span><div><h4>在 Playbook 中播放</h4><p>打开项目，查看内容，选择运行方式并播放。</p></div></div><div className="creation-step"><span>3</span><div><h4>带着反馈继续完善</h4><p>复制运行上下文，交给智能体修改，再回来验证。</p></div></div><div className="skill-note"><Icon name="shield" size={20} /><p>Playbook 只展示和播放项目内容，不在这里编辑脚本。</p></div></aside></div>;
}
