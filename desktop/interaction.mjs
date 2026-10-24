export class ManualInteraction {
  constructor(options, now = Date.now()) {
    this.prompt = options.prompt || '现在可以亲自操作；完成后点击继续播放。';
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.onTimeout = options.onTimeout || 'continue';
    this.remainingMs = this.timeoutMs || null;
    this.startedAt = now; this.updatedAt = now; this.activityAt = 0;
    this.busy = false; this.paused = false; this.outcome = null;
  }
  update(now, activityAt = this.activityAt) {
    if (this.outcome) return;
    const elapsed = Math.max(0, now - this.updatedAt); this.updatedAt = now;
    if (activityAt > this.activityAt) { this.activityAt = activityAt; this.remainingMs = this.timeoutMs || null; }
    else if (this.remainingMs !== null && !this.busy && !this.paused) {
      this.remainingMs = Math.max(0, this.remainingMs - elapsed);
      if (!this.remainingMs) this.outcome = 'timed-out';
    }
  }
  setBusy(value, now = Date.now()) {
    if (this.outcome) return;
    if (!value) this.update(now);
    this.busy = Boolean(value);
    this.remainingMs = this.timeoutMs || null;
    this.updatedAt = now;
  }
  resume() { if (!this.outcome && !this.busy) this.outcome = 'continued'; }
  state() { return { prompt: this.prompt, remainingMs: this.remainingMs, busy: this.busy, paused: this.paused }; }
  result(now = Date.now()) { return { outcome: this.outcome, elapsedMs: Math.max(0, now - this.startedAt) }; }
}
