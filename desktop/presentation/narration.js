(() => {
  if (window.playbookNarration) return;
  let media, finish, last = { state: 'idle' };
  function stop() {
    if (media) { const current = media; media = null; current.onended = null; current.onerror = null; current.pause(); current.removeAttribute('src'); current.load(); }
    finish?.(); finish = null;
    if (last.state === 'playing' || last.state === 'paused') last.state = 'stopped';
  }
  function play({ dataUrl, kind }) {
    stop(); media = new Audio(dataUrl);
    last = { kind, state: 'playing' };
    return new Promise((resolve, reject) => {
      const current = media;
      const done = error => {
        if (media !== current) return;
        finish = null; last.state = error ? 'failed' : 'ended';
        error ? reject(new Error('语音播放失败，请核对音频格式和音频输出设备。')) : resolve();
      };
      finish = resolve;
      current.onended = () => done(); current.onerror = () => done(true);
      current.play().catch(error => { if (error.name !== 'AbortError') done(true); });
    });
  }
  function state({ phase }) {
    if (['stopping', 'stopped', 'error', 'done'].includes(phase)) { stop(); return; }
    if (!media || !['playing', 'paused'].includes(last.state)) return;
    if (['paused', 'pausing'].includes(phase)) { media.pause(); last.state = 'paused'; }
    else if (phase === 'playing' && last.state === 'paused') { const current = media; last.state = 'playing'; current.play().catch(error => { if (media === current && error.name !== 'AbortError') current.dispatchEvent(new Event('error')); }); }
  }
  window.playbookNarration = { play, state, stop, inspect: () => ({ ...last, time: media?.currentTime || 0, duration: Number.isFinite(media?.duration) ? media.duration : null, paused: media?.paused ?? true }) };
})();
