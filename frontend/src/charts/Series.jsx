import { useState } from 'react';
import { area, curveMonotoneX, line, max, scaleBand, scaleLinear, scalePoint } from 'd3';
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

// A column with a rounded top and a square foot on the baseline.
const column = (x, top, width, height) => {
  const r = Math.min(4, width / 2, height);
  return `M${x},${top + height}V${top + r}q0,${-r} ${r},${-r}H${x + width - r}q${r},0 ${r},${r}V${top + height}Z`;
};

// Columns for a count per year. The last `emphasis` columns are drawn in the accent colour and the
// rest are held back, so the recent years stand out.
export function Columns({ rows, x: X, y: Y, label, emphasis = 0 }) {
  const tip = useTip();
  const [ref, width] = useWidth();
  const w = Math.max(240, width || 600);
  let body = <Empty>—</Empty>;
  if (rows && !rows.length) body = <Empty />;
  if (rows && rows.length) {
    const y = scaleLinear().domain([0, max(rows, (r) => +r[Y]) || 1]).nice(4);
    const ticks = y.ticks(4).filter(Number.isInteger);
    const labelW = max(rows, (r) => textWidth(r[X])) || 30;
    const m = { t: 20, r: 6, b: 24, l: Math.ceil(textWidth(fmt.int(ticks[ticks.length - 1]))) + 10 };
    const x = scaleBand().domain(rows.map((r) => r[X])).range([m.l, w - m.r]).padding(0.22);
    y.range([H - m.b, m.t]);
    const bw = Math.min(24, x.bandwidth());
    const left = (r) => x(r[X]) + (x.bandwidth() - bw) / 2;
    const every = Math.max(1, Math.ceil((labelW + 8) / x.step()));
    const strong = (i) => !emphasis || i >= rows.length - emphasis;
    body = (
      <svg width="100%" viewBox={`0 0 ${w} ${H}`} role="img" aria-label={label}>
        <Grid ticks={ticks} y={y} left={m.l} right={w - m.r} />
        {rows.map((r, i) => +r[Y] > 0 && (
          <path key={r[X]} d={column(left(r), y(+r[Y]), bw, y(0) - y(+r[Y]))}
            style={{ fill: strong(i) ? COLORS[0] : `color-mix(in srgb, ${COLORS[0]} 38%, var(--color-panel))` }} />
        ))}
        {rows.map((r, i) => (emphasis ? strong(i) : x.bandwidth() >= 22) && (
          <text key={`v${r[X]}`} className="wf-vlabel" x={left(r) + bw / 2} y={y(+r[Y]) - 5} textAnchor="middle">{fmt.int(r[Y])}</text>
        ))}
        {rows.filter((r, i) => (rows.length - 1 - i) % every === 0).map((r) => (
          <text key={`x${r[X]}`} className="wf-tick" x={Math.min(x(r[X]) + x.bandwidth() / 2, w - labelW / 2 - 1)} y={H - 6} textAnchor="middle">{r[X]}</text>
        ))}
        {rows.map((r) => (
          <rect key={`h${r[X]}`} className="wf-hit" x={x(r[X]) - x.step() * 0.1} width={x.step()} y={m.t} height={H - m.b - m.t}
            {...tip.props(`${r[X]}: ${fmt.int(r[Y])} current members joined`)} />
        ))}
      </svg>
    );
  }
  return <div ref={ref} className="wf-cols">{body}</div>;
}

// A line over months. The newest month is only part of a month, so the stretch leading to it is dashed.
export function Trend({ rows, label }) {
  const tip = useTip();
  const [ref, width] = useWidth();
  const [at, setAt] = useState(null);
  const w = Math.max(240, width || 600);
  let body = <Empty>—</Empty>;
  if (rows && !rows.length) body = <Empty />;
  if (rows && rows.length) {
    const y = scaleLinear().domain([0, max(rows, (r) => +r.members) || 1]).nice(4);
    const ticks = y.ticks(4).filter(Number.isInteger);
    const labelW = max(rows, (r) => textWidth(fmt.month(r.month))) || 30;
    const side = Math.ceil(labelW / 2) + 2;
    const m = { t: 22, r: side, b: 24, l: Math.max(Math.ceil(textWidth(fmt.int(ticks[ticks.length - 1]))) + 10, side) };
    const x = scalePoint().domain(rows.map((r) => r.month)).range([m.l, w - m.r]);
    y.range([H - m.b, m.t]);
    const step = x.step() || w;
    const every = Math.max(1, Math.ceil((labelW + 10) / step));
    const whole = rows.length > 1 ? rows.slice(0, -1) : rows;
    const last = rows[rows.length - 1];
    const lastWhole = whole[whole.length - 1];
    const path = line().x((r) => x(r.month)).y((r) => y(+r.members)).curve(curveMonotoneX);
    const peak = whole.reduce((best, r) => (+r.members > +best.members ? r : best), whole[0]);
    const here = at !== null && rows[at] ? rows[at] : null;
    body = (
      <svg width="100%" viewBox={`0 0 ${w} ${H}`} role="img" aria-label={label} onPointerLeave={() => setAt(null)}>
        <Grid ticks={ticks} y={y} left={m.l} right={w - m.r} />
        <path d={area().x((r) => x(r.month)).y0(y(0)).y1((r) => y(+r.members)).curve(curveMonotoneX)(whole)} style={{ fill: COLORS[0], fillOpacity: 0.1 }} />
        <path d={path(whole)} style={{ fill: 'none', stroke: COLORS[0], strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' }} />
        {rows.length > 1 && (
          <path d={path([lastWhole, last])} style={{ fill: 'none', stroke: COLORS[0], strokeWidth: 2, strokeDasharray: '2 5', strokeLinecap: 'round' }} />
        )}
        <circle cx={x(lastWhole.month)} cy={y(+lastWhole.members)} r="4" style={{ fill: COLORS[0], stroke: 'var(--color-panel)', strokeWidth: 2 }} />
        {peak && +peak.members > 0 && (
          <text className="wf-vlabel" x={x(peak.month)} y={y(+peak.members) - 9} textAnchor="middle">
            {fmt.int(peak.members)} in {fmt.month(peak.month)}
          </text>
        )}
        {here && (
          <g pointerEvents="none">
            <line x1={x(here.month)} x2={x(here.month)} y1={m.t} y2={H - m.b} style={{ stroke: 'var(--cds-chart-axis)' }} />
            <circle cx={x(here.month)} cy={y(+here.members)} r="4.5" style={{ fill: COLORS[0], stroke: 'var(--color-panel)', strokeWidth: 2 }} />
          </g>
        )}
        {rows.filter((r, i) => (rows.length - 1 - i) % every === 0).map((r) => (
          <text key={`x${r.month}`} className="wf-tick" x={x(r.month)} y={H - 6} textAnchor="middle">{fmt.month(r.month)}</text>
        ))}
        {rows.map((r, i) => {
          const hover = tip.props(`${fmt.longMonth(r.month)}: ${fmt.int(r.members)} current members joined${r === last && rows.length > 1 ? ' so far (part month)' : ''}`);
          return (
            <rect key={`h${r.month}`} x={x(r.month) - step / 2} width={step} y={m.t} height={H - m.b - m.t} style={{ fill: 'transparent' }}
              {...hover} onPointerEnter={() => setAt(i)} />
          );
        })}
      </svg>
    );
  }
  return <div ref={ref} className="wf-cols">{body}</div>;
}

// Joined above the line, left below it: one column per week, or per day when a month is picked.
// Both kinds of joiner are blue (new members solid, transfers in lighter); leavers are orange.
export function Flow({ daily, byWeek, label }) {
  const tip = useTip();
  const [ref, width] = useWidth();
  const w = Math.max(240, width || 520);
  const h = 220;
  const cNew = COLORS[0];
  const cIn = `color-mix(in srgb, ${COLORS[0]} 45%, var(--color-panel))`;
  const cOut = COLORS[1];
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
    const joined = (r) => r.new_members + r.transferred_in;
    const up = Math.max(1, max(rows, joined) || 0);
    const down = Math.max(1, max(rows, (r) => r.transferred_out) || 0);
    const y = scaleLinear().domain([-down, up]).nice(5);
    const ticks = y.ticks(5).filter(Number.isInteger);
    const labelW = max(rows, (r) => textWidth(fmt.shortDate(r.start))) || 30;
    const m = { t: 20, r: Math.ceil(labelW / 2), b: 24, l: Math.ceil(max(ticks, (t) => textWidth(Math.abs(t))) || 10) + 10 };
    const x = scaleBand().domain(rows.map((r) => r.start)).range([m.l, w - m.r]).padding(0.2);
    y.range([h - m.b, m.t]);
    const bw = Math.min(24, x.bandwidth());
    const left = (r) => x(r.start) + (x.bandwidth() - bw) / 2;
    const every = Math.max(1, Math.ceil((labelW + 8) / x.step()));
    const GAP = 2;
    // A column segment from one value to another. `round` rounds the end away from the zero line.
    const seg = (r, from, to, fill, key, round) => {
      const top = Math.min(y(from), y(to));
      const height = Math.abs(y(from) - y(to)) - (from !== 0 && to !== 0 ? GAP : 0);
      if (height <= 0) return null;
      const x0 = left(r);
      const rad = round ? Math.min(4, height, bw / 2) : 0;
      const d = to >= 0
        ? `M${x0},${top + height}V${top + rad}q0,${-rad} ${rad},${-rad}H${x0 + bw - rad}q${rad},0 ${rad},${rad}V${top + height}Z`
        : `M${x0},${top}V${top + height - rad}q0,${rad} ${rad},${rad}H${x0 + bw - rad}q${rad},0 ${rad},${-rad}V${top}Z`;
      return <path key={`${key}${r.start}`} d={d} style={{ fill }} />;
    };
    const when = (r) => (r.start === r.end ? fmt.shortDate(r.start) : `${fmt.shortDate(r.start)} to ${fmt.shortDate(r.end)}`);
    const peak = max(rows, joined);
    const firstPeak = rows.find((r) => joined(r) === peak);
    body = (
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
        <Grid ticks={ticks} y={y} left={m.l} right={w - m.r} label={(t) => Math.abs(t)} />
        {rows.map((r) => seg(r, 0, r.new_members, cNew, 'n', r.transferred_in === 0))}
        {rows.map((r) => seg(r, r.new_members, joined(r), cIn, 'i', true))}
        {rows.map((r) => seg(r, 0, -r.transferred_out, cOut, 'o', true))}
        {peak > 0 && firstPeak && (
          <text className="wf-vlabel" x={left(firstPeak) + bw / 2} y={y(peak) - 6} textAnchor="middle">{fmt.int(peak)}</text>
        )}
        {rows.filter((r, i) => i % every === 0).map((r) => (
          <text key={`x${r.start}`} className="wf-tick" x={x(r.start) + x.bandwidth() / 2} y={h - 6} textAnchor="middle">{fmt.shortDate(r.start)}</text>
        ))}
        {rows.map((r) => (
          <rect key={`h${r.start}`} className="wf-hit" x={x(r.start) - x.step() * 0.1} width={x.step()} y={m.t} height={h - m.b - m.t}
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
        <span>{byWeek ? 'One column per week' : 'One column per day'}</span>
      </div>
      {body}
    </div>
  );
}
