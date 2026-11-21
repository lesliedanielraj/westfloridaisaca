import { useState } from 'react';
import { useApi } from '../api.js';
import { Flow } from '../charts/Series.jsx';
import Donut from '../charts/Donut.jsx';
import { Treemap } from '../charts/Treemap.jsx';
import { useFilters } from '../filters.jsx';
import { fmt } from '../util.js';

const dash = (value, format = fmt.int) => (value === null || value === undefined ? '—' : format(value));

// A headline tile: a label, a figure, an optional small visual, and a line of detail.
function Kpi({ label, value, visual, children }) {
  return (
    <div className="wf-card wf-kpi">
      <div className="wf-k-label">{label}</div>
      <div className="wf-k-num">{value}</div>
      {visual && <div className="wf-k-visual">{visual}</div>}
      <div className="wf-k-sub">{children}</div>
    </div>
  );
}

// A share of the group as a thin bar on a lighter track of the same colour.
function Meter({ value }) {
  if (value === null || value === undefined) return <div className="wf-meter" />;
  return <div className="wf-meter"><i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

// A small trend line with no axes; the last point is marked.
function Spark({ values }) {
  if (!values || values.length < 2) return <div className="wf-spark" />;
  const top = Math.max(1, ...values);
  const x = (i) => 3 + (i * 94) / (values.length - 1);
  const y = (v) => 25 - (v / top) * 21;
  return (
    <svg className="wf-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} vectorEffect="non-scaling-stroke" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.6" />
    </svg>
  );
}

// A tiny column per band, to show a distribution's shape.
function MiniCols({ rows }) {
  if (!rows || !rows.length) return <div className="wf-minicols" />;
  const top = Math.max(1, ...rows.map((r) => r.members));
  return (
    <div className="wf-minicols" aria-hidden="true">
      {rows.map((r) => <i key={r.category} title={`${r.category}: ${fmt.int(r.members)}`} style={{ height: `${Math.max(6, (100 * r.members) / top)}%` }} />)}
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
          <div className="wf-flow-net">
            <div className="wf-k-label">Net change</div>
            <div className="wf-k-num wf-k-hero">{dash(t.net, fmt.signed)}</div>
            <div className="wf-k-sub">members, joined minus left</div>
          </div>
          <div>
            <div className="wf-k-label"><i className="wf-dot wf-dot-in" />Joined</div>
            <div className="wf-k-num">{dash(t.joined)}</div>
            <div className="wf-k-sub">{dash(t.new_members)} new members and {dash(t.transferred_in)} transferred in</div>
          </div>
          <div>
            <div className="wf-k-label"><i className="wf-dot wf-dot-out" />Left</div>
            <div className="wf-k-num">{dash(t.transferred_out)}</div>
            <div className="wf-k-sub">transferred to another chapter</div>
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

function Take({ head, figure, line, children }) {
  return (
    <div className="wf-card wf-take">
      <div className="wf-take-head">{head}</div>
      <div className="wf-take-fig">{figure}</div>
      <div className="wf-take-line">{line}</div>
      <p>{children}</p>
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
          <Take head="Venues" figure={fmt.pct(summary.top3_county_share)} line="live in the three largest counties">
            {summary.top_county} alone is home to <b>{fmt.pct(summary.top_county_share)}</b>.
            {larger.length >= 2 && (
              <> Among counties with fifty or more members, {larger[0].county} has the highest share of recent
                joiners: <b>{fmt.pct(larger[0].rate)}</b> of its {fmt.int(larger[0].members)} joined in the last 12 months.</>
            )}
          </Take>
        )}
        {!values.job_function && topics.length >= 3 && (
          <Take head="Topics" figure={fmt.pct(topics[0].share + topics[1].share + topics[2].share)}
            line={`work in ${fmt.lowerFirst(topics[0].category)}, ${fmt.lowerFirst(topics[1].category)} or ${fmt.lowerFirst(topics[2].category)}`}>
            {topics[0].category} is <b>{fmt.pct(topics[0].share)}</b>, {fmt.lowerFirst(topics[1].category)}{' '}
            <b>{fmt.pct(topics[1].share)}</b> and {fmt.lowerFirst(topics[2].category)} <b>{fmt.pct(topics[2].share)}</b>, so a
            programme weighted that way matches this audience.
          </Take>
        )}
        {!values.seniority && (
          <Take head="Level of content" figure={fmt.pct(leaders)} line="are executives, directors, managers or consultants">
            <b>{fmt.pct(early)}</b> joined within the last three years. That is two distinct audiences: leadership sessions
            and early-career development.
          </Take>
        )}
        {!values.credential && (
          <Take head="Certification pipeline" figure={fmt.int(summary.no_cert)} line="members hold no ISACA credential">
            That is <b>{fmt.pct(summary.no_cert_share)}</b>, the natural audience for exam preparation.{' '}
            <b>{fmt.int(summary.ai_cert_holders)}</b> hold one of the AI credentials (AAIA, AAISM or AAIR).
          </Take>
        )}
        <Take head="Renewal" figure={fmt.int(summary.renewal_due)} line="memberships end on or before 31 December">
          That is <b>{fmt.pct(summary.renewal_due_share)}</b>, which makes the weeks before it the window for a renewal push.
        </Take>
      </div>
    </>
  );
}

export default function Overview({ meta, summary }) {
  const filters = useFilters();
  const { values, toggle } = filters;
  const { data: seniority } = useApi('/breakdown/seniority', filters.without('seniority'));
  const { data: functions } = useApi('/breakdown/job_function', filters.without('job_function'));
  const { data: months } = useApi('/joins/month', values);
  const { data: tenure } = useApi('/breakdown/tenure', values);
  // The last twelve whole months; the newest month in the data is only part of one.
  const lastYear = months ? months.rows.slice(-13, -1).map((r) => r.members) : null;
  const s = summary || {};
  const groups = seniority ? seniority.rows : [];
  const leaders = groups.filter((r) => ['C-suite and executives', 'Directors, managers and consultants'].includes(r.category));
  const everyone = seniority ? seniority.total : 0;
  const leaderCount = leaders.reduce((n, r) => n + r.members, 0);

  return (
    <section className="wf-pane" id="overview">
      <div className="wf-kpis">
        <Kpi label="Members" value={dash(s.members)} visual={<Meter value={s.members ? (100 * s.in_florida) / s.members : null} />}>
          {dash(s.in_florida)} with a Florida home address; {dash(s.share_of_all, fmt.pct)} of the roster
        </Kpi>
        <Kpi label="Joined in the last 12 months" value={dash(s.new_12mo)} visual={<Spark values={lastYear} />}>
          {dash(s.new_12mo_share, fmt.pct)} of these members; {dash(s.new_90d)} in the last 90 days
        </Kpi>
        <Kpi label="Hold an ISACA credential" value={dash(s.certified_share, fmt.pct)} visual={<Meter value={s.certified_share} />}>
          {dash(s.certified)} members; {dash(s.no_cert)} hold none
        </Kpi>
        <Kpi label="Memberships ending by 31 December" value={dash(s.renewal_due)} visual={<Meter value={s.renewal_due_share} />}>
          {dash(s.renewal_due_share, fmt.pct)} of these members; {dash(s.renewed_ahead)} already run into next year
        </Kpi>
        <Kpi label="Median tenure" value={<>{dash(s.median_tenure_years, fmt.one)} <span className="wf-k-unit">years</span></>}
          visual={<MiniCols rows={tenure && tenure.rows} />}>
          from under 1 year, left, to 20 or more, right
        </Kpi>
        {!values.seniority && (
          <Kpi label="In leadership roles" value={seniority && everyone ? fmt.pct((100 * leaderCount) / everyone) : '—'}
            visual={<Meter value={seniority && everyone ? (100 * leaderCount) / everyone : null} />}>
            {seniority ? fmt.int(leaderCount) : '—'} executives, directors, managers and consultants
          </Kpi>
        )}
      </div>

      {meta.has_movement && <Movement />}

      <div className="wf-two wf-gap">
        <div className="wf-card">
          <h3 className="wf-h3">Seniority</h3>
          <p className="wf-note wf-tight">Point at a segment for its share. Click a segment or a name to filter every tab by it, and again to clear.</p>
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
