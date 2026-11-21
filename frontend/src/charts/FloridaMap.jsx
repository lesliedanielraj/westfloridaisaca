import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  contourDensity, geoContains, geoMercator, geoPath, max, pointer, scaleSqrt, select, zoom, zoomIdentity,
} from 'd3';
import florida from '../geo/florida-counties.json';
import basemap from '../geo/basemap.json';
import { useTip } from '../tooltip.jsx';
import { COLORS, fmt, useWidth } from '../util.js';

// West central Florida, where nearly all members live. Zooming out is not allowed past this frame.
const FRAME = { type: 'MultiPoint', coordinates: [[-83.2, 26.85], [-81.35, 28.95]] };

export const MAP_VIEWS = [
  { id: 'heat', name: 'Heat', hint: 'Where members concentrate, whatever the county lines' },
  { id: 'hex', name: 'Hexagons', hint: 'Members counted in cells about 5 miles across' },
  { id: 'counties', name: 'Counties', hint: 'Members per county, with a circle for each home ZIP code' },
];

// Towns named on the map: [name, longitude, latitude, the zoom level it appears from].
const TOWNS = [
  ['Tampa', -82.458, 27.948, 1], ['St. Petersburg', -82.64, 27.771, 1], ['Clearwater', -82.8, 27.966, 1],
  ['Lakeland', -81.95, 28.04, 1], ['Sarasota', -82.531, 27.336, 1], ['Bradenton', -82.575, 27.499, 1],
  ['Spring Hill', -82.525, 28.479, 1], ['Orlando', -81.379, 28.538, 1], ['Brandon', -82.286, 27.938, 1],
  ['Wesley Chapel', -82.33, 28.24, 1], ['Winter Haven', -81.733, 28.022, 1], ['Port Charlotte', -82.09, 26.976, 1],
  ['Kissimmee', -81.408, 28.292, 1],
  ['Riverview', -82.326, 27.866, 2], ['Largo', -82.787, 27.909, 2], ['Palm Harbor', -82.764, 28.078, 2],
  ['Lutz', -82.461, 28.151, 2], ['Plant City', -82.115, 28.018, 2], ["Land O' Lakes", -82.457, 28.219, 2],
  ['New Port Richey', -82.719, 28.244, 2], ['Venice', -82.454, 27.1, 2], ['Brooksville', -82.388, 28.555, 2],
  ['Dunedin', -82.773, 28.02, 3], ['Temple Terrace', -82.389, 28.035, 3], ['Odessa', -82.592, 28.194, 3],
  ['Valrico', -82.236, 27.938, 3], ['Apollo Beach', -82.407, 27.773, 3], ['Lithia', -82.21, 27.84, 3],
  ['Zephyrhills', -82.181, 28.234, 3], ['Tarpon Springs', -82.757, 28.146, 3], ['Lakewood Ranch', -82.41, 27.41, 3],
];
// In the county view these sit under a county's own label until the map is zoomed in.
const UNDER_COUNTY_LABEL = ['Clearwater', 'Bradenton', 'Brandon', 'Spring Hill', 'Sarasota'];
// On a phone-width map these crowd their neighbours until the map is zoomed in.
const CROWDED_WHEN_NARROW = ['Brandon', 'Winter Haven', 'Kissimmee', 'Wesley Chapel'];
const WATERS = [['Gulf of Mexico', -83.02, 27.75, -70], ['Tampa Bay', -82.56, 27.7, -55]];
const SHIELDS = [['I-75', -82.33, 28.42], ['I-4', -82.1, 28.03], ['I-275', -82.52, 27.86], ['I-75', -82.36, 27.3]];

// A colour between the low, middle and high stops the theme defines for a ramp ("heat" or "hex").
const ramp = (name, t) => {
  const pct = (x) => Math.round(Math.min(1, Math.max(0, x)) * 100);
  return t < 0.5
    ? `color-mix(in oklab, var(--map-${name}-mid) ${pct(t * 2)}%, var(--map-${name}-lo))`
    : `color-mix(in oklab, var(--map-${name}-hi) ${pct(t * 2 - 1)}%, var(--map-${name}-mid))`;
};

// What survives a change of tab or filter: the zoom, and the view the visitor chose.
const kept = { transform: null, width: 0, view: null };
function startingView() {
  if (kept.view) return kept.view;
  try {
    const saved = window.localStorage.getItem('wf-map-view');
    if (MAP_VIEWS.some((v) => v.id === saved)) return saved;
  } catch { /* nothing saved */ }
  return 'heat';
}

// Coast, water, built-up areas and main roads. Drawn once per size; zooming only moves it.
const Basemap = memo(function Basemap({ path, plain }) {
  const d = (f) => path(f);
  return (
    <g className="wf-basemap">
      {florida.features.map((f) => <path key={f.properties.name} d={d(f)} className="wf-bm-land" vectorEffect="non-scaling-stroke" />)}
      {!plain && basemap.urban.map((f, i) => <path key={`u${i}`} d={d(f)} className="wf-bm-urban" />)}
      {basemap.lakes.map((f, i) => <path key={`l${i}`} d={d(f)} className="wf-bm-water" />)}
      {basemap.rivers.map((f, i) => <path key={`r${i}`} d={d(f)} className="wf-bm-river" vectorEffect="non-scaling-stroke" />)}
      {!plain && basemap.roads.map((f, i) => <path key={`c${i}`} d={d(f)} className="wf-bm-road-case" vectorEffect="non-scaling-stroke" />)}
      {!plain && basemap.roads.map((f, i) => <path key={`s${i}`} d={d(f)} className="wf-bm-road" vectorEffect="non-scaling-stroke" />)}
      {!plain && basemap.highways.map((f, i) => <path key={`hc${i}`} d={d(f)} className="wf-bm-hwy-case" vectorEffect="non-scaling-stroke" />)}
      {!plain && basemap.highways.map((f, i) => <path key={`h${i}`} d={d(f)} className="wf-bm-hwy" vectorEffect="non-scaling-stroke" />)}
    </g>
  );
});

// A map of members by home ZIP code, in three views the visitor can switch between.
// `picked` outlines one county. With `onPick`, a click on a county that has members (or on a ZIP circle
// or hexagon in it) calls it with the county's name. With `onClear`, Reset also clears the picked county.
export default function FloridaMap({ counties, zips, picked, label, onPick, onClear }) {
  const tip = useTip();
  const [ref, width] = useWidth();
  const svgRef = useRef(null);
  const control = useRef(null);
  const clickTimer = useRef(null);
  const [zoomed, setZoomed] = useState(zoomIdentity);
  const [view, setViewState] = useState(startingView);
  const w = Math.max(240, width || 480);
  const h = Math.round(Math.min(w * 1.3, 640));

  const setView = (id) => {
    kept.view = id;
    try { window.localStorage.setItem('wf-map-view', id); } catch { /* not saved */ }
    tip.hide();
    setViewState(id);
  };

  const path = useMemo(() => geoPath(geoMercator().fitExtent([[6, 6], [w - 6, h - 6]], FRAME)), [w, h]);
  const projection = path.projection();
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
        setZoomed(event.transform);
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
  const zipRows = useMemo(() => zips || [], [zips]);
  const byName = new Map(countyRows.map((c) => [c.county, c]));
  const points = useMemo(
    () => zipRows.map((z) => ({ p: projection([+z.lon, +z.lat]), n: +z.members, county: z.county })).filter((d) => d.p),
    [zipRows, projection],
  );

  // Heat: smoothed member density, as nested bands that build up towards the busiest places.
  const heat = useMemo(() => {
    if (view !== 'heat' || !points.length) return [];
    const bands = contourDensity().x((d) => d.p[0]).y((d) => d.p[1]).weight((d) => d.n)
      .size([w, h]).bandwidth(Math.max(7, w / 50)).thresholds(14)(points);
    const top = max(bands, (b) => b.value) || 1;
    const draw = geoPath();
    return bands.map((b) => ({ d: draw(b), t: (b.value / top) ** 0.7 }));
  }, [view, points, w, h]);

  // Hexagons: members summed into a honeycomb. Each cell belongs to the county its centre is in.
  const hexes = useMemo(() => {
    if (view !== 'hex' || !points.length) return { cells: [], corners: '', top: 1 };
    const r = Math.max(9, w / 43);
    const dx = r * Math.sqrt(3);
    const dy = r * 1.5;
    const bins = new Map();
    points.forEach((d) => {
      const row = Math.round(d.p[1] / dy);
      const shift = row % 2 ? dx / 2 : 0;
      const col = Math.round((d.p[0] - shift) / dx);
      const key = `${col},${row}`;
      const cell = bins.get(key) || { key, x: col * dx + shift, y: row * dy, n: 0 };
      cell.n += d.n;
      bins.set(key, cell);
    });
    const cells = [...bins.values()];
    cells.forEach((c) => {
      const where = projection.invert([c.x, c.y]);
      const home = florida.features.find((f) => geoContains(f, where));
      c.county = home ? home.properties.name : null;
    });
    const corners = [0, 1, 2, 3, 4, 5].map((i) => {
      const a = (Math.PI / 180) * (60 * i - 30);
      return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
    }).join(' ');
    return { cells, corners, top: max(cells, (c) => c.n) || 1 };
  }, [view, points, w, projection]);

  const shade = scaleSqrt().domain([0, max(countyRows, (c) => +c.members) || 1]).range([0.08, 0.9]);
  const radius = scaleSqrt().domain([0, max(zipRows, (z) => +z.members) || 1]).range([0, w < 420 ? 9 : 13]);
  const { k } = zoomed;
  const on = (x, y, pad = 12) => x > pad && x < w - pad && y > pad && y < h - pad;
  const zoomBy = (factor) => control.current && control.current.svg.call(control.current.behaviour.scaleBy, factor);
  const reset = () => {
    clearTimeout(clickTimer.current);
    if (control.current) control.current.svg.call(control.current.behaviour.transform, zoomIdentity);
    if (picked && onClear) onClear();
  };
  // Waits a moment before picking, so the first click of a double-click does not filter. A drag never gets here:
  // the zoom behaviour swallows the click that ends one.
  const pick = (county) => {
    clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => onPick(county), 220);
  };
  const pickable = (county) => Boolean(onPick && county && byName.has(county));
  const hintFor = (county) => (pickable(county) ? (picked === county ? '. Click to clear the filter' : '. Click to filter') : '');
  const countyTip = (name) => {
    const c = byName.get(name);
    const count = c ? `${fmt.int(c.members)} members (${fmt.pct(c.share)})` : counties ? 'no members' : 'loading';
    return `${name} County: ${count}${hintFor(name)}`;
  };

  const countyLabelFrom = k >= 4 ? 1 : k >= 2 ? 5 : 20;
  const towns = TOWNS.filter(([name, , , from]) => k >= from
    && !(view === 'counties' && k < 2 && UNDER_COUNTY_LABEL.includes(name))
    && !(w < 420 && k < 2 && CROWDED_WHEN_NARROW.includes(name)));
  // Where each town's name is drawn, so a hexagon's count can step aside for it.
  const townBoxes = towns.map(([name, lon, lat]) => {
    const p = projection([lon, lat]);
    const x = zoomed.applyX(p[0]);
    const y = zoomed.applyY(p[1]);
    return { name, x, y, left: x + 2, right: x + 9 + name.length * 6.2, top: y - 9, bottom: y + 7 };
  }).filter((t) => on(t.x, t.y, 14) && t.x < w - 50);
  const underTown = (x, y) => townBoxes.some((t) => x > t.left - 9 && x < t.right + 9 && y > t.top - 6 && y < t.bottom + 6);
  const legend = {
    heat: { title: 'Member density', low: 'Fewer', high: 'More', ramp: 'heat' },
    hex: { title: 'Members per hexagon', low: '1', high: fmt.int(hexes.top), ramp: 'hex' },
    counties: { title: 'Members per county', low: '1', high: fmt.int(max(countyRows, (c) => +c.members) || 1), ramp: 'county' },
  }[view];

  return (
    <div className="wf-map-wrap">
      <div className="wf-seg" role="group" aria-label="Map view">
        {MAP_VIEWS.map((v) => (
          <button key={v.id} type="button" className="wf-seg-btn" aria-pressed={view === v.id} title={v.hint}
            onClick={() => setView(v.id)}>{v.name}</button>
        ))}
      </div>
      <div ref={ref} className="wf-map-box">
        <svg ref={svgRef} className="wf-mapsvg" width="100%" viewBox={`0 0 ${w} ${h}`} role="img"
          aria-label={`${label}. View: ${MAP_VIEWS.find((v) => v.id === view).name}`}
          style={{ touchAction: k > 1 ? 'none' : 'pan-y', cursor: k > 1 ? 'grab' : undefined }}>
          <rect width={w} height={h} className="wf-bm-sea" />
          <g transform={zoomed.toString()}>
            <Basemap path={path} plain={view === 'counties'} />

            {view === 'heat' && (
              <g className="wf-heat">
                {heat.map((b, i) => <path key={i} d={b.d} style={{ fill: ramp('heat', b.t) }} />)}
              </g>
            )}

            {/* Counties: shaded in the county view, otherwise clear shapes that still take the pointer. */}
            <g>
              {outlines.map((o) => {
                const c = byName.get(o.name);
                const can = pickable(o.name);
                return (
                  <path key={o.name} d={o.d} vectorEffect="non-scaling-stroke"
                    className={view === 'counties' ? 'wf-county' : 'wf-county wf-county-line'}
                    onClick={can ? () => pick(o.name) : undefined}
                    style={{
                      fill: COLORS[0], fillOpacity: view === 'counties' && c ? shade(+c.members) : 0,
                      cursor: can ? 'pointer' : undefined, pointerEvents: 'all',
                    }}
                    {...tip.props(countyTip(o.name))} />
                );
              })}
            </g>

            {view === 'hex' && (
              <g>
                {hexes.cells.map((c) => (
                  <polygon key={c.key} points={hexes.corners} transform={`translate(${c.x},${c.y})`} className="wf-hex"
                    vectorEffect="non-scaling-stroke"
                    onClick={pickable(c.county) ? () => pick(c.county) : undefined}
                    style={{ fill: ramp('hex', Math.sqrt(c.n / hexes.top)), cursor: pickable(c.county) ? 'pointer' : undefined }}
                    {...tip.props(`${fmt.int(c.n)} ${c.n === 1 ? 'member' : 'members'} in this area${c.county ? `, ${c.county} County` : ''}${hintFor(c.county)}`)} />
                ))}
              </g>
            )}

            {outlines.filter((o) => o.name === picked).map((o) => (
              <path key={o.name} d={o.d} className="wf-county-on" vectorEffect="non-scaling-stroke" />
            ))}
          </g>

          {view === 'counties' && (
            <g>
              {zipRows.map((z) => {
                const p = projection([+z.lon, +z.lat]);
                if (!p) return null;
                return (
                  <circle key={z.zip} cx={zoomed.applyX(p[0])} cy={zoomed.applyY(p[1])} r={Math.max(1.5, radius(+z.members)) * k ** 0.4}
                    onClick={pickable(z.county) ? () => pick(z.county) : undefined}
                    style={{ fill: COLORS[1], fillOpacity: 0.7, stroke: 'var(--color-panel)', strokeWidth: 0.7, cursor: pickable(z.county) ? 'pointer' : undefined }}
                    {...tip.props(`ZIP ${z.zip}${z.place ? `, ${z.place}` : ''}: ${fmt.int(z.members)} ${+z.members === 1 ? 'member' : 'members'}`)} />
                );
              })}
            </g>
          )}

          {/* Names and numbers sit outside the zoomed group, so they stay the same size at every zoom. */}
          <g className="wf-map-names">
            {WATERS.map(([name, lon, lat, turn]) => {
              const p = projection([lon, lat]);
              const x = zoomed.applyX(p[0]);
              const y = zoomed.applyY(p[1]);
              return on(x, y, 30) && (
                <text key={name} className="wf-bm-waterlabel" textAnchor="middle" transform={`translate(${x},${y}) rotate(${turn})`}>{name}</text>
              );
            })}
            {view === 'heat' && SHIELDS.map(([name, lon, lat], i) => {
              const p = projection([lon, lat]);
              const x = zoomed.applyX(p[0]);
              const y = zoomed.applyY(p[1]);
              return on(x, y, 20) && (
                <g key={i} transform={`translate(${x},${y})`}>
                  <rect x={-14} y={-7} width={28} height={14} rx={3} className="wf-bm-shield" />
                  <text className="wf-bm-shieldtext" textAnchor="middle" dy={3.5}>{name}</text>
                </g>
              );
            })}
            {view === 'hex' && hexes.cells.filter((c) => c.n >= (k >= 2 ? 5 : 25)).map((c) => {
              const x = zoomed.applyX(c.x);
              const y = zoomed.applyY(c.y);
              return on(x, y) && !underTown(x, y) && (
                <text key={c.key} x={x} y={y + 3.5} textAnchor="middle"
                  className={`wf-hexlabel${Math.sqrt(c.n / hexes.top) > 0.5 ? ' wf-hexlabel-strong' : ''}`}>{fmt.int(c.n)}</text>
              );
            })}
            {townBoxes.map(({ name, x, y }) => (
              <g key={name}>
                {view !== 'hex' && <circle cx={x} cy={y} r={2} className="wf-towndot" />}
                <text className={`wf-town${name === 'Tampa' ? ' wf-town-main' : ''}`} x={x + 5} y={y + 3.5}>{name}</text>
              </g>
            ))}
            {view === 'counties' && outlines.map((o) => {
              const c = byName.get(o.name);
              const x = zoomed.applyX(o.centre[0]);
              const y = zoomed.applyY(o.centre[1]);
              if (!c || +c.members < countyLabelFrom || !on(x, y, 30)) return null;
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
          <button type="button" className="wf-zoom-btn"
            aria-label={onClear ? 'Reset the map view and clear the county filter' : 'Reset the map view'}
            onClick={reset} disabled={k === 1 && !(picked && onClear)}>Reset</button>
        </div>
        <div className="wf-maplegend">
          <div className="wf-maplegend-title">{legend.title}</div>
          <div className={`wf-maplegend-ramp wf-ramp-${legend.ramp}`} />
          <div className="wf-maplegend-ends"><span>{legend.low}</span><span>{legend.high}</span></div>
        </div>
      </div>
    </div>
  );
}
