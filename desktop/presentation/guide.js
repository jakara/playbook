(() => {
  if (window.playbookGuide) return;
  const root = document.createElement('div');
  root.id = 'ygd-root'; root.setAttribute('popover', 'manual');
  root.innerHTML = `
    <svg id="ygd-shade" aria-hidden="true"><defs><radialGradient id="ygd-feather"><stop id="ygd-feather-inner" offset="77%" stop-color="black"/><stop offset="100%" stop-color="white"/></radialGradient><filter id="ygd-text-soft"><feGaussianBlur stdDeviation="5"/></filter><mask id="ygd-mask"><rect width="100%" height="100%" fill="white"/><circle id="ygd-hole" cx="-200" cy="-200" r="105" fill="url(#ygd-feather)"/><g id="ygd-text-soft-holes" filter="url(#ygd-text-soft)"></g><g id="ygd-text-holes"></g></mask></defs><rect width="100%" height="100%" fill="#1c2535" fill-opacity=".56" mask="url(#ygd-mask)"/></svg>
    <div id="ygd-cursor" aria-hidden="true"><span class="ygd-halo"></span><svg viewBox="0 0 32 40"><path d="M3 2 L3 31 L11 23 L17 37 L23 34 L17 20 L29 20 Z" fill="white" stroke="#142139" stroke-width="2.4" stroke-linejoin="round"/></svg><span class="ygd-ripple"></span></div>
    <section id="ygd-card" aria-live="polite" hidden></section>
`;
  document.documentElement.append(root); root.showPopover();
  const $ = selector => root.querySelector(selector);
  const cursor = $('#ygd-cursor'), hole = $('#ygd-hole'), card = $('#ygd-card');
  let position = { x: innerWidth * .7, y: innerHeight * .65 };
  let textSession, cancelled = false, activeEditor;
  const driver = window.driver.js.driver({
    animate: true, duration: 280, overlayOpacity: 0,
    allowClose: false, allowKeyboardControl: false, showButtons: [],
    stagePadding: 8, stageRadius: 9, popoverOffset: 18,
    popoverClass: 'ygd-popover',
  });
  function bringForward(element) {
    root.style.removeProperty('display');
    if (root.matches(':popover-open')) root.hidePopover();
    const parent = element?.closest('dialog[open]') || document.querySelector('dialog[open]') || document.documentElement;
    if (root.parentElement !== parent) parent.append(root);
    root.showPopover();
  }
  function place(x, y) {
    position = { x, y }; cursor.style.transform = `translate(${x}px,${y}px)`;
    hole.setAttribute('cx', x); hole.setAttribute('cy', y);
  }
  function state(value) {
    root.dataset.phase = value.phase;
    if (value.phase !== 'paused') activeEditor?.cancel();
  }
  function center({ eyebrow, title, description, phase = 'ready' }) {
    clearText(); driver.destroy(); bringForward();
    card.replaceChildren(); card.hidden = false; cursor.hidden = true;
    hole.setAttribute('r', 0);
    const tag = document.createElement('div'); tag.className = 'ygd-eyebrow'; tag.textContent = eyebrow;
    const heading = document.createElement('h1'); heading.textContent = title;
    const paragraph = document.createElement('p'); paragraph.textContent = description;
    card.append(tag, heading, paragraph);
    state({ phase, title: phase === 'done' ? '演示已完成' : '核心操作流程', count: phase === 'done' ? '已完成' : '准备就绪', progress: phase === 'done' ? 100 : 0 });
  }
  const escape = value => String(value || '').replace(/[&<>\"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' })[char]);
  function addTextEditor(popover) {
    activeEditor?.cancel();
    const title = popover.querySelector('.driver-popover-title');
    const description = popover.querySelector('.driver-popover-description');
    const controls = document.createElement('div'); controls.className = 'ygd-text-editor';
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'ygd-edit-button'; edit.textContent = '编辑文字';
    const form = document.createElement('form'); form.hidden = true;
    const titleLabel = document.createElement('label'); titleLabel.textContent = '标题';
    const titleInput = document.createElement('input'); titleInput.type = 'text'; titleInput.maxLength = 500; titleInput.required = true;
    const descriptionLabel = document.createElement('label'); descriptionLabel.textContent = '说明';
    const descriptionInput = document.createElement('textarea'); descriptionInput.rows = 5; descriptionInput.maxLength = 5000; descriptionInput.required = true;
    titleLabel.append(titleInput); descriptionLabel.append(descriptionInput);
    const actions = document.createElement('div'); actions.className = 'ygd-edit-actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '取消';
    const save = document.createElement('button'); save.type = 'submit'; save.textContent = '保存到 Playbook';
    const error = document.createElement('p'); error.className = 'ygd-edit-error'; error.setAttribute('role', 'alert'); error.hidden = true;
    actions.append(cancel, save); form.append(titleLabel, descriptionLabel, actions, error); controls.append(edit, form); popover.append(controls);
    const fit = () => {
      popover.style.removeProperty('translate');
      const bounds = popover.getBoundingClientRect();
      const dx = bounds.left < 12 ? 12 - bounds.left : bounds.right > innerWidth - 12 ? innerWidth - 12 - bounds.right : 0;
      const dy = bounds.top < 12 ? 12 - bounds.top : bounds.bottom > innerHeight - 12 ? innerHeight - 12 - bounds.bottom : 0;
      popover.style.translate = `${dx}px ${dy}px`;
    };
    const close = () => { form.hidden = true; edit.hidden = false; title.hidden = false; description.hidden = false; error.hidden = true; popover.classList.remove('ygd-editing'); popover.style.removeProperty('translate'); };
    activeEditor = { cancel: close };
    edit.addEventListener('click', () => {
      if (root.dataset.phase !== 'paused') return;
      titleInput.value = title.textContent; descriptionInput.value = description.textContent;
      title.hidden = true; description.hidden = true; edit.hidden = true; form.hidden = false;
      popover.classList.add('ygd-editing'); fit(); titleInput.focus();
    });
    descriptionInput.addEventListener('input', fit);
    cancel.addEventListener('click', close);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (root.dataset.phase !== 'paused') return;
      const value = { title: titleInput.value, explain: descriptionInput.value };
      if (!value.title.trim() || !value.explain.trim()) { error.textContent = '标题和说明不能为空'; error.hidden = false; return; }
      save.disabled = true; cancel.disabled = true; error.hidden = true;
      try {
        const result = await window.__playbookSaveStepText(value);
        title.textContent = result.title; description.textContent = result.explain;
        close();
      } catch (cause) { error.textContent = cause?.message || '保存失败，请重试'; error.hidden = false; }
      finally { save.disabled = false; cancel.disabled = false; }
    });
  }
  let radius = 105, feather = 24;
  function configure(value) {
    radius = value.spotlightRadius ?? 105; feather = value.spotlightFeather ?? 24;
    $('#ygd-feather-inner').setAttribute('offset', `${Math.max(0, 1 - feather / radius) * 100}%`);
    hole.setAttribute('fill', feather ? 'url(#ygd-feather)' : 'black');
    root.querySelector('#ygd-shade > rect').setAttribute('fill-opacity', value.overlayOpacity ?? .56);
  }
  function clearText() {
    if (textSession) {
      textSession.controller.abort(); textSession.observer.disconnect(); textSession.resize.disconnect();
      if (textSession.frame) cancelAnimationFrame(textSession.frame);
      textSession.popover.remove(); textSession = null;
    }
    $('#ygd-text-holes').replaceChildren(); $('#ygd-text-soft-holes').replaceChildren();
  }
  const svg = name => document.createElementNS('http://www.w3.org/2000/svg', name);
  function visibleTextLines(element) {
    if (!element.isConnected || !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const fragments = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || !node.parentElement?.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        // A clipped glyph row cannot be read, so never report it as a visible spotlight line.
        if (rect.top < 0 || rect.bottom > innerHeight) continue;
        const left = Math.max(0, rect.left), top = Math.max(0, rect.top);
        const right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
        if (right > left && bottom > top) fragments.push({ left, top, right, bottom });
      }
      range.detach();
    }
    fragments.sort((a, b) => a.top - b.top || a.left - b.left);
    const lines = [];
    for (const item of fragments) {
      const line = lines.find(value => Math.abs(value.top - item.top) < 4 && Math.abs(value.bottom - item.bottom) < 5);
      if (line) { line.left = Math.min(line.left, item.left); line.right = Math.max(line.right, item.right); line.top = Math.min(line.top, item.top); line.bottom = Math.max(line.bottom, item.bottom); }
      else lines.push({ ...item });
    }
    return lines;
  }
  function placeTextPopover(popover, lines, preferred) {
    const bounds = lines.reduce((a, b) => ({ left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) }));
    const width = Math.min(360, innerWidth - 24), height = popover.getBoundingClientRect().height;
    const clamp = (value, limit) => Math.max(12, Math.min(value, limit - 12));
    const choices = {
      bottom: { left: clamp(bounds.left, innerWidth - width), top: bounds.bottom + 18 },
      top: { left: clamp(bounds.left, innerWidth - width), top: bounds.top - height - 18 },
      right: { left: bounds.right + 18, top: clamp(bounds.top, innerHeight - height) },
      left: { left: bounds.left - width - 18, top: clamp(bounds.top, innerHeight - height) },
    };
    const order = [preferred, 'bottom', 'top', 'right', 'left'].filter((value, index, all) => all.indexOf(value) === index);
    const score = side => {
      const point = choices[side], endX = point.left + width, endY = point.top + height;
      const outside = Math.max(0, -point.left) + Math.max(0, endX - innerWidth) + Math.max(0, -point.top) + Math.max(0, endY - innerHeight);
      const overlap = lines.reduce((sum, line) => sum + Math.max(0, Math.min(endX, line.right) - Math.max(point.left, line.left)) * Math.max(0, Math.min(endY, line.bottom) - Math.max(point.top, line.top)), 0);
      return outside * 10000 + overlap;
    };
    order.sort((a, b) => score(a) - score(b));
    const point = choices[order[0]];
    popover.style.width = `${width}px`;
    popover.style.left = `${clamp(point.left, innerWidth - width)}px`;
    popover.style.top = `${clamp(point.top, innerHeight - height)}px`;
  }
  function textHighlight(element, step) {
    clearText(); driver.destroy(); bringForward(element);
    card.hidden = true; cursor.hidden = true; hole.setAttribute('r', 0);
    const popover = document.createElement('section'); popover.className = 'driver-popover ygd-popover ygd-text-popover';
    const badge = document.createElement('span'); badge.className = 'ygd-step-tag'; badge.textContent = `步骤 ${String(step.index).padStart(2, '0')} / ${step.total} · ${step.actionLabel || '查看'}`;
    const title = document.createElement('div'); title.className = 'driver-popover-title'; title.textContent = step.title;
    const description = document.createElement('div'); description.className = 'driver-popover-description'; description.textContent = step.description;
    popover.append(badge, title, description); addTextEditor(popover); root.append(popover);
    const controller = new AbortController();
    const session = { element, popover, controller, frame: 0, lines: [], observer: null, resize: null };
    const refresh = () => {
      session.frame = 0;
      if (textSession !== session || cancelled) return;
      session.lines = visibleTextLines(element);
      $('#ygd-text-holes').replaceChildren(); $('#ygd-text-soft-holes').replaceChildren();
      if (!session.lines.length) { popover.hidden = true; return; }
      popover.hidden = false;
      for (const line of session.lines) {
        const rect = svg('rect'); const soft = svg('rect');
        for (const shape of [rect, soft]) {
          shape.setAttribute('x', Math.max(0, line.left - 6)); shape.setAttribute('y', Math.max(0, line.top - 5));
          shape.setAttribute('width', Math.min(innerWidth, line.right + 6) - Math.max(0, line.left - 6));
          shape.setAttribute('height', Math.min(innerHeight, line.bottom + 5) - Math.max(0, line.top - 5));
          shape.setAttribute('rx', 7); shape.setAttribute('fill', 'black');
        }
        $('#ygd-text-holes').append(rect); $('#ygd-text-soft-holes').append(soft);
      }
      placeTextPopover(popover, session.lines, step.side || 'bottom');
    };
    const schedule = () => { if (!session.frame && textSession === session && !cancelled) session.frame = requestAnimationFrame(refresh); };
    session.observer = new MutationObserver(records => { if (records.some(record => !root.contains(record.target))) schedule(); });
    session.resize = new ResizeObserver(schedule);
    textSession = session;
    refresh();
    if (!session.lines.length) { clearText(); throw new Error('文字聚光目标没有可见文字'); }
    session.observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
    session.resize.observe(element);
    addEventListener('scroll', schedule, { capture: true, passive: true, signal: controller.signal });
    addEventListener('resize', schedule, { passive: true, signal: controller.signal });
    visualViewport?.addEventListener('resize', schedule, { passive: true, signal: controller.signal });
    visualViewport?.addEventListener('scroll', schedule, { passive: true, signal: controller.signal });
    document.fonts?.addEventListener('loadingdone', schedule, { signal: controller.signal });
  }
  function highlight(element, step) {
    if (cancelled) return;
    if (step.spotlight === 'text') { textHighlight(element, step); state({ phase: 'playing' }); return; }
    clearText();
    card.hidden = true; cursor.hidden = false; hole.setAttribute('r', radius); bringForward(element);
    driver.highlight({ element, popover: {
      title: escape(step.title), description: escape(step.description),
      side: step.side || 'bottom', align: 'start',
      onPopoverRender(popover) {
        const badge = document.createElement('span'); badge.className = 'ygd-step-tag';
        badge.textContent = `步骤 ${String(step.index).padStart(2, '0')} / ${step.total} · ${step.actionLabel || '查看'}`;
        popover.wrapper.prepend(badge);
        addTextEditor(popover.wrapper);
        // 放在引导层内，确保正文和弹窗预览中都不被蒙层压暗。
        root.append(popover.wrapper);
      },
    }});
    state({ phase: 'playing', title: step.title, count: `${String(step.index).padStart(2, '0')} / ${step.total}`, progress: (step.index - 1) / step.total * 100 });
  }
  function detach() { clearText(); driver.destroy(); card.hidden = true; cursor.hidden = false; hole.setAttribute('r', 0); bringForward(); }
  function clickEffect() {
    cursor.classList.remove('ygd-click'); void cursor.offsetWidth; cursor.classList.add('ygd-click');
  }
  function interactive() { clearText(); driver.destroy(); card.hidden = true; cursor.hidden = true; root.dataset.phase = 'waiting'; root.style.setProperty('display', 'none', 'important'); if (root.matches(':popover-open')) root.hidePopover(); }
  function cancel() { cancelled = true; detach(); cursor.hidden = true; root.style.setProperty('display', 'none', 'important'); if (root.matches(':popover-open')) root.hidePopover(); }
  window.playbookGuide = { interactive, configure, center, highlight, state, place: ({ x, y }) => place(x, y), detach, cancel, clickEffect, position: () => position, bringForward,
    inspect: () => ({ phase: root.dataset.phase, x: position.x, y: position.y, apertureX: Number(hole.getAttribute('cx')), apertureY: Number(hole.getAttribute('cy')), spotlightFeather: feather, cardVisible: !card.hidden, popoverVisible: !!document.querySelector('.ygd-popover'), textLines: textSession?.lines || [], textVisible: !!textSession?.lines.length, textPopover: textSession?.popover.getBoundingClientRect().toJSON() || null }) };
  place(position.x, position.y);
})();
