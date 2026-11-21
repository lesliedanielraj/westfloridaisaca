import { max, sum } from 'd3';
import { useFilters } from '../filters.jsx';
import { useTip } from '../tooltip.jsx';
import { COLORS, colorsFor, fmt, isQuiet } from '../util.js';

export const Empty = ({ children = 'No members match these filters' }) => <div className="wf-empty">{children}</div>;

// Enter or Space on a focused row acts like a click.
const onKey = (run) => (event) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); run(); }
};

// What a row looks like when one of its siblings is the active filter.
const pickClass = (pick, name) => (!pick ? '' : pick.value === name ? ' wf-pickable wf-on' : pick.value ? ' wf-pickable wf-dim' : ' wf-pickable');

// Horizontal bars, one per row. `pick` makes rows clickable to set a filter.
export function Bars({ rows, label = 'category', value = 'members', top, color = 0, lollipop, wide, pick, noun = 'members' }) {
  const tip = useTip();
  const { scope } = useFilters();
  if (!rows) return <Empty>—</Empty>;
  const shown = top ? rows.slice(0, top) : rows;
  if (!shown.length) return <Empty />;
  const most = max(shown, (r) => +r[value]) || 1;
  return (
    <div className={`wf-bars${wide ? ' wf-wide' : ''}${lollipop ? ' wf-lolli' : ''}`}>
      {shown.map((r) => {
        const name = r[label];
        const on = pick && pick.value === name;
        const text = `${name}: ${fmt.int(r[value])} ${noun} (${fmt.pct(r.share)} of ${pick ? 'those shown' : scope})`
          + (pick ? `. Click to ${on ? 'clear this filter' : 'filter by this'}.` : '');
        const hover = tip.props(text);
        const click = pick ? { onClick: () => pick.toggle(name) } : {};
        const cls = pickClass(pick, name);
        return [
          <div key={`${name}-l`} className={`wf-bar-label${cls}`} {...hover} {...click}
            {...(pick ? { role: 'button', tabIndex: 0, 'aria-pressed': on, onKeyDown: onKey(() => pick.toggle(name)) } : {})}>
            {name}
          </div>,
          <div key={`${name}-t`} className={`wf-bar-track${cls}`} {...hover} {...click}>
            <div className="wf-bar-fill" style={{ width: `${(100 * r[value]) / most}%`, background: COLORS[color % COLORS.length] }} />
          </div>,
          <div key={`${name}-v`} className={`wf-bar-val${cls}`} {...hover} {...click}>
            {fmt.int(r[value])} · {fmt.pct(r.share)}
          </div>,
        ];
      })}
    </div>
  );
}

// Colour swatch, name and count for each row. Shared by the part-of-a-whole charts.
export function Legend({ rows, colors, pick }) {
  const tip = useTip();
  const { scope } = useFilters();
  return (
    <div className="wf-split-legend">
      {rows.map((r, i) => {
        const on = pick && pick.value === r.category;
        const hover = tip.props(`${r.category}: ${fmt.int(r.members)} members (${fmt.pct(r.share)} of ${pick ? 'those shown' : scope})`);
        const click = pick ? { onClick: () => pick.toggle(r.category) } : {};
        const cls = pickClass(pick, r.category);
        return [
          <div key={`${r.category}-s`} className={`wf-swatch${cls}`} style={{ background: colors[i] }} {...hover} {...click} />,
          <div key={`${r.category}-n`} className={cls.trim()} {...hover} {...click}
            {...(pick ? { role: 'button', tabIndex: 0, 'aria-pressed': on, onKeyDown: onKey(() => pick.toggle(r.category)) } : {})}>
            {r.category}
          </div>,
          <div key={`${r.category}-v`} className={`wf-split-val${cls}`} {...hover} {...click}>
            {fmt.int(r.members)} · {fmt.pct(r.share)}
          </div>,
        ];
      })}
    </div>
  );
}

// One bar for the whole group, divided by category. For ordered categories such as tenure.
export function SplitBar({ rows }) {
  const tip = useTip();
  const { scope } = useFilters();
  if (!rows) return <Empty>—</Empty>;
  if (!rows.length) return <Empty />;
  const total = sum(rows, (r) => +r.members) || 1;
  const colors = colorsFor(rows, true);
  return (
    <div>
      <div className="wf-split-bar">
        {rows.map((r, i) => (
          <div key={r.category} className="wf-split-seg" style={{ width: `${(100 * r.members) / total}%`, background: colors[i] }}
            {...tip.props(`${r.category}: ${fmt.int(r.members)} members (${fmt.pct(r.share)} of ${scope})`)} />
        ))}
      </div>
      <Legend rows={rows} colors={colors} />
    </div>
  );
}

// A hundred squares, each about 1% of the group.
export function Waffle({ rows }) {
  const tip = useTip();
  const { scope } = useFilters();
  if (!rows) return <Empty>—</Empty>;
  if (!rows.length) return <Empty />;
  const total = sum(rows, (r) => +r.members) || 1;
  const colors = colorsFor(rows);
  const exact = rows.map((r) => (100 * r.members) / total);
  const cells = exact.map((v) => Math.floor(v));
  const byRemainder = exact.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  let left = 100 - sum(cells);
  for (let k = 0; left > 0 && k < byRemainder.length; k += 1) {
    if (byRemainder[k][0] >= 0.5 || k === 0) { cells[byRemainder[k][1]] += 1; left -= 1; }
  }
  cells[cells.indexOf(Math.max(...cells))] += left;
  return (
    <div>
      <div className="wf-waffle">
        {rows.flatMap((r, i) => Array.from({ length: cells[i] }, (_, k) => (
          <div key={`${r.category}-${k}`} className="wf-waffle-cell" style={{ background: colors[i] }}
            {...tip.props(`${r.category}: ${fmt.int(r.members)} members (${fmt.pct(r.share)} of ${scope})`)} />
        )))}
      </div>
      <Legend rows={rows} colors={colors} />
    </div>
  );
}

const SHORT_BANDS = {
  'Under 1 year': 'Under 1', '1 to 3 years': '1 to 3', '3 to 5 years': '3 to 5',
  '5 to 10 years': '5 to 10', '10 to 20 years': '10 to 20', '20 years or more': '20 or more',
};

// A column per band, in the bands' own order, so the shape of the distribution shows.
export function BandColumns({ rows, unit, tipFor }) {
  const tip = useTip();
  const { scope } = useFilters();
  if (!rows) return <Empty>—</Empty>;
  if (!rows.length) return <Empty />;
  const most = max(rows, (r) => +r.members) || 1;
  return (
    <div className="wf-bandcols" role="img" aria-label={rows.map((r) => `${r.category}: ${fmt.int(r.members)}`).join('; ')}>
      <div className="wf-bandcols-plot">
        {rows.map((r) => (
          <div key={r.category} className="wf-bandcol" {...tip.props(tipFor ? tipFor(r) : `${r.category}: ${fmt.int(r.members)} members (${fmt.pct(r.share)} of ${scope})`)}>
            <span className="wf-bandcol-val">{fmt.int(r.members)}</span>
            <i style={{ height: `${Math.max(2, (100 * r.members) / most)}%` }} />
          </div>
        ))}
      </div>
      <div className="wf-bandcols-axis">
        {rows.map((r) => <span key={r.category}>{SHORT_BANDS[r.category] || r.category}</span>)}
      </div>
      {unit && <div className="wf-bandcols-unit">{unit}</div>}
    </div>
  );
}

// One whole split into a few blocks, each printing its share where it fits, with the names listed below.
// `ordered` shades one colour from strong to light, for categories that run in order.
export function TierBar({ rows, ordered, label }) {
  const tip = useTip();
  const { scope } = useFilters();
  if (!rows) return <Empty>—</Empty>;
  if (!rows.length) return <Empty />;
  const total = sum(rows, (r) => +r.members) || 1;
  const colors = colorsFor(rows, ordered);
  // Ink that reads on each block: the page colour on strong fills, the text colour on pale ones.
  const ink = (r, i) => ((ordered ? i < 2 : !isQuiet(r.category)) ? 'var(--color-bg)' : 'var(--color-fg)');
  return (
    <div>
      <div className="wf-tier" role="img" aria-label={label}>
        {rows.filter((r) => r.members > 0).map((r) => {
          const i = rows.indexOf(r);
          const part = (100 * r.members) / total;
          return (
            <div key={r.category} className="wf-tier-part" style={{ flexGrow: r.members, background: colors[i], color: ink(r, i) }}
              {...tip.props(`${r.category}: ${fmt.int(r.members)} members (${fmt.pct(r.share)} of ${scope})`)}>
              {part >= 18 ? fmt.pct(r.share) : ''}
            </div>
          );
        })}
      </div>
      <Legend rows={rows} colors={colors} />
    </div>
  );
}

// One category dominates: lead with its share, then show the rest on their own scale.
export function LeadShare({ rows, noun = 'members' }) {
  const tip = useTip();
  const { scope } = useFilters();
  if (!rows) return <Empty>—</Empty>;
  if (!rows.length) return <Empty />;
  const [lead, ...rest] = [...rows].sort((a, b) => b.members - a.members);
  const most = max(rest, (r) => +r.members) || 1;
  return (
    <div>
      <div className="wf-lead-fig">{fmt.pct(lead.share)}</div>
      <div className="wf-lead-line">{lead.category} · {fmt.int(lead.members)} {noun}</div>
      <div className="wf-meter wf-lead-meter"><i style={{ width: `${lead.share}%` }} /></div>
      {rest.length > 0 && (
        <>
          <div className="wf-lead-rest">The other {fmt.pct(100 - lead.share)}</div>
          <div className="wf-bars wf-bars-tight">
            {rest.map((r) => {
              const hover = tip.props(`${r.category}: ${fmt.int(r.members)} ${noun} (${fmt.pct(r.share)} of ${scope})`);
              return [
                <div key={`${r.category}-l`} className="wf-bar-label" {...hover}>{r.category}</div>,
                <div key={`${r.category}-t`} className="wf-bar-track" {...hover}>
                  <div className="wf-bar-fill" style={{ width: `${(100 * r.members) / most}%`, background: COLORS[0] }} />
                </div>,
                <div key={`${r.category}-v`} className="wf-bar-val" {...hover}>{fmt.int(r.members)} · {fmt.pct(r.share)}</div>,
              ];
            })}
          </div>
        </>
      )}
    </div>
  );
}
