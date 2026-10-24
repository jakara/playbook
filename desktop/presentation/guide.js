(() => {
  if (window.playbookGuide) return;
  const root = document.createElement('div');
  root.id = 'ygd-root'; root.setAttribute('popover', 'manual');
  root.innerHTML = `
    <svg id="ygd-shade" aria-hidden="true"><defs><radialGradient id="ygd-feather"><stop id="ygd-feather-inner" offset="77%" stop-color="black"/><stop offset="100%" stop-color="white"/></radialGradient><mask id="ygd-mask"><rect width="100%" height="100%" fill="white"/><circle id="ygd-hole" cx="-200" cy="-200" r="105" fill="url(#ygd-feather)"/></mask></defs><rect width="100%" height="100%" fill="#1c2535" fill-opacity=".56" mask="url(#ygd-mask)"/></svg>
    <div id="ygd-cursor" aria-hidden="true"><span class="ygd-halo"></span><svg viewBox="0 0 32 40"><path d="M3 2 L3 31 L11 23 L17 37 L23 34 L17 20 L29 20 Z" fill="white" stroke="#142139" stroke-width="2.4" stroke-linejoin="round"/></svg><span class="ygd-ripple"></span></div>
    <section id="ygd-card" aria-live="polite" hidden></section>
`;
  document.body.append(root); root.showPopover();
  const $ = selector => root.querySelector(selector);
  const cursor = $('#ygd-cursor'), hole = $('#ygd-hole'), card = $('#ygd-card');
  let position = { x: innerWidth * .7, y: innerHeight * .65 };
  const driver = window.driver.js.driver({
    animate: true, duration: 280, overlayOpacity: 0,
    allowClose: false, allowKeyboardControl: false, showButtons: [],
    stagePadding: 8, stageRadius: 9, popoverOffset: 18,
    popoverClass: 'ygd-popover',
  });
  function bringForward(element) {
    root.style.removeProperty('display');
    if (root.matches(':popover-open')) root.hidePopover();
    const parent = element?.closest('dialog[open]') || document.querySelector('dialog[open]') || document.body;
    if (root.parentElement !== parent) parent.append(root);
    root.showPopover();
  }
  function place(x, y) {
    position = { x, y }; cursor.style.transform = `translate(${x}px,${y}px)`;
    hole.setAttribute('cx', x); hole.setAttribute('cy', y);
  }
  function state(value) { root.dataset.phase = value.phase; }
  function center({ eyebrow, title, description, phase = 'ready' }) {
    driver.destroy(); bringForward();
    card.replaceChildren(); card.hidden = false; cursor.hidden = true;
    hole.setAttribute('r', 0);
    const tag = document.createElement('div'); tag.className = 'ygd-eyebrow'; tag.textContent = eyebrow;
    const heading = document.createElement('h1'); heading.textContent = title;
    const paragraph = document.createElement('p'); paragraph.textContent = description;
    card.append(tag, heading, paragraph);
    state({ phase, title: phase === 'done' ? '演示已完成' : '核心操作流程', count: phase === 'done' ? '已完成' : '准备就绪', progress: phase === 'done' ? 100 : 0 });
  }
  const escape = value => String(value || '').replace(/[&<>\"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' })[char]);
  let radius = 105, feather = 24;
  function configure(value) {
    radius = value.spotlightRadius ?? 105; feather = value.spotlightFeather ?? 24;
    $('#ygd-feather-inner').setAttribute('offset', `${Math.max(0, 1 - feather / radius) * 100}%`);
    hole.setAttribute('fill', feather ? 'url(#ygd-feather)' : 'black');
    root.querySelector('#ygd-shade > rect').setAttribute('fill-opacity', value.overlayOpacity ?? .56);
  }
  function highlight(element, step) {
    card.hidden = true; cursor.hidden = false; hole.setAttribute('r', radius); bringForward(element);
    driver.highlight({ element, popover: {
      title: escape(step.title), description: escape(step.description),
      side: step.side || 'bottom', align: 'start',
      onPopoverRender(popover) {
        const badge = document.createElement('span'); badge.className = 'ygd-step-tag';
        badge.textContent = `步骤 ${String(step.index).padStart(2, '0')} / ${step.total} · ${step.actionLabel || '查看'}`;
        popover.wrapper.prepend(badge);
        // 放在引导层内，确保正文和弹窗预览中都不被蒙层压暗。
        root.append(popover.wrapper);
      },
    }});
    state({ phase: 'playing', title: step.title, count: `${String(step.index).padStart(2, '0')} / ${step.total}`, progress: (step.index - 1) / step.total * 100 });
  }
  function detach() { driver.destroy(); card.hidden = true; cursor.hidden = false; bringForward(); }
  function clickEffect() {
    cursor.classList.remove('ygd-click'); void cursor.offsetWidth; cursor.classList.add('ygd-click');
  }
  function interactive() { driver.destroy(); card.hidden = true; cursor.hidden = true; root.dataset.phase = 'waiting'; root.style.setProperty('display', 'none', 'important'); if (root.matches(':popover-open')) root.hidePopover(); }
  window.playbookGuide = { interactive, configure, center, highlight, state, place: ({ x, y }) => place(x, y), detach, clickEffect, position: () => position, bringForward,
    inspect: () => ({ phase: root.dataset.phase, x: position.x, y: position.y, apertureX: Number(hole.getAttribute('cx')), apertureY: Number(hole.getAttribute('cy')), spotlightFeather: feather, cardVisible: !card.hidden, popoverVisible: !!document.querySelector('.ygd-popover') }) };
  place(position.x, position.y);
})();
