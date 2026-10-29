import React from 'react';
import './narration-toggle.css';

export default function NarrationToggle({ enabled, onChange, disabled }) {
  return <button type="button" className="narration-toggle" role="switch" aria-label="语音讲解" aria-checked={enabled} disabled={disabled} onClick={() => onChange(!enabled)} title="自动朗读开场和步骤说明，已有录音优先。开启后从下一段生效，关闭立即停止。"><span>语音讲解</span><span className="narration-toggle-state" aria-hidden="true">{enabled ? '开' : '关'}</span></button>;
}
