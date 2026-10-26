/* FireSET fuel-type EDA dashboard.
   Static: every view fetches the CSV it needs from data/ and draws it client-side with Plotly.
   SVG figures produced by the pipeline are embedded next to the interactive versions. */
(() => {
  "use strict";
  const DATA = "data/";
  const $ = (s, r = document) => r.querySelector(s);
  const view = $("#view");
  let INDEX = null, CAT = null, FILES = new Set();
  const cache = new Map();
  const charts = new Set();   // live Plotly divs, restyled on theme change
  const ui = {};              // per-view control state, kept across re-renders

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
  const CLASS_SLOT = { nonburnable: 0, grass: 1, shrub: 2, tree: 3, slash: 4, unassigned: 5, nodata: 5 };
  const classColor = c => PALETTE()[CLASS_SLOT[c] ?? 6];

  function setTheme(v) {
    try { localStorage.setItem("fireset-theme", v); } catch (e) { /* ignore */ }
    if (v === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
    $("#theme").value = v;
    route();  // redraw charts against the new surface
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
  const has = p => FILES.has(p);

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
  const METRIC_LABEL = m => m === "n_readings_total" ? "all components" : nice(m.replace("n_readings_", ""));
  const CONV_LABEL = { matched_release: "matched release (nearest year)", fixed_release: "fixed release (latest)" };
  const PAIR_LABEL = p => `${p.id[0]} · ${p.rows} × ${p.cols}`;

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

  /* sortable table */
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
        tb.append(h("tr", {}, cols.map(c => {
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

  function heatmap(div, M, opts = {}) {
    const nz = M.z.flat().filter(v => v != null);
    const big = M.cols.length * M.rows.length > 450;
    const vmax = Math.max(...nz, 0);
    const trace = {
      type: "heatmap", x: M.cols, y: M.rows, z: M.z, colorscale: SEQ(), zmin: 0, zmax: vmax || 1,
      xgap: 2, ygap: 2, hoverongaps: false,
      hovertemplate: `${opts.rowName || M.rowName || "row"} %{y} · ${opts.colName || "col"} %{x}<br>${opts.valueLabel || "value"}: %{z${opts.zfmt || ":,"}}<extra></extra>`,
      colorbar: { thickness: 10, len: 0.8, outlinewidth: 0, title: { text: opts.valueLabel || "", side: "right" } },
    };
    if (!big) {
      trace.texttemplate = opts.textfmt || "%{z:,}";
      trace.textfont = { size: M.cols.length > 20 ? 9 : 11 };
    }
    const n = Math.max(M.cols.length, M.rows.length);
    div.style.minHeight = Math.min(900, Math.max(320, 22 * M.rows.length + 120)) + "px";
    plot(div, [trace], {
      title: opts.title, margin: { l: 90, r: 16, t: opts.title ? 40 : 16, b: n > 12 ? 80 : 50 },
      xaxis: { title: { text: opts.colName || "" }, type: "category", tickangle: M.cols.length > 12 ? -60 : 0, showgrid: false, side: "bottom" },
      yaxis: { title: { text: opts.rowName || M.rowName || "" }, type: "category", autorange: "reversed", showgrid: false },
    });
    return div;
  }

  /* figure card for a pipeline SVG */
  function figure(path, caption, opts = {}) {
    const stem = path.replace(/\.svg$/, "");
    const data = [stem + "_data.csv", stem + ".csv"].find(has);
    const img = h("img", { src: DATA + path, alt: caption || path, loading: "lazy" });
    img.addEventListener("click", () => lightbox(path, caption));
    const links = h("span", { class: "links" }, h("a", { href: DATA + path, target: "_blank", rel: "noopener" }, "SVG"));
    if (data) links.append(" · ", dl(data, "CSV"));
    const what = describe(path);
    const cap = h("span", {}, h("strong", {}, caption || path));
    if (what) cap.append(h("br"), what);
    const f = h("figure", {}, img, h("figcaption", {}, cap, links));
    if (opts.maxWidth) f.style.maxWidth = opts.maxWidth;
    return f;
  }
  function lightbox(path, caption) {
    const lb = h("div", { class: "lightbox" }, h("img", { src: DATA + path, alt: caption || path }), h("div", { class: "cap" }, caption || path));
    lb.addEventListener("click", () => lb.remove());
    document.body.append(lb);
  }

  /* minimal markdown (headings, tables, lists, paragraphs, bold, code) for the pipeline README */
  function markdown(src) {
    const lines = src.split("\n");
    const out = [];
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (/^#{1,4} /.test(l)) { const n = l.match(/^#+/)[0].length; out.push(`<h${n}>${inline(l.slice(n + 1))}</h${n}>`); i++; continue; }
      if (l.startsWith("|")) {
        const rows = [];
        while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
        const cells = r => r.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
        const head = cells(rows[0]);
        const body = rows.slice(1).filter(r => !/^\|\s*-+/.test(r)).map(cells);
        out.push("<table><thead><tr>" + head.map(c => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>" +
          body.map(r => "<tr>" + r.map(c => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</tbody></table>");
        continue;
      }
      if (/^\s*- /.test(l)) {
        const items = [];
        while (i < lines.length && /^\s*- /.test(lines[i])) items.push(lines[i++].replace(/^\s*- /, ""));
        out.push("<ul>" + items.map(x => `<li>${inline(x)}</li>`).join("") + "</ul>");
        continue;
      }
      if (l.trim() === "") { i++; continue; }
      const para = [];
      while (i < lines.length && lines[i].trim() !== "" && !/^(#|\||\s*- )/.test(lines[i])) para.push(lines[i++]);
      out.push(`<p>${inline(para.join(" "))}</p>`);
    }
    return out.join("\n");
  }

  /* ---------- what a file shows, from its path ---------- */
  const CONV_SHORT = { matched_release: "matched release (nearest year)", fixed_release: "fixed release (latest)" };
  const SCHEME_TEXT = { FBFM13: "FBFM13 codes", FBFM40: "FBFM40 codes", cat_from_13: "five categories derived from FBFM13", cat_from_40: "five categories derived from FBFM40" };
  const DIM_TEXT = { cat13: "category from FBFM13", cat40: "category from FBFM40", FBFM13: "FBFM13 code", FBFM40: "FBFM40 code" };
  const GRID_FILES = {
    "ca_cell_counts.csv": "Valid (non-nodata) cells inside the California polygon per release and product, with km² and the nodata gap versus the fullest file.",
    "code_inventory.csv": "Every raw code present in California per release and product: cell count, share of valid cells, whether it is in the attribute table, and its crosswalk category.",
    "code_inventory_summary.csv": "Per file: number of codes present, codes missing from the attribute table, attribute-table codes absent in California, non-burnable codes present.",
    "code_counts.svg": "Bar chart of the share of valid California cells per raw code, one panel per release and product.",
    "code_counts_data.csv": "Data behind the code-count figure (same content as the code inventory).",
    "file_metadata.csv": "Source GeoTIFF metadata: CRS, pixel size, origin, size, extent, nodata, dtype, block size, compression, file size and SHA-256.",
    "release_discovery.csv": "Which LANDFIRE files were found on disk and whether each was used, with the reason if not.",
    "pairwise_alignment.csv": "For every pair of source files: same CRS, 30 m pixels, zero rotation, snap offset to the 30 m lattice, equal origin/extent, and the nodata-footprint disagreement inside the California bounding box.",
    "pairwise_alignment_heatmap.svg": "Pairwise alignment checks as a pass/fail grid over all source files.",
    "file_extents.svg": "Footprints of every source file in EPSG:5070 with the master grid and the California bounding box.",
    "nonburnable_coincidence.csv": "Per release: cells non-burnable in both products, non-burnable in FBFM13 only, in FBFM40 only, and the disagreement fraction.",
    "nonburnable_disagreement_map.svg": "Map of cells where FBFM13 and FBFM40 disagree on non-burnable (only LF2016 Remap has any).",
    "nonburnable_disagreement_map_data.csv": "Data behind the non-burnable disagreement map (same as the coincidence table).",
    "cat13_x_cat40_diagonal_share.csv": "Per release: share of valid California cells whose category is the same from FBFM13 and from FBFM40 (pixel-level matrix D).",
  };
  const XW_FILES = {
    "fuel_crosswalk.csv": "The generated crosswalk: every FBFM13 and FBFM40 code with its abbreviation, name, source group, category, category code and provenance note.",
    "coverage_report.csv": "Per file: codes present versus codes mapped and valid cells versus mapped cells; coverage is 100 % everywhere.",
    "mapping_flow_table.svg": "Flow table from code groups of both products to the five categories, with the project decisions marked.",
    "mapping_long_table.svg": "The crosswalk as a long table, one row per code.",
  };
  const CHANGE_FILES = {
    "pair_summary.csv": "Per scheme and release pair: valid cells, cells changed, % changed, km² changed, nodata transitions, cells entering and leaving non-burnable.",
    "pair_summary_per_class.csv": "Per scheme, release pair and class: cells in each release, % of the class's cells that change, net change in cells and km².",
    "anomaly_fbfm13_grass.svg": "The FBFM13 grass anomaly: FM1/FM3 area per release against FBFM40 grass, where the FM1/FM3 cells go, and what FBFM13 codes sit under FBFM40 grass.",
    "anomaly_fbfm13_grass_data.csv": "Data behind the anomaly figure: presence in km² per release and the destination/co-occurrence shares.",
  };
  function describe(path) {
    const parts = path.split("/"), name = parts[parts.length - 1], top = parts[0];
    let m;
    if (top === "grid") return GRID_FILES[name] || (
      (m = name.match(/^cat13_x_cat40_cells_(.+)\.csv$/)) ? `Pixel-level matrix D for ${m[1]}: California cells by category from FBFM13 (rows) × category from FBFM40 (columns).` :
      (m = name.match(/^fbfm13_x_fbfm40_cells_(.+)\.csv$/)) ? `Pixel-level crosstab for ${m[1]}: California cells by FBFM13 code (rows) × FBFM40 code (columns).` : "");
    if (top === "crosswalk") return XW_FILES[name] || "";
    if (top === "counts") {
      if (name === "fems_filter_stages.csv") return "Rows remaining after each FEMS filter stage, from the yearly files to QC-passed California readings.";
      if (name === "release_table.csv") return `Which LANDFIRE release classifies the readings of each FEMS year under the ${CONV_SHORT[parts[1]] || parts[1]} convention.`;
      const conv = CONV_SHORT[parts[1]] || parts[1];
      if ((m = name.match(/^(\w+?)_(total|year|cumulative)(_wide)?\.csv$/)))
        return `QC-passed readings per ${SCHEME_TEXT[m[1]] || m[1]} class, ${{ total: "all years", year: "per local year", cumulative: "cumulative by year" }[m[2]]}, ${conv}${m[3] ? " (wide: one column per component)" : " (long form: one row per class, period and component)"}.`;
      if ((m = name.match(/^(\w+?)_(total_bars|year_bars|cumulative_lines)(_data\.csv|\.svg)$/)))
        return `${m[3] === ".svg" ? "Figure" : "Data for the figure"}: readings per ${SCHEME_TEXT[m[1]] || m[1]} class, ${{ total_bars: "all years, by class and by component", year_bars: "per local year", cumulative_lines: "cumulative over years" }[m[2]]}, ${conv}.`;
    }
    if (top === "matrices") {
      const conv = CONV_SHORT[parts[1]] || parts[1];
      if ((m = name.match(/^([A-D])_(\w+?)_x_(\w+?)_n_readings_total_per_year(_data\.csv|\.svg)$/)))
        return `${m[4] === ".svg" ? "Small multiples" : "Data for the small multiples"}: matrix ${m[1]} (${DIM_TEXT[m[2]]} × ${DIM_TEXT[m[3]]}) for every FEMS year, all components, ${conv}.`;
      if ((m = name.match(/^([A-D])_(\w+?)_x_(\w+?)_(n_readings_[a-z0-9_]+?)_(total|\d{4})\.(csv|svg)$/)))
        return `Matrix ${m[1]}: readings by ${DIM_TEXT[m[2]]} (rows) × ${DIM_TEXT[m[3]]} (columns), ${METRIC_LABEL(m[4])}, ${m[5] === "total" ? "all years" : "year " + m[5]}, ${conv}${m[6] === "svg" ? " (annotated heatmap)" : ""}.`;
    }
    if (top === "change") {
      if (parts.length === 2) {
        if (CHANGE_FILES[name]) return CHANGE_FILES[name];
        if ((m = name.match(/^stability_(\w+)(_data\.csv|\.svg)$/)))
          return `${m[2] === ".svg" ? "Map and histogram" : "Histogram data"}: how many times each California cell changes ${SCHEME_TEXT[m[1]] || m[1]} class across consecutive releases.`;
        if ((m = name.match(/^(\w+?)_class_share_per_release(_data\.csv|\.svg)$/)))
          return `${m[2] === ".svg" ? "Stacked bars" : "Table"}: share of valid California cells per ${SCHEME_TEXT[m[1]] || m[1]} class, one bar per release.`;
      }
      if (parts[1] === "maps" && (m = name.match(/^(\w+?)_(LF\d{4}(?:_Remap)?)_to_(LF\d{4}(?:_Remap)?)_(binary|from_to)\.svg$/)))
        return `${m[4] === "binary" ? "Map of cells that change" : "Map of the dominant from → to transition"} in ${SCHEME_TEXT[m[1]] || m[1]} class between ${m[2]} and ${m[3]}.`;
      if ((m = name.match(/^(LF\d{4}(?:_Remap)?)_to_(LF\d{4}(?:_Remap)?)_(cells|km2|row_normalised|heatmap)\.(csv|svg)$/)))
        return `Transition matrix ${m[1]} → ${m[2]} for ${SCHEME_TEXT[parts[1]] || parts[1]}: rows = class in ${m[1]}, columns = class in ${m[2]}, ${{ cells: "in cells", km2: "in km²", row_normalised: "as share of each source class", heatmap: "in km² with colour = share of source class" }[m[3]]}.`;
    }
    return "";
  }

  const tile = (k, v, u) => h("div", { class: "tile" }, h("div", { class: "k" }, k), h("div", { class: "v" }, v), u ? h("div", { class: "u" }, u) : null);
  const loading = () => h("p", { class: "muted" }, "Loading…");
  async function section(title, build) {
    const box = panel(title ? h("h2", {}, title) : null, loading());
    try {
      const content = await build();
      box.lastChild.remove();
      box.append(...[content].flat().filter(Boolean));
    } catch (e) {
      box.lastChild.replaceWith(h("p", { class: "muted" }, "Could not load: " + e.message));
    }
    return box;
  }

  /* =================================================================== views */
  const VIEWS = {};

  VIEWS.overview = async () => {
    const H = INDEX.headline, g = INDEX.master_grid;
    const dShare = H.D_diagonal_share || {};
    const dm = dShare.matched_release?.D_diagonal_share_n_readings_total, df = dShare.fixed_release?.D_diagonal_share_n_readings_total;
    const cells = H.ca_mask_cells;
    const pixel = H.D_diagonal_share_cells || {};
    const lastRel = CAT.releases[CAT.releases.length - 1];
    const chg = H.pct_cells_changed || {};
    const chgKey = Object.keys(chg).find(k => k.startsWith("cat_from_40 ") && k.endsWith("->" + lastRel));

    view.append(
      h("h1", {}, "FireSET fuel-type EDA — California"),
      h("p", { class: "lede" }, "How the two LANDFIRE surface fuel products (FBFM13 and FBFM40) describe California, how they map onto five fuel categories, ",
        "how FEMS fuel-moisture readings distribute across those classes, and how the maps change from release to release. ",
        "The EDA is aggregate only: FEMS enters as counts of QC-passed readings per class, year and component. No per-station products exist."),
      h("div", { class: "tiles" },
        tile("FEMS readings after QC", fmt(H.readings_after_qc), `located through ${fmt(H.sites_used)} California sites`),
        tile("California cells on the 30 m grid", fmt(cells), `${fmt(km2(cells), 0)} km² · ${g.width} × ${g.height} px`),
        tile("Releases", CAT.releases.length, CAT.releases.join(", ")),
        tile("Category agreement of readings", pct(dm), `cat_from_13 = cat_from_40, matched release · fixed: ${pct(df)}`),
        tile("Category agreement of cells", pct(pixel[lastRel]), `${lastRel}, pixel level · ${CAT.releases[0]}: ${pct(pixel[CAT.releases[0]])}`),
        chgKey ? tile("Cells changing category", chg[chgKey].toFixed(1) + " %", chgKey.replace("cat_from_40 ", "cat_from_40, ")) : null,
      ),
    );

    view.append(await section("FEMS filter stages", async () => {
      const rows = INDEX.row_counts_by_stage;
      const keep = rows.filter(r => !/removed|excluded|sites/i.test(r.stage));
      const div = chartDiv("short");
      const body = h("div", { class: "row" }, h("div", {}, note("Chart: rows that survive each keep-stage; the removed and excluded stages (all tiny) are left out so the bars stay readable."), div),
        h("div", {}, note("Table: every stage as the pipeline logged it, including the removal and exclusion counts and the two site counts at the end."), table(rows, { labels: { stage: "stage", rows: "rows" }, maxHeight: "300px" }), tablefoot("counts/fems_filter_stages.csv")));
      setTimeout(() => plot(div, [{
        type: "bar", orientation: "h", x: keep.map(r => r.rows), y: keep.map(r => r.stage), marker: { color: PALETTE()[0] },
        hovertemplate: "%{y}<br>%{x:,} rows<extra></extra>", text: keep.map(r => fmt(r.rows)), textposition: "outside", cliponaxis: false,
      }], { margin: { l: 10, r: 70, t: 10, b: 40 }, yaxis: { autorange: "reversed", automargin: true }, xaxis: { title: { text: "rows" }, tickformat: "," }, showlegend: false }));
      return [note("Rows kept at each step from the yearly FEMS files to QC-passed California readings. Sites are only the link from a reading to its 30 m cell."), body];
    }));

    view.append(await section("Change between releases", async () => {
      const rows = (await csv("change/pair_summary.csv")).filter(r => r.spec_pair === true || r.spec_pair === "True");
      const schemes = CAT.schemes.filter(s => rows.some(r => r.scheme === s));
      const pairs = [...new Set(rows.map(r => r.pair))];
      const div = chartDiv();
      setTimeout(() => plot(div, schemes.map(s => ({
        type: "bar", name: s, x: pairs, y: pairs.map(p => rows.find(r => r.scheme === s && r.pair === p)?.pct_changed ?? null),
        customdata: pairs.map(p => rows.find(r => r.scheme === s && r.pair === p)?.area_changed_km2 ?? null),
        hovertemplate: `${s}<br>%{x}<br>%{y:.1f} % of cells · %{customdata:,.0f} km²<extra></extra>`,
      })), { yaxis: { title: { text: "% of valid cells that change class" }, ticksuffix: " %", rangemode: "tozero" }, xaxis: { title: { text: "release pair" } }, barmode: "group" }));
      const relTab = Object.entries(INDEX.matched_release_table).map(([y, m]) => ({ year: +y, matched: m, fixed: INDEX.fixed_release_table[y] }));
      return [note("Share of California cells whose class differs between two releases, per scheme. Raw code schemes (FBFM13, FBFM40) change more than the five-category schemes derived from them. Details under Change."), div,
        h("h3", {}, "Release convention per FEMS year"),
        note("Table: which LANDFIRE release classifies the readings of each FEMS year. Matched: the temporally nearest release (ties go to the earlier one), used for the headline numbers. Fixed: every year on the latest release, the secondary view."),
        table(relTab, { maxHeight: "260px" })];
    }));

    view.append(await section("Pipeline README", async () => [
      note("The report the pipeline wrote at the end of the run, unchanged: decisions in effect, releases found, definitions, headline tables, the FBFM13 grass anomaly and the output layout."),
      h("div", { class: "md", html: markdown(await text("README.md")) })]));
  };

  /* ------------------------------------------------------------------ grid */
  VIEWS.grid = async () => {
    const st = ui.grid ??= { release: CAT.releases[CAT.releases.length - 1], product: "FBFM40", rel2: CAT.releases[CAT.releases.length - 1] };
    const g = INDEX.master_grid;
    view.append(h("h1", {}, "Master grid and raw codes"),
      h("p", { class: "lede" }, "All releases are clipped to one 30 m grid (EPSG:5070): the intersection of every file's extent, cut to the California bounding box, snapped to the 30 m lattice, then masked by the state polygon."),
      h("div", { class: "tiles" },
        tile("Grid size", `${fmt(g.width)} × ${fmt(g.height)}`, `${fmt(g.width * g.height)} cells in the bounding box`),
        tile("Pixel", `${g.pixel_size_m} m`, `EPSG:${g.epsg} · reference ${g.reference_file}`),
        tile("California mask", fmt(INDEX.headline.ca_mask_cells), `${fmt(km2(INDEX.headline.ca_mask_cells), 0)} km²`),
      ));

    view.append(await section("Valid cells per file", async () => {
      const rows = await csv("grid/ca_cell_counts.csv");
      return [note("Cells inside the California polygon that hold a valid (non-nodata) code, per release and product. LF2016 Remap has 2,434 nodata cells inside the state that later releases fill."),
        table(rows, { format: { ca_valid_km2: v => fmt(v, 0) } }), tablefoot("grid/ca_cell_counts.csv")];
    }));

    view.append(await section("Code inventory", async () => {
      const rows = await csv("grid/code_inventory.csv");
      const box = h("div");
      const draw = () => {
        const sel = rows.filter(r => r.release === st.release && r.product === st.product);
        const cats = CAT.classes.filter(c => sel.some(r => r.category === c));
        const div = chartDiv("tall");
        box.innerHTML = "";
        box.append(note(`Chart: each bar is one raw ${st.product} code present in ${st.release}, its length the share of valid California cells it covers; colour is the category the crosswalk assigns.`), div,
          note("Table: the same codes with cell counts, share, and whether the code appears in the file's attribute table."),
          table(sel, { columns: ["code", "label", "category", "cells_in_ca", "share_of_ca_valid", "in_attribute_table"], format: { share_of_ca_valid: v => pct(v, 2) }, maxHeight: "340px" }), tablefoot("grid/code_inventory.csv", sel.length));
        div.style.minHeight = Math.max(300, 18 * sel.length + 90) + "px";
        plot(div, cats.map(c => {
          const r = sel.filter(x => x.category === c);
          return { type: "bar", orientation: "h", name: c, marker: { color: classColor(c) }, x: r.map(x => 100 * x.share_of_ca_valid), y: r.map(x => x.label),
            hovertemplate: `%{y} (${c})<br>%{x:.2f} % of valid cells<extra></extra>` };
        }), { margin: { l: 10, r: 20, t: 30, b: 40 }, barmode: "stack", xaxis: { title: { text: "% of valid California cells" }, ticksuffix: " %" },
          yaxis: { type: "category", categoryorder: "array", categoryarray: sel.map(x => x.label).reverse(), automargin: true }, showlegend: true });
      };
      const ctl = controls(st, [
        { key: "release", label: "release", options: CAT.releases.map(r => [r, r]) },
        { key: "product", label: "product", options: [["FBFM13", "FBFM13"], ["FBFM40", "FBFM40"]] },
      ], draw);
      draw();
      return [note("Share of valid California cells per raw code, coloured by the category the crosswalk assigns. The FBFM13 codes FM1 and FM3 vanish after LF2016 Remap (see the anomaly under Change)."), ctl, box];
    }));

    view.append(await section("Code inventory summary", async () => {
      const rows = await csv("grid/code_inventory_summary.csv");
      return [note("Table: per file, how many codes occur in California, which attribute-table codes never occur here, and which non-burnable codes are present. No file carries a code outside its attribute table."),
        table(rows, { wrap: ["attribute_codes_absent_in_ca", "codes_not_in_attribute_table"] }), tablefoot("grid/code_inventory_summary.csv")];
    }));

    view.append(await section("Category agreement between products, per release", async () => {
      const share = await csv("grid/cat13_x_cat40_diagonal_share.csv");
      const nb = await csv("grid/nonburnable_coincidence.csv");
      const div = chartDiv("short");
      setTimeout(() => plot(div, [{ type: "bar", x: share.map(r => r.release), y: share.map(r => 100 * r.diagonal_share_cells), marker: { color: PALETTE()[0] },
        text: share.map(r => pct(r.diagonal_share_cells)), textposition: "outside", cliponaxis: false, hovertemplate: "%{x}<br>%{y:.2f} % of cells on the diagonal<extra></extra>" }],
        { yaxis: { title: { text: "cells where cat_from_13 = cat_from_40" }, ticksuffix: " %", range: [0, 110] }, showlegend: false, margin: { t: 20 } }));
      const box = h("div");
      const draw = async () => {
        const M = await matrix(`grid/cat13_x_cat40_cells_${st.rel2}.csv`);
        box.innerHTML = "";
        const div2 = chartDiv();
        box.append(div2);
        heatmap(div2, M, { rowName: "cat_from_13", colName: "cat_from_40", valueLabel: "cells", title: `cat_from_13 × cat_from_40 cells, ${st.rel2}` });
      };
      const ctl = controls(st, [{ key: "rel2", label: "release", options: CAT.releases.map(r => [r, r]) }], draw);
      await draw();
      return [note("Chart: pixel-level view of matrix D. For each release, the share of valid California cells whose category is the same whether derived from FBFM13 or from FBFM40. Agreement climbs from 78 % in LF2016 Remap to 98 % in LF2025."), div,
        h("h3", {}, "Per-release crosstab"), ctl,
        note("Heatmap: all valid California cells of the chosen release, rows = category from FBFM13, columns = category from FBFM40. The diagonal is agreement; off-diagonal cells show which category pairs the two products disagree on."),
        box, tablefoot(`grid/cat13_x_cat40_cells_${st.rel2}.csv`),
        h("h3", {}, "Non-burnable coincidence"),
        note("FBFM13 codes 91–99 against FBFM40 NB codes in the same release. LF2016 Remap carries 36.5 M cells that FBFM13 marks non-burnable while FBFM40 gives a burnable code; later releases agree exactly."),
        table(nb, { format: { disagreement_frac: v => pct(v, 2) } }), tablefoot("grid/nonburnable_coincidence.csv"),
        h("div", { class: "row", style: "margin-top:12px" }, figure("grid/nonburnable_disagreement_map.svg", "Where FBFM13 and FBFM40 disagree on non-burnable (LF2016 Remap)"))];
    }));

    view.append(await section("Alignment of the source files", async () => {
      const rows = await csv("grid/pairwise_alignment.csv");
      return [note("Every pair of source GeoTIFFs: same CRS, 30 m pixels, zero rotation, sub-nanometre snap offset. Extents differ between LF2016 Remap and later releases, hence the intersection grid."),
        h("div", { class: "row" }, figure("grid/file_extents.svg", "File extents and the master grid"), figure("grid/pairwise_alignment_heatmap.svg", "Pairwise alignment checks")),
        h("h3", {}, "Pairwise alignment table"),
        note("Table: one row per pair of source files with the checks that justify stacking them on one grid without resampling: identical CRS, 30 m pixels, no rotation, snap offset far below a millimetre, and how much of the California bounding box is nodata in one file but not the other."),
        table(rows, { format: { snap_offset_x_m: v => v.toExponential(2), snap_offset_y_m: v => fmt(v), nodata_footprint_disagreement_frac_ca_bbox: v => pct(v, 2) }, maxHeight: "360px" }),
        tablefoot("grid/pairwise_alignment.csv", rows.length)];
    }));
  };

  /* ------------------------------------------------------------- crosswalk */
  VIEWS.crosswalk = async () => {
    const st = ui.crosswalk ??= { scheme: "all", q: "" };
    view.append(h("h1", {}, "Fuel crosswalk"),
      h("p", { class: "lede" }, "Every raw code of both products maps to exactly one of five categories: nonburnable, grass, shrub, tree, slash. Ambiguous groups (grass-shrub, timber-understory, slash-blowdown and FBFM13 FM2/FM6) follow explicit project decisions."),
      h("div", { class: "tiles" }, ...Object.entries(INDEX.decisions).map(([k, v]) => tile(k, v))));

    view.append(await section("Crosswalk table", async () => {
      const rows = await csv("crosswalk/fuel_crosswalk.csv");
      const box = h("div");
      const draw = () => {
        const q = (st.q || "").toLowerCase();
        const sel = rows.filter(r => (st.scheme === "all" || r.scheme === st.scheme) &&
          (!q || [r.abbrev, r.name, r.category, r.source_group, r.note, r.code].join(" ").toLowerCase().includes(q)));
        box.innerHTML = "";
        box.append(table(sel, { columns: ["scheme", "code", "abbrev", "name", "source_group", "category", "category_code", "note"], wrap: ["note"], maxHeight: "560px" }), tablefoot("crosswalk/fuel_crosswalk.csv", sel.length));
      };
      const ctl = controls(st, [
        { key: "scheme", label: "scheme", options: [["all", "both"], ["FBFM13", "FBFM13"], ["FBFM40", "FBFM40"]] },
        { key: "q", label: "search", type: "text", placeholder: "code, name, category…" },
      ], draw);
      draw();
      return [note("Table: the generated crosswalk, one row per raw code of either product, with the Anderson (1982) or Scott & Burgan (2005) name, its source group, the category it maps to, and a note recording where the mapping comes from (attribute table, literature, or a project decision)."), ctl, box];
    }));

    view.append(await section("Mapping tables and coverage", async () => {
      const cov = await csv("crosswalk/coverage_report.csv");
      return [note("Figures: the same crosswalk drawn by the pipeline, first as a flow from code groups to categories, then as the long per-code table."),
        h("div", { class: "row" }, figure("crosswalk/mapping_flow_table.svg", "Mapping flow: code groups → category"), figure("crosswalk/mapping_long_table.svg", "Long mapping table")),
        h("h3", {}, "Coverage"), note("Table: for each file, codes present versus codes the crosswalk maps, and valid cells versus mapped cells. Every code present in California is mapped, so coverage is 100 % of valid cells everywhere."),
        table(cov, { format: { coverage_pct: v => fmt(v, 1) + " %" } }), tablefoot("crosswalk/coverage_report.csv")];
    }));
  };

  /* ---------------------------------------------------------------- counts */
  VIEWS.counts = async () => {
    const st = ui.counts ??= { conv: CAT.conventions[0], scheme: "cat_from_40", comp: "all", mode: "year" };
    view.append(h("h1", {}, "FEMS reading counts per fuel class"),
      h("p", { class: "lede" }, "Each QC-passed reading is classified by the 30 m cell containing its site, in the release the convention picks for the reading's year. Counts are per class, per local year, and per fuel-moisture component. Every reading counts toward exactly one class per scheme."));

    const box = h("div");
    const comps = INDEX.catalogue.metrics.filter(m => m !== "n_readings_total").map(m => m.replace("n_readings_", ""));
    const draw = async () => {
      box.innerHTML = "";
      box.append(loading());
      const file = `counts/${st.conv}/${st.scheme}_${st.mode === "total" ? "total" : st.mode}.csv`;
      const rows = await csv(file);
      const metric = st.comp === "all" ? "n_readings_total" : "n_readings", comp = st.comp === "all" ? "all" : st.comp;
      const sel = rows.filter(r => r.metric === metric && r.component === comp);
      const classes = [...new Set(sel.map(r => r.class))];
      const periods = [...new Set(sel.map(r => String(r.period)))];
      const yr = p => +String(p).replace("<=", "");
      const isCat = st.scheme.startsWith("cat_");
      const color = c => isCat ? classColor(c) : undefined;
      const div = chartDiv();
      const total = sel.reduce((s, r) => s + (r.value || 0), 0);
      const compText = st.comp === "all" ? "all fuel-moisture components together" : `the ${nice(st.comp)} component only`;
      const what = {
        year: `Chart: QC-passed FEMS readings per local year, stacked by ${st.scheme} class of the cell under the reading's site (${CONV_LABEL[st.conv]}), ${compText}. Bar height is the year's total; the segments show how those readings split across fuel classes.`,
        cumulative: `Chart: running total of QC-passed readings per ${st.scheme} class up to each year (${CONV_LABEL[st.conv]}), ${compText}. The slope of a line is that class's yearly intake.`,
        total: `Chart: QC-passed readings per ${st.scheme} class over all years (${CONV_LABEL[st.conv]}), ${compText}. Each reading counts toward exactly one class.`,
      }[st.mode];
      box.innerHTML = "";
      box.append(note(what), div);
      let traces, lay;
      if (st.mode === "total") {
        traces = [{ type: "bar", x: classes, y: classes.map(c => sel.find(r => r.class === c)?.value ?? 0), marker: { color: classes.map(c => color(c) || PALETTE()[0]) },
          text: classes.map(c => fmt(sel.find(r => r.class === c)?.value ?? 0)), textposition: "outside", cliponaxis: false, hovertemplate: "%{x}<br>%{y:,} readings<extra></extra>" }];
        lay = { yaxis: { title: { text: "readings" }, tickformat: ",", rangemode: "tozero" }, xaxis: { title: { text: st.scheme } }, showlegend: false, margin: { t: 30 } };
        if (classes.length > 12) { lay.xaxis.tickangle = -60; lay.margin.b = 80; }
      } else {
        const years = periods.map(yr);
        traces = classes.map(c => ({ type: st.mode === "cumulative" ? "scatter" : "bar", mode: "lines+markers", name: c,
          x: years, y: periods.map(p => sel.find(r => r.class === c && String(r.period) === p)?.value ?? 0),
          marker: { color: color(c), size: 6 }, line: { color: color(c), width: 2 },
          hovertemplate: `${c}<br>%{x}: %{y:,} readings<extra></extra>` }));
        const many = classes.length > 8;
        if (many) traces = foldOther(traces, 7);
        lay = { barmode: "stack", yaxis: { title: { text: st.mode === "cumulative" ? "cumulative readings" : "readings per year" }, tickformat: ",", rangemode: "tozero" },
          xaxis: { title: { text: "local year" }, dtick: 1 }, hovermode: st.mode === "cumulative" ? "x unified" : "closest", legend: { orientation: "h", x: 0, y: 1.12 }, margin: { t: 60 } };
      }
      plot(div, traces, lay);
      const wideFile = `counts/${st.conv}/${st.scheme}_${st.mode}_wide.csv`;
      const wide = await csv(wideFile);
      box.append(h("p", { class: "note" }, `${fmt(total)} readings in this selection · ${CONV_LABEL[st.conv]} · component: ${st.comp === "all" ? "all" : nice(st.comp)}`),
        h("h3", {}, "Wide table (all components)"),
        note(`Table: the same selection with one column per component. n_readings_total is the sum of the component columns; rows are ${st.mode === "total" ? "classes" : "class × period"}.`),
        table(wide, { maxHeight: "420px" }), tablefoot(wideFile, wide.length),
        h("h3", {}, "Pipeline figures"),
        note("Figures: the pipeline's own renderings of the three views for this scheme and convention (totals by class and by component, per year, cumulative), for comparison with the interactive chart above."),
        h("div", { class: "row" },
          figure(`counts/${st.conv}/${st.scheme}_total_bars.svg`, `${st.scheme} totals (${st.conv})`),
          figure(`counts/${st.conv}/${st.scheme}_year_bars.svg`, `${st.scheme} per year (${st.conv})`),
          figure(`counts/${st.conv}/${st.scheme}_cumulative_lines.svg`, `${st.scheme} cumulative (${st.conv})`)));
    };
    const ctl = controls(st, [
      { key: "conv", label: "release convention", options: CAT.conventions.map(c => [c, CONV_LABEL[c]]) },
      { key: "scheme", label: "scheme", options: CAT.schemes.map(s => [s, s]) },
      { key: "comp", label: "component", options: [["all", "all components"], ...comps.map(c => [c, nice(c)])] },
      { key: "mode", label: "view", options: [["year", "per year"], ["cumulative", "cumulative"], ["total", "total"]] },
    ], draw);
    view.append(panel(ctl, box));
    await draw();
  };

  /* fold series beyond the first n (by total) into "Other" so the palette never cycles */
  function foldOther(traces, n) {
    const sum = t => t.y.reduce((s, v) => s + (v || 0), 0);
    const sorted = traces.slice().sort((a, b) => sum(b) - sum(a));
    const keep = sorted.slice(0, n), rest = sorted.slice(n);
    if (!rest.length) return traces;
    const other = { ...rest[0], name: `Other (${rest.length})`, y: rest[0].y.map((_, i) => rest.reduce((s, t) => s + (t.y[i] || 0), 0)), hovertemplate: "Other<br>%{x}: %{y:,}<extra></extra>" };
    other.marker = { color: cssVar("--muted") }; other.line = { color: cssVar("--muted"), width: 2 };
    keep.forEach((t, i) => { t.marker = { ...(t.marker || {}), color: PALETTE()[i] }; t.line = { ...(t.line || {}), color: PALETTE()[i] }; });
    return [...keep, other];
  }

  /* -------------------------------------------------------------- matrices */
  VIEWS.matrices = async () => {
    const st = ui.matrices ??= { conv: CAT.conventions[0], pair: "D_cat13_x_cat40", metric: "n_readings_total", period: "total", norm: "none" };
    view.append(h("h1", {}, "Cross-product matrices"),
      h("p", { class: "lede" }, "Readings cross-tabulated by the class of the same cell under two schemes. A: FBFM40 category × FBFM13 code. B: FBFM13 category × FBFM40 code. C: FBFM13 code × FBFM40 code. D: category × category, whose diagonal share is the headline agreement number. Margins reconcile exactly with the count tables."));
    const box = h("div"), stats = h("div", { class: "tiles" });
    const draw = async () => {
      box.innerHTML = ""; box.append(loading());
      const file = `matrices/${st.conv}/${st.pair}_${st.metric}_${st.period}.csv`;
      const M = await matrix(file);
      const pair = CAT.pairs.find(p => p.id === st.pair);
      const total = M.z.flat().reduce((s, v) => s + (v || 0), 0);
      const rowSum = M.z.map(r => r.reduce((s, v) => s + (v || 0), 0));
      const colSum = M.cols.map((_, j) => M.z.reduce((s, r) => s + (r[j] || 0), 0));
      let Z = M.z, label = "readings", zfmt = ":,", textfmt = "%{z:,}";
      if (st.norm === "row") { Z = M.z.map((r, i) => r.map(v => rowSum[i] ? 100 * v / rowSum[i] : null)); label = "% of row"; zfmt = ":.1f"; textfmt = "%{z:.0f}"; }
      if (st.norm === "col") { Z = M.z.map(r => r.map((v, j) => colSum[j] ? 100 * v / colSum[j] : null)); label = "% of column"; zfmt = ":.1f"; textfmt = "%{z:.0f}"; }
      const div = chartDiv();
      const PAIR_WHAT = {
        A: "Matrix A: does the FBFM40-derived category agree with the raw FBFM13 code? Rows are the category from FBFM40, columns the FBFM13 code of the same cell.",
        B: "Matrix B: does the FBFM13-derived category agree with the raw FBFM40 code? Rows are the category from FBFM13, columns the FBFM40 code of the same cell.",
        C: "Matrix C: the raw code pairing, FBFM13 code (rows) against FBFM40 code (columns) of the same cell.",
        D: "Matrix D: category from FBFM13 (rows) against category from FBFM40 (columns). The diagonal is where both products agree; its share of all readings is the headline agreement number.",
      }[pair.id[0]];
      const normText = { none: "Cell values are reading counts.", row: "Cell values are percentages of their row, so each row sums to 100 % and shows where a row class lands in the other scheme.", col: "Cell values are percentages of their column, so each column sums to 100 %." }[st.norm];
      box.innerHTML = "";
      box.append(note(`${PAIR_WHAT} Readings are QC-passed FEMS samples, ${METRIC_LABEL(st.metric)}, ${st.period === "total" ? "all years" : "year " + st.period}, ${CONV_LABEL[st.conv]}. ${normText}`), div);
      heatmap(div, { ...M, z: Z }, { rowName: pair.rows, colName: pair.cols, valueLabel: label, zfmt, textfmt, title: `${PAIR_LABEL(pair)} · ${METRIC_LABEL(st.metric)} · ${st.period} · ${st.conv}` });
      stats.innerHTML = "";
      stats.append(tile("Readings in matrix", fmt(total), `${METRIC_LABEL(st.metric)}, ${st.period}`));
      const square = M.rows.length === M.cols.length && M.rows.every((r, i) => r === M.cols[i]);
      if (square) {
        const diag = M.z.reduce((s, r, i) => s + (r[i] || 0), 0);
        stats.append(tile("Diagonal share", pct(total ? diag / total : NaN), `${fmt(diag)} readings on the same category in both products`));
      }
      const nz = M.z.flat().filter(v => v).length;
      stats.append(tile("Non-zero cells", fmt(nz), `of ${M.rows.length} × ${M.cols.length}`));
      const mt = M.rows.map((r, i) => Object.fromEntries([[pair.rows, r], ...M.cols.map((c, j) => [c, M.z[i][j]]), ["row_total", rowSum[i]]]));
      box.append(h("h3", {}, "Table"), note("Table: the raw counts of the matrix above with a row-total column; the row totals equal the class counts under Counts for the same scheme, component, period and convention."),
        table(mt, { maxHeight: "420px" }), tablefoot(file),
        h("h3", {}, "Per-year small multiples (pipeline figure)"),
        note("Figure: the same pair for all components, one panel per FEMS year, so a drift in agreement over time (and over the release that classifies each year) is visible at a glance."),
        figure(`matrices/${st.conv}/${st.pair}_n_readings_total_per_year.svg`, `${PAIR_LABEL(pair)} · all components per year · ${st.conv}`));
    };
    const ctl = controls(st, [
      { key: "conv", label: "release convention", options: CAT.conventions.map(c => [c, CONV_LABEL[c]]) },
      { key: "pair", label: "pair", options: CAT.pairs.map(p => [p.id, PAIR_LABEL(p)]) },
      { key: "metric", label: "component", options: INDEX.catalogue.metrics.map(m => [m, METRIC_LABEL(m)]) },
      { key: "period", label: "period", options: [["total", "all years"], ...CAT.years.map(y => [String(y), String(y)])] },
      { key: "norm", label: "normalise", options: [["none", "counts"], ["row", "% of row"], ["col", "% of column"]] },
    ], draw);
    view.append(panel(ctl, stats, box));
    await draw();
  };

  /* ---------------------------------------------------------------- change */
  VIEWS.change = async () => {
    const st = ui.change ??= { specOnly: true, scheme: "cat_from_40", pair: null, unit: "cells", classMetric: "net_change_km2", mapScheme: "cat_from_40", mapPair: null, shareScheme: "cat_from_40" };
    view.append(h("h1", {}, "Change between releases"),
      h("p", { class: "lede" }, "Cell-by-cell transitions between releases on the master grid, for the raw codes and for the derived categories. Spec pairs are consecutive releases plus LF2016 Remap → latest; the other pairs are listed for completeness."));

    view.append(await section("Share of cells changing class", async () => {
      const all = await csv("change/pair_summary.csv");
      const box = h("div");
      const draw = () => {
        const rows = all.filter(r => !st.specOnly || r.spec_pair === true || r.spec_pair === "True");
        const schemes = CAT.schemes.filter(s => rows.some(r => r.scheme === s));
        const pairs = [...new Set(rows.map(r => r.pair))];
        box.innerHTML = "";
        const div = chartDiv();
        box.append(note("Chart: for each release pair, the percentage of cells valid in both releases whose class differs, one bar per scheme. Raw code schemes change more than the derived categories because many code changes stay inside one category."), div,
          note("Table: the numbers behind the chart plus cells that become or stop being nodata and cells entering or leaving the non-burnable class."),
          table(rows, { columns: ["scheme", "pair", "spec_pair", "cells_valid_both", "cells_changed", "pct_changed", "area_changed_km2", "cells_entering_nonburnable", "cells_leaving_nonburnable"],
          format: { pct_changed: v => fmt(v, 1) + " %", area_changed_km2: v => fmt(v, 0) }, maxHeight: "360px" }), tablefoot("change/pair_summary.csv", rows.length));
        plot(div, schemes.map(s => ({ type: "bar", name: s, x: pairs, y: pairs.map(p => rows.find(r => r.scheme === s && r.pair === p)?.pct_changed ?? null),
          customdata: pairs.map(p => rows.find(r => r.scheme === s && r.pair === p)?.area_changed_km2 ?? null),
          hovertemplate: `${s}<br>%{x}<br>%{y:.1f} % · %{customdata:,.0f} km²<extra></extra>` })),
          { barmode: "group", yaxis: { title: { text: "% of valid cells" }, ticksuffix: " %", rangemode: "tozero" }, xaxis: { tickangle: pairs.length > 6 ? -30 : 0 }, margin: { t: 40, b: 70 } });
      };
      const ctl = controls(st, [{ key: "specOnly", label: "spec pairs only", type: "check" }], draw);
      draw();
      return [ctl, box];
    }));

    view.append(await section("Net change per class", async () => {
      const all = await csv("change/pair_summary_per_class.csv");
      const box = h("div");
      const draw = () => {
        const rows = all.filter(r => r.scheme === st.scheme && (r.spec_pair === true || r.spec_pair === "True"));
        const pairs = [...new Set(rows.map(r => r.pair))];
        let classes = [...new Set(rows.map(r => r.class))];
        const isCat = st.scheme.startsWith("cat_");
        box.innerHTML = "";
        const div = chartDiv();
        box.append(note(st.classMetric === "net_change_km2"
          ? `Chart: net area each ${st.scheme} class gains (above zero) or loses (below zero) between the two releases of a pair, in km². Gains and losses across classes cancel to the nodata difference only.`
          : `Chart: of the cells a ${st.scheme} class had in the earlier release, the percentage that hold a different class in the later release.`), div,
          note("Table: cells per class in each release of the pair, the share of the earlier cells that change, and the net change in cells and km²."),
          table(rows, { columns: ["pair", "class", "cells_a", "cells_b", "pct_of_a_changed", "net_change_cells", "net_change_km2"], format: { pct_of_a_changed: v => fmt(v, 1) + " %", net_change_km2: v => fmt(v, 0) }, maxHeight: "360px" }),
          tablefoot("change/pair_summary_per_class.csv", rows.length));
        let traces = classes.map(c => ({ type: "bar", name: c, x: pairs, y: pairs.map(p => rows.find(r => r.class === c && r.pair === p)?.[st.classMetric] ?? null),
          marker: { color: isCat ? classColor(c) : undefined }, hovertemplate: `${c}<br>%{x}<br>%{y:,.1f}<extra></extra>` }));
        if (!isCat) traces = foldOther(traces.map(t => ({ ...t, y: t.y.map(v => v ?? 0) })), 7);
        const lab = st.classMetric === "net_change_km2" ? "net change, km² (cells_b − cells_a)" : "% of the class's cells in release A that change";
        plot(div, traces, { barmode: st.classMetric === "net_change_km2" ? "relative" : "group", yaxis: { title: { text: lab }, tickformat: "," }, margin: { t: 60, b: 70 }, legend: { orientation: "h", x: 0, y: 1.12 } });
      };
      const ctl = controls(st, [
        { key: "scheme", label: "scheme", options: CAT.schemes.map(s => [s, s]) },
        { key: "classMetric", label: "measure", options: [["net_change_km2", "net change (km²)"], ["pct_of_a_changed", "% of class changed"]] },
      ], draw);
      draw();
      return [note("Per class: how many of its cells in the earlier release end up elsewhere, and the net gain or loss between the two releases. For the raw code schemes the seven largest classes are shown and the rest folded into Other; the table lists every class."), ctl, box];
    }));

    view.append(await section("Transition matrix", async () => {
      const box = h("div");
      const draw = async () => {
        const pairs = CAT.change[st.scheme] || [];
        if (!pairs.includes(st.pair)) st.pair = pairs[0];
        const file = `change/${st.scheme}/${st.pair.replace("->", "_to_")}_${st.unit}.csv`;
        box.innerHTML = ""; box.append(loading());
        const M0 = await matrix(file);
        /* nodata ↔ nodata (outside the valid footprint) would swamp the colour scale: keep it in the table, not the heatmap */
        const keepR = M0.rows.map(r => r !== "nodata"), keepC = M0.cols.map(c => c !== "nodata");
        const M = { ...M0, rows: M0.rows.filter((_, i) => keepR[i]), cols: M0.cols.filter((_, j) => keepC[j]), z: M0.z.filter((_, i) => keepR[i]).map(r => r.filter((_, j) => keepC[j])) };
        box.innerHTML = "";
        const div = chartDiv();
        const [a, b] = st.pair.split("->");
        const unitText = { cells: "cell counts", km2: "area in km²", row_normalised: "the share of each source class (rows sum to 1)" }[st.unit];
        box.append(note(`Heatmap: California cells by ${st.scheme} class in ${a} (rows) and in ${b} (columns), as ${unitText}. The diagonal is unchanged land; an off-diagonal cell is land that moved from the row class to the column class. Transitions to or from nodata are omitted here and kept in the CSV.`), div);
        const opts = { rowName: `${a} class`, colName: `${b} class`, valueLabel: { cells: "cells", km2: "km²", row_normalised: "share of row" }[st.unit] };
        if (st.unit === "row_normalised") { opts.zfmt = ":.3f"; opts.textfmt = "%{z:.2f}"; }
        if (st.unit === "km2") { opts.zfmt = ":,.0f"; opts.textfmt = "%{z:,.0f}"; }
        heatmap(div, M, { ...opts, title: `${st.scheme}: ${a} → ${b} (${opts.valueLabel})` });
        const mt = M0.rows.map((r, i) => Object.fromEntries([[`${a} \\ ${b}`, r], ...M0.cols.map((c, j) => [c, M0.z[i][j]])]));
        box.append(note("Table: the full matrix including the nodata row and column."), table(mt, { maxHeight: "360px" }), tablefoot(file), figure(`change/${st.scheme}/${st.pair.replace("->", "_to_")}_heatmap.svg`, `${st.scheme} ${st.pair} transition (pipeline figure)`, { maxWidth: "640px" }));
      };
      const sync = () => { pairSel.innerHTML = ""; for (const p of CAT.change[st.scheme] || []) pairSel.append(h("option", { value: p }, p)); if (!(CAT.change[st.scheme] || []).includes(st.pair)) st.pair = (CAT.change[st.scheme] || [])[0]; pairSel.value = st.pair; };
      const ctl = controls(st, [
        { key: "scheme", label: "scheme", options: Object.keys(CAT.change).map(s => [s, s]) },
        { key: "pair", label: "release pair", options: (CAT.change[st.scheme] || []).map(p => [p, p]) },
        { key: "unit", label: "unit", options: [["cells", "cells"], ["km2", "km²"], ["row_normalised", "row-normalised"]] },
      ], () => { sync(); draw(); });
      const pairSel = ctl.querySelectorAll("select")[1];
      await draw();
      return [note("Rows: class in the earlier release. Columns: class in the later release. Row-normalised values show where each class goes."), ctl, box];
    }));

    view.append(await section("Stability across releases", async () => {
      const schemes = CAT.schemes.filter(s => has(`change/stability_${s}_data.csv`));
      const data = await Promise.all(schemes.map(s => csv(`change/stability_${s}_data.csv`)));
      const div = chartDiv("short");
      setTimeout(() => plot(div, schemes.map((s, i) => ({ type: "bar", name: s, x: data[i].map(r => r.n_changes), y: data[i].map(r => 100 * r.share),
        customdata: data[i].map(r => r.area_km2), hovertemplate: `${s}<br>%{x} changes: %{y:.1f} % of cells · %{customdata:,.0f} km²<extra></extra>` })),
        { barmode: "group", xaxis: { title: { text: "number of class changes across consecutive releases" }, dtick: 1 }, yaxis: { title: { text: "% of California cells" }, ticksuffix: " %" }, margin: { t: 40 } }));
      return [note("Chart: for every valid California cell, the number of times its class changes along the consecutive-release sequence (LF2016 Remap → LF2022 → LF2023 → LF2024 → LF2025), as a share of cells, one bar group per scheme. Most of California never changes category; the raw code schemes churn more."), div,
        note("Maps: where those changes happen. Each map colours cells by the number of changes for one scheme, with the histogram beside it."),
        h("div", { class: "gallery", style: "margin-top:12px" }, ...schemes.map(s => figure(`change/stability_${s}.svg`, `Stability map, ${s}`)))];
    }));

    view.append(await section("Class share per release", async () => {
      const box = h("div");
      const draw = async () => {
        const rows = await csv(`change/${st.shareScheme}_class_share_per_release_data.csv`);
        const classes = Object.keys(rows[0]).filter(k => k !== "release");
        const isCat = st.shareScheme.startsWith("cat_");
        box.innerHTML = "";
        const div = chartDiv();
        box.append(note(`Chart: composition of California per release, the share of valid cells in each ${st.shareScheme} class stacked to 100 %. A change in a segment between two releases is the net effect of the transitions above.${isCat ? "" : " The seven largest codes are shown; the rest are folded into Other."}`),
          div, tablefoot(`change/${st.shareScheme}_class_share_per_release_data.csv`), figure(`change/${st.shareScheme}_class_share_per_release.svg`, `${st.shareScheme} class share per release (pipeline figure)`, { maxWidth: "720px" }));
        let traces = classes.map(c => ({ type: "bar", name: c, x: rows.map(r => r.release), y: rows.map(r => 100 * (r[c] || 0)), marker: { color: isCat ? classColor(c) : undefined }, hovertemplate: `${c}<br>%{x}: %{y:.2f} %<extra></extra>` }));
        if (!isCat) traces = foldOther(traces, 7);
        plot(div, traces, { barmode: "stack", yaxis: { title: { text: "% of valid California cells" }, ticksuffix: " %" }, margin: { t: 60 }, legend: { orientation: "h", x: 0, y: 1.12 } });
      };
      const ctl = controls(st, [{ key: "shareScheme", label: "scheme", options: CAT.schemes.map(s => [s, s]) }], draw);
      await draw();
      return [ctl, box];
    }));

    view.append(await section("Change maps", async () => {
      const box = h("div", { class: "row" });
      const schemes = [...new Set(CAT.maps.map(m => m.scheme))];
      const pairsFor = s => [...new Set(CAT.maps.filter(m => m.scheme === s).map(m => m.pair))];
      const draw = () => {
        if (!pairsFor(st.mapScheme).includes(st.mapPair)) st.mapPair = pairsFor(st.mapScheme)[0];
        pairSel.innerHTML = ""; for (const p of pairsFor(st.mapScheme)) pairSel.append(h("option", { value: p }, p)); pairSel.value = st.mapPair;
        box.innerHTML = "";
        for (const kind of ["binary", "from_to"]) {
          const m = CAT.maps.find(x => x.scheme === st.mapScheme && x.pair === st.mapPair && x.kind === kind);
          if (m) box.append(figure(m.path, `${st.mapScheme} ${st.mapPair}: ${kind === "binary" ? "changed / unchanged" : "from → to transitions"}`));
        }
      };
      const ctl = controls(st, [
        { key: "mapScheme", label: "scheme", options: schemes.map(s => [s, s]) },
        { key: "mapPair", label: "release pair", options: pairsFor(st.mapScheme).map(p => [p, p]) },
      ], draw);
      const pairSel = ctl.querySelectorAll("select")[1];
      draw();
      return [note("Maps are rendered by the pipeline on a coarsened grid. Binary: cells that change class. From → to: the dominant transition per cell."), ctl, box];
    }));

    view.append(await section("FBFM13 grass anomaly", async () => {
      const rows = await csv("change/anomaly_fbfm13_grass_data.csv");
      const pres = rows.filter(r => r.panel === "presence_km2");
      const cols = ["FM1", "FM2", "FM3", "FBFM40 GR (all)"].filter(c => c in (pres[0] || {}));
      const div = chartDiv("short");
      setTimeout(() => plot(div, cols.map(c => ({ type: "bar", name: c, x: pres.map(r => r.row), y: pres.map(r => r[c]), hovertemplate: `${c}<br>%{x}: %{y:,.0f} km²<extra></extra>` })),
        { barmode: "group", yaxis: { title: { text: "km² in California" }, tickformat: "," }, margin: { t: 40 } }));
      return [note("FBFM13 FM1 and FM3 (short and tall grass) cover 51,600 km² in LF2016 Remap and nothing afterwards, while FBFM40 grass stays near 80–120 thousand km². The cells become FM2 and FM5. Reported, not corrected."),
        note("Chart: area in km² covered by FBFM13 FM1, FM2 and FM3 and by all FBFM40 grass codes, per release. FM1 and FM3 drop to zero after LF2016 Remap while FBFM40 grass does not."),
        div, h("div", { class: "row", style: "margin-top:12px" }, figure("change/anomaly_fbfm13_grass.svg", "Anomaly panels (pipeline figure)")),
        note("Table: the three panels of the figure as rows. presence_km2: area per code and release. The other panels give, per release, the share of former FM1/FM3 cells landing on each FBFM13 code, and the share of FBFM40 grass cells carrying each FBFM13 code."),
        table(rows, { maxHeight: "320px" }), tablefoot("change/anomaly_fbfm13_grass_data.csv")];
    }));
  };

  /* --------------------------------------------------------------- figures */
  VIEWS.figures = async () => {
    const st = ui.figures ??= { folder: "all", q: "", page: 0 };
    const svgs = INDEX.files.filter(f => f.kind === "svg");
    const folders = [...new Set(svgs.map(f => f.path.split("/")[0]))];
    const PER = 48;
    view.append(h("h1", {}, "All pipeline figures"), h("p", { class: "lede" }, `${fmt(svgs.length)} SVG figures written by the pipeline, each with the CSV it was drawn from. Click a figure to enlarge.`));
    const box = h("div"), pager = h("div", { class: "pager" }), gal = h("div", { class: "gallery" });
    const draw = () => {
      const q = (st.q || "").toLowerCase();
      const sel = svgs.filter(f => (st.folder === "all" || f.path.startsWith(st.folder + "/")) && (!q || f.path.toLowerCase().includes(q) || describe(f.path).toLowerCase().includes(q)));
      const pages = Math.max(1, Math.ceil(sel.length / PER));
      st.page = Math.min(st.page, pages - 1);
      gal.innerHTML = "";
      for (const f of sel.slice(st.page * PER, (st.page + 1) * PER)) gal.append(figure(f.path, f.path));
      pager.innerHTML = "";
      const prev = h("button", { onclick: () => { st.page--; draw(); } }, "‹ prev"), next = h("button", { onclick: () => { st.page++; draw(); } }, "next ›");
      prev.disabled = st.page === 0; next.disabled = st.page >= pages - 1;
      pager.append(prev, `${fmt(sel.length)} figures · page ${st.page + 1} of ${pages}`, next);
    };
    const ctl = controls(st, [
      { key: "folder", label: "folder", options: [["all", "all"], ...folders.map(f => [f, f])] },
      { key: "q", label: "search path", type: "text", placeholder: "e.g. D_cat13 live 2021" },
    ], () => { st.page = 0; draw(); });
    box.append(ctl, pager, gal);
    view.append(panel(box));
    draw();
  };

  /* ------------------------------------------------------------------ data */
  VIEWS.data = async () => {
    const st = ui.data ??= { q: "", kind: "all" };
    const files = INDEX.files;
    const bytes = files.reduce((s, f) => s + f.bytes, 0);
    view.append(h("h1", {}, "Data files"), h("p", { class: "lede" }, `${fmt(files.filter(f => f.kind === "csv").length)} CSV and ${fmt(files.filter(f => f.kind === "svg").length)} SVG files, ${fmt(bytes / 1e6, 1)} MB in total, mirroring the pipeline's output folders. `,
      h("a", { href: DATA + "manifest.json" }, "manifest.json"), " records inputs, SHA-256 hashes, releases and headline numbers; ", h("a", { href: DATA + "README.md" }, "README.md"), " is the pipeline's own report."));
    const box = h("div");
    const draw = () => {
      const q = (st.q || "").toLowerCase();
      const sel = files.filter(f => (st.kind === "all" || f.kind === st.kind) && (!q || f.path.toLowerCase().includes(q) || describe(f.path).toLowerCase().includes(q)))
        .map(f => ({ path: f.path, kind: f.kind, kB: Math.round(f.bytes / 102.4) / 10, what: describe(f.path), link: f.path }));
      box.innerHTML = "";
      box.append(table(sel, { columns: ["path", "kind", "kB", "what", "link"], labels: { what: "what it shows" }, wrap: ["what"], format: { link: v => dl(v, "download") }, maxHeight: "600px", sort: "path", asc: true }), h("div", { class: "tablefoot" }, `${fmt(sel.length)} files`));
    };
    const ctl = controls(st, [
      { key: "kind", label: "type", options: [["all", "all"], ["csv", "CSV"], ["svg", "SVG"]] },
      { key: "q", label: "search path", type: "text", placeholder: "folder or file name" },
    ], draw);
    view.append(panel(ctl, box));
    draw();
  };

  /* ---------------------------------------------------------------- router */
  let rendering = 0;
  async function route() {
    const tab = (location.hash.slice(1) || "overview").split("?")[0];
    const fn = VIEWS[tab] || VIEWS.overview;
    document.querySelectorAll("#tabs a").forEach(a => a.classList.toggle("active", a.dataset.tab === tab));
    const id = ++rendering;
    for (const d of charts) { try { Plotly.purge(d); } catch (e) { /* ignore */ } }
    charts.clear();
    view.innerHTML = "";
    view.hidden = false;
    try { await fn(); } catch (e) { if (id === rendering) view.append(panel(h("p", { class: "muted" }, "This section failed to render: " + e.message))); console.error(e); }
    window.scrollTo({ top: 0 });
  }

  async function init() {
    let t = "auto";
    try { t = localStorage.getItem("fireset-theme") || "auto"; } catch (e) { /* ignore */ }
    if (t !== "auto") document.documentElement.dataset.theme = t;
    $("#theme").value = t;
    $("#theme").addEventListener("change", e => setTheme(e.target.value));
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (!document.documentElement.dataset.theme) route(); });
    try {
      INDEX = await (await fetch(DATA + "index.json")).json();
    } catch (e) {
      $("#loading").innerHTML = `<p class="muted">Could not load data/index.json (${esc(e.message)}). Run build_site.py first.</p>`;
      return;
    }
    CAT = INDEX.catalogue;
    FILES = new Set(INDEX.files.map(f => f.path));
    $("#built-from").textContent = `California · LANDFIRE FBFM13 / FBFM40 × FEMS · run ${INDEX.built_from}`;
    $("#loading").remove();
    window.addEventListener("hashchange", route);
    route();
  }
  init();
})();
