import React, { useEffect, useState } from 'react';
import './playback-control.css';
import PlaybookMark from './PlaybookMark.jsx';

export default function PlaybackControl() {
  const [data, setData] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    document.title = 'Playbook 播放控制';
    document.documentElement.classList.add('playback-control-window');
    const off = window.playbookControl.onState(setData);
    window.playbookControl.getState().then(setData).catch(error => setError(error.message));
    return off;
  }, []);
  const run = data?.run, paused = ['paused', 'pausing'].includes(run?.state), collapsed = data?.collapsed === true;
  const waiting = run?.state === 'waiting';
  const releasing = ['cleaning', 'recovering'].includes(run?.state);
  const caption = waiting ? (run.interaction?.prompt || '你可以操作当前页面，再继续演示') + (run.interaction?.busy ? ' · 正在选择文件或安装，请稍候' : run.interaction?.remainingMs == null ? ' · 完成后点继续' : run.interaction?.paused ? ' · 倒计时已暂停' : ' · ' + Math.ceil(Math.max(0, run.interaction.remainingMs) / 1000) + ' 秒后继续') : run?.state === 'recovering' ? '正在恢复资源释放…' : run?.state === 'cleaning' ? '正在释放资源，结束后保存回执' : run?.state === 'stopping' ? '已请求停止，等待执行结束…' : run?.stepTitle || (run?.state === 'preparing' ? '正在准备演示…' : '自动演示');
  const enabled = ['preparing', 'playing', 'paused', 'pausing', 'waiting'].includes(run?.state) && !(waiting && run.interaction?.busy);
  const progress = run?.total ? Math.round((run.completed || 0) / run.total * 100) : 0;
  const control = command => { setError(''); window.playbookControl.control(command).catch(error => setError(error.message)); };
  const annotate = () => { setError(''); window.playbookControl.annotate().catch(error => setError(error.message)); };
  const collapse = value => { setError(''); window.playbookControl.setCollapsed(value).then(setData).catch(error => setError(error.message)); };
  return <main className={`playback-control-bar${collapsed ? ' is-collapsed' : ''}`} aria-label="全局播放控制">
    <div className="control-brand"><PlaybookMark size={18} className={paused || releasing || waiting ? 'paused' : ''} />Playbook</div>
    <div className="control-caption" title={error || caption || run?.title}><small>{waiting ? '交给你操作' : collapsed && releasing ? run?.state === 'recovering' ? '恢复释放中' : '释放资源中' : <>{!collapsed && `${run?.sectionTitle || run?.title || '自动演示'} · `}{run?.completed || 0} / {run?.total || 0}</>}</small>{!collapsed && <strong>{error || caption}</strong>}</div>
    <button type="button" aria-label={waiting || paused ? '继续播放' : '暂停播放'} title={`${waiting || paused ? '继续播放' : '暂停播放'} ${data?.shortcut?.label || ''}`} disabled={!enabled} onClick={() => control(waiting || paused ? 'resume' : 'pause')}>{collapsed ? waiting || paused ? '▶' : 'Ⅱ' : waiting || paused ? '▶ 继续' : 'Ⅱ 暂停'}{!collapsed && <kbd>{data?.shortcut?.label}</kbd>}</button>
    {run?.state === 'paused' && <button type="button" aria-label={data?.annotationMode ? '退出批注模式' : '添加批注'} title={data?.annotationMode ? '退出批注模式' : '在页面上选择元素并添加批注'} onClick={annotate}>{collapsed ? '✎' : data?.annotationMode ? '退出批注' : '✎ 批注'}</button>}
    {!collapsed && <button type="button" aria-label="停止播放" disabled={!run || run.state === 'stopping' || run.stopRequested || !['preparing', 'playing', 'paused', 'pausing', 'waiting', 'exporting', 'cleaning', 'recovering'].includes(run.state)} onClick={() => control('stop')}>{run?.stopRequested || run?.state === 'stopping' ? '已请求停止' : '停止播放'}</button>}
    <button type="button" className="control-size" aria-label={collapsed ? '展开播放栏' : '最小化播放栏'} title={collapsed ? '展开播放栏' : '最小化播放栏'} onClick={() => collapse(!collapsed)}>{collapsed ? '↗' : '−'}</button>
    <div id="playbook-playback-progress" role="progressbar" aria-label="播放进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></div>
  </main>;
}
