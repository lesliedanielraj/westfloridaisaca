import { useState } from 'react';
import { useApi } from '../api.js';
import { Bars } from '../charts/Bars.jsx';
import FloridaMap from '../charts/FloridaMap.jsx';
import Matrix from '../charts/Matrix.jsx';
import { useFilters } from '../filters.jsx';
import { fmt } from '../util.js';

const COLUMNS = [
  { key: 'county', name: 'County' },
  { key: 'members', name: 'Members', num: true },
  { key: 'share', name: 'Share', num: true },
  { key: 'new_12mo', name: 'Joined, last 12 months', num: true },
  { key: 'certified', name: 'With a credential', num: true },
];

export default function Where() {
  const filters = useFilters();
  const { values, toggle } = filters;
  // The county list ignores the county filter, so the other counties stay visible to pick from.
  const { data: counties } = useApi('/counties', filters.without('county'));
  const { data: zips } = useApi('/zips', values);
  const { data: cities } = useApi('/cities', values);
  const { data: regions } = useApi('/region-function', values);
  const [sort, setSort] = useState({ key: 'members', down: true });
  const sortBy = (key) => setSort((now) => (now.key === key ? { key, down: !now.down } : { key, down: key !== 'county' }));
  const rows = (counties ? counties.rows : []).map((c) => ({
    ...c, recent: c.members ? (100 * c.new_12mo) / c.members : 0, held: c.members ? (100 * c.certified) / c.members : 0,
  }));
  const most = Math.max(1, ...rows.map((c) => c.members));
  const sorted = [...rows].sort((a, b) => {
    const order = sort.key === 'county' ? a.county.localeCompare(b.county) : a[sort.key] - b[sort.key];
    return (sort.down ? -order : order) || b.members - a.members;
  });

  return (
    <section className="wf-pane" id="where">
      <h2 className="wf-h2">Where members live</h2>
      <p className="wf-sub">
        By home ZIP code. Click a county on the map or in the table to filter every tab by it; Reset clears it. Zoom with
        the buttons, a double-click or a pinch, and drag to move once zoomed in.
      </p>
      <div className="wf-two">
        <div className="wf-card wf-map">
          <FloridaMap counties={counties && counties.rows} zips={zips && zips.rows} picked={values.county} onPick={(county) => toggle('county', county)} onClear={() => filters.set('county', null)}
            label="Map of west central Florida showing where members live" />
        </div>
        <div className="wf-stack">
          <div className="wf-card">
            <h3 className="wf-h3">Largest home cities</h3>
            <div className="wf-chart"><Bars rows={cities && cities.rows} label="city" top={15} lollipop /></div>
          </div>
          <div className="wf-card">
            <h3 className="wf-h3">Counties</h3>
            <p className="wf-note wf-tight">Click a heading to sort. The small percentages are shares of that county&apos;s members.</p>
            <div className="wf-scroll">
              <table className="wf-table">
                <thead>
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className={c.num ? 'wf-num' : undefined} aria-sort={sort.key === c.key ? (sort.down ? 'descending' : 'ascending') : 'none'}>
                        <button type="button" className="wf-sort" onClick={() => sortBy(c.key)}>
                          {c.name}<span aria-hidden="true">{sort.key === c.key ? (sort.down ? ' ↓' : ' ↑') : ''}</span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c) => (
                    <tr key={c.county} className={`wf-row-pick${values.county === c.county ? ' wf-row-on' : ''}`}
                      tabIndex={0} role="button" aria-pressed={values.county === c.county}
                      onClick={() => toggle('county', c.county)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle('county', c.county); } }}>
                      <td>{c.county}</td>
                      <td className="wf-num wf-cellbar">
                        <i style={{ width: `${(100 * c.members) / most}%` }} /><span>{fmt.int(c.members)}</span>
                      </td>
                      <td className="wf-num">{fmt.pct(c.share)}</td>
                      <td className="wf-num">{fmt.int(c.new_12mo)} <span className="wf-quiet">· {fmt.pct(c.recent)}</span></td>
                      <td className="wf-num">{fmt.int(c.certified)} <span className="wf-quiet">· {fmt.pct(c.held)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <div className="wf-card wf-gap">
        <h3 className="wf-h3">Job function by home region</h3>
        <p className="wf-note wf-tight">Darker cells are a larger share of that region&apos;s members, so each row can be read on its own.</p>
        <Matrix data={regions} />
      </div>
    </section>
  );
}
