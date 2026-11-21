import { useApi } from '../api.js';
import { FILTER_LABELS, FILTER_NAMES, useFilters } from '../filters.jsx';
import { fmt } from '../util.js';
import Credentials from './Credentials.jsx';
import Employers from './Employers.jsx';
import Growth from './Growth.jsx';
import Overview from './Overview.jsx';
import Where from './Where.jsx';
import Who from './Who.jsx';

export const TABS = [
  ['overview', 'Overview', Overview],
  ['where', 'Where', Where],
  ['who', 'Who', Who],
  ['credentials', 'Credentials', Credentials],
  ['growth', 'Joining and renewal', Growth],
  ['employers', 'Employers', Employers],
];

// One line under the page title: how many members are shown, or why none are.
function Lede({ summary }) {
  const { any } = useFilters();
  const s = summary;
  return (
    <p className="wf-lede">
      {!s ? '—' : s.withheld ? (
        <>Fewer than {s.min_selection} members match these filters, so nothing is shown: figures for so few would describe
          individuals. Clear a filter to see more.</>
      ) : (
        <><b>{fmt.int(s.members)}</b> members{any ? ' match the filters' : ''}, as of {fmt.date(s.as_of)}. Counts only: the site holds no names or contact details.</>
      )}
    </p>
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

// The member reporting pages: filters, six tabs of charts, and the notes on how the numbers are made.
export default function Reporting({ tab, setTab }) {
  const { values } = useFilters();
  const { data: meta, error } = useApi('/meta');
  const { data: summary } = useApi('/summary', values);

  if (error) return <p className="wf-error">The site could not reach its data: {error}</p>;
  if (!meta) return <p className="wf-note">Loading…</p>;

  const Page = (TABS.find(([id]) => id === tab) || TABS[0])[2];
  return (
    <div className="wf-page">
      <Lede summary={summary} />
      <FilterBar meta={meta} tab={tab} setTab={setTab} />
      <Page meta={meta} summary={summary} />
      <Notes />
    </div>
  );
}
