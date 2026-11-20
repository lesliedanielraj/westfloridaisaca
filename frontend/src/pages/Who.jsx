import { useApi } from '../api.js';
import { Bars, SplitBar, Waffle } from '../charts/Bars.jsx';
import Donut from '../charts/Donut.jsx';
import { useFilters } from '../filters.jsx';
import { fmt } from '../util.js';

export default function Who() {
  const { values } = useFilters();
  const { data: tenure } = useApi('/breakdown/tenure', values);
  const { data: level } = useApi('/breakdown/member_level', values);
  const { data: type } = useApi('/breakdown/member_type', values);
  const { data: gender } = useApi('/breakdown/gender', values);
  const { data: area } = useApi('/breakdown/professional_area', values);
  const unstated = gender && gender.rows.find((r) => r.category === 'Not stated');

  return (
    <section className="wf-pane" id="who">
      <h2 className="wf-h2">Who the members are</h2>
      <p className="wf-sub">How the members shown divide by tenure, level, type and gender.</p>
      <div className="wf-grid">
        <div className="wf-card"><h3 className="wf-h3">Tenure</h3>
          <div className="wf-chart"><SplitBar rows={tenure && tenure.rows} /></div></div>
        <div className="wf-card"><h3 className="wf-h3">Member level</h3>
          <div className="wf-chart"><Donut rows={level && level.rows} ordered label="Members by member level" /></div></div>
        <div className="wf-card"><h3 className="wf-h3">Member type</h3>
          <div className="wf-chart"><Waffle rows={type && type.rows} /></div>
          <p className="wf-note">One hundred squares, each about 1% of the group. Types under half a percent get no square.</p></div>
        <div className="wf-card"><h3 className="wf-h3">Gender</h3>
          <div className="wf-chart"><Donut rows={gender && gender.rows} label="Members by gender" /></div>
          <p className="wf-note">{unstated ? `${fmt.pct(unstated.share)} of these members did not state a gender.` : 'Every member here stated a gender.'}</p></div>
      </div>
      <div className="wf-card wf-gap">
        <h3 className="wf-h3">Professional area, as members chose it</h3>
        <p className="wf-note wf-tight">Job function and seniority are groupings of these categories.</p>
        <Bars rows={area && area.rows} wide />
      </div>
    </section>
  );
}
