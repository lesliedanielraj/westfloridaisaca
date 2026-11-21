import { useEffect, useState } from 'react';
import { useApi } from './api.js';
import logo from './assets/wf_isaca_logo.png';
import { FILTER_LABELS, FILTER_NAMES, useFilters } from './filters.jsx';
import Credentials from './pages/Credentials.jsx';
import Employers from './pages/Employers.jsx';
import Growth from './pages/Growth.jsx';
import Overview from './pages/Overview.jsx';
import Where from './pages/Where.jsx';
import Who from './pages/Who.jsx';
import { fmt } from './util.js';

const TABS = [
  ['overview', 'Overview', Overview],
  ['where', 'Where', Where],
  ['who', 'Who', Who],
  ['credentials', 'Credentials', Credentials],
  ['growth', 'Joining and renewal', Growth],
  ['employers', 'Employers', Employers],
];
const tabFromAddress = () => {
  const name = window.location.hash.replace('#', '');
  return TABS.some(([id]) => id === name) ? name : 'overview';
};

// Auto follows the computer's setting; light and dark override it. The choice is remembered.
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

// Light or dark, and one of five colour themes. Both are remembered on this computer.
function Appearance() {
  const [mode, setMode] = useState(() => saved('wf-theme', MODES.map((m) => m[0]), 'auto'));
  const [accent, setAccent] = useState(() => saved('wf-accent', ACCENTS.map((a) => a[0]), 'blue'));
  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode);
    if (accent === 'blue') root.removeAttribute('data-accent'); else root.setAttribute('data-accent', accent);
    try {
      window.localStorage.setItem('wf-theme', mode);
      window.localStorage.setItem('wf-accent', accent);
    } catch { /* not saved */ }
  }, [mode, accent]);
  return (
    <div className="wf-looks">
      <div className="wf-swatches" role="radiogroup" aria-label="Colour theme">
        {ACCENTS.map(([id, name, light]) => (
          <button key={id} type="button" role="radio" aria-checked={accent === id} aria-label={`${name} colour theme`} title={name}
            className="wf-swatch-btn" style={{ background: light }} onClick={() => setAccent(id)} />
        ))}
      </div>
      <div className="wf-seg" role="group" aria-label="Light or dark">
        {MODES.map(([id, name]) => (
          <button key={id} type="button" className="wf-seg-btn" aria-pressed={mode === id} onClick={() => setMode(id)}>{name}</button>
        ))}
      </div>
    </div>
  );
}

function Header({ summary }) {
  const { any } = useFilters();
  const s = summary;
  return (
    <header className="wf-head">
      <Appearance />
      <div className="wf-brand"><img className="wf-logo" src={logo} alt="ISACA West Florida Chapter" width="462" height="160" /></div>
      <h1 className="wf-title">West Florida ISACA Member Insights</h1>
      <p className="wf-lede">
        {!s ? '—' : s.withheld ? (
          <>Fewer than {s.min_selection} members match these filters, so nothing is shown: figures for so few would describe
            individuals. Clear a filter to see more.</>
        ) : (
          <><b>{fmt.int(s.members)}</b> members{any ? ' match the filters' : ''}, as of {fmt.date(s.as_of)}. Counts only: the site holds no names or contact details.</>
        )}
      </p>
    </header>
  );
}

function FilterBar({ meta, tab, setTab }) {
  const { values, set, clear, any } = useFilters();
  return (
    <div className="wf-bar" id="controls">
      <div className="wf-filters" role="group" aria-label="Filters">
        {FILTER_NAMES.map((name) => (
          <label key={name} className="wf-drill-pick">{FILTER_LABELS[name]}
            <select className={`dash-select${values[name] ? ' wf-select-on' : ''}`} value={values[name] || ''}
              onChange={(e) => set(name, e.target.value)}>
              <option value="">All</option>
              {meta.filters[name].map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        ))}
        {any && <button type="button" className="wf-clear" onClick={clear}>Clear filters</button>}
      </div>
      <div className="wf-tabs" role="tablist" aria-label="Sections">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id}
            className={`wf-tab${tab === id ? ' wf-tab-on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Notes() {
  return (
    <details className="wf-details" id="notes">
      <summary>How these numbers are made, and their limits</summary>
      <ul>
        <li>Everything comes from ISACA&apos;s chapter reports. The roster is a snapshot: it shows who is a member now, not who
          attends events or how membership changed over time.</li>
        <li>Filters combine. Shares are a percentage of the members the filters select, or of all members when none is set.</li>
        <li>Location uses each member&apos;s home ZIP code. Members with a home address outside Florida are counted in totals but
          not shown on the map.</li>
        <li>Job function and seniority are groupings of the professional area each member chose. The original categories are
          on the Who tab.</li>
        <li>Seniority groups: C-suite and executives are the chief officer, VP and EVP categories; directors, managers and
          consultants are the categories named that way; staff and senior staff are the staff and auditor categories; students
          and academics are students, professors and teachers.</li>
        <li>Small groups are held back to protect members. An employer, ZIP code or city shared by fewer than five members
          is not stored, so those members count in their county and in totals but not on the employer list or as a point on
          the map. Filters that select fewer than five members show nothing.</li>
        <li>Dates are kept to the month. Employer names are as members typed them, with common variants of the same name
          merged.</li>
        <li>Small groups give small numbers. A chart for a few dozen members is a count of a few people, not a trend.</li>
      </ul>
    </details>
  );
}

export default function App() {
  const { values } = useFilters();
  const [tab, setTabState] = useState(tabFromAddress);
  const { data: meta, error } = useApi('/meta');
  const { data: summary } = useApi('/summary', values);

  useEffect(() => {
    const onHash = () => setTabState(tabFromAddress());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const setTab = (id) => { window.location.hash = id; setTabState(id); };

  if (error) {
    return (
      <div className="wf-app"><div className="wf-page">
        <h1 className="wf-title">West Florida ISACA Member Insights</h1>
        <p className="wf-error">The site could not reach its data: {error}</p>
      </div></div>
    );
  }
  if (!meta) return <div className="wf-app"><div className="wf-page"><p className="wf-note">Loading…</p></div></div>;

  const Page = TABS.find(([id]) => id === tab)[2];
  return (
    <div className="wf-app">
      <div className="wf-page">
        <Header summary={summary} />
        <FilterBar meta={meta} tab={tab} setTab={setTab} />
        <Page meta={meta} summary={summary} />
        <Notes />
      </div>
    </div>
  );
}
