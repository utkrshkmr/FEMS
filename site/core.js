/* Shared helpers for the LANDFIRE and FEMS pages. Copied from older/app.js so the Older section stays frozen. */
const FX = (() => {
  "use strict";
  const DATA = "data/";
  const $ = (s, r = document) => r.querySelector(s);
  const cache = new Map();
  const charts = new Set();
  const ui = {};
  let onTheme = () => {};

  /* ---------- theme ---------- */
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const PALETTE = () => ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"].map(cssVar);
  const isDark = () => matchMedia("(prefers-color-scheme: dark)").matches
    ? document.documentElement.dataset.theme !== "light" : document.documentElement.dataset.theme === "dark";
  const SEQ = () => {
    const ramp = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
    const r = isDark() ? ramp.slice().reverse() : ramp;
    return r.map((c, i) => [i / (r.length - 1), c]);
  };
  const CLASS_SLOT = { grass: 3, shrub: 7, tree: 5, slash: 6 };
  const classColor = c => (CLASS_SLOT[c] == null ? cssVar("--muted") : PALETTE()[CLASS_SLOT[c]]);
  function setTheme(v) {
    try { localStorage.setItem("fireset-theme", v); } catch (e) { /* ignore */ }
    if (v === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
    $("#theme").value = v;
    onTheme();
  }

  /* ---------- data ---------- */
  async function text(path) {
    const key = "t:" + path;
    if (!cache.has(key)) cache.set(key, fetch(DATA + path).then(r => {
      if (!r.ok) throw new Error(`${r.status} ${path}`);
      return r.text();
    }));
    return cache.get(key);
  }
  async function csv(path) {
    const key = "c:" + path;
    if (!cache.has(key)) cache.set(key, text(path).then(t =>
      Papa.parse(t, { header: true, dynamicTyping: true, skipEmptyLines: true }).data));
    return cache.get(key);
  }
  /* matrix CSV: first row = header (first cell names the row dimension), first column = row labels */
  async function matrix(path) {
    const key = "m:" + path;
    if (!cache.has(key)) cache.set(key, text(path).then(t => {
      const rows = Papa.parse(t, { header: false, dynamicTyping: true, skipEmptyLines: true }).data;
      const head = rows[0];
      return {
        rowName: String(head[0] ?? ""), cols: head.slice(1).map(String),
        rows: rows.slice(1).map(r => String(r[0])),
        z: rows.slice(1).map(r => r.slice(1).map(v => (v === "" || v == null) ? null : +v)),
      };
    }));
    return cache.get(key);
  }

  /* ---------- formatting ---------- */
  const fmt = (v, d) => {
    if (v == null || v === "") return "";
    if (typeof v === "boolean") return v ? "yes" : "no";
    if (typeof v !== "number") return String(v);
    if (d != null) return v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
    if (Number.isInteger(v)) return v.toLocaleString("en-US");
    if (Math.abs(v) >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (Math.abs(v) < 0.001 && v !== 0) return v.toPrecision(3);
    return v.toLocaleString("en-US", { maximumFractionDigits: 3 });
  };
  const pct = (x, d = 1) => (x == null || isNaN(x)) ? "" : (100 * x).toFixed(d) + " %";
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const km2 = cells => cells * 0.0009;
  const nice = s => String(s).replace(/_/g, " ");
  const isTrue = v => v === true || String(v) === "True";

  /* ---------- DOM ---------- */
  function h(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (v != null) e.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
    return e;
  }
  const panel = (...kids) => h("div", { class: "panel" }, ...kids);
  const note = s => h("p", { class: "note", html: s });

  /* controls: spec = [{key, label, options:[[value,label]], value, type:'select'|'check'|'text'}] ; state object; onChange */
  function controls(state, spec, onChange) {
    const wrap = h("div", { class: "controls" });
    for (const c of spec) {
      if (c.type === "check") {
        const inp = h("input", { type: "checkbox" });
        inp.checked = !!state[c.key];
        inp.addEventListener("change", () => { state[c.key] = inp.checked; onChange(); });
        wrap.append(h("label", { class: "check" }, inp, c.label));
      } else if (c.type === "text") {
        const inp = h("input", { type: "search", placeholder: c.placeholder || "", value: state[c.key] || "" });
        inp.addEventListener("input", () => { state[c.key] = inp.value; onChange(); });
        wrap.append(h("label", {}, c.label, inp));
      } else {
        const sel = h("select");
        for (const [v, l] of c.options) sel.append(h("option", { value: v }, l ?? v));
        if (!c.options.some(o => String(o[0]) === String(state[c.key]))) state[c.key] = c.options[0]?.[0];
        sel.value = state[c.key];
        sel.addEventListener("change", () => { state[c.key] = sel.value; onChange(); });
        wrap.append(h("label", {}, c.label, sel));
      }
    }
    return wrap;
  }

  /* sortable table; opts.pinned(row) keeps total-style rows at the bottom whatever the sort */
  function table(rows, opts = {}) {
    const cols = opts.columns || (rows.length ? Object.keys(rows[0]) : []);
    const labels = opts.labels || {};
    const fmtCol = opts.format || {};
    const wrap = h("div", { class: "tablewrap" });
    if (opts.maxHeight) wrap.style.maxHeight = opts.maxHeight;
    const t = h("table", { class: "data" });
    const isNum = c => rows.some(r => typeof r[c] === "number");
    let sortKey = opts.sort || null, asc = opts.asc ?? false;
    const render = () => {
      let data = rows.slice();
      if (sortKey) data.sort((a, b) => {
        if (opts.pinned) { const p = (opts.pinned(a) ? 1 : 0) - (opts.pinned(b) ? 1 : 0); if (p) return p; }
        const x = a[sortKey], y = b[sortKey];
        const r = (typeof x === "number" && typeof y === "number") ? x - y : String(x ?? "").localeCompare(String(y ?? ""));
        return asc ? r : -r;
      });
      t.innerHTML = "";
      const tr = h("tr");
      for (const c of cols) {
        const th = h("th", { class: (isNum(c) ? "num " : "") + (c === sortKey ? "sorted " + (asc ? "asc" : "") : "") }, labels[c] ?? nice(c));
        th.addEventListener("click", () => { if (sortKey === c) asc = !asc; else { sortKey = c; asc = !isNum(c); } render(); });
        tr.append(th);
      }
      t.append(h("thead", {}, tr));
      const tb = h("tbody");
      for (const r of data) {
        tb.append(h("tr", { class: opts.pinned && opts.pinned(r) ? "pinned" : "" }, cols.map(c => {
          const v = r[c];
          const f = fmtCol[c];
          const plain = /^(year|period|code|category_code|epsg|n_changes)$/.test(c) || /^code_/.test(c);
          const cell = f ? f(v, r) : (plain ? String(v ?? "") : fmt(v));
          return h("td", { class: (typeof v === "number" ? "num" : "") + (opts.wrap?.includes(c) ? " wrap" : "") }, cell);
        })));
      }
      t.append(tb);
    };
    render();
    wrap.append(t);
    return wrap;
  }
  const dl = (path, label) => h("a", { href: DATA + path, download: "" }, label || path.split("/").pop());
  const tablefoot = (path, n) => h("div", { class: "tablefoot" }, dl(path, "download CSV"), n != null ? `${fmt(n)} rows` : null);

  /* ---------- Plotly ---------- */
  function layout(extra = {}) {
    const ink2 = cssVar("--ink-2"), grid = cssVar("--grid"), axis = cssVar("--axis"), surface = cssVar("--surface");
    const ax = { gridcolor: grid, zerolinecolor: axis, linecolor: axis, tickcolor: axis, automargin: true, title: { font: { size: 12 } } };
    const base = {
      paper_bgcolor: surface, plot_bgcolor: surface,
      font: { family: cssVar("--sans"), color: ink2, size: 12 },
      margin: { l: 56, r: 16, t: 36, b: 48 },
      xaxis: { ...ax }, yaxis: { ...ax },
      legend: { orientation: "h", x: 0, y: 1.1, bgcolor: "rgba(0,0,0,0)", font: { size: 12 }, traceorder: "normal" },
      modebar: { orientation: "v", bgcolor: "rgba(0,0,0,0)" },
      hoverlabel: { bgcolor: surface, bordercolor: axis, font: { color: cssVar("--ink"), size: 12 } },
      colorway: PALETTE(), bargap: 0.3, bargroupgap: 0.08, hovermode: "closest",
    };
    const out = { ...base, ...extra };
    out.xaxis = { ...base.xaxis, ...(extra.xaxis || {}) };
    out.yaxis = { ...base.yaxis, ...(extra.yaxis || {}) };
    out.legend = { ...base.legend, ...(extra.legend || {}) };
    if (extra.title) out.title = { text: extra.title, x: 0, xanchor: "left", font: { size: 14, color: cssVar("--ink") } };
    return out;
  }
  const CONFIG = { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"], toImageButtonOptions: { format: "svg" } };
  function plot(div, traces, lay) {
    /* draw only once the div is in the document, so Plotly measures the real width */
    const go = () => {
      if (!div.isConnected) { requestAnimationFrame(go); return; }
      Plotly.react(div, traces, layout(lay), CONFIG);
      charts.add(div);
    };
    setTimeout(go, 0);
    return div;
  }
  const chartDiv = cls => h("div", { class: "chart " + (cls || "") });

  /* SVG figure card */
  function figure(path, title, what) {
    const img = h("img", { src: DATA + path, alt: title, loading: "lazy" });
    img.addEventListener("click", () => {
      const lb = h("div", { class: "lightbox" }, h("img", { src: DATA + path, alt: title }), h("div", { class: "cap" }, title));
      lb.addEventListener("click", () => lb.remove());
      document.body.append(lb);
    });
    return h("figure", {}, img, h("figcaption", {}, h("span", {}, h("strong", {}, title), what ? h("br") : null, what || null),
      h("span", { class: "links" }, h("a", { href: DATA + path, target: "_blank", rel: "noopener" }, "open SVG"))));
  }

  const tile = (k, v, u) => h("div", { class: "tile" }, h("div", { class: "k" }, k), h("div", { class: "v" }, v), u ? h("div", { class: "u" }, u) : null);
  const tiles = (...t) => h("div", { class: "tiles" }, ...t);
  const about = html => h("details", { class: "about", open: "" }, h("summary", {}, "About this analysis"), h("div", { class: "about-body", html }));
  const loading = () => h("p", { class: "muted" }, "Loading…");
  function section(view, id, title, aboutHtml, build) {
    const body = h("div", {}, loading());
    view.append(h("h2", { id }, title), about(aboutHtml), body);
    return Promise.resolve().then(() => build(body)).catch(e => {
      console.error(e);
      body.innerHTML = "";
      body.append(panel(h("p", { class: "muted" }, `This section failed to render: ${e.message}`)));
    });
  }
  const fill = (body, ...els) => { body.innerHTML = ""; body.append(...els); };
  const toc = items => h("nav", { class: "toc", "aria-label": "On this page" }, items.map(([id, label]) =>
    h("a", { href: "#", onclick: e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); } }, label)));

  /* ---------- California station map ---------- */
  const SCALE_Y = 1 / Math.cos(37.2 * Math.PI / 180);   // equal-area look at California's mid latitude
  async function outlineTrace() {
    const rows = await csv("stations/ca_outline.csv");
    const x = [], y = [];
    let ring = null;
    for (const r of rows) {
      if (ring !== null && r.ring !== ring) { x.push(null); y.push(null); }
      ring = r.ring; x.push(r.lon); y.push(r.lat);
    }
    return { type: "scatter", mode: "lines", x, y, line: { color: cssVar("--axis"), width: 1 }, hoverinfo: "skip", showlegend: false };
  }
  /* points: [{lat, lon, group, text}]; groups: [{key, label, color, symbol, size}] in draw order */
  async function stationMap(div, points, groups) {
    const base = await outlineTrace();
    const at = new Map();
    for (const p of points) {
      const k = `${p.lat},${p.lon}`;
      if (!at.has(k)) at.set(k, []);
      at.get(k).push(p.text);
    }
    const traces = [base];
    for (const g of groups) {
      const pts = points.filter(p => p.group === g.key);
      if (!pts.length) continue;
      traces.push({
        type: "scatter", mode: "markers", name: `${g.label} (${fmt(pts.length)})`,
        x: pts.map(p => p.lon), y: pts.map(p => p.lat),
        text: pts.map(p => at.get(`${p.lat},${p.lon}`).join("<br>")),
        hovertemplate: "%{text}<extra></extra>",
        marker: { color: g.color, symbol: g.symbol || "circle", size: g.size || 9, line: { color: cssVar("--surface"), width: 1 } },
      });
    }
    div.style.minHeight = "660px";
    plot(div, traces, {
      margin: { l: 4, r: 28, t: 48, b: 4 }, legend: { y: 1.08 },
      xaxis: { visible: false, showgrid: false, zeroline: false },
      yaxis: { visible: false, showgrid: false, zeroline: false, scaleanchor: "x", scaleratio: SCALE_Y },
    });
    return div;
  }

  async function initTheme(cb) {
    onTheme = cb;
    let t = "auto";
    try { t = localStorage.getItem("fireset-theme") || "auto"; } catch (e) { /* ignore */ }
    if (t !== "auto") document.documentElement.dataset.theme = t;
    $("#theme").value = t;
    $("#theme").addEventListener("change", e => setTheme(e.target.value));
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (!document.documentElement.dataset.theme) cb(); });
  }
  const purge = () => { for (const d of charts) { try { Plotly.purge(d); } catch (e) { /* ignore */ } } charts.clear(); };

  return { DATA, $, ui, cssVar, PALETTE, isDark, SEQ, classColor, text, csv, matrix, fmt, pct, esc, km2, nice, isTrue, h, panel, note,
    controls, table, dl, tablefoot, plot, chartDiv, figure, tile, tiles, about, section, fill, toc, stationMap, initTheme, purge };
})();
