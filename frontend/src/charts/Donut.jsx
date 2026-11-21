import { useState } from 'react';
import { arc, pie, sum } from 'd3';
import { useFilters } from '../filters.jsx';
import { useTip } from '../tooltip.jsx';
import { colorsFor, fmt, useWidth } from '../util.js';
import { Empty, Legend } from './Bars.jsx';

// Parts of a whole. `pick` makes the segments and names clickable to set a filter.
export default function Donut({ rows, ordered, pick, label }) {
  const tip = useTip();
  const { scope } = useFilters();
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  if (!rows) return <Empty>—</Empty>;
  if (!rows.length) return <Empty />;
  const colors = colorsFor(rows, ordered);
  const total = sum(rows, (r) => +r.members);
  const size = Math.max(140, Math.min(210, (width || 210) - 8));
  const ring = (grow) => arc().innerRadius(size * 0.27).outerRadius(size * (grow ? 0.5 : 0.475)).padAngle(0.022).cornerRadius(3);
  // The centre reads out the group under the pointer, else the one picked, else the total.
  const shown = rows.find((r) => r.category === hover) || (pick && rows.find((r) => r.category === pick.value)) || null;
  const slices = pie().sort(null).value((r) => +r.members)(rows);
  return (
    <div ref={ref} className="wf-donut">
      <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} role="img" aria-label={label}>
        {slices.map((slice, i) => {
          const r = slice.data;
          const on = pick && pick.value === r.category;
          const cls = !pick ? 'wf-seg' : `wf-seg wf-pickable${on ? ' wf-on' : pick.value ? ' wf-dim' : ''}`;
          const text = `${r.category}: ${fmt.int(r.members)} members (${fmt.pct(r.share)} of ${pick ? 'those shown' : scope})`
            + (pick ? `. Click to ${on ? 'clear this filter' : 'filter by this'}.` : '');
          const hoverProps = tip.props(text);
          return (
            <path key={r.category} className={cls} d={ring(hover === r.category || on)(slice)} style={{ fill: colors[i] }}
              {...hoverProps}
              onMouseEnter={(e) => { setHover(r.category); if (hoverProps.onMouseEnter) hoverProps.onMouseEnter(e); }}
              onMouseLeave={(e) => { setHover(null); if (hoverProps.onMouseLeave) hoverProps.onMouseLeave(e); }}
              onClick={pick ? () => pick.toggle(r.category) : undefined} />
          );
        })}
        <text className="wf-donut-num" textAnchor="middle" dy="0.05em">{shown ? fmt.pct(shown.share) : fmt.int(total)}</text>
        <text className="wf-donut-cap" textAnchor="middle" dy="1.5em">{shown ? `${fmt.int(shown.members)} members` : 'members'}</text>
      </svg>
      <Legend rows={rows} colors={colors} pick={pick} />
    </div>
  );
}
