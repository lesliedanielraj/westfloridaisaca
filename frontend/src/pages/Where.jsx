import { useApi } from '../api.js';
import { Bars } from '../charts/Bars.jsx';
import FloridaMap from '../charts/FloridaMap.jsx';
import Matrix from '../charts/Matrix.jsx';
import { useFilters } from '../filters.jsx';
import { fmt } from '../util.js';

export default function Where() {
  const filters = useFilters();
  const { values, toggle } = filters;
  // The county list ignores the county filter, so the other counties stay visible to pick from.
  const { data: counties } = useApi('/counties', filters.without('county'));
  const { data: zips } = useApi('/zips', values);
  const { data: cities } = useApi('/cities', values);
  const { data: regions } = useApi('/region-function', values);

  return (
    <section className="wf-pane" id="where">
      <h2 className="wf-h2">Where members live</h2>
      <p className="wf-sub">
        By home ZIP code. Shading shows members per county; each circle is one ZIP code, sized by its members. Click a county to
        filter every tab by it, and click it again to clear. Zoom with the buttons, a double-click or a pinch, or hold Ctrl or ⌘ while scrolling; drag to move once zoomed in.
      </p>
      <div className="wf-two">
        <div className="wf-card wf-map">
          <FloridaMap counties={counties && counties.rows} zips={zips && zips.rows} picked={values.county} onPick={(county) => toggle('county', county)}
            label="Map of west central Florida with counties shaded by member count and a circle for each home ZIP code" />
        </div>
        <div className="wf-stack">
          <div className="wf-card">
            <h3 className="wf-h3">Largest home cities</h3>
            <div className="wf-chart"><Bars rows={cities && cities.rows} label="city" top={15} lollipop /></div>
          </div>
          <div className="wf-card">
            <h3 className="wf-h3">Counties</h3>
            <p className="wf-note wf-tight">Click a county to filter every tab by it.</p>
            <div className="wf-scroll">
              <table className="wf-table">
                <thead>
                  <tr>
                    <th>County</th><th className="wf-num">Members</th><th className="wf-num">Share</th>
                    <th className="wf-num">Joined, last 12 months</th><th className="wf-num">With a credential</th>
                  </tr>
                </thead>
                <tbody>
                  {(counties ? counties.rows : []).map((c) => (
                    <tr key={c.county} className={`wf-row-pick${values.county === c.county ? ' wf-row-on' : ''}`}
                      tabIndex={0} role="button" aria-pressed={values.county === c.county}
                      onClick={() => toggle('county', c.county)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle('county', c.county); } }}>
                      <td>{c.county}</td>
                      <td className="wf-num">{fmt.int(c.members)}</td>
                      <td className="wf-num">{fmt.pct(c.share)}</td>
                      <td className="wf-num">{fmt.int(c.new_12mo)}</td>
                      <td className="wf-num">{fmt.int(c.certified)}</td>
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
        <p className="wf-note wf-tight">Members in each cell. More strongly shaded cells are a larger share of that region&apos;s members.</p>
        <Matrix data={regions} />
      </div>
    </section>
  );
}
