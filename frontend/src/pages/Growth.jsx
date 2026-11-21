import { useState } from 'react';
import { useApi } from '../api.js';
import { Empty } from '../charts/Bars.jsx';
import { Columns, Trend } from '../charts/Series.jsx';
import { useFilters } from '../filters.jsx';
import { useTip } from '../tooltip.jsx';
import { fmt } from '../util.js';

const SPLITS = [
  { id: 'tenure', name: 'Tenure' },
  { id: 'seniority', name: 'Seniority' },
  { id: 'member_level', name: 'Member level' },
];
const RECENT_YEARS = 3;

// A large ring filled to one share, with the share in its centre.
function BigRing({ share }) {
  const r = 52;
  const round = 2 * Math.PI * r;
  return (
    <svg className="wf-bigring" viewBox="0 0 128 128" aria-hidden="true">
      <circle className="wf-ring-track" cx="64" cy="64" r={r} />
      {share > 0 && (
        <circle className="wf-ring-fill" cx="64" cy="64" r={r} strokeDasharray={`${(round * Math.min(100, share)) / 100} ${round}`}
          transform="rotate(-90 64 64)" />
      )}
      <text x="64" y="60" textAnchor="middle" className="wf-bigring-num">{fmt.pct(share)}</text>
      <text x="64" y="80" textAnchor="middle" className="wf-bigring-cap">renewed</text>
    </svg>
  );
}

export default function Growth() {
  const { values } = useFilters();
  const tip = useTip();
  const [split, setSplit] = useState('tenure');
  const { data: renewal } = useApi(`/renewal/${split}`, values);
  const { data: months } = useApi('/joins/month', values);
  const { data: years } = useApi('/joins/year', values);
  const next = renewal ? renewal.year + 1 : '';
  const recent = years ? years.rows.slice(-RECENT_YEARS) : [];
  const recentCount = recent.reduce((n, r) => n + r.members, 0);

  return (
    <section className="wf-pane" id="growth">
      <h2 className="wf-h2">Joining and renewal</h2>
      <div className="wf-two">
        <div className="wf-card">
          <h3 className="wf-h3">Renewal for {next || 'next year'}</h3>
          {!renewal ? <Empty>—</Empty> : (
            <div className="wf-renew">
              <BigRing share={renewal.renewed_share} />
              <div className="wf-renew-facts">
                <div><b>{fmt.int(renewal.renewed)}</b> of {fmt.int(renewal.total)} members already have a membership that runs into {next}.</div>
                <div><b>{fmt.int(renewal.due)}</b> memberships end on or before {fmt.date(renewal.year_end)}.</div>
                <div className="wf-renew-days"><b>{fmt.int(renewal.days_left)}</b> days were left at the report date.</div>
              </div>
            </div>
          )}
        </div>
        <div className="wf-card">
          <div className="wf-drill-head">
            <h3 className="wf-h3 wf-flow-title">Who has already renewed</h3>
            <div className="wf-seg wf-seg-small" role="group" aria-label="Split the members by">
              {SPLITS.map((s) => (
                <button key={s.id} type="button" className="wf-seg-btn" aria-pressed={split === s.id} onClick={() => setSplit(s.id)}>{s.name}</button>
              ))}
            </div>
          </div>
          <p className="wf-note wf-tight">Each bar is one group; the filled part is the share of it that has renewed.</p>
          {!renewal ? <Empty>—</Empty> : !renewal.rows.length ? <Empty /> : (
            <div className="wf-meterlist">
              {renewal.rows.map((r) => {
                const hover = tip.props(`${r.category}: ${fmt.int(r.renewed)} of ${fmt.int(r.members)} have renewed (${fmt.pct(r.renewed_share)}); ${fmt.int(r.due)} still to renew`);
                return [
                  <div key={`${r.category}-n`} className="wf-bar-label" {...hover}>{r.category}</div>,
                  <div key={`${r.category}-m`} className="wf-meter wf-meter-tall" {...hover}><i style={{ width: `${r.renewed_share}%` }} /></div>,
                  <div key={`${r.category}-v`} className="wf-bar-val" {...hover}><b>{fmt.pct(r.renewed_share)}</b> · {fmt.int(r.renewed)} of {fmt.int(r.members)}</div>,
                ];
              })}
            </div>
          )}
        </div>
      </div>
      <div className="wf-two wf-gap">
        <div className="wf-card"><h3 className="wf-h3">Current members by the month they joined, last two years</h3>
          <div className="wf-chart"><Trend rows={months && months.rows} label="Current members by the month they joined over the last two years" /></div>
          <p className="wf-note">The dashed end is the newest month, which is only part of a month.</p></div>
        <div className="wf-card"><h3 className="wf-h3">Current members by the year they joined</h3>
          <div className="wf-chart"><Columns rows={years && years.rows} x="year" y="members" emphasis={RECENT_YEARS}
            label="Current members by the year they joined, with the last three years highlighted" /></div>
          <p className="wf-note">
            {recent.length === RECENT_YEARS ? `${fmt.int(recentCount)} of the members shown joined in ${recent[0].year} to ${recent[RECENT_YEARS - 1].year}, the highlighted years. ` : ''}
            Only people still on the roster are counted, so earlier years look smaller than the number who actually joined then.
            This is not a growth trend.
          </p></div>
      </div>
    </section>
  );
}
