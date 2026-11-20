import { useEffect, useState } from 'react';
import { format, utcFormat } from 'd3';

const comma = format(',');
const one = format('.1f');
const day = (v) => new Date(`${String(v).slice(0, 10)}T00:00:00Z`);

export const fmt = {
  int: (v) => comma(+v),
  pct: (v) => `${one(+v)}%`,
  one: (v) => one(+v),
  signed: (v) => `${+v > 0 ? '+' : +v < 0 ? '−' : ''}${comma(Math.abs(+v))}`,
  date: (v) => utcFormat('%-d %B %Y')(day(v)),
  shortDate: (v) => utcFormat('%-d %b')(day(v)),
  month: (v) => utcFormat('%b %y')(day(v)),
  longMonth: (v) => utcFormat('%B %Y')(day(v)),
  lowerFirst: (v) => String(v).replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase()),
};

export const COLORS = ['var(--wf-c1)', 'var(--wf-c2)', 'var(--wf-c3)', 'var(--wf-c4)', 'var(--wf-c5)'];
export const MUTED = 'var(--cds-chart-muted)';
const QUIET = ['Not stated', 'Other'];
const SHADES = [100, 72, 50, 34, 22, 14];

// A colour per category: distinct hues, or shades of one hue when the categories are in order.
export function colorsFor(rows, ordered = false) {
  let n = 0;
  return rows.map((row, i) => {
    if (ordered) return `color-mix(in srgb, ${COLORS[0]} ${SHADES[i % SHADES.length]}%, var(--color-panel))`;
    if (QUIET.includes(row.category)) return MUTED;
    const k = n;
    n += 1;
    return k < COLORS.length ? COLORS[k] : `color-mix(in srgb, ${COLORS[k % COLORS.length]} 50%, var(--color-panel))`;
  });
}
export const isQuiet = (name) => QUIET.includes(name);

// The width of whatever element the returned ref is attached to, kept current as the page resizes.
export function useWidth() {
  const [node, setNode] = useState(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, width];
}

// Measures text in the chart's own font, for axis margins and label spacing.
let ruler;
export function textWidth(text, size = 12.5) {
  if (!ruler) ruler = document.createElement('canvas').getContext('2d');
  ruler.font = `${size}px "Inter Variable", system-ui, sans-serif`;
  return ruler.measureText(String(text)).width;
}
