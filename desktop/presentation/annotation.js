(() => {
  if (window.playbookAnnotations) return;
  const host = document.createElement('div');
  host.id = 'playbook-annotations'; host.setAttribute('popover', 'manual');
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>
    :host { position:fixed; inset:0; width:100vw; height:100vh; margin:0; padding:0; border:0; background:transparent; overflow:visible; pointer-events:none; color:#182a3f; font:14px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif }
    * { box-sizing:border-box }
    [hidden] { display:none!important }
    #outline { position:fixed; border:2px solid #3b91ef; background:#459dff30; box-shadow:0 0 0 100vmax #10233b1c; pointer-events:none; border-radius:3px }
    #tip { position:fixed; max-width:400px; padding:5px 9px; border-radius:5px; color:white; background:#173c67; box-shadow:0 5px 15px #0003; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; pointer-events:none }
    #panel { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:min(480px,calc(100vw - 32px)); padding:20px; border:1px solid #c8d5e3; border-radius:12px; background:#fff; box-shadow:0 18px 65px #10243d55; pointer-events:auto }
    #panel h2 { margin:0 0 6px; font-size:18px }
    #target { color:#52677e; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin:0 0 12px }
    textarea { display:block; width:100%; height:116px; resize:vertical; border:1px solid #aebed0; border-radius:7px; padding:10px; font:inherit; color:inherit }
    textarea:focus-visible,button:focus-visible { outline:3px solid #8ec4ff; outline-offset:2px }
    #error { color:#a43c30; min-height:21px; margin:6px 0; font-size:12px }
    #actions { display:flex; justify-content:flex-end; gap:8px }
    button { font:inherit; cursor:pointer; border:1px solid #b7c5d2; border-radius:7px; padding:7px 11px; color:#18334f; background:#fff }
    button.primary { background:#215e9c; border-color:#215e9c; color:white }
    button.danger { color:#a43c30; margin-right:auto }
    button:disabled { opacity:.55; cursor:default }
    .pin { position:fixed; width:30px; height:30px; padding:0; border-radius:50%; background:#215e9c; border:2px solid white; color:white; box-shadow:0 3px 12px #0005; pointer-events:auto; font-size:15px; font-weight:bold }
    #detail { position:fixed; width:min(340px,calc(100vw - 24px)); padding:14px; border-radius:10px; background:white; border:1px solid #c8d5e3; box-shadow:0 12px 38px #10243d55; pointer-events:auto }
    #detail strong { display:block; margin-bottom:6px }
    #detail p { white-space:pre-wrap; overflow-wrap:anywhere; max-height:180px; overflow:auto; margin:0 0 10px }
    #detail footer { display:flex; gap:8px; justify-content:flex-end }
    #copy-status { color:#52677e; min-height:18px; font-size:12px }
  </style><div id="outline" hidden></div><div id="tip" hidden></div><section id="panel" role="dialog" aria-label="添加批注" hidden><h2>添加批注</h2><p id="target"></p><textarea id="body" maxlength="5000" aria-label="批注内容" placeholder="描述问题、期望效果或改进建议"></textarea><p id="error" role="alert"></p><div id="actions"><button id="cancel" type="button">取消</button><button id="save" type="button" class="primary">确认批注</button></div></section><section id="detail" role="dialog" aria-label="查看批注" hidden><strong>Playbook 批注</strong><p id="detail-body"></p><div id="copy-status" role="status"></div><footer><button id="delete" type="button" class="danger">删除批注</button><button id="close-detail" type="button">关闭</button><button id="copy" type="button" class="primary">复制给智能体</button></footer></section>`;
  const $ = selector => shadow.querySelector(selector);
  const outline = $('#outline'), tip = $('#tip'), panel = $('#panel'), detail = $('#detail');
  const pins = new Map(), removed = new Set();
  let picking = false, selected = null, draft = null, resolvePick = null, frame = 0, currentDetail = null, disposed = false;
  let observedRoute = location.origin + location.pathname;
  const clip = value => String(value || '').replace(/\s+/g, ' ').trim();
  const route = () => location.origin + location.pathname;
  const visible = element => element?.isConnected && element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  const shortName = element => `${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''}${[...element.classList].filter(value => !/^(driver-|ygd-)/.test(value)).slice(0, 2).map(value => '.' + value).join('')}`;
  function selectorFor(element) {
    if (element.id) {
      const id = `#${CSS.escape(element.id)}`;
      if (document.querySelectorAll(id).length === 1) return id;
    }
    for (const key of ['data-testid', 'data-test', 'data-qa']) {
      const value = element.getAttribute(key);
      if (value) {
        const item = `[${key}="${CSS.escape(value)}"]`;
        if (document.querySelectorAll(item).length === 1) return item;
      }
    }
    const parts = [];
    for (let node = element; node && node.nodeType === Node.ELEMENT_NODE; node = node.parentElement) {
      if (node.id) { parts.unshift(`#${CSS.escape(node.id)}`); break; }
      const siblings = [...(node.parentElement?.children || [])].filter(item => item.tagName === node.tagName);
      parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1})`);
      if (node === document.documentElement) break;
    }
    return parts.join(' > ');
  }
  function candidate(x, y) {
    return document.elementsFromPoint(x, y).find(element => element !== host && !host.contains(element)
      && !element.closest?.('#ygd-root,.driver-popover,.driver-overlay,#playbook-annotations')) || null;
  }
  function preview(element) {
    if (!visible(element)) { outline.hidden = true; tip.hidden = true; return; }
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) { outline.hidden = true; tip.hidden = true; return; }
    Object.assign(outline.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    tip.textContent = `${shortName(element)} · 点击选择，Esc 退出`;
    Object.assign(tip.style, { left: `${Math.max(8, Math.min(innerWidth - 250, rect.left))}px`, top: `${Math.max(8, rect.top - 32)}px` });
    outline.hidden = false; tip.hidden = false;
  }
  function onMove(event) { if (picking) preview(candidate(event.clientX, event.clientY)); }
  function onClick(event) {
    if (!picking || event.composedPath().includes(host)) return;
    const element = candidate(event.clientX, event.clientY);
    if (!element) return;
    event.preventDefault(); event.stopImmediatePropagation();
    picking = false; selected = element; draft = null;
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('click', onClick, true);
    outline.hidden = true; tip.hidden = true;
    $('#target').textContent = selectorFor(element);
    $('#body').value = ''; $('#error').textContent = ''; $('#save').disabled = false;
    panel.hidden = false; $('#body').focus();
  }
  function onKey(event) { if (event.key === 'Escape' && (picking || !panel.hidden)) { event.preventDefault(); event.stopImmediatePropagation(); cancelPick(); } }
  function stopSelection() {
    picking = false; document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey, true);
    outline.hidden = true; tip.hidden = true;
    document.documentElement.classList.remove('playbook-annotating');
  }
  function cancelPick() {
    stopSelection(); panel.hidden = true; selected = null; draft = null;
    detail.hidden = true; currentDetail = null; document.documentElement.classList.remove('playbook-annotation-detail');
    const resolve = resolvePick; resolvePick = null; resolve?.(null);
  }
  function start() {
    if (disposed) throw new Error('批注页面已关闭');
    if (resolvePick) throw new Error('已有批注正在进行');
    raise(); document.documentElement.classList.add('playbook-annotating');
    detail.hidden = true; currentDetail = null; document.documentElement.classList.remove('playbook-annotation-detail');
    if (selected && !panel.hidden && draft) { $('#save').disabled = false; $('#error').textContent = ''; }
    else {
      selected = null; draft = null; panel.hidden = true; picking = true;
      document.addEventListener('pointermove', onMove, true);
      document.addEventListener('click', onClick, true);
    }
    document.addEventListener('keydown', onKey, true);
    return new Promise(resolve => { resolvePick = resolve; });
  }
  function elementData(element) {
    return {
      selector: selectorFor(element), tag: element.tagName.toLowerCase(), role: element.getAttribute('role') || '',
      label: element.getAttribute('aria-label') || element.labels?.[0]?.textContent || '',
      text: clip(element.innerText || element.textContent).slice(0, 800),
      nearbyText: clip(element.parentElement?.innerText || element.parentElement?.textContent).slice(0, 800),
    };
  }
  $('#cancel').onclick = cancelPick;
  $('#save').onclick = () => {
    if (!resolvePick || !selected) return;
    const body = $('#body').value.trim();
    if (!body) { $('#error').textContent = '请填写批注内容'; $('#body').focus(); return; }
    draft = { body, page: { url: location.href, title: document.title,
      headings: [...document.querySelectorAll('h1,h2,h3')].filter(visible).slice(0, 6).map(item => clip(item.innerText).slice(0, 160)) },
      element: elementData(selected) };
    $('#save').disabled = true; $('#error').textContent = '正在保存…';
    const resolve = resolvePick; resolvePick = null; resolve(draft);
  };
  function saveError(message) { $('#save').disabled = false; $('#error').textContent = message || '保存失败，请重试'; }
  function update() {
    frame = 0;
    if (disposed) return;
    if (picking) preview(selected);
    const currentRoute = route();
    if (currentRoute !== observedRoute) { observedRoute = currentRoute; detail.hidden = true; currentDetail = null; document.documentElement.classList.remove('playbook-annotation-detail'); }
    for (const value of pins.values()) {
      let element = value.element;
      if (!element?.isConnected) { try { element = document.querySelector(value.annotation.element.selector); } catch { element = null; } value.element = element; }
      const rect = element?.getBoundingClientRect();
      const onScreen = value.route === currentRoute && visible(element) && rect && rect.width > 0 && rect.height > 0
        && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
      value.button.hidden = !onScreen;
      if (onScreen) Object.assign(value.button.style, { left: `${Math.max(4, Math.min(innerWidth - 34, rect.right - 16))}px`, top: `${Math.max(4, Math.min(innerHeight - 34, rect.top - 16))}px` });
    }
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  async function copy(value) {
    try { await navigator.clipboard.writeText(value); return true; } catch {}
    const area = document.createElement('textarea'); area.value = value; area.style.cssText = 'position:fixed;left:-9999px;top:0';
    shadow.append(area); area.select();
    const done = document.execCommand('copy'); area.remove(); return done;
  }
  $('#close-detail').onclick = () => { detail.hidden = true; currentDetail = null; document.documentElement.classList.remove('playbook-annotation-detail'); };
  $('#copy').onclick = async () => {
    if (!currentDetail) return;
    $('#copy-status').textContent = (await copy(currentDetail.prompt)) ? '已复制，可粘贴给智能体' : '复制失败，请在运行记录中复制';
  };
  function remove(id) {
    removed.add(id);
    pins.get(id)?.button.remove(); pins.delete(id);
    if (currentDetail?.annotation.id === id) {
      detail.hidden = true; currentDetail = null; document.documentElement.classList.remove('playbook-annotation-detail');
    }
  }
  $('#delete').onclick = async () => {
    if (!currentDetail || $('#delete').disabled) return;
    const id = currentDetail.annotation.id;
    $('#delete').disabled = true; $('#copy-status').textContent = '正在删除…';
    try { await window.__playbookDeleteAnnotation(id); remove(id); }
    catch (error) { if (currentDetail?.annotation.id === id) $('#copy-status').textContent = error.message || '删除失败，请重试'; }
    finally { $('#delete').disabled = false; }
  };
  function commit(annotation, prompt) {
    stopSelection(); panel.hidden = true;
    if (removed.has(annotation.id)) { selected = null; draft = null; return; }
    selected ||= document.querySelector(annotation.element.selector);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'pin';
    button.setAttribute('aria-label', `查看批注：${annotation.body.slice(0, 40)}`); button.title = '查看 Playbook 批注'; button.textContent = '✎';
    shadow.append(button);
    const value = { annotation, prompt, button, element: selected, route: route() }; pins.set(annotation.id, value);
    button.onclick = () => {
      currentDetail = value; $('#detail-body').textContent = annotation.body; $('#copy-status').textContent = '';
      const rect = button.getBoundingClientRect();
      detail.style.left = `${Math.max(12, Math.min(innerWidth - 352, rect.left))}px`;
      detail.style.top = `${Math.max(12, Math.min(innerHeight - 235, rect.bottom + 7))}px`;
      detail.hidden = false; document.documentElement.classList.add('playbook-annotation-detail'); raise();
    };
    selected = null; draft = null; schedule(); raise();
  }
  function raise() {
    if (disposed) return;
    if (!host.isConnected) (document.querySelector('dialog[open]') || document.documentElement).append(host);
    if (host.matches(':popover-open')) host.hidePopover();
    host.showPopover();
  }
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  addEventListener('scroll', schedule, true); addEventListener('resize', schedule);
  document.documentElement.append(host); host.showPopover();
  const style = document.createElement('style'); style.textContent = 'html.playbook-annotating #ygd-root,html.playbook-annotating .driver-popover,html.playbook-annotating .driver-overlay,html.playbook-annotation-detail #ygd-root,html.playbook-annotation-detail .driver-popover,html.playbook-annotation-detail .driver-overlay { visibility:hidden!important }';
  document.head?.append(style);
  function dispose() {
    if (disposed) return; cancelPick(); disposed = true;
    observer.disconnect(); removeEventListener('scroll', schedule, true); removeEventListener('resize', schedule);
    if (frame) cancelAnimationFrame(frame); style.remove(); host.remove();
    delete window.playbookAnnotations;
  }
  window.playbookAnnotations = { start, cancelPick, commit, remove, saveError, raise, dispose,
    inspect: () => ({ picking, formVisible: !panel.hidden, detailVisible: !detail.hidden, bodyLength: $('#body').value.length,
      formError: $('#error').textContent, saveDisabled: $('#save').disabled, focused: shadow.activeElement?.id || '', copyStatus: $('#copy-status').textContent,
      saveRect: $('#save').getBoundingClientRect().toJSON(),
      copyRect: $('#copy').getBoundingClientRect().toJSON(),
      deleteRect: $('#delete').getBoundingClientRect().toJSON(),
      pinCount: pins.size, pins: [...pins.values()].map(item => ({ id: item.annotation.id, visible: !item.button.hidden, rect: item.button.getBoundingClientRect().toJSON() })) }) };
})();
