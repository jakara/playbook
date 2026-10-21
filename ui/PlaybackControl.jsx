import React, { useEffect, useState } from 'react';
import './playback-control.css';

export default function PlaybackControl() {
  const [data, setData] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    document.title = 'Playbook 播放控制';
    document.documentElement.classList.add('playback-control-window');
    const off = window.playbookControl.onState(setData);
    window.playbookControl.getState().then(setData).catch(error => setError(error.message));
    return off;
  }, []);
  const run = data?.run, paused = run?.state === 'paused';
  const enabled = ['playing', 'paused'].includes(run?.state);
  const progress = run?.total ? Math.round((run.completed || 0) / run.total * 100) : 0;
  const control = command => { setError(''); window.playbookControl.control(command).catch(error => setError(error.message)); };
  return <main className="playback-control-bar" aria-label="全局播放控制">
    <div className="control-brand"><i className={paused ? 'paused' : ''} />Playbook</div>
    <div className="control-caption"><small>{run?.sectionTitle || run?.title || '自动演示'} · {run?.completed || 0} / {run?.total || 0}</small><strong>{error || run?.stepTitle || (run?.state === 'preparing' ? '正在准备演示…' : '自动演示')}</strong></div>
    <button type="button" aria-label={paused ? '继续播放' : '暂停播放'} disabled={!enabled} onClick={() => control(paused ? 'resume' : 'pause')}>{paused ? '▶ 继续' : 'Ⅱ 暂停'}<kbd>{data?.shortcut?.label}</kbd></button>
    <button type="button" aria-label="停止播放" disabled={!run || run.state === 'stopping'} onClick={() => control('stop')}>结束</button>
    <div id="playbook-playback-progress" role="progressbar" aria-label="播放进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></div>
  </main>;
}
