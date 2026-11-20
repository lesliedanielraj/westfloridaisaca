import { area, line, max, scaleBand, scaleLinear, scalePoint } from 'd3';
import { useTip } from '../tooltip.jsx';
import { COLORS, fmt, textWidth, useWidth } from '../util.js';
import { Empty } from './Bars.jsx';

const H = 230;

function Grid({ ticks, y, left, right, label = fmt.int }) {
  return (
    <g>
      {ticks.map((t) => (
        <line key={`g${t}`} x1={left} x2={right} y1={y(t)} y2={y(t)}
          style={{ stroke: t === 0 ? 'var(--cds-chart-axis)' : 'var(--cds-chart-grid)' }} />
      ))}
      {ticks.map((t) => (
        <text key={`t${t}`} className="wf-tick" x={left - 6} y={y(t)} dy="0.32em" textAnchor="end">{label(t)}</text>
      ))}
    </g>
  );
}

// Columns for a count per year.
export function Columns({ rows, x: X, y: Y, label }) {
  const tip = useTip();
  const [ref, width] = useWidth();
  const w = Math.max(240, width || 600);
  let body = <Empty>—</Empty>;
  if (rows && !rows.length) body = <Empty />;
  if (rows && rows.length) {
    const y = scaleLinear().domain([0, max(rows, (r) => +r[Y]) || 1]).nice(4);
    const ticks = y.ticks(4).filter(Number.isInteger);
    const labelW = max(rows, (r) => textWidth(r[X])) || 30;
    const m = { t: 18, r: 6, b: 24, l: Math.ceil(textWidth(fmt.int(ticks[ticks.length - 1]))) + 10 };
    const x = scaleBand().domain(rows.map((r) => r[X])).range([m.l, w - m.r]).padding(0.2);
    y.range([H - m.b, m.t]);
    const every = Math.max(1, Math.ceil((labelW + 8) / x.step()));
    body = (
      <svg width="100%" viewBox={`0 0 ${w} ${H}`} role="img" aria-label={label}>
        <Grid ticks={ticks} y={y} left={m.l} right={w - m.r} />
        {rows.map((r) => (
          <rect key={r[X]} x={x(r[X])} width={x.bandwidth()} y={y(+r[Y])} height={y(0) - y(+r[Y])} rx="2" style={{ fill: COLORS[0] }} />
        ))}
        {x.bandwidth() >= 22 && rows.map((r) => (
          <text key={`v${r[X]}`} className="wf-vlabel" x={x(r[X]) + x.bandwidth() / 2} y={y(+r[Y]) - 4} textAnchor="middle">{fmt.int(r[Y])}</text>
        ))}
        {rows.filter((r, i) => (rows.length - 1 - i) % every === 0).map((r) => (
          <text key={`x${r[X]}`} className="wf-tick" x={Math.min(x(r[X]) + x.bandwidth() / 2, w - labelW / 2 - 1)} y={H - 6} textAnchor="middle">{r[X]}</text>
        ))}
        {rows.map((r) => (
          <rect key={`h${r[X]}`} x={x(r[X]) - x.step() * 0.1} width={x.step()} y={m.t} height={H - m.b - m.t} style={{ fill: 'transparent' }}
            {...tip.props(`${r[X]}: ${fmt.int(r[Y])} current members joined`)} />
        ))}
      </svg>
    );
  }
  return <div ref={ref} className="wf-cols">{body}</div>;
}

// A line over months.
export function Trend({ rows, label }) {
  const tip = useTip();
  const [ref, width] = useWidth();
  const w = Math.max(240, width || 600);
  let body = <Empty>—</Empty>;
  if (rows && !rows.length) body = <Empty />;
  if (rows && rows.length) {
    const y = scaleLinear().domain([0, max(rows, (r) => +r.members) || 1]).nice(4);
    const ticks = y.ticks(4).filter(Number.isInteger);
    const labelW = max(rows, (r) => textWidth(fmt.month(r.month))) || 30;
    const side = Math.ceil(labelW / 2) + 2;
    const m = { t: 14, r: side, b: 24, l: Math.max(Math.ceil(textWidth(fmt.int(ticks[ticks.length - 1]))) + 10, side) };
    const x = scalePoint().domain(rows.map((r) => r.month)).range([m.l, w - m.r]);
    y.range([H - m.b, m.t]);
    const step = x.step() || w;
    const every = Math.max(1, Math.ceil((labelW + 10) / step));
    body = (
      <svg width="100%" viewBox={`0 0 ${w} ${H}`} role="img" aria-label={label}>
        <Grid ticks={ticks} y={y} left={m.l} right={w - m.r} />
        <path d={area().x((r) => x(r.month)).y0(y(0)).y1((r) => y(+r.members))(rows)} style={{ fill: COLORS[0], fillOpacity: 0.16 }} />
        <path d={line().x((r) => x(r.month)).y((r) => y(+r.members))(rows)}
          style={{ fill: 'none', stroke: COLORS[0], strokeWidth: 2, strokeLinejoin: 'round' }} />
        {rows.map((r) => (
          <circle key={r.month} cx={x(r.month)} cy={y(+r.members)} r="3" style={{ fill: COLORS[0], stroke: 'var(--color-panel)', strokeWidth: 1.5 }} />
        ))}
        {rows.filter((r, i) => (rows.length - 1 - i) % every === 0).map((r) => (
          <text key={`x${r.month}`} className="wf-tick" x={x(r.month)} y={H - 6} textAnchor="middle">{fmt.month(r.month)}</text>
        ))}
        {rows.map((r) => (
          <rect key={`h${r.month}`} x={x(r.month) - step / 2} width={step} y={m.t} height={H - m.b - m.t} style={{ fill: 'transparent' }}
            {...tip.props(`${fmt.longMonth(r.month)}: ${fmt.int(r.members)} current members joined`)} />
        ))}
      </svg>
    );
  }
  return <div ref={ref} className="wf-cols">{body}</div>;
}

// Joined above the line, left below it: one column per week, or per day when a month is picked.
export function Flow({ daily, byWeek, label }) {
  const tip = useTip();
  const [ref, width] = useWidth();
  const w = Math.max(240, width || 520);
  const h = 210;
  const [cNew, cIn, cOut] = [COLORS[0], COLORS[2], COLORS[1]];
  let body = <Empty>—</Empty>;
  if (daily && !daily.length) body = <Empty>Nothing in this period</Empty>;
  if (daily && daily.length) {
    const rows = [];
    daily.forEach((d, i) => {
      if (!byWeek || i % 7 === 0) rows.push({ start: d.date, end: d.date, new_members: 0, transferred_in: 0, transferred_out: 0 });
      const bin = rows[rows.length - 1];
      bin.end = d.date;
      bin.new_members += d.new_members;
      bin.transferred_in += d.transferred_in;
      bin.transferred_out += d.transferred_out;
    });
    const up = Math.max(1, max(rows, (r) => r.new_members + r.transferred_in) || 0);
    const down = Math.max(1, max(rows, (r) => r.transferred_out) || 0);
    const y = scaleLinear().domain([-down, up]).nice(5);
    const ticks = y.ticks(5).filter(Number.isInteger);
    const labelW = max(rows, (r) => textWidth(fmt.shortDate(r.start))) || 30;
    const m = { t: 16, r: Math.ceil(labelW / 2), b: 24, l: Math.ceil(max(ticks, (t) => textWidth(Math.abs(t))) || 10) + 10 };
    const x = scaleBand().domain(rows.map((r) => r.start)).range([m.l, w - m.r]).padding(byWeek ? 0.3 : 0.2);
    y.range([h - m.b, m.t]);
    const every = Math.max(1, Math.ceil((labelW + 8) / x.step()));
    const bar = (r, from, to, fill, key) => (
      <rect key={`${key}${r.start}`} x={x(r.start)} width={x.bandwidth()} y={Math.min(y(from), y(to))} height={Math.abs(y(from) - y(to))} style={{ fill }} />
    );
    const when = (r) => (r.start === r.end ? fmt.shortDate(r.start) : `${fmt.shortDate(r.start)} to ${fmt.shortDate(r.end)}`);
    body = (
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
        <Grid ticks={ticks} y={y} left={m.l} right={w - m.r} label={(t) => Math.abs(t)} />
        {rows.map((r) => bar(r, 0, r.new_members, cNew, 'n'))}
        {rows.map((r) => bar(r, r.new_members, r.new_members + r.transferred_in, cIn, 'i'))}
        {rows.map((r) => bar(r, 0, -r.transferred_out, cOut, 'o'))}
        {x.bandwidth() >= 18 && rows.filter((r) => byWeek || r.new_members + r.transferred_in > 0).map((r) => (
          <text key={`v${r.start}`} className="wf-vlabel" x={x(r.start) + x.bandwidth() / 2} y={y(r.new_members + r.transferred_in) - 4} textAnchor="middle">
            {fmt.int(r.new_members + r.transferred_in)}
          </text>
        ))}
        {rows.filter((r, i) => i % every === 0).map((r) => (
          <text key={`x${r.start}`} className="wf-tick" x={x(r.start) + x.bandwidth() / 2} y={h - 6} textAnchor="middle">{fmt.shortDate(r.start)}</text>
        ))}
        {rows.map((r) => (
          <rect key={`h${r.start}`} x={x(r.start) - x.step() * 0.1} width={x.step()} y={m.t} height={h - m.b - m.t} style={{ fill: 'transparent' }}
            {...tip.props(`${when(r)}: ${fmt.int(r.new_members)} new, ${fmt.int(r.transferred_in)} transferred in, ${fmt.int(r.transferred_out)} transferred out`)} />
        ))}
      </svg>
    );
  }
  return (
    <div ref={ref} className="wf-cols">
      <div className="wf-flow-key">
        {[['New members', cNew], ['Transferred in', cIn], ['Transferred out', cOut]].map(([name, color]) => (
          <span key={name}><i className="wf-swatch" style={{ background: color }} />{name}</span>
        ))}
        <span>{byWeek ? 'Each column is one week' : 'Each column is one day'}</span>
      </div>
      {body}
    </div>
  );
}
