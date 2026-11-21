import { useState } from 'react';
import { useApi } from '../api.js';
import { BandColumns, Bars, LeadShare, TierBar } from '../charts/Bars.jsx';
import { useFilters } from '../filters.jsx';
import { fmt } from '../util.js';

const TOP_AREAS = 10;

export default function Who() {
  const { values } = useFilters();
  const { data: tenure } = useApi('/breakdown/tenure', values);
  const { data: level } = useApi('/breakdown/member_level', values);
  const { data: type } = useApi('/breakdown/member_type', values);
  const { data: gender } = useApi('/breakdown/gender', values);
  const { data: area } = useApi('/breakdown/professional_area', values);
  const [allAreas, setAllAreas] = useState(false);
  const unstated = gender && gender.rows.find((r) => r.category === 'Not stated');
  const areas = area ? area.rows : null;
  const hidden = areas ? Math.max(0, areas.length - TOP_AREAS) : 0;

  return (
    <section className="wf-pane" id="who">
      <h2 className="wf-h2">Who the members are</h2>
      <p className="wf-sub">How the members shown divide by tenure, level, type and gender.</p>
      <div className="wf-grid">
        <div className="wf-card"><h3 className="wf-h3">Tenure</h3>
          <p className="wf-note wf-tight">Years since the join date on the roster.</p>
          <div className="wf-chart"><BandColumns rows={tenure && tenure.rows} unit="years as a member" /></div></div>
        <div className="wf-card"><h3 className="wf-h3">Member level</h3>
          <p className="wf-note wf-tight">ISACA&apos;s loyalty tiers, highest first.</p>
          <div className="wf-chart"><TierBar rows={level && level.rows} ordered label="Members by member level" /></div></div>
        <div className="wf-card"><h3 className="wf-h3">Member type</h3>
          <div className="wf-chart"><LeadShare rows={type && type.rows} /></div></div>
        <div className="wf-card"><h3 className="wf-h3">Gender</h3>
          <p className="wf-note wf-tight">{unstated ? `${fmt.pct(unstated.share)} did not state a gender.` : 'Every member here stated a gender.'}</p>
          <div className="wf-chart"><TierBar rows={gender && gender.rows} label="Members by gender" /></div></div>
      </div>
      <div className="wf-card wf-gap">
        <h3 className="wf-h3">Professional area, as members chose it</h3>
        <p className="wf-note wf-tight">The answer each member gave ISACA. Job function and seniority, used on the other tabs, are groupings of these.</p>
        <Bars rows={areas && (allAreas ? areas : areas.slice(0, TOP_AREAS))} wide />
        {hidden > 0 && (
          <button type="button" className="wf-more" aria-expanded={allAreas} onClick={() => setAllAreas(!allAreas)}>
            {allAreas ? `Show the largest ${TOP_AREAS} only` : `Show the other ${hidden}`}
          </button>
        )}
      </div>
    </section>
  );
}
