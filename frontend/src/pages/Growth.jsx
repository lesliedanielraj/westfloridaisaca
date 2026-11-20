import { useApi } from '../api.js';
import { SplitBar } from '../charts/Bars.jsx';
import { Columns, Trend } from '../charts/Series.jsx';
import { useFilters } from '../filters.jsx';

export default function Growth() {
  const { values } = useFilters();
  const { data: renewal } = useApi('/breakdown/renewal', values);
  const { data: months } = useApi('/joins/month', values);
  const { data: years } = useApi('/joins/year', values);

  return (
    <section className="wf-pane" id="growth">
      <h2 className="wf-h2">Joining and renewal</h2>
      <div className="wf-card"><h3 className="wf-h3">Renewal status</h3>
        <SplitBar rows={renewal && renewal.rows} /></div>
      <div className="wf-two wf-gap">
        <div className="wf-card"><h3 className="wf-h3">Current members by the month they joined, last two years</h3>
          <div className="wf-chart"><Trend rows={months && months.rows} label="Current members by the month they joined over the last two years" /></div>
          <p className="wf-note">The latest month is partial.</p></div>
        <div className="wf-card"><h3 className="wf-h3">Current members by the year they joined</h3>
          <div className="wf-chart"><Columns rows={years && years.rows} x="year" y="members" label="Current members by the year they joined" /></div>
          <p className="wf-note">Only people still on the roster are counted, so earlier years look smaller than the number who
            actually joined then. This is not a growth trend.</p></div>
      </div>
    </section>
  );
}
