import { hierarchy, max, pack, treemap } from 'd3';
import { useFilters } from '../filters.jsx';
import { useTip } from '../tooltip.jsx';
import { COLORS, MUTED, fmt, isQuiet, useWidth } from '../util.js';
import { Empty } from './Bars.jsx';

// Boxes sized by members. `pick` makes a box clickable to set a filter.
export function Treemap({ rows, pick }) {
  const tip = useTip();
  const [ref, width] = useWidth();
  const w = Math.max(200, width || 480);
  const h = w < 420 ? 300 : 250;
  let body = <Empty>—</Empty>;
  if (rows && !rows.length) body = <Empty />;
  if (rows && rows.length) {
    const root = hierarchy({ children: rows }).sum((r) => +r.members || 0);
    treemap().size([w, h]).paddingInner(3).round(true)(root);
    const most = max(rows, (r) => +r.members) || 1;
    body = (
      <div className="wf-tree" style={{ height: h }}>
        {root.leaves().map((leaf) => {
          const r = leaf.data;
          const cw = leaf.x1 - leaf.x0;
          const ch = leaf.y1 - leaf.y0;
          const on = pick && pick.value === r.category;
          const background = isQuiet(r.category)
            ? `color-mix(in srgb, ${MUTED} 55%, var(--color-panel))`
            : `color-mix(in srgb, ${COLORS[0]} ${Math.round(18 + (34 * r.members) / most)}%, var(--color-panel))`;
          const text = `${r.category}: ${fmt.int(r.members)} members (${fmt.pct(r.share)} of those shown)`
            + (pick ? `. Click to ${on ? 'clear this filter' : 'filter by this'}.` : '');
          return (
            <div key={r.category} className={`wf-tree-cell${pick ? ` wf-pickable${on ? ' wf-on wf-tree-on' : pick.value ? ' wf-dim' : ''}` : ''}`}
              style={{ left: `${(100 * leaf.x0) / w}%`, top: leaf.y0, width: `${(100 * cw) / w}%`, height: ch, background }}
              {...tip.props(text)} onClick={pick ? () => pick.toggle(r.category) : undefined}>
              {cw > 64 && ch > 22 && <div className="wf-tree-name">{r.category}</div>}
              {cw > 64 && ch > 52 && <div className="wf-tree-val">{fmt.int(r.members)} · {fmt.pct(r.share)}</div>}
            </div>
          );
        })}
      </div>
    );
  }
  return <div ref={ref}>{body}</div>;
}

// Circles sized by members, for the largest employers.
export function Bubbles({ rows, top = 25, label }) {
  const tip = useTip();
  const { scope } = useFilters();
  const [ref, width] = useWidth();
  const w = Math.max(220, width || 480);
  const h = Math.round(Math.max(260, Math.min(w * 0.85, 400)));
  let body = <Empty>—</Empty>;
  if (rows && !rows.length) body = <Empty>No employer has three or more of these members</Empty>;
  if (rows && rows.length) {
    const shown = rows.slice(0, top);
    const root = hierarchy({ children: shown }).sum((r) => +r.members || 0);
    pack().size([w, h]).padding(4)(root);
    const most = max(shown, (r) => +r.members) || 1;
    const fit = (d) => {
      const room = Math.floor((d.r * 2 - 8) / 6.4);
      const name = String(d.data.employer);
      if (room < 3) return '';
      return name.length <= room ? name : `${name.slice(0, Math.max(1, room - 1))}…`;
    };
    body = (
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
        {root.leaves().map((d) => (
          <circle key={d.data.employer} cx={d.x} cy={d.y} r={d.r}
            style={{ fill: `color-mix(in srgb, ${COLORS[3]} ${Math.round(22 + (38 * d.data.members) / most)}%, var(--color-panel))` }}
            {...tip.props(`${d.data.employer}: ${fmt.int(d.data.members)} members (${fmt.pct(d.data.share)} of ${scope})`)} />
        ))}
        {root.leaves().filter((d) => d.r >= 17).map((d) => (
          <text key={d.data.employer} className="wf-bubble-label" textAnchor="middle" x={d.x} y={d.y}>
            <tspan x={d.x} dy={d.r >= 24 ? '-0.15em' : '0.32em'}>{fit(d)}</tspan>
            {d.r >= 24 && <tspan className="wf-bubble-n" x={d.x} dy="1.2em">{fmt.int(d.data.members)}</tspan>}
          </text>
        ))}
      </svg>
    );
  }
  return <div ref={ref}>{body}</div>;
}
