(function () {
  const DATA = __DATA__;
  const calcs = {}, draws = {}, listeners = [];
  let params = { seniority: 'All members' };
  let queued = false;
  const run = () => {
    queued = false;
    listeners.forEach((fn) => { try { fn(); } catch (err) { console.error(err); } });
    Object.keys(draws).forEach((name) => {
      document.querySelectorAll('[data-draw="' + name + '"]').forEach((el) => {
        if (el.closest('[hidden]')) return;
        try { draws[name](el); } catch (err) { console.error(err); }
      });
    });
  };
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(run); } };
  window.dash = {
    colors: ['var(--wf-c1)', 'var(--wf-c2)', 'var(--wf-c3)', 'var(--wf-c4)', 'var(--wf-c5)'],
    data(id) {
      if (calcs[id]) {
        const c = calcs[id];
        return { status: 'ok', data: c.fn(...c.inputs.map((i) => window.dash.data(i).data)) };
      }
      return DATA[id] ? { status: 'ok', data: DATA[id] } : { status: 'missing', data: [] };
    },
    calc(id, def) { calcs[id] = def; },
    loader() {},
    draw(name, fn) { if (fn) draws[name] = fn; else schedule(); },
    onData(fn) { listeners.push(fn); },
    params() { return params; },
    setParams(next) { params = Object.assign({}, params, next); schedule(); },
    resetParams() { params = { seniority: 'All members' }; schedule(); },
    setLink(name) { try { history.replaceState(null, '', '#' + name); } catch (err) { /* file pages may refuse */ } },
    refresh() {},
  };
  window.__dashStart = () => {
    run();
    let width = window.innerWidth;
    window.addEventListener('resize', () => { if (window.innerWidth !== width) { width = window.innerWidth; schedule(); } });
    const shown = new WeakMap();
    document.querySelectorAll('.wf-pane').forEach((pane) => {
      shown.set(pane, !pane.hidden);
      new MutationObserver(() => {
        const now = !pane.hidden;
        if (shown.get(pane) === now) return;
        shown.set(pane, now);
        if (now) schedule();
      }).observe(pane, { attributes: true, attributeFilter: ['hidden'] });
    });
  };

  const root = document.documentElement;
  const btn = document.getElementById('theme-toggle');
  const order = ['auto', 'light', 'dark'];
  let theme = 'auto';
  try { theme = localStorage.getItem('wf-theme') || 'auto'; } catch (err) { theme = 'auto'; }
  const apply = () => {
    if (theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
    if (btn) btn.textContent = 'Theme: ' + theme;
  };
  apply();
  if (btn) btn.addEventListener('click', () => {
    theme = order[(order.indexOf(theme) + 1) % order.length];
    try { localStorage.setItem('wf-theme', theme); } catch (err) { /* not saved */ }
    apply();
  });
})();
