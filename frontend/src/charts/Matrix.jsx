import { max } from 'd3';
import { useTip } from '../tooltip.jsx';
import { COLORS, fmt } from '../util.js';
import { Empty } from './Bars.jsx';

// Regions down the side, job functions across the top. Shading is each cell's share of its region.
export default function Matrix({ data }) {
  const tip = useTip();
  if (!data) return <Empty>—</Empty>;
  if (!data.rows.length) return <Empty />;
  const cell = new Map(data.rows.map((r) => [`${r.region}|${r.function}`, r]));
  const top = max(data.rows, (r) => (r.region_total ? r.members / r.region_total : 0)) || 1;
  return (
    <div className="wf-scroll-x">
      <table className="wf-matrix">
        <thead>
          <tr><th />{data.functions.map((f) => <th key={f}>{f}</th>)}</tr>
        </thead>
        <tbody>
          {data.regions.map((region) => (
            <tr key={region}>
              <th className="wf-rowhead">{region}</th>
              {data.functions.map((f) => {
                const r = cell.get(`${region}|${f}`);
                if (!r) return <td key={f} />;
                const part = r.region_total ? r.members / r.region_total : 0;
                return (
                  <td key={f} style={{ background: `color-mix(in srgb, ${COLORS[0]} ${Math.round(6 + (49 * part) / top)}%, transparent)` }}
                    {...tip.props(`${region}, ${fmt.lowerFirst(f)}: ${fmt.int(r.members)} of ${fmt.int(r.region_total)} members (${fmt.pct(100 * part)})`)}>
                    {fmt.int(r.members)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
