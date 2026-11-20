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
function ThemeToggle() {
  const order = ['auto', 'light', 'dark'];
  const [theme, setTheme] = useState(() => {
    try { return window.localStorage.getItem('wf-theme') || 'auto'; } catch { return 'auto'; }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
    try { window.localStorage.setItem('wf-theme', theme); } catch { /* not saved */ }
  }, [theme]);
  return (
    <button type="button" className="wf-theme" aria-label="Switch between light and dark mode"
      onClick={() => setTheme(order[(order.indexOf(theme) + 1) % order.length])}>
      Theme: {theme}
    </button>
  );
}

function Header({ summary }) {
  const { values, any } = useFilters();
  const { data: counties } = useApi('/counties', values);
  const top = counties ? counties.rows.slice(0, 3).map((c) => c.county) : [];
  const s = summary;
  return (
    <header className="wf-head">
      <ThemeToggle />
      <div className="wf-brand"><img className="wf-logo" src={logo} alt="ISACA West Florida Chapter" width="462" height="160" /></div>
      <h1 className="wf-title">West Florida ISACA Member Insights</h1>
      <p className="wf-lede">
        {s ? (
          <>
            <b>{fmt.int(s.members)}</b> members{any ? ' match the filters' : ''} as of {fmt.date(s.as_of)}.
            {s.members > 0 && (
              <>
                {!values.county && top.length === 3 && (
                  <> <b>{fmt.pct(s.top3_county_share)}</b> live in {top[0]}, {top[1]} and {top[2]} counties,</>
                )}
                {' '}<b>{fmt.pct(s.certified_share)}</b> hold an ISACA credential, and <b>{fmt.int(s.renewal_due)}</b> memberships end
                on or before 31 December {s.as_of.slice(0, 4)}.
              </>
            )}
          </>
        ) : '—'}
      </p>
      <p className="wf-note">Counts only. The site holds no names or contact details.</p>
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
        <li>Employers and cities are listed only at three or more of the members shown. Employer names are as members typed
          them, with common variants of the same name merged.</li>
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
