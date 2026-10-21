(() => {
  if (window.playbookPrivacy) return;
  const rules = window.__playbookRedactions || [];
  for (const rule of rules) document.querySelectorAll(rule.selector);
  const style = document.createElement('style');
  style.id = 'playbook-privacy-style';
  // Hide covered pixels in CSS before drawing covers; newly inserted matches never flash their text.
  style.textContent = rules.map(rule => `:is(${rule.selector}) { ${rule.mode === 'blur' ? `filter:blur(${rule.blurPx ?? 12}px)` : 'opacity:0'} !important; }`).join('\n');
  const root = document.createElement('div');
  root.id = 'playbook-redactions'; root.setAttribute('popover', 'manual'); root.setAttribute('aria-hidden', 'true');
  root.style.cssText = 'all:initial;position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;pointer-events:none;overflow:hidden;';
  const cards = new Map();
  let lastDialog;
  function bounds(element, padding) {
    const box = element.getBoundingClientRect();
    if (!box.width || !box.height || getComputedStyle(element).visibility === 'hidden') return null;
    let left = Math.max(0, box.left - padding), top = Math.max(0, box.top - padding);
    let right = Math.min(innerWidth, box.right + padding), bottom = Math.min(innerHeight, box.bottom + padding);
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent), rect = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(css.overflowX)) { left = Math.max(left, rect.left); right = Math.min(right, rect.right); }
      if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) { top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom); }
    }
    return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
  }
  function render() {
    if (!document.documentElement) { requestAnimationFrame(render); return; }
    if (!style.isConnected) document.documentElement.append(style);
    if (!root.isConnected) { document.documentElement.append(root); root.showPopover(); }
    const dialog = [...document.querySelectorAll('dialog[open]')].at(-1);
    if (dialog !== lastDialog) { if (root.matches(':popover-open')) root.hidePopover(); root.showPopover(); lastDialog = dialog; }
    const seen = new Set();
    rules.forEach((rule, index) => {
      if (rule.mode === 'blur') return;
      document.querySelectorAll(rule.selector).forEach(element => {
        if (element === root || root.contains(element)) return;
        const rect = bounds(element, rule.padding ?? 2);
        if (!rect) return;
        seen.add(element);
        let card = cards.get(element);
        if (!card) {
          card = document.createElement('div');
          card.style.cssText = 'all:initial;position:fixed;box-sizing:border-box;display:flex;align-items:center;justify-content:center;background:#28332f;color:#e8ede9;border-radius:4px;font:12px -apple-system,sans-serif;overflow:hidden;pointer-events:none;';
          card.textContent = rule.label || ''; card.dataset.rule = String(index);
          root.append(card); cards.set(element, card);
        }
        const css = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`;
        if (card.dataset.bounds !== css) { card.style.cssText = card.style.cssText.replace(/(?:left|top|width|height):[^;]*;/g, '') + css; card.dataset.bounds = css; }
      });
    });
    for (const [element, card] of cards) if (!seen.has(element)) { card.remove(); cards.delete(element); }
    requestAnimationFrame(render);
  }
  window.playbookPrivacy = { inspect: () => ({ rules: rules.length, covers: [...cards.values()].map(card => ({ rule: Number(card.dataset.rule), ...Object.fromEntries(['left', 'top', 'width', 'height'].map(key => [key, Number.parseFloat(card.style[key])])) })) }) };
  render();
})();
