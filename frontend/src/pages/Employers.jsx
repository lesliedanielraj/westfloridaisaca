import { useApi } from '../api.js';
import { Bubbles } from '../charts/Treemap.jsx';
import { useFilters } from '../filters.jsx';
import { fmt } from '../util.js';

export default function Employers() {
  const { values } = useFilters();
  const { data } = useApi('/employers', values);
  const rows = data ? data.rows : [];

  return (
    <section className="wf-pane" id="employers">
      <h2 className="wf-h2">Employers</h2>
      <p className="wf-sub">Employers with three or more of the members shown, as a guide to sponsors, hosts and corporate outreach.</p>
      <div className="wf-two">
        <div className="wf-card"><h3 className="wf-h3">Largest employers</h3>
          <div className="wf-chart"><Bubbles rows={data && data.rows} label="The largest employers by number of members" /></div>
          <p className="wf-note">The 25 largest, each circle sized by its members. Point at a circle for its name and count; the
            table lists them all.</p></div>
        <div className="wf-card"><h3 className="wf-h3">All employers with three or more members</h3>
          <div className="wf-scroll">
            <table className="wf-table">
              <thead><tr><th>Employer</th><th className="wf-num">Members</th><th className="wf-num">Share</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employer}><td>{r.employer}</td><td className="wf-num">{fmt.int(r.members)}</td><td className="wf-num">{fmt.pct(r.share)}</td></tr>
                ))}
              </tbody>
            </table>
          </div></div>
      </div>
    </section>
  );
}
