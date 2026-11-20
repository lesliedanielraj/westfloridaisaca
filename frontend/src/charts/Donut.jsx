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
  if (!rows) return <Empty>—</Empty>;
  if (!rows.length) return <Empty />;
  const colors = colorsFor(rows, ordered);
  const total = sum(rows, (r) => +r.members);
  const size = Math.max(130, Math.min(190, (width || 190) - 8));
  const shape = arc().innerRadius(size * 0.31).outerRadius(size * 0.49).padAngle(0.014).cornerRadius(2);
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
          return (
            <path key={r.category} className={cls} d={shape(slice)} style={{ fill: colors[i] }}
              {...tip.props(text)} onClick={pick ? () => pick.toggle(r.category) : undefined} />
          );
        })}
        <text className="wf-donut-num" textAnchor="middle" dy="0.05em">{fmt.int(total)}</text>
        <text className="wf-donut-cap" textAnchor="middle" dy="1.5em">members</text>
      </svg>
      <Legend rows={rows} colors={colors} pick={pick} />
    </div>
  );
}
