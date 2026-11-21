import { useEffect, useState } from 'react';
import logo from './assets/wf_isaca_logo.png';

const PATHS = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h5v-6h4v6h5V9.5" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 20v-6" /><path d="M12 20V9" /><path d="M16 20v-9" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17" /><path d="M8 3v4" /><path d="M16 3v4" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0" /><path d="M12 17.5V21" /><path d="M8.5 21h7" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></>,
  gear: <><path d="M10.34 5.20 L10.81 2.88 L13.19 2.88 L13.66 5.20 L15.63 6.02 L17.61 4.71 L19.29 6.39 L17.98 8.37 L18.80 10.34 L21.12 10.81 L21.12 13.19 L18.80 13.66 L17.98 15.63 L19.29 17.61 L17.61 19.29 L15.63 17.98 L13.66 18.80 L13.19 21.12 L10.81 21.12 L10.34 18.80 L8.37 17.98 L6.39 19.29 L4.71 17.61 L6.02 15.63 L5.20 13.66 L2.88 13.19 L2.88 10.81 L5.20 10.34 L6.02 8.37 L4.71 6.39 L6.39 4.71 L8.37 6.02Z" /><circle cx="12" cy="12" r="3" /></>,
  menu: <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>,
  collapse: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="m15.5 9.5-2.5 2.5 2.5 2.5" /></>,
  expand: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="m13.5 9.5 2.5 2.5-2.5 2.5" /></>,
};

export function Icon({ name, size = 20 }) {
  return (
    <svg className="wf-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>
  );
}

function remembered() {
  try { return window.localStorage.getItem('wf-nav') === 'collapsed'; } catch { return false; }
}

// The frame around every page: a navigation pane on the left that can be collapsed to icons, and a bar across
// the top with the page title. On a narrow screen the pane slides in over the page from a menu button.
export default function Shell({ sections, current, title, tools, children }) {
  const [collapsed, setCollapsed] = useState(remembered);
  const [open, setOpen] = useState(false); // narrow screens only

  useEffect(() => {
    try { window.localStorage.setItem('wf-nav', collapsed ? 'collapsed' : 'open'); } catch { /* not saved */ }
  }, [collapsed]);
  useEffect(() => { setOpen(false); }, [current]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={`wf-shell${collapsed ? ' wf-shell-collapsed' : ''}${open ? ' wf-shell-open' : ''}`}>
      <aside className="wf-side" id="wf-side">
        <div className="wf-side-top">
          <a className="wf-side-brand" href="#home" aria-label="ISACA West Florida Chapter, home">
            <img src={logo} alt="" width="462" height="160" />
          </a>
          <button type="button" className="wf-side-toggle" aria-expanded={!collapsed} aria-controls="wf-side"
            aria-label={collapsed ? 'Expand the navigation' : 'Collapse the navigation'} title={collapsed ? 'Expand' : 'Collapse'}
            onClick={() => setCollapsed(!collapsed)}>
            <Icon name={collapsed ? 'expand' : 'collapse'} />
          </button>
        </div>
        <nav className="wf-nav" aria-label="Site">
          {sections.map((s) => (
            <a key={s.id} className="wf-nav-item" href={`#${s.id}`} aria-current={s.id === current ? 'page' : undefined}
              title={collapsed ? s.name : undefined} onClick={() => setOpen(false)}>
              <Icon name={s.icon} />
              <span className="wf-nav-name">{s.name}</span>
              {!s.ready && <span className="wf-nav-soon">Soon</span>}
            </a>
          ))}
        </nav>
        <div className="wf-side-foot">ISACA West Florida Chapter</div>
      </aside>
      <button type="button" className="wf-scrim" aria-label="Close the navigation" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} />
      <div className="wf-main">
        <header className="wf-topbar">
          <button type="button" className="wf-menu" aria-label="Open the navigation" aria-expanded={open} aria-controls="wf-side"
            onClick={() => setOpen(true)}><Icon name="menu" /></button>
          <h1 className="wf-title">{title}</h1>
          {tools}
        </header>
        <main className="wf-content">{children}</main>
      </div>
    </div>
  );
}
