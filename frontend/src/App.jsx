import { useEffect, useRef, useState } from 'react';
import Placeholder from './pages/Placeholder.jsx';
import Reporting, { TABS } from './pages/Reporting.jsx';
import Shell, { Icon } from './Shell.jsx';

// The site's sections, in the order the navigation lists them. `ready` is false while a page is not built.
export const SECTIONS = [
  { id: 'home', name: 'Home', icon: 'home', ready: false },
  { id: 'reporting', name: 'Reporting', icon: 'chart', ready: true, title: 'Member Insights' },
  { id: 'events', name: 'Event Management', icon: 'calendar', ready: false },
  { id: 'speakers', name: 'Speaker Management', icon: 'mic', ready: false },
  { id: 'contact', name: 'Contact Us', icon: 'mail', ready: false },
];

// Where the address points: '#events' is a section, '#where' is a tab of Reporting (so older links still work).
function routeFromAddress() {
  const id = window.location.hash.slice(1);
  if (TABS.some(([tab]) => tab === id)) return { section: 'reporting', tab: id };
  if (SECTIONS.some((s) => s.id === id)) return { section: id, tab: TABS[0][0] };
  return { section: 'home', tab: TABS[0][0] };
}

const MODES = [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']];
// Colour themes: the name, and the lead colour shown on its button in light and in dark.
const ACCENTS = [
  ['blue', 'Blue', '#3565c9', '#5f8fe8'], ['teal', 'Teal', '#00909a', '#159fa8'], ['violet', 'Violet', '#6b4fc0', '#9076ee'],
  ['green', 'Green', '#2e8552', '#3aad6e'], ['crimson', 'Crimson', '#b23a52', '#e35f7c'],
];

function saved(key, allowed, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return allowed.includes(value) ? value : fallback;
  } catch { return fallback; }
}

// The settings gear in the top bar. Its panel holds the appearance choices: light or dark, and one of five
// colour themes. Both are remembered on this computer, and applied whether or not the panel is open.
function Settings() {
  const [mode, setMode] = useState(() => saved('wf-theme', MODES.map((m) => m[0]), 'auto'));
  const [accent, setAccent] = useState(() => saved('wf-accent', ACCENTS.map((a) => a[0]), 'blue'));
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode);
    if (accent === 'blue') root.removeAttribute('data-accent'); else root.setAttribute('data-accent', accent);
    try {
      window.localStorage.setItem('wf-theme', mode);
      window.localStorage.setItem('wf-accent', accent);
    } catch { /* not saved */ }
  }, [mode, accent]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    const onDown = (event) => { if (box.current && !box.current.contains(event.target)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); };
  }, [open]);

  return (
    <div className="wf-settings" ref={box}>
      <button type="button" className="wf-gear" aria-label="Settings" title="Settings" aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen(!open)}><Icon name="gear" /></button>
      {open && (
        <div className="wf-settings-panel" role="dialog" aria-label="Settings">
          <div className="wf-settings-head">Settings</div>
          <div className="wf-settings-label" id="wf-set-mode">Appearance</div>
          <div className="wf-seg wf-seg-fill" role="group" aria-labelledby="wf-set-mode">
            {MODES.map(([id, name]) => (
              <button key={id} type="button" className="wf-seg-btn" aria-pressed={mode === id} onClick={() => setMode(id)}>{name}</button>
            ))}
          </div>
          <div className="wf-settings-label" id="wf-set-colour">Colour theme</div>
          <div className="wf-swatches" role="radiogroup" aria-labelledby="wf-set-colour">
            {ACCENTS.map(([id, name, light]) => (
              <button key={id} type="button" role="radio" aria-checked={accent === id} aria-label={`${name} colour theme`} title={name}
                className="wf-swatch-btn" style={{ background: light }} onClick={() => setAccent(id)} />
            ))}
          </div>
          <div className="wf-settings-note">{ACCENTS.find((a) => a[0] === accent)[1]}, {MODES.find((m) => m[0] === mode)[1].toLowerCase()}. Saved on this computer.</div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState(routeFromAddress);
  useEffect(() => {
    const onHash = () => setRoute(routeFromAddress());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const section = SECTIONS.find((s) => s.id === route.section);
  const title = section.title || section.name;
  useEffect(() => { document.title = `${title} · ISACA West Florida`; }, [title]);
  const setTab = (id) => { window.location.hash = id; };

  return (
    <Shell sections={SECTIONS} current={section.id} title={title} tools={<Settings />}>
      {section.id === 'reporting'
        ? <Reporting tab={route.tab} setTab={setTab} />
        : <Placeholder name={section.name} icon={<Icon name={section.icon} size={30} />} />}
    </Shell>
  );
}
