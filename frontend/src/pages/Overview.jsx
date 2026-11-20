import { useState } from 'react';
import { useApi } from '../api.js';
import { Flow } from '../charts/Series.jsx';
import Donut from '../charts/Donut.jsx';
import { Treemap } from '../charts/Treemap.jsx';
import { useFilters } from '../filters.jsx';
import { fmt } from '../util.js';

const dash = (value, format = fmt.int) => (value === null || value === undefined ? '—' : format(value));

function Kpi({ label, value, children }) {
  return (
    <div className="wf-card">
      <div className="wf-k-label">{label}</div>
      <div className="wf-k-num">{value}</div>
      <div className="wf-k-sub">{children}</div>
    </div>
  );
}

const names = (rows, counts) => (rows && rows.length
  ? rows.map((r) => r.name + (counts || r.members > 1 ? ` (${fmt.int(r.members)})` : '')).join(', ')
  : 'none');

// Who joined and left over the 90 days ISACA's New Member and transfer reports cover.
function Movement() {
  const { any } = useFilters();
  const [month, setMonth] = useState('');
  const { data: mv, error } = useApi('/movement', { month });
  if (error) return null;
  const t = mv ? mv.totals : {};
  return (
    <div className="wf-card wf-gap" id="movement">
      <div className="wf-drill-head">
        <h3 className="wf-h3 wf-flow-title">
          Joined and left the chapter{mv ? `, ${fmt.date(mv.from)} to ${fmt.date(mv.to)}` : ''}
        </h3>
        <label className="wf-drill-pick">Month
          <select className="dash-select" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">All 90 days</option>
            {(mv ? mv.months : []).map((m) => <option key={m} value={m}>{fmt.longMonth(`${m}-01`)}</option>)}
          </select>
        </label>
      </div>
      <div className="wf-flow">
        <div className="wf-flow-nums">
          <div>
            <div className="wf-k-label">Joined</div>
            <div className="wf-k-num">{dash(t.joined)}</div>
            <div className="wf-k-sub">{dash(t.new_members)} new members and {dash(t.transferred_in)} transferred in</div>
          </div>
          <div>
            <div className="wf-k-label">Left</div>
            <div className="wf-k-num">{dash(t.transferred_out)}</div>
            <div className="wf-k-sub">transferred to another chapter</div>
          </div>
          <div>
            <div className="wf-k-label">Net change</div>
            <div className="wf-k-num">{dash(t.net, fmt.signed)}</div>
            <div className="wf-k-sub">joined minus left</div>
          </div>
        </div>
        <Flow daily={mv && mv.daily} byWeek={!month}
          label="Members who joined, above the line, and left, below it, by week, or by day when a month is picked" />
      </div>
      <ul className="wf-flow-detail">
        <li>New members by type: {mv ? names(mv.new_member_types, true) : '—'}.</li>
        <li>Transferred in from: {mv ? names(mv.transferred_in_from) : '—'}.</li>
        <li>Transferred out to: {mv ? names(mv.transferred_out_to) : '—'}.</li>
      </ul>
      <p className="wf-note">
        From ISACA&apos;s New Member and chapter transfer reports, which cover the last 90 days, so the first and last months are
        part months. Pick a month to see it day by day. Left counts only transfers to another chapter: members whose membership
        lapsed are not in these reports, so the true number who left is higher.
        {any ? ' The filters above do not apply to this section.' : ''}
      </p>
    </div>
  );
}

function Takeaways({ summary }) {
  const { values } = useFilters();
  const { data: counties } = useApi('/counties', values);
  const { data: functions } = useApi('/breakdown/job_function', values);
  const { data: seniority } = useApi('/breakdown/seniority', values);
  const { data: tenure } = useApi('/breakdown/tenure', values);
  if (!summary || !counties || !functions || !seniority || !tenure) return null;

  const share = (data, category) => (data.rows.find((r) => r.category === category) || { share: 0 }).share;
  const larger = counties.rows.filter((c) => c.members >= 50)
    .map((c) => ({ ...c, rate: (100 * c.new_12mo) / c.members })).sort((a, b) => b.rate - a.rate);
  const topics = functions.rows.filter((r) => r.category !== 'Other' && r.category !== 'Not stated');
  const leaders = share(seniority, 'C-suite and executives') + share(seniority, 'Directors, managers and consultants');
  const early = share(tenure, 'Under 1 year') + share(tenure, '1 to 3 years');

  return (
    <>
      <h3 className="wf-h2 wf-gap-lg" id="takeaways">What this suggests for events and engagement</h3>
      <div className="wf-takes">
        {!values.county && summary.top_county && (
          <div className="wf-card wf-take"><div className="wf-take-head">Venues</div>
            <p>{summary.top_county} alone is home to <b>{fmt.pct(summary.top_county_share)}</b> of these members, and the three
              largest counties to <b>{fmt.pct(summary.top3_county_share)}</b>.
              {larger.length >= 2 && (
                <> Among counties with fifty or more, {larger[0].county} has the highest share of recent
                  joiners: <b>{fmt.pct(larger[0].rate)}</b> of its {fmt.int(larger[0].members)} members joined in the last 12 months.</>
              )}
            </p>
          </div>
        )}
        {!values.job_function && topics.length >= 3 && (
          <div className="wf-card wf-take"><div className="wf-take-head">Topics</div>
            <p>The largest job functions are {fmt.lowerFirst(topics[0].category)} (<b>{fmt.pct(topics[0].share)}</b>),{' '}
              {fmt.lowerFirst(topics[1].category)} (<b>{fmt.pct(topics[1].share)}</b>) and{' '}
              {fmt.lowerFirst(topics[2].category)} (<b>{fmt.pct(topics[2].share)}</b>), so a programme weighted that way
              matches this audience.</p>
          </div>
        )}
        {!values.seniority && (
          <div className="wf-card wf-take"><div className="wf-take-head">Level of content</div>
            <p><b>{fmt.pct(leaders)}</b> of these members are executives, directors, managers or consultants, while{' '}
              <b>{fmt.pct(early)}</b> joined within the last three years. That is two distinct audiences: leadership sessions
              and early-career development.</p>
          </div>
        )}
        {!values.credential && (
          <div className="wf-card wf-take"><div className="wf-take-head">Certification pipeline</div>
            <p><b>{fmt.int(summary.no_cert)}</b> members ({fmt.pct(summary.no_cert_share)}) hold no ISACA credential, the natural
              audience for exam preparation. <b>{fmt.int(summary.ai_cert_holders)}</b> hold one of the AI credentials (AAIA, AAISM
              or AAIR).</p>
          </div>
        )}
        <div className="wf-card wf-take"><div className="wf-take-head">Renewal</div>
          <p><b>{fmt.int(summary.renewal_due)}</b> memberships ({fmt.pct(summary.renewal_due_share)}) end on or before 31 December,
            which makes the weeks before it the window for a renewal push.</p>
        </div>
      </div>
    </>
  );
}

export default function Overview({ meta, summary }) {
  const filters = useFilters();
  const { values, toggle } = filters;
  const { data: seniority } = useApi('/breakdown/seniority', filters.without('seniority'));
  const { data: functions } = useApi('/breakdown/job_function', filters.without('job_function'));
  const s = summary || {};
  const groups = seniority ? seniority.rows : [];
  const leaders = groups.filter((r) => ['C-suite and executives', 'Directors, managers and consultants'].includes(r.category));
  const everyone = seniority ? seniority.total : 0;
  const leaderCount = leaders.reduce((n, r) => n + r.members, 0);

  return (
    <section className="wf-pane" id="overview">
      <div className="wf-kpis">
        <Kpi label="Members" value={dash(s.members)}>
          {dash(s.share_of_all, fmt.pct)} of the roster; {dash(s.in_florida)} with a Florida home address
        </Kpi>
        <Kpi label="Joined in the last 12 months" value={dash(s.new_12mo)}>
          {dash(s.new_12mo_share, fmt.pct)} of these members; {dash(s.new_90d)} in the last 90 days
        </Kpi>
        <Kpi label="Hold an ISACA credential" value={dash(s.certified_share, fmt.pct)}>
          {dash(s.certified)} members; {dash(s.no_cert)} hold none
        </Kpi>
        <Kpi label="Memberships ending by 31 December" value={dash(s.renewal_due)}>
          {dash(s.renewal_due_share, fmt.pct)} of these members; {dash(s.renewed_ahead)} already run into next year
        </Kpi>
        <Kpi label="Median tenure" value={<>{dash(s.median_tenure_years, fmt.one)} <span className="wf-k-unit">years</span></>}>
          since the join date on the roster
        </Kpi>
        {!values.seniority && (
          <Kpi label="In leadership roles" value={seniority && everyone ? fmt.pct((100 * leaderCount) / everyone) : '—'}>
            {seniority ? fmt.int(leaderCount) : '—'} executives, directors, managers and consultants
          </Kpi>
        )}
      </div>

      {meta.has_movement && <Movement />}

      <div className="wf-two wf-gap">
        <div className="wf-card">
          <h3 className="wf-h3">Seniority</h3>
          <p className="wf-note wf-tight">Click a segment or a name to see only that group across every tab. Click it again to clear it.</p>
          <div className="wf-chart">
            <Donut rows={seniority && seniority.rows} label="Members by seniority group"
              pick={{ value: values.seniority, toggle: (v) => toggle('seniority', v) }} />
          </div>
        </div>
        <div className="wf-card">
          <h3 className="wf-h3">Job function</h3>
          <p className="wf-note wf-tight">Each box is sized by its number of members. Click a box to filter by that function.</p>
          <div className="wf-chart">
            <Treemap rows={functions && functions.rows} pick={{ value: values.job_function, toggle: (v) => toggle('job_function', v) }} />
          </div>
        </div>
      </div>

      <Takeaways summary={summary} />
    </section>
  );
}
