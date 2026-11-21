import { useState } from 'react';
import { useApi } from '../api.js';
import { BandColumns, Empty } from '../charts/Bars.jsx';
import { Treemap } from '../charts/Treemap.jsx';
import { useFilters } from '../filters.jsx';
import { fmt } from '../util.js';

const TOP = 20;
const SIZES = [
  { name: '5 to 9', from: 5, to: 9 }, { name: '10 to 19', from: 10, to: 19 },
  { name: '20 to 49', from: 20, to: 49 }, { name: '50 or more', from: 50, to: Infinity },
];
const NONE = 'No employer has five or more of these members';

export default function Employers() {
  const { values } = useFilters();
  const { data } = useApi('/employers', values);
  const [find, setFind] = useState('');
  const rows = data ? data.rows : [];
  const most = Math.max(1, ...rows.map((r) => r.members));
  const covered = rows.reduce((n, r) => n + r.members, 0);
  const five = rows.slice(0, 5).reduce((n, r) => n + r.members, 0);
  const pct = (n) => (data && data.total ? (100 * n) / data.total : 0);
  const wanted = find.trim().toLowerCase();
  const listed = wanted ? rows.filter((r) => r.employer.toLowerCase().includes(wanted)) : rows;
  const sizes = SIZES.map((s) => {
    const inBand = rows.filter((r) => r.members >= s.from && r.members <= s.to);
    return { category: s.name, members: inBand.length, people: inBand.reduce((n, r) => n + r.members, 0) };
  });

  return (
    <section className="wf-pane" id="employers">
      <h2 className="wf-h2">Employers</h2>
      <p className="wf-sub">Employers with five or more of the members shown, as a guide to sponsors, hosts and corporate outreach.</p>

      <div className="wf-kpis">
        <div className="wf-card wf-kpi">
          <div className="wf-k-label">Employers with five or more members</div>
          <div className="wf-k-num">{data ? fmt.int(rows.length) : '—'}</div>
          <div className="wf-k-sub">smaller employers are not stored or named, so no row points to a handful of people</div>
        </div>
        <div className="wf-card wf-kpi">
          <div className="wf-k-label">Members who work at them</div>
          <div className="wf-k-num">{data ? fmt.int(covered) : '—'}</div>
          <div className="wf-k-visual"><div className="wf-meter"><i style={{ width: `${pct(covered)}%` }} /></div></div>
          <div className="wf-k-sub">{data ? fmt.pct(pct(covered)) : '—'} of the members shown</div>
        </div>
        <div className="wf-card wf-kpi">
          <div className="wf-k-label">At the five largest</div>
          <div className="wf-k-num">{data ? fmt.int(five) : '—'}</div>
          <div className="wf-k-visual"><div className="wf-meter"><i style={{ width: `${pct(five)}%` }} /></div></div>
          <div className="wf-k-sub">{data ? fmt.pct(pct(five)) : '—'} of the members shown{rows.length ? `: ${rows.slice(0, 5).map((r) => r.employer).join(', ')}` : ''}</div>
        </div>
      </div>

      <div className="wf-card wf-gap">
        <h3 className="wf-h3">Largest employers</h3>
        <p className="wf-note wf-tight">The {Math.min(TOP, rows.length) || TOP} largest. Each box is sized by its number of members.</p>
        <Treemap rows={data && rows.slice(0, TOP).map((r) => ({ category: r.employer, members: r.members, share: r.share }))}
          height={340} empty={NONE} />
      </div>

      <div className="wf-two wf-gap">
        <div className="wf-card">
          <div className="wf-drill-head">
            <h3 className="wf-h3 wf-flow-title">Every employer with five or more</h3>
            <input className="wf-find" type="search" value={find} onChange={(e) => setFind(e.target.value)}
              placeholder="Find an employer" aria-label="Find an employer" />
          </div>
          {!data ? <Empty>—</Empty> : !rows.length ? <Empty>{NONE}</Empty> : !listed.length ? <Empty>No employer matches “{find.trim()}”</Empty> : (
            <div className="wf-scroll">
              <table className="wf-table">
                <thead><tr><th>Employer</th><th className="wf-num">Members</th><th className="wf-num">Share</th></tr></thead>
                <tbody>
                  {listed.map((r) => (
                    <tr key={r.employer}>
                      <td>{r.employer}</td>
                      <td className="wf-num wf-cellbar"><i style={{ width: `${(100 * r.members) / most}%` }} /><span>{fmt.int(r.members)}</span></td>
                      <td className="wf-num">{fmt.pct(r.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="wf-card">
          <h3 className="wf-h3">How large the employer groups are</h3>
          <p className="wf-note wf-tight">Number of employers by how many of the members shown work there.</p>
          <div className="wf-chart">
            {data && !rows.length ? <Empty>{NONE}</Empty> : (
              <BandColumns rows={data && sizes} unit="members at the employer"
                tipFor={(r) => `${fmt.int(r.members)} ${r.members === 1 ? 'employer has' : 'employers have'} ${r.category} members: ${fmt.int(r.people)} members in all`} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
