const fmt = {
  int: (v) => d3.format(',')(+v),
  signed: (v) => (+v > 0 ? '+' : +v < 0 ? '−' : '') + d3.format(',')(Math.abs(+v)),
  pct: (v) => d3.format('.1f')(+v) + '%',
  yrs: (v) => d3.format('.1f')(+v),
  text: (v) => String(v),
  lower: (v) => String(v).replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase()),
  date: (v) => d3.utcFormat('%-d %B %Y')(new Date(v)),
  year: (v) => String(v).slice(0, 4),
};
const enc = (v) => String(v).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D');
const matches = (row, where) => where.split('&').every((pair) => {
  const i = pair.indexOf('=');
  return String(row[decodeURIComponent(pair.slice(0, i))]) === decodeURIComponent(pair.slice(i + 1));
});
const rowsOf = (id) => {
  const s = dash.data(id);
  return s.status === 'ok' && Array.isArray(s.data) ? s.data : null;
};
const failed = (ids) => ids.some((id) => dash.data(id).status === 'error');
const placeholder = (el, ids) => { el.textContent = failed(ids) ? 'Failed to load' : '—'; };
const showTip = (el, tip, ev, text) => {
  tip.textContent = text;
  tip.hidden = false;
  const box = el.getBoundingClientRect();
  const x = Math.min(ev.clientX - box.left + 12, Math.max(0, el.clientWidth - tip.offsetWidth - 4));
  tip.style.left = Math.max(0, x) + 'px';
  tip.style.top = (ev.clientY - box.top + 14) + 'px';
};
const addTip = (el) => {
  const tip = document.createElement('div');
  tip.className = 'wf-tip';
  tip.hidden = true;
  el.append(tip);
  return tip;
};

const ALL = 'All members';
const chosenGroup = () => dash.params().seniority || ALL;
[
  ['summary', 'Headline member counts'],
  ['breakdowns', 'Members by category'],
  ['join_year', 'Current members by join year'],
  ['join_month', 'Current members by join month'],
  ['certifications', 'Credential holders'],
  ['employers', 'Employers with three or more members'],
  ['counties', 'Members by Florida county'],
  ['zips', 'Members by home ZIP code'],
  ['cities', 'Members by home city'],
  ['region_function', 'Job function by home region'],
].forEach(([id, title]) => {
  dash.calc(id + '_v', {
    title: title + ', for the seniority group shown',
    description: 'The rows of this table for the seniority group picked on the page.',
    inputs: [id],
    fn: (rows) => {
      const group = dash.params().seniority || 'All members';
      return rows.filter((row) => row.seniority === group);
    },
  });
});

dash.calc('highlights', {
  title: 'Highlights for the board',
  description: 'The three largest counties and job functions, the larger county with the highest share of recent joiners, and the share of members in leadership roles or in their first three years.',
  inputs: ['counties_v', 'breakdowns_v'],
  fn: (counties, breakdowns) => {
    if (!counties || !breakdowns || !counties.length || !breakdowns.length) return [];
    const round1 = (n) => Math.round(n * 10) / 10;
    const bySize = [...counties].sort((a, b) => b.members - a.members);
    const larger = counties.filter((c) => c.members >= 50)
      .map((c) => ({ county: c.county, members: c.members, rate: 100 * c.new_12mo / c.members }))
      .sort((a, b) => b.rate - a.rate);
    const pick = (dimension, category) => breakdowns.find((r) => r.dimension === dimension && r.category === category) || { members: 0, share: 0 };
    const functions = breakdowns
      .filter((r) => r.dimension === 'Job function' && r.category !== 'Other' && r.category !== 'Not stated')
      .sort((a, b) => b.members - a.members);
    const executives = pick('Seniority', 'C-suite and executives');
    const managers = pick('Seniority', 'Directors, managers and consultants');
    const underOne = pick('Tenure', 'Under 1 year');
    const oneToThree = pick('Tenure', '1 to 3 years');
    const name = (list, i, key) => (list[i] ? list[i][key] : '');
    const share = (list, i) => (list[i] ? list[i].share : 0);
    return [{
      county_1: name(bySize, 0, 'county'), county_2: name(bySize, 1, 'county'), county_3: name(bySize, 2, 'county'),
      growth_county: larger.length >= 2 ? name(larger, 0, 'county') : '',
      growth_members: larger[0] ? larger[0].members : 0,
      growth_share: larger[0] ? round1(larger[0].rate) : 0,
      function_1: name(functions, 0, 'category'), function_1_share: share(functions, 0),
      function_2: name(functions, 1, 'category'), function_2_share: share(functions, 1),
      function_3: name(functions, 2, 'category'), function_3_share: share(functions, 2),
      leaders: executives.members + managers.members,
      leaders_share: round1(executives.share + managers.share),
      early_share: round1(underOne.share + oneToThree.share),
    }];
  },
});

dash.draw('num', (el) => {
  const rows = rowsOf(el.dataset.source);
  let row = null;
  if (rows) row = el.dataset.where ? rows.find((r) => matches(r, el.dataset.where)) : rows[+el.dataset.row || 0];
  const v = row ? row[el.dataset.field] : null;
  el.textContent = v == null || v === '' ? '—' : fmt[el.dataset.fmt || 'int'](v);
});

dash.draw('rows', (tb) => {
  const rows = rowsOf(tb.dataset.src);
  if (!rows) { tb.replaceChildren(); return; }
  const cols = tb.dataset.cols.split(',').map((c) => c.split(':'));
  tb.replaceChildren(...rows.map((r) => {
    const tr = document.createElement('tr');
    cols.forEach(([field, kind]) => {
      const td = document.createElement('td');
      td.textContent = r[field] == null ? '' : fmt[kind || 'text'](r[field]);
      if (kind) td.className = 'wf-num';
      tr.append(td);
    });
    return tr;
  }));
});

dash.draw('bars', (el) => {
  const id = el.dataset.source;
  let rows = rowsOf(id);
  if (!rows) { placeholder(el, [id]); return; }
  const L = el.dataset.label, V = el.dataset.value, S = el.dataset.share;
  if (el.dataset.dim) rows = rows.filter((r) => r.dimension === el.dataset.dim);
  if (el.dataset.top) rows = rows.slice(0, +el.dataset.top);
  if (!rows.length) { el.textContent = 'None in this group'; return; }
  const max = d3.max(rows, (r) => +r[V]) || 1;
  el.replaceChildren();
  const box = document.createElement('div');
  box.className = 'wf-bars' + (el.dataset.wide ? ' wf-wide' : '') + (el.dataset.look === 'lollipop' ? ' wf-lolli' : '');
  const tip = addTip(el);
  rows.forEach((r) => {
    const label = document.createElement('div');
    label.className = 'wf-bar-label';
    label.textContent = r[L];
    const track = document.createElement('div');
    track.className = 'wf-bar-track';
    const fill = document.createElement('div');
    fill.className = 'wf-bar-fill';
    fill.style.width = (100 * r[V] / max) + '%';
    fill.style.background = dash.colors[(+el.dataset.color || 0) % dash.colors.length];
    track.append(fill);
    const val = document.createElement('div');
    val.className = 'wf-bar-val';
    val.textContent = fmt.int(r[V]) + (S ? ' · ' + fmt.pct(r[S]) : '');
    const text = r[L] + ': ' + fmt.int(r[V]) + ' members' + (S ? ' (' + fmt.pct(r[S]) + (chosenGroup() === ALL ? ' of all members)' : ' of this group)') : '');
    [label, track, val].forEach((n) => {
      n.addEventListener('pointermove', (ev) => showTip(el, tip, ev, text));
      n.addEventListener('pointerleave', () => { tip.hidden = true; });
    });
    box.append(label, track, val);
  });
  el.prepend(box);
});

dash.draw('cols', (el) => {
  const id = el.dataset.source;
  const rows = rowsOf(id);
  if (!rows) { placeholder(el, [id]); return; }
  if (!rows.length) { el.textContent = 'None in this group'; return; }
  const X = el.dataset.x, Y = el.dataset.y;
  const label = el.dataset.kind === 'month' ? (v) => d3.utcFormat('%b %y')(new Date(v)) : (v) => String(v);
  const tipLabel = el.dataset.kind === 'month' ? (v) => d3.utcFormat('%B %Y')(new Date(v)) : (v) => String(v);
  const w = Math.max(240, el.clientWidth || 600), h = 230;
  el.replaceChildren();
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`)
    .attr('role', 'img').attr('aria-label', el.dataset.aria || '');
  const tip = addTip(el);
  const y = d3.scaleLinear().domain([0, d3.max(rows, (r) => +r[Y]) || 1]).nice(4);
  const ticks = y.ticks(4);
  const measure = (t) => { const n = svg.append('text').attr('class', 'wf-tick').text(t); const len = n.node().getComputedTextLength(); n.remove(); return len; };
  const left = Math.ceil(measure(fmt.int(ticks[ticks.length - 1]))) + 10;
  const xLabelW = d3.max(rows, (r) => measure(label(r[X]))) || 30;
  const m = { t: 18, r: 6, b: 24, l: left };
  const x = d3.scaleBand().domain(rows.map((r) => r[X])).range([m.l, w - m.r]).padding(0.2);
  y.range([h - m.b, m.t]);
  svg.append('g').selectAll('line').data(ticks).join('line')
    .attr('x1', m.l).attr('x2', w - m.r).attr('y1', (t) => y(t)).attr('y2', (t) => y(t))
    .style('stroke', 'var(--cds-chart-grid)');
  svg.append('g').selectAll('text').data(ticks).join('text').attr('class', 'wf-tick')
    .attr('x', m.l - 6).attr('y', (t) => y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text((t) => fmt.int(t));
  svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', (r) => x(r[X])).attr('width', x.bandwidth())
    .attr('y', (r) => y(+r[Y])).attr('height', (r) => y(0) - y(+r[Y])).attr('rx', 2)
    .style('fill', dash.colors[0]);
  if (x.bandwidth() >= 22) {
    svg.append('g').selectAll('text').data(rows).join('text').attr('class', 'wf-vlabel')
      .attr('x', (r) => x(r[X]) + x.bandwidth() / 2).attr('y', (r) => y(+r[Y]) - 4).attr('text-anchor', 'middle').text((r) => fmt.int(r[Y]));
  }
  const every = Math.max(1, Math.ceil((xLabelW + 8) / x.step()));
  svg.append('g').selectAll('text').data(rows.filter((r, i) => (rows.length - 1 - i) % every === 0)).join('text').attr('class', 'wf-tick')
    .attr('x', (r) => Math.min(x(r[X]) + x.bandwidth() / 2, w - xLabelW / 2 - 1)).attr('y', h - 6).attr('text-anchor', 'middle').text((r) => label(r[X]));
  svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', (r) => x(r[X]) - x.step() * 0.1).attr('width', x.step()).attr('y', m.t).attr('height', h - m.b - m.t)
    .style('fill', 'transparent')
    .on('pointermove', (ev, r) => showTip(el, tip, ev, tipLabel(r[X]) + ': ' + fmt.int(r[Y]) + ' current members joined'))
    .on('pointerleave', () => { tip.hidden = true; });
});

let mapView = null;
let mapWidth = 0;

dash.draw('map', (el) => {
  const counties = rowsOf('counties_v'), zips = rowsOf('zips_v');
  const geo = window.WF_COUNTIES;
  if (!counties || !zips || !geo) { placeholder(el, ['counties', 'zips']); return; }
  const w = Math.max(240, el.clientWidth || 480);
  const h = Math.round(Math.min(w * 1.3, 640));
  el.replaceChildren();
  const svg = d3.select(el).append('svg').attr('class', 'wf-mapsvg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`)
    .attr('role', 'img').attr('aria-label', el.dataset.aria || '');
  const tip = addTip(el);
  const frame = { type: 'MultiPoint', coordinates: [[-83.2, 26.85], [-81.35, 28.95]] };
  const projection = d3.geoMercator().fitExtent([[6, 6], [w - 6, h - 6]], frame);
  const path = d3.geoPath(projection);
  const byName = new Map(counties.map((c) => [c.county, c]));
  const maxCounty = d3.max(counties, (c) => +c.members) || 1;
  const shade = d3.scaleSqrt().domain([0, maxCounty]).range([0.05, 0.8]);
  const hide = () => { tip.hidden = true; };
  const land = svg.append('g');
  land.selectAll('path').data(geo.features).join('path').attr('d', path)
    .attr('vector-effect', 'non-scaling-stroke')
    .style('fill', dash.colors[0])
    .style('fill-opacity', (f) => { const c = byName.get(f.properties.name); return c ? shade(+c.members) : 0; })
    .style('stroke', 'var(--cds-chart-axis)').style('stroke-width', 0.8)
    .on('pointermove', (ev, f) => {
      const c = byName.get(f.properties.name);
      showTip(el, tip, ev, f.properties.name + ' County: ' + (c ? fmt.int(c.members) + ' members (' + fmt.pct(c.share) + ')' : 'no members'));
    })
    .on('pointerleave', hide);
  const maxZip = d3.max(zips, (z) => +z.members) || 1;
  const radius = d3.scaleSqrt().domain([0, maxZip]).range([0, w < 420 ? 9 : 13]);
  const points = zips.map((z) => ({ z, p: projection([+z.lon, +z.lat]) }))
    .filter((d) => d.p)
    .sort((a, b) => b.z.members - a.z.members);
  const circles = svg.append('g').selectAll('circle').data(points).join('circle')
    .style('fill', dash.colors[1 % dash.colors.length]).style('fill-opacity', 0.7)
    .style('stroke', 'var(--color-panel)').style('stroke-width', 0.7)
    .on('pointermove', (ev, d) => showTip(el, tip, ev, 'ZIP ' + d.z.zip + (d.z.place ? ', ' + d.z.place : '') + ': ' + fmt.int(d.z.members) + (+d.z.members === 1 ? ' member' : ' members')))
    .on('pointerleave', hide);
  const named = geo.features.map((f) => ({ f, c: byName.get(f.properties.name), p: path.centroid(f) })).filter((d) => d.c);
  const labels = svg.append('g').selectAll('text').data(named).join('text').attr('class', 'wf-maplabel').attr('text-anchor', 'middle');
  labels.append('tspan').attr('x', 0).text((d) => d.f.properties.name);
  labels.append('tspan').attr('class', 'wf-maplabel-n').attr('x', 0).attr('dy', '1.15em').text((d) => fmt.int(d.c.members));

  const place = (t) => {
    const k = t.k;
    land.attr('transform', t);
    circles
      .attr('cx', (d) => t.applyX(d.p[0])).attr('cy', (d) => t.applyY(d.p[1]))
      .attr('r', (d) => Math.max(1.5, radius(+d.z.members)) * Math.pow(k, 0.4));
    const least = k >= 4 ? 1 : k >= 2 ? 5 : 20;
    labels.attr('transform', (d) => `translate(${t.applyX(d.p[0])},${t.applyY(d.p[1])})`)
      .style('display', (d) => {
        const x = t.applyX(d.p[0]), y = t.applyY(d.p[1]);
        return +d.c.members >= least && x > 30 && x < w - 30 && y > 14 && y < h - 14 ? null : 'none';
      });
    svg.style('touch-action', k > 1 ? 'none' : 'pan-y').style('cursor', k > 1 ? 'grab' : null);
  };

  const zoom = d3.zoom().scaleExtent([1, 12]).extent([[0, 0], [w, h]]).translateExtent([[0, 0], [w, h]])
    .filter((ev) => {
      if (ev.type === 'wheel') return ev.ctrlKey || ev.metaKey;
      if (ev.type === 'touchstart') return ev.touches.length > 1 || (mapView && mapView.k > 1);
      return !ev.button;
    })
    .on('zoom', (ev) => {
      mapView = ev.transform;
      mapWidth = w;
      hide();
      place(ev.transform);
      reset.disabled = ev.transform.k === 1;
    });

  const tools = document.createElement('div');
  tools.className = 'wf-zoom';
  const button = (text, label, run) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wf-zoom-btn';
    b.textContent = text;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', run);
    tools.append(b);
    return b;
  };
  button('+', 'Zoom in', () => svg.call(zoom.scaleBy, 1.6));
  button('−', 'Zoom out', () => svg.call(zoom.scaleBy, 1 / 1.6));
  const reset = button('Reset', 'Reset the map view', () => svg.call(zoom.transform, d3.zoomIdentity));
  el.append(tools);

  svg.call(zoom).on('dblclick.zoom', null);
  svg.on('dblclick', (ev) => { const [x, y] = d3.pointer(ev); svg.call(zoom.scaleBy, 2, [x, y]); });
  let start = d3.zoomIdentity;
  if (mapView && mapWidth) {
    const f = w / mapWidth;
    start = d3.zoomIdentity.translate(mapView.x * f, mapView.y * f).scale(mapView.k);
  }
  reset.disabled = start.k === 1;
  svg.call(zoom.transform, start);
});

dash.draw('matrix', (el) => {
  const rows = rowsOf('region_function_v');
  if (!rows) { placeholder(el, ['region_function']); return; }
  if (!rows.length) { el.textContent = 'None in this group'; return; }
  const regions = [...new Set(rows.map((r) => r.region))];
  const functions = [...new Set(rows.map((r) => r.function))];
  const cell = new Map(rows.map((r) => [r.region + '|' + r.function, r]));
  const maxShare = d3.max(rows, (r) => (r.region_total ? r.members / r.region_total : 0)) || 1;
  el.replaceChildren();
  const tip = addTip(el);
  const table = document.createElement('table');
  table.className = 'wf-matrix';
  const head = document.createElement('tr');
  head.append(document.createElement('th'));
  functions.forEach((f) => { const th = document.createElement('th'); th.textContent = f; head.append(th); });
  const thead = document.createElement('thead');
  thead.append(head);
  const tbody = document.createElement('tbody');
  regions.forEach((region) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.className = 'wf-rowhead';
    th.textContent = region;
    tr.append(th);
    functions.forEach((f) => {
      const r = cell.get(region + '|' + f);
      const td = document.createElement('td');
      if (r) {
        const share = r.region_total ? r.members / r.region_total : 0;
        td.textContent = fmt.int(r.members);
        td.setAttribute('data-source', 'region_function_v');
        td.setAttribute('data-field', 'members');
        td.setAttribute('data-where', 'region=' + enc(region) + '&function=' + enc(f));
        td.style.background = `color-mix(in srgb, ${dash.colors[0]} ${Math.round(6 + 49 * share / maxShare)}%, transparent)`;
        const text = region + ', ' + f.toLowerCase() + ': ' + fmt.int(r.members) + ' of ' + fmt.int(r.region_total) + ' members (' + fmt.pct(100 * share) + ')';
        td.addEventListener('pointermove', (ev) => showTip(el, tip, ev, text));
        td.addEventListener('pointerleave', () => { tip.hidden = true; });
      }
      tr.append(td);
    });
    tbody.append(tr);
  });
  table.append(thead, tbody);
  el.prepend(table);
});

dash.draw('scope', (el) => {
  const group = chosenGroup();
  el.textContent = group === ALL ? '' : ' in the group “' + group + '”';
});

const pickGroup = (group) => dash.setParams({ seniority: group && group !== ALL ? group : ALL });

dash.draw('senbars', (el) => {
  const all = rowsOf('breakdowns');
  if (!all) { placeholder(el, ['breakdowns']); return; }
  const rows = all.filter((r) => r.seniority === ALL && r.dimension === 'Seniority');
  const group = chosenGroup();
  const max = d3.max(rows, (r) => +r.members) || 1;
  el.replaceChildren();
  const box = document.createElement('div');
  box.className = 'wf-bars';
  const tip = addTip(el);
  rows.forEach((r) => {
    const on = group === r.category;
    const state = ' wf-pick' + (on ? ' wf-on' : group !== ALL ? ' wf-dim' : '');
    const label = document.createElement('div');
    label.className = 'wf-bar-label' + state;
    label.textContent = r.category;
    label.tabIndex = 0;
    label.setAttribute('role', 'button');
    label.setAttribute('aria-pressed', on ? 'true' : 'false');
    const track = document.createElement('div');
    track.className = 'wf-bar-track' + state;
    const fill = document.createElement('div');
    fill.className = 'wf-bar-fill';
    fill.style.width = (100 * r.members / max) + '%';
    fill.style.background = dash.colors[1 % dash.colors.length];
    track.append(fill);
    const val = document.createElement('div');
    val.className = 'wf-bar-val' + state;
    val.textContent = fmt.int(r.members) + ' · ' + fmt.pct(r.share);
    const text = r.category + ': ' + fmt.int(r.members) + ' members (' + fmt.pct(r.share) + ' of all members). ' + (on ? 'Click to show all members.' : 'Click to show this group.');
    const toggle = () => pickGroup(on ? ALL : r.category);
    [label, track, val].forEach((n) => {
      n.addEventListener('pointermove', (ev) => showTip(el, tip, ev, text));
      n.addEventListener('pointerleave', () => { tip.hidden = true; });
      n.addEventListener('click', toggle);
    });
    label.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } });
    box.append(label, track, val);
  });
  el.prepend(box);
});

document.querySelectorAll('.wf-seniority').forEach((sel) => {
  sel.addEventListener('change', () => pickGroup(sel.value));
});
document.querySelectorAll('.wf-clear').forEach((btn) => {
  btn.addEventListener('click', () => pickGroup(ALL));
});

dash.onData(() => {
  const group = chosenGroup();
  document.querySelectorAll('.wf-seniority').forEach((sel) => {
    if (document.activeElement !== sel) sel.value = group;
  });
  document.querySelectorAll('.wf-clear').forEach((btn) => { btn.hidden = group === ALL; });
  document.querySelectorAll('.wf-all-only').forEach((n) => { n.hidden = group !== ALL; });
  const rows = rowsOf('highlights');
  const hasGrowth = !!(rows && rows[0] && rows[0].growth_county);
  document.querySelectorAll('.wf-growth').forEach((n) => { n.hidden = !hasGrowth; });
  const hasTopics = !!(rows && rows[0] && rows[0].function_3);
  document.querySelectorAll('.wf-topics').forEach((n) => { n.hidden = !hasTopics; });
});

const SHADES = [100, 72, 50, 34, 22, 14];
dash.draw('split', (el) => {
  const id = el.dataset.source;
  const all = rowsOf(id);
  if (!all) { placeholder(el, [id]); return; }
  const rows = all.filter((r) => r.dimension === el.dataset.dim);
  if (!rows.length) { el.textContent = 'None in this group'; return; }
  const total = d3.sum(rows, (r) => +r.members) || 1;
  const color = (i) => `color-mix(in srgb, ${dash.colors[0]} ${SHADES[i % SHADES.length]}%, var(--color-panel))`;
  el.replaceChildren();
  const tip = addTip(el);
  const bar = document.createElement('div');
  bar.className = 'wf-split-bar';
  const legend = document.createElement('div');
  legend.className = 'wf-split-legend';
  rows.forEach((r, i) => {
    const text = r.category + ': ' + fmt.int(r.members) + ' members (' + fmt.pct(r.share) + (chosenGroup() === ALL ? ' of all members)' : ' of this group)');
    const seg = document.createElement('div');
    seg.className = 'wf-split-seg';
    seg.style.width = (100 * r.members / total) + '%';
    seg.style.background = color(i);
    const swatch = document.createElement('div');
    swatch.className = 'wf-swatch';
    swatch.style.background = color(i);
    const label = document.createElement('div');
    label.textContent = r.category;
    const val = document.createElement('div');
    val.className = 'wf-split-val';
    val.textContent = fmt.int(r.members) + ' · ' + fmt.pct(r.share);
    [seg, swatch, label, val].forEach((n) => {
      n.addEventListener('pointermove', (ev) => showTip(el, tip, ev, text));
      n.addEventListener('pointerleave', () => { tip.hidden = true; });
    });
    bar.append(seg);
    legend.append(swatch, label, val);
  });
  el.prepend(bar, legend);
});

const PANES = ['overview', 'where', 'who', 'credentials', 'growth', 'employers'];
const showPane = (name, link) => {
  const open = PANES.includes(name) ? name : PANES[0];
  document.querySelectorAll('.wf-pane').forEach((pane) => { pane.hidden = pane.dataset.pane !== open; });
  document.querySelectorAll('.wf-tab').forEach((tab) => {
    const on = tab.dataset.tab === open;
    tab.classList.toggle('wf-tab-on', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
    tab.tabIndex = on ? 0 : -1;
  });
  if (link) dash.setLink(open);
  window.wfPane = open;
};
document.querySelectorAll('.wf-tab').forEach((tab) => {
  tab.addEventListener('click', () => showPane(tab.dataset.tab, true));
  tab.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    const tabs = [...document.querySelectorAll('.wf-tab')];
    const next = tabs[(tabs.indexOf(tab) + (ev.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    if (next) { next.focus(); showPane(next.dataset.tab, true); }
  });
});
showPane((location.hash || '').replace('#', ''), false);
window.addEventListener('beforeprint', () => {
  document.querySelectorAll('.wf-pane').forEach((pane) => { pane.hidden = false; });
});
window.addEventListener('afterprint', () => showPane(window.wfPane, false));

const QUIET = ['Not stated', 'Other'];
const tone = (i) => (i < dash.colors.length
  ? dash.colors[i]
  : `color-mix(in srgb, ${dash.colors[i % dash.colors.length]} 50%, var(--color-panel))`);
const shade = (i) => `color-mix(in srgb, ${dash.colors[0]} ${SHADES[i % SHADES.length]}%, var(--color-panel))`;
const colorsFor = (rows, ordered) => {
  let n = 0;
  return rows.map((r, i) => {
    if (ordered) return shade(i);
    if (QUIET.includes(r.category)) return 'var(--cds-chart-muted)';
    return tone(n++);
  });
};
const ofWhat = () => (chosenGroup() === ALL ? ' of all members)' : ' of this group)');
const legendOf = (rows, colors) => {
  const legend = document.createElement('div');
  legend.className = 'wf-split-legend';
  const parts = rows.map((r, i) => {
    const swatch = document.createElement('div');
    swatch.className = 'wf-swatch';
    swatch.style.background = colors[i];
    const label = document.createElement('div');
    label.textContent = r.category;
    const val = document.createElement('div');
    val.className = 'wf-split-val';
    val.textContent = fmt.int(r.members) + ' · ' + fmt.pct(r.share);
    legend.append(swatch, label, val);
    return [swatch, label, val];
  });
  return { legend, parts };
};

dash.draw('donut', (el) => {
  const id = el.dataset.source;
  const all = rowsOf(id);
  if (!all) { placeholder(el, [id]); return; }
  const pick = el.dataset.pick === 'seniority';
  const rows = all.filter((r) => r.dimension === el.dataset.dim && (!pick || r.seniority === ALL));
  if (!rows.length) { el.textContent = 'None in this group'; return; }
  const group = chosenGroup();
  const colors = colorsFor(rows, el.dataset.palette === 'ordered');
  const total = d3.sum(rows, (r) => +r.members) || 1;
  const size = Math.max(130, Math.min(190, (el.clientWidth || 190) - 8));
  el.replaceChildren();
  const tip = addTip(el);
  const wrap = document.createElement('div');
  wrap.className = 'wf-donut';
  const svg = d3.select(wrap).append('svg').attr('width', size).attr('height', size)
    .attr('viewBox', `${-size / 2} ${-size / 2} ${size} ${size}`)
    .attr('role', 'img').attr('aria-label', el.dataset.aria || '');
  const arc = d3.arc().innerRadius(size * 0.31).outerRadius(size * 0.49).padAngle(0.014).cornerRadius(2);
  const slices = d3.pie().sort(null).value((r) => +r.members)(rows);
  const state = (r) => (!pick ? '' : group === r.category ? ' wf-pickable wf-on' : group !== ALL ? ' wf-pickable wf-dim' : ' wf-pickable');
  const text = (r) => r.category + ': ' + fmt.int(r.members) + ' members (' + fmt.pct(r.share)
    + (pick ? ' of all members). ' + (group === r.category ? 'Click to show all members.' : 'Click to show this group.') : ofWhat());
  const toggle = (r) => pickGroup(group === r.category ? ALL : r.category);
  svg.append('g').selectAll('path').data(slices).join('path')
    .attr('class', (d) => 'wf-seg' + state(d.data))
    .attr('d', arc)
    .style('fill', (d, i) => colors[i])
    .on('pointermove', (ev, d) => showTip(el, tip, ev, text(d.data)))
    .on('pointerleave', () => { tip.hidden = true; })
    .on('click', (ev, d) => { if (pick) toggle(d.data); });
  svg.append('text').attr('class', 'wf-donut-num').attr('text-anchor', 'middle').attr('dy', '0.05em').text(fmt.int(total));
  svg.append('text').attr('class', 'wf-donut-cap').attr('text-anchor', 'middle').attr('dy', '1.5em').text('members');
  const { legend, parts } = legendOf(rows, colors);
  parts.forEach((nodes, i) => {
    const r = rows[i];
    nodes.forEach((n) => {
      n.className += state(r);
      n.addEventListener('pointermove', (ev) => showTip(el, tip, ev, text(r)));
      n.addEventListener('pointerleave', () => { tip.hidden = true; });
      if (pick) n.addEventListener('click', () => toggle(r));
    });
    if (pick) {
      const label = nodes[1];
      label.tabIndex = 0;
      label.setAttribute('role', 'button');
      label.setAttribute('aria-pressed', group === r.category ? 'true' : 'false');
      label.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(r); } });
    }
  });
  wrap.append(legend);
  el.prepend(wrap);
});

dash.draw('tree', (el) => {
  const id = el.dataset.source;
  const all = rowsOf(id);
  if (!all) { placeholder(el, [id]); return; }
  const rows = all.filter((r) => r.dimension === el.dataset.dim);
  if (!rows.length) { el.textContent = 'None in this group'; return; }
  const w = Math.max(200, el.clientWidth || 480);
  const h = w < 420 ? 300 : 250;
  const root = d3.hierarchy({ children: rows }).sum((r) => +r.members || 0);
  d3.treemap().size([w, h]).paddingInner(3).round(true)(root);
  const top = d3.max(rows, (r) => +r.members) || 1;
  el.replaceChildren();
  const tip = addTip(el);
  const box = document.createElement('div');
  box.className = 'wf-tree';
  box.style.height = h + 'px';
  root.leaves().forEach((leaf) => {
    const r = leaf.data;
    const cw = leaf.x1 - leaf.x0, ch = leaf.y1 - leaf.y0;
    const cell = document.createElement('div');
    cell.className = 'wf-tree-cell';
    cell.style.left = (100 * leaf.x0 / w) + '%';
    cell.style.top = leaf.y0 + 'px';
    cell.style.width = (100 * cw / w) + '%';
    cell.style.height = ch + 'px';
    cell.style.background = QUIET.includes(r.category)
      ? 'color-mix(in srgb, var(--cds-chart-muted) 55%, var(--color-panel))'
      : `color-mix(in srgb, ${dash.colors[0]} ${Math.round(18 + 34 * r.members / top)}%, var(--color-panel))`;
    if (cw > 64 && ch > 22) {
      const name = document.createElement('div');
      name.className = 'wf-tree-name';
      name.textContent = r.category;
      cell.append(name);
      if (ch > 52) {
        const val = document.createElement('div');
        val.className = 'wf-tree-val';
        val.textContent = fmt.int(r.members) + ' · ' + fmt.pct(r.share);
        cell.append(val);
      }
    }
    const text = r.category + ': ' + fmt.int(r.members) + ' members (' + fmt.pct(r.share) + ofWhat();
    cell.addEventListener('pointermove', (ev) => showTip(el, tip, ev, text));
    cell.addEventListener('pointerleave', () => { tip.hidden = true; });
    box.append(cell);
  });
  el.prepend(box);
});

dash.draw('waffle', (el) => {
  const id = el.dataset.source;
  const all = rowsOf(id);
  if (!all) { placeholder(el, [id]); return; }
  const rows = all.filter((r) => r.dimension === el.dataset.dim);
  if (!rows.length) { el.textContent = 'None in this group'; return; }
  const total = d3.sum(rows, (r) => +r.members) || 1;
  const colors = colorsFor(rows, false);
  const exact = rows.map((r) => 100 * r.members / total);
  const cells = exact.map((v) => Math.floor(v));
  const order = exact.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  let left = 100 - d3.sum(cells);
  for (let k = 0; left > 0 && k < order.length; k += 1) {
    if (order[k][0] >= 0.5 || k === 0) { cells[order[k][1]] += 1; left -= 1; }
  }
  cells[d3.maxIndex(cells)] += left;
  el.replaceChildren();
  const tip = addTip(el);
  const grid = document.createElement('div');
  grid.className = 'wf-waffle';
  rows.forEach((r, i) => {
    const text = r.category + ': ' + fmt.int(r.members) + ' members (' + fmt.pct(r.share) + ofWhat();
    for (let k = 0; k < cells[i]; k += 1) {
      const cell = document.createElement('div');
      cell.className = 'wf-waffle-cell';
      cell.style.background = colors[i];
      cell.addEventListener('pointermove', (ev) => showTip(el, tip, ev, text));
      cell.addEventListener('pointerleave', () => { tip.hidden = true; });
      grid.append(cell);
    }
  });
  const { legend, parts } = legendOf(rows, colors);
  parts.forEach((nodes, i) => {
    const r = rows[i];
    const text = r.category + ': ' + fmt.int(r.members) + ' members (' + fmt.pct(r.share) + ofWhat();
    nodes.forEach((n) => {
      n.addEventListener('pointermove', (ev) => showTip(el, tip, ev, text));
      n.addEventListener('pointerleave', () => { tip.hidden = true; });
    });
  });
  el.prepend(grid, legend);
});

dash.draw('trend', (el) => {
  const id = el.dataset.source;
  const rows = rowsOf(id);
  if (!rows) { placeholder(el, [id]); return; }
  if (!rows.length) { el.textContent = 'None in this group'; return; }
  const X = el.dataset.x, Y = el.dataset.y;
  const label = (v) => d3.utcFormat('%b %y')(new Date(v));
  const long = (v) => d3.utcFormat('%B %Y')(new Date(v));
  const w = Math.max(240, el.clientWidth || 600), h = 230;
  el.replaceChildren();
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`)
    .attr('role', 'img').attr('aria-label', el.dataset.aria || '');
  const tip = addTip(el);
  const y = d3.scaleLinear().domain([0, d3.max(rows, (r) => +r[Y]) || 1]).nice(4);
  const ticks = y.ticks(4);
  const measure = (t) => { const n = svg.append('text').attr('class', 'wf-tick').text(t); const len = n.node().getComputedTextLength(); n.remove(); return len; };
  const left = Math.ceil(measure(fmt.int(ticks[ticks.length - 1]))) + 10;
  const labelW = d3.max(rows, (r) => measure(label(r[X]))) || 30;
  const m = { t: 14, r: Math.ceil(labelW / 2) + 2, b: 24, l: Math.max(left, Math.ceil(labelW / 2) + 2) };
  const x = d3.scalePoint().domain(rows.map((r) => r[X])).range([m.l, w - m.r]);
  y.range([h - m.b, m.t]);
  svg.append('g').selectAll('line').data(ticks).join('line')
    .attr('x1', m.l).attr('x2', w - m.r).attr('y1', (t) => y(t)).attr('y2', (t) => y(t))
    .style('stroke', 'var(--cds-chart-grid)');
  svg.append('g').selectAll('text').data(ticks).join('text').attr('class', 'wf-tick')
    .attr('x', m.l - 6).attr('y', (t) => y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text((t) => fmt.int(t));
  svg.append('path').datum(rows)
    .attr('d', d3.area().x((r) => x(r[X])).y0(y(0)).y1((r) => y(+r[Y])))
    .style('fill', dash.colors[0]).style('fill-opacity', 0.16);
  svg.append('path').datum(rows)
    .attr('d', d3.line().x((r) => x(r[X])).y((r) => y(+r[Y])))
    .style('fill', 'none').style('stroke', dash.colors[0]).style('stroke-width', 2).style('stroke-linejoin', 'round');
  const dots = svg.append('g').selectAll('circle').data(rows).join('circle')
    .attr('cx', (r) => x(r[X])).attr('cy', (r) => y(+r[Y])).attr('r', 3)
    .style('fill', dash.colors[0]).style('stroke', 'var(--color-panel)').style('stroke-width', 1.5);
  const step = x.step() || w;
  const every = Math.max(1, Math.ceil((labelW + 10) / step));
  svg.append('g').selectAll('text').data(rows.filter((r, i) => (rows.length - 1 - i) % every === 0)).join('text').attr('class', 'wf-tick')
    .attr('x', (r) => x(r[X])).attr('y', h - 6).attr('text-anchor', 'middle').text((r) => label(r[X]));
  svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', (r) => x(r[X]) - step / 2).attr('width', step).attr('y', m.t).attr('height', h - m.b - m.t)
    .style('fill', 'transparent')
    .on('pointermove', (ev, r) => {
      dots.attr('r', (d) => (d === r ? 5 : 3));
      showTip(el, tip, ev, long(r[X]) + ': ' + fmt.int(r[Y]) + ' current members joined');
    })
    .on('pointerleave', () => { dots.attr('r', 3); tip.hidden = true; });
});

dash.draw('bubbles', (el) => {
  const id = el.dataset.source;
  const all = rowsOf(id);
  if (!all) { placeholder(el, [id]); return; }
  const rows = all.slice(0, +el.dataset.top || 25);
  if (!rows.length) { el.textContent = 'None in this group'; return; }
  const w = Math.max(220, el.clientWidth || 480);
  const h = Math.round(Math.max(260, Math.min(w * 0.85, 400)));
  const root = d3.hierarchy({ children: rows }).sum((r) => +r.members || 0);
  d3.pack().size([w, h]).padding(4)(root);
  const top = d3.max(rows, (r) => +r.members) || 1;
  el.replaceChildren();
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`)
    .attr('role', 'img').attr('aria-label', el.dataset.aria || '');
  const tip = addTip(el);
  const leaves = root.leaves();
  svg.append('g').selectAll('circle').data(leaves).join('circle')
    .attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', (d) => d.r)
    .style('fill', (d) => `color-mix(in srgb, ${dash.colors[3 % dash.colors.length]} ${Math.round(22 + 38 * d.data.members / top)}%, var(--color-panel))`)
    .on('pointermove', (ev, d) => showTip(el, tip, ev, d.data.employer + ': ' + fmt.int(d.data.members) + ' members (' + fmt.pct(d.data.share) + ofWhat()))
    .on('pointerleave', () => { tip.hidden = true; });
  const fit = (d) => {
    const room = Math.floor((d.r * 2 - 8) / 6.4);
    const name = String(d.data.employer);
    if (room < 3) return '';
    return name.length <= room ? name : name.slice(0, Math.max(1, room - 1)) + '…';
  };
  const labels = svg.append('g').selectAll('text').data(leaves.filter((d) => d.r >= 17)).join('text')
    .attr('class', 'wf-bubble-label').attr('text-anchor', 'middle').attr('x', (d) => d.x).attr('y', (d) => d.y);
  labels.append('tspan').attr('x', (d) => d.x).attr('dy', (d) => (d.r >= 24 ? '-0.15em' : '0.32em')).text(fit);
  labels.filter((d) => d.r >= 24).append('tspan').attr('class', 'wf-bubble-n').attr('x', (d) => d.x).attr('dy', '1.2em').text((d) => fmt.int(d.data.members));
});

const chosenMonth = () => dash.params().month || 'all';
const monthName = (m) => d3.utcFormat('%B %Y')(new Date(m + '-01'));

dash.calc('movement_v', {
  title: 'Joined and left, for the month shown',
  description: 'The daily rows for the month picked on the page, or all 90 days.',
  inputs: ['movement'],
  fn: (movement) => {
    const month = dash.params().month || 'all';
    return (movement || []).filter((row) => month === 'all' || row.month === month);
  },
});

dash.calc('movement_total', {
  title: 'Joined and left, total',
  description: 'The days shown added up: new members, transfers in and out, and the net change.',
  inputs: ['movement_v'],
  fn: (days) => {
    if (!days || !days.length) return [];
    const sum = (key) => days.reduce((total, row) => total + (+row[key] || 0), 0);
    const dates = days.map((row) => row.date).sort();
    const joined = sum('new_members') + sum('transferred_in');
    return [{
      from: dates[0], to: dates[dates.length - 1],
      new_members: sum('new_members'), transferred_in: sum('transferred_in'), transferred_out: sum('transferred_out'),
      joined, net: joined - sum('transferred_out'),
    }];
  },
});

dash.draw('monthpick', (sel) => {
  const rows = rowsOf('movement');
  const months = rows ? [...new Set(rows.map((r) => r.month))].sort() : [];
  sel.replaceChildren(new Option('All 90 days', 'all'), ...months.map((m) => new Option(monthName(m), m)));
  sel.value = months.includes(chosenMonth()) ? chosenMonth() : 'all';
  sel.onchange = () => dash.setParams({ month: sel.value || 'all' });
});

dash.draw('flow', (el) => {
  const days = rowsOf('movement_v');
  if (!days) { placeholder(el, ['movement']); return; }
  if (!days.length) { el.textContent = 'Nothing in this period'; return; }
  const byWeek = chosenMonth() === 'all';
  const sorted = [...days].sort((p, q) => (p.date < q.date ? -1 : 1));
  const rows = [];
  sorted.forEach((d, i) => {
    if (!byWeek || i % 7 === 0) rows.push({ period_start: d.date, period_end: d.date, new_members: 0, transferred_in: 0, transferred_out: 0 });
    const bin = rows[rows.length - 1];
    bin.period_end = d.date;
    bin.new_members += +d.new_members;
    bin.transferred_in += +d.transferred_in;
    bin.transferred_out += +d.transferred_out;
  });
  const day = d3.utcFormat('%-d %b');
  const w = Math.max(240, el.clientWidth || 520), h = 210;
  const cNew = dash.colors[0], cIn = dash.colors[2 % dash.colors.length], cOut = dash.colors[1 % dash.colors.length];
  el.replaceChildren();
  const key = document.createElement('div');
  key.className = 'wf-flow-key';
  [['New members', cNew], ['Transferred in', cIn], ['Transferred out', cOut]].forEach(([name, color]) => {
    const item = document.createElement('span');
    const swatch = document.createElement('i');
    swatch.className = 'wf-swatch';
    swatch.style.background = color;
    item.append(swatch, name);
    key.append(item);
  });
  const unit = document.createElement('span');
  unit.textContent = byWeek ? 'Each column is one week' : 'Each column is one day';
  key.append(unit);
  el.append(key);
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`)
    .attr('role', 'img').attr('aria-label', el.dataset.aria || '');
  const tip = addTip(el);
  const up = Math.max(1, d3.max(rows, (r) => r.new_members + r.transferred_in) || 0);
  const down = Math.max(1, d3.max(rows, (r) => r.transferred_out) || 0);
  const y = d3.scaleLinear().domain([-down, up]).nice(5);
  const ticks = y.ticks(5).filter((t) => Number.isInteger(t));
  const measure = (t) => { const n = svg.append('text').attr('class', 'wf-tick').text(t); const len = n.node().getComputedTextLength(); n.remove(); return len; };
  const left = Math.ceil(d3.max(ticks, (t) => measure(String(Math.abs(t)))) || 10) + 10;
  const labelW = d3.max(rows, (r) => measure(day(new Date(r.period_start)))) || 30;
  const m = { t: 16, r: Math.ceil(labelW / 2), b: 24, l: left };
  const x = d3.scaleBand().domain(rows.map((r) => r.period_start)).range([m.l, w - m.r]).padding(byWeek ? 0.3 : 0.2);
  y.range([h - m.b, m.t]);
  svg.append('g').selectAll('line').data(ticks).join('line')
    .attr('x1', m.l).attr('x2', w - m.r).attr('y1', (t) => y(t)).attr('y2', (t) => y(t))
    .style('stroke', (t) => (t === 0 ? 'var(--cds-chart-axis)' : 'var(--cds-chart-grid)'));
  svg.append('g').selectAll('text').data(ticks).join('text').attr('class', 'wf-tick')
    .attr('x', m.l - 6).attr('y', (t) => y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text((t) => Math.abs(t));
  const bar = (y0, y1, color) => svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', (r) => x(r.period_start)).attr('width', x.bandwidth())
    .attr('y', (r) => Math.min(y(y0(r)), y(y1(r)))).attr('height', (r) => Math.abs(y(y0(r)) - y(y1(r))))
    .style('fill', color);
  bar(() => 0, (r) => r.new_members, cNew);
  bar((r) => r.new_members, (r) => r.new_members + r.transferred_in, cIn);
  bar(() => 0, (r) => -r.transferred_out, cOut);
  if (x.bandwidth() >= 18) {
    svg.append('g').selectAll('text').data(rows.filter((r) => byWeek || r.new_members + r.transferred_in > 0)).join('text').attr('class', 'wf-vlabel')
      .attr('x', (r) => x(r.period_start) + x.bandwidth() / 2).attr('y', (r) => y(r.new_members + r.transferred_in) - 4)
      .attr('text-anchor', 'middle').text((r) => fmt.int(r.new_members + r.transferred_in));
  }
  const every = Math.max(1, Math.ceil((labelW + 8) / x.step()));
  svg.append('g').selectAll('text').data(rows.filter((r, i) => i % every === 0)).join('text').attr('class', 'wf-tick')
    .attr('x', (r) => x(r.period_start) + x.bandwidth() / 2).attr('y', h - 6).attr('text-anchor', 'middle')
    .text((r) => day(new Date(r.period_start)));
  svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', (r) => x(r.period_start) - x.step() * 0.1).attr('width', x.step()).attr('y', m.t).attr('height', h - m.b - m.t)
    .style('fill', 'transparent')
    .on('pointermove', (ev, r) => showTip(el, tip, ev,
      (r.period_start === r.period_end ? day(new Date(r.period_start)) : day(new Date(r.period_start)) + ' to ' + day(new Date(r.period_end))) + ': '
      + fmt.int(r.new_members) + ' new, ' + fmt.int(r.transferred_in) + ' transferred in, ' + fmt.int(r.transferred_out) + ' transferred out'))
    .on('pointerleave', () => { tip.hidden = true; });
});

dash.draw('detail', (el) => {
  const all = rowsOf('movement_detail');
  if (!all) { el.textContent = '—'; return; }
  const rows = all.filter((r) => r.kind === el.dataset.kind && r.month === chosenMonth());
  el.textContent = rows.length
    ? rows.map((r) => r.name + (el.dataset.counts || +r.members > 1 ? ' (' + fmt.int(r.members) + ')' : '')).join(', ')
    : 'none';
});
