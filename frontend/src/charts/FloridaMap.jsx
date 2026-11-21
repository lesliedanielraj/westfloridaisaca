import { useEffect, useMemo, useRef, useState } from 'react';
import { geoMercator, geoPath, max, pointer, scaleSqrt, select, zoom, zoomIdentity } from 'd3';
import florida from '../geo/florida-counties.json';
import { useTip } from '../tooltip.jsx';
import { COLORS, fmt, useWidth } from '../util.js';

// West central Florida, where nearly all members live. Zooming out is not allowed past this frame.
const FRAME = { type: 'MultiPoint', coordinates: [[-83.2, 26.85], [-81.35, 28.95]] };

// The zoom level outlives the component, so switching tabs or filters keeps the same view.
const kept = { transform: null, width: 0 };

// Counties shaded by members, with a circle per home ZIP code. `picked` outlines one county.
// With `onPick`, a click on a county that has members, or on one of its ZIP circles, calls it with the county's name.
export default function FloridaMap({ counties, zips, picked, label, onPick }) {
  const tip = useTip();
  const [ref, width] = useWidth();
  const svgRef = useRef(null);
  const control = useRef(null);
  const clickTimer = useRef(null);
  const [view, setView] = useState(zoomIdentity);
  const w = Math.max(240, width || 480);
  const h = Math.round(Math.min(w * 1.3, 640));

  const path = useMemo(() => geoPath(geoMercator().fitExtent([[6, 6], [w - 6, h - 6]], FRAME)), [w, h]);
  const outlines = useMemo(
    () => florida.features.map((f) => ({ name: f.properties.name, d: path(f), centre: path.centroid(f) })),
    [path],
  );

  useEffect(() => {
    if (!width || !svgRef.current) return undefined;
    const svg = select(svgRef.current);
    let current = zoomIdentity;
    const behaviour = zoom().scaleExtent([1, 12]).extent([[0, 0], [w, h]]).translateExtent([[0, 0], [w, h]])
      // Plain scrolling moves the page; zooming needs Ctrl or ⌘, a pinch, or the buttons.
      .filter((event) => {
        if (event.type === 'wheel') return event.ctrlKey || event.metaKey;
        if (event.type === 'touchstart') return event.touches.length > 1 || current.k > 1;
        return !event.button;
      })
      .on('zoom', (event) => {
        current = event.transform;
        kept.transform = event.transform;
        kept.width = w;
        tip.hide();
        setView(event.transform);
      });
    control.current = { svg, behaviour };
    svg.call(behaviour).on('dblclick.zoom', null);
    svg.on('dblclick', (event) => {
      clearTimeout(clickTimer.current); // a double-click zooms; it is not two picks
      svg.call(behaviour.scaleBy, 2, pointer(event));
    });
    const scale = kept.width ? w / kept.width : 1;
    const start = kept.transform
      ? zoomIdentity.translate(kept.transform.x * scale, kept.transform.y * scale).scale(kept.transform.k)
      : zoomIdentity;
    svg.call(behaviour.transform, start);
    return () => { clearTimeout(clickTimer.current); svg.on('.zoom', null).on('dblclick', null); };
  }, [width, w, h, tip]);

  // The map is drawn even before the counts arrive, so zooming is wired up once and stays.
  const countyRows = counties || [];
  const zipRows = zips || [];
  const byName = new Map(countyRows.map((c) => [c.county, c]));
  const shade = scaleSqrt().domain([0, max(countyRows, (c) => +c.members) || 1]).range([0.05, 0.8]);
  const radius = scaleSqrt().domain([0, max(zipRows, (z) => +z.members) || 1]).range([0, w < 420 ? 9 : 13]);
  const projection = path.projection();
  const { k } = view;
  const labelFrom = k >= 4 ? 1 : k >= 2 ? 5 : 20;
  const zoomBy = (factor) => control.current && control.current.svg.call(control.current.behaviour.scaleBy, factor);
  const reset = () => control.current && control.current.svg.call(control.current.behaviour.transform, zoomIdentity);
  // Waits a moment before picking, so the first click of a double-click does not filter. A drag never gets here:
  // the zoom behaviour swallows the click that ends one.
  const pick = (county) => {
    clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => onPick(county), 220);
  };
  const pickable = (county) => Boolean(onPick && county && byName.has(county));

  return (
    <div ref={ref} className="wf-map-box">
      <svg ref={svgRef} className="wf-mapsvg" width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}
        style={{ touchAction: k > 1 ? 'none' : 'pan-y', cursor: k > 1 ? 'grab' : undefined }}>
        <g transform={view.toString()}>
          {outlines.map((o) => {
            const c = byName.get(o.name);
            const on = picked === o.name;
            const can = pickable(o.name);
            return (
              <path key={o.name} d={o.d} vectorEffect="non-scaling-stroke"
                onClick={can ? () => pick(o.name) : undefined}
                style={{
                  cursor: can ? 'pointer' : undefined,
                  fill: COLORS[0], fillOpacity: c ? shade(+c.members) : 0,
                  stroke: on ? 'var(--color-fg)' : 'var(--cds-chart-axis)', strokeWidth: on ? 2 : 0.8,
                }}
                {...tip.props(`${o.name} County: ${c ? `${fmt.int(c.members)} members (${fmt.pct(c.share)})` : counties ? 'no members' : 'loading'}${can ? (on ? '. Click to clear the filter' : '. Click to filter') : ''}`)} />
            );
          })}
        </g>
        <g>
          {zipRows.map((z) => {
            const p = projection([+z.lon, +z.lat]);
            if (!p) return null;
            return (
              <circle key={z.zip} cx={view.applyX(p[0])} cy={view.applyY(p[1])} r={Math.max(1.5, radius(+z.members)) * k ** 0.4}
                onClick={pickable(z.county) ? () => pick(z.county) : undefined}
                style={{ fill: COLORS[1], fillOpacity: 0.7, stroke: 'var(--color-panel)', strokeWidth: 0.7, cursor: pickable(z.county) ? 'pointer' : undefined }}
                {...tip.props(`ZIP ${z.zip}${z.place ? `, ${z.place}` : ''}: ${fmt.int(z.members)} ${+z.members === 1 ? 'member' : 'members'}`)} />
            );
          })}
        </g>
        <g>
          {outlines.map((o) => {
            const c = byName.get(o.name);
            const x = view.applyX(o.centre[0]);
            const y = view.applyY(o.centre[1]);
            if (!c || +c.members < labelFrom || x < 30 || x > w - 30 || y < 14 || y > h - 14) return null;
            return (
              <text key={o.name} className="wf-maplabel" textAnchor="middle" transform={`translate(${x},${y})`}>
                <tspan x="0">{o.name}</tspan>
                <tspan className="wf-maplabel-n" x="0" dy="1.15em">{fmt.int(c.members)}</tspan>
              </text>
            );
          })}
        </g>
      </svg>
      <div className="wf-zoom">
        <button type="button" className="wf-zoom-btn" aria-label="Zoom in" onClick={() => zoomBy(1.6)}>+</button>
        <button type="button" className="wf-zoom-btn" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.6)}>−</button>
        <button type="button" className="wf-zoom-btn" aria-label="Reset the map view" onClick={reset} disabled={k === 1}>Reset</button>
      </div>
    </div>
  );
}
