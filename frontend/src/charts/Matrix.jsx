import { useState } from 'react';
import { max } from 'd3';
import { useTip } from '../tooltip.jsx';
import { COLORS, fmt } from '../util.js';
import { Empty } from './Bars.jsx';

// Regions down the side, job functions across the top. Shading is each cell's share of its region,
// so a small region can be compared with a large one. The figures switch between counts and shares.
export default function Matrix({ data }) {
  const tip = useTip();
  const [show, setShow] = useState('count');
  if (!data) return <Empty>—</Empty>;
  if (!data.rows.length) return <Empty />;
  const cell = new Map(data.rows.map((r) => [`${r.region}|${r.function}`, r]));
  const top = max(data.rows, (r) => (r.region_total ? r.members / r.region_total : 0)) || 1;
  const totals = new Map(data.rows.map((r) => [r.region, r.region_total]));
  return (
    <>
      <div className="wf-seg wf-seg-small" role="group" aria-label="Figures shown in the grid">
        <button type="button" className="wf-seg-btn" aria-pressed={show === 'count'} onClick={() => setShow('count')}>Members</button>
        <button type="button" className="wf-seg-btn" aria-pressed={show === 'share'} onClick={() => setShow('share')}>Share of region</button>
      </div>
      <div className="wf-scroll-x">
        <table className="wf-matrix">
          <thead>
            <tr><th className="wf-rowhead" />{data.functions.map((f) => <th key={f}>{f}</th>)}<th className="wf-matrix-total">All</th></tr>
          </thead>
          <tbody>
            {data.regions.map((region) => (
              <tr key={region}>
                <th className="wf-rowhead">{region}</th>
                {data.functions.map((f) => {
                  const r = cell.get(`${region}|${f}`);
                  if (!r) return <td key={f} />;
                  const part = r.region_total ? r.members / r.region_total : 0;
                  const strength = part / top;
                  return (
                    <td key={f} className={strength > 0.6 ? 'wf-matrix-strong' : undefined}
                      style={{ background: `color-mix(in srgb, ${COLORS[0]} ${Math.round(4 + 82 * strength)}%, var(--color-panel))` }}
                      {...tip.props(`${region}, ${fmt.lowerFirst(f)}: ${fmt.int(r.members)} of ${fmt.int(r.region_total)} members (${fmt.pct(100 * part)})`)}>
                      {show === 'count' ? fmt.int(r.members) : fmt.pct(100 * part)}
                    </td>
                  );
                })}
                <td className="wf-matrix-total">{fmt.int(totals.get(region))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
