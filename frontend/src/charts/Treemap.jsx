import { hierarchy, treemap } from 'd3';
import { useTip } from '../tooltip.jsx';
import { COLORS, MUTED, fmt, isQuiet, textWidth, useWidth } from '../util.js';
import { Empty } from './Bars.jsx';

// Boxes sized by members. `pick` makes a box clickable to set a filter.
export function Treemap({ rows, pick, height, empty }) {
  const tip = useTip();
  const [ref, width] = useWidth();
  const w = Math.max(200, width || 480);
  const h = height ? (w < 420 ? Math.round(height * 1.15) : height) : (w < 420 ? 300 : 250);
  let body = <Empty>—</Empty>;
  if (rows && !rows.length) body = empty ? <Empty>{empty}</Empty> : <Empty />;
  if (rows && rows.length) {
    const root = hierarchy({ children: rows }).sum((r) => +r.members || 0);
    treemap().size([w, h]).paddingInner(4).round(true)(root);
    const unnamed = [];
    body = (
      <div className="wf-tree" style={{ height: h }}>
        {root.leaves().map((leaf) => {
          const r = leaf.data;
          const cw = leaf.x1 - leaf.x0;
          const ch = leaf.y1 - leaf.y0;
          const on = pick && pick.value === r.category;
          // Every function wears the same tint: the box's size already says how big it is.
          const background = isQuiet(r.category)
            ? `color-mix(in srgb, ${MUTED} 55%, var(--color-panel))`
            : `color-mix(in srgb, ${COLORS[0]} 42%, var(--color-panel))`;
          // A name is printed only where it fits whole, on one line or two.
          const nameW = textWidth(r.category, 14);
          const longestWord = Math.max(...String(r.category).split(/[\s-]+/).map((word) => textWidth(word, 14)));
          const oneLine = nameW <= cw - 22 && ch > 26;
          const twoLines = longestWord <= cw - 22 && nameW <= (cw - 22) * 1.8 && ch > 46;
          const named = oneLine || twoLines;
          const valueText = `${fmt.int(r.members)} · ${fmt.pct(r.share)}`;
          const valued = named && ch > (oneLine ? 52 : 70) && textWidth(valueText) <= cw - 20;
          if (!named) unnamed.push(r);
          const text = `${r.category}: ${fmt.int(r.members)} members (${fmt.pct(r.share)} of those shown)`
            + (pick ? `. Click to ${on ? 'clear this filter' : 'filter by this'}.` : '');
          return (
            <div key={r.category} className={`wf-tree-cell${pick ? ` wf-pickable${on ? ' wf-on wf-tree-on' : pick.value ? ' wf-dim' : ''}` : ''}`}
              style={{ left: `${(100 * leaf.x0) / w}%`, top: leaf.y0, width: `${(100 * cw) / w}%`, height: ch, background }}
              {...tip.props(text)} onClick={pick ? () => pick.toggle(r.category) : undefined}>
              {named && <div className="wf-tree-name">{r.category}</div>}
              {valued && <div className="wf-tree-val">{valueText}</div>}
              {named && !valued && ch > (oneLine ? 44 : 62) && <div className="wf-tree-val">{fmt.int(r.members)}</div>}
            </div>
          );
        })}
      </div>
    );
    if (unnamed.length) {
      body = (
        <>
          {body}
          <div className="wf-tree-rest">
            <span>Too small to label:</span>
            {unnamed.map((r) => {
              const on = pick && pick.value === r.category;
              return pick ? (
                <button key={r.category} type="button" className="wf-chip" aria-pressed={on} onClick={() => pick.toggle(r.category)}>
                  {r.category} <b>{fmt.int(r.members)}</b>
                </button>
              ) : <span key={r.category} className="wf-chip">{r.category} <b>{fmt.int(r.members)}</b></span>;
            })}
          </div>
        </>
      );
    }
  }
  return <div ref={ref}>{body}</div>;
}
