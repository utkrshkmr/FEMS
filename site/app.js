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
    if (top === "sampling") {
      if (name === "sites_by_growth_form.csv") return "FEMS sites with QC readings, counted by the live fuel they most often sample (or dead-only).";
      if ((m = name.match(/^map_overlay_(.+?)_(FBFM13|FBFM40)(_data\.csv|\.svg)$/)))
        return m[3] === ".svg" ? `Map of LANDFIRE ${m[1]} ${m[2]} over California (hue = fuel-model family, shade = model) with the FEMS sites drawn on top, coloured by the live fuel they sample.`
          : `Per code of LANDFIRE ${m[1]} ${m[2]}: label, family, cells, area, share of valid area and the number of FEMS sites on that code.`;
      if ((m = name.match(/^representativeness_(\w+?)_(matched_release|fixed_release)(_data\.csv|\.svg)$/)))
        return `${m[3] === ".svg" ? "Dumbbell chart" : "Table"}: per ${SCHEME_TEXT[m[1]] || m[1]} class, share of California area versus share of QC readings and of sites, ${CONV_SHORT[m[2]]}.`;
      if (name.startsWith("effort")) return `${name.endsWith(".svg") ? "Heatmaps" : "Table"}: QC readings and distinct sites per local year × month.`;
      if ((m = name.match(/^seasonal_moisture_(\w+?)_(matched_release|fixed_release)(_data\.csv|\.svg)$/)))
        return `${m[3] === ".svg" ? "Panels per component" : "Table"}: month-of-year median fuel moisture with quartiles per ${SCHEME_TEXT[m[1]] || m[1]} class, live and dead components apart, ${CONV_SHORT[m[2]]}.`;
    }
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

  /* ---------- long-form description of each analysis ---------- */
  const ABOUT = {
    "overview.stages": `
<p><strong>What it is.</strong> The provenance of the FEMS readings used everywhere else on this site. The pipeline reads every yearly FEMS <em>field_samples_&lt;year&gt;.csv</em> file from 2015 onward and applies a fixed sequence of filters; this analysis records how many rows survive each one, so any number on the other tabs can be traced back to the raw export.</p>
<p><strong>How it is computed.</strong> Rows are kept only when <em>Sample Status</em> is <code>Submitted</code>; duplicate <em>Sample Id</em> rows and rows whose time stamp cannot be parsed are dropped and counted. The sample time is converted to America/Los_Angeles and the local calendar year is kept. A reading must belong to a site that exists in the FEMS site metadata export (the yearly files carry only a numeric SiteId, no coordinates) and whose coordinates fall inside the California polygon by a point-in-polygon test, not the metadata <em>State</em> field. Finally the quality-control gate keeps readings whose moisture value lies in [0, 400] %; missing and out-of-range values are reported and excluded.</p>
<p><strong>How to read it.</strong> The bars show the keep-stages, so the first drop you should notice is at "site inside California polygon": most FEMS readings nationally are outside the state. The table adds the removal counts and two site counts: California sites present in the metadata, and the subset with at least one QC-passed reading, which is the set actually used to place readings on the grid. Sites appear nowhere else: the EDA is aggregate only.</p>
<p><strong>In this run.</strong> Of 244,268 rows in the yearly files, 49,785 belong to California sites and 49,772 pass QC (13 out-of-range values). Those readings are located through 376 of the 417 California sites.</p>`,
    "overview.change": `
<p><strong>What it is.</strong> A one-glance summary of how much California's fuel map moves between LANDFIRE releases, for each of the four schemes: the raw FBFM13 codes, the raw FBFM40 codes, and the five categories derived from each. The full analysis, with transition matrices, per-class detail and maps, is on the Change tab.</p>
<p><strong>How it is computed.</strong> Each release is clipped to the same 30 m master grid and masked by the California polygon. For a pair of releases, every cell valid in both is compared class by class; the percentage changed is the share of those cells whose class differs. The "spec pairs" are the consecutive releases (LF2016 Remap → LF2022 → LF2023 → LF2024 → LF2025) plus LF2016 Remap → LF2025, the full span.</p>
<p><strong>How to read it.</strong> Within a pair, the raw code schemes always change more than the derived categories, because a change from one grass code to another grass code stays inside the grass category. The LF2016 Remap → LF2022 step is far larger than any later step: it spans six years of LANDFIRE updates in one comparison and includes the FBFM13 grass anomaly described under Change. The three later steps move about 5–14 % of cells each.</p>
<p><strong>Release convention table.</strong> FEMS readings span 2015–2026 and no single LANDFIRE release matches every year. The matched convention assigns each FEMS year the release with the nearest nominal year (ties go to the earlier release) and is used for the headline numbers; the fixed convention assigns every year the latest release on disk and shows what the same readings look like against today's map.</p>`,
    "overview.readme": `
<p><strong>What it is.</strong> The pipeline writes a Markdown report at the end of every run; this is that file, rendered without edits. It is the authoritative record of which crosswalk decisions were in effect, which releases were discovered on disk and which were missing, the exact definitions used for a reading, a component, a year and a class, every headline table, and the folder layout of the raw outputs.</p>
<p><strong>How to read it.</strong> If a number on this site and a number in the README ever disagree, the README wins: it was computed in the same process that wrote the CSVs. The manifest (linked in the footer) adds SHA-256 hashes of every input file, so a future run can be checked against this one.</p>`,
    "grid.valid": `
<p><strong>What it is.</strong> A census of how many cells inside the California polygon carry a real fuel code in each source file. It is the denominator for every percentage on the Grid and Change tabs, and it is where the small differences between releases in coverage are made explicit.</p>
<p><strong>How it is computed.</strong> The master grid is the intersection of all ten file extents, cut to the California bounding box and snapped to the 30 m lattice (23,649 × 40,346 cells, EPSG:5070). The state polygon is rasterised onto that grid to make the California mask (455,354,314 cells, 409,819 km² at 0.09 ha per cell). Each file is then clipped to the grid once and cached; a cell is "valid" when its value is not the file's nodata and not outside the mask.</p>
<p><strong>How to read it.</strong> <em>ca_valid_cells</em> is the count that matters; <em>nodata_inside_ca</em> is how many masked cells the file leaves empty; <em>diff_vs_max</em> compares against the fullest file. LF2016 Remap has 2,434 nodata cells inside the state that every later release fills. All later releases have identical coverage, which is why pairs among them have zero nodata transitions in the change tables.</p>`,
    "grid.inventory": `
<p><strong>What it is.</strong> The complete list of raw fuel-model codes that actually occur inside California in each release and product, with how much of the state each covers. It answers "which fuel models matter here?" before any crosswalk is applied, and it checks the rasters against the attribute tables that ship with them.</p>
<p><strong>How it is computed.</strong> A histogram of every valid cell in the clipped raster, per file. Each code is joined to the label in the file's attribute table (FBFM1…FBFM13, GR1…SB4, NB1…NB9) and to the category the crosswalk assigns it. <em>share_of_ca_valid</em> is cells for the code divided by valid cells in that file. The summary table below lists codes present in the raster but absent from the attribute table (none, in every file) and attribute-table codes that never occur in California (several of the wetter FBFM40 grass and timber-litter models, for example GR6 and GS4).</p>
<p><strong>How to read it.</strong> Switch release and product with the controls. Bars are stacked by category colour so you can see, for instance, that in FBFM40 the single code GR2 covers about 17 % of the state in LF2025, that the non-burnable NB9 (barren) and NB1 (urban) together cover another 17 %, and that the shrub category is made up mostly of the grass-shrub model GS2 (12.6 % of the state) and the shrub models SH1 (8.8 %), SH5 (3.9 %) and SH4 (3.7 %). Compare FBFM13 across releases to see FM1 and FM3 present in LF2016 Remap and absent afterwards, the anomaly documented on the Change tab.</p>`,
    "grid.summary": `
<p><strong>What it is.</strong> The file-level roll-up of the code inventory: how many distinct codes each file contains in California, and the two possible mismatches between a raster and its attribute table.</p>
<p><strong>How to read it.</strong> <em>codes_not_in_attribute_table</em> would flag undocumented values in the raster; it is empty everywhere, so every pixel value is a documented fuel model or a documented non-burnable class. <em>attribute_codes_absent_in_ca</em> lists documented models that simply do not occur in the state (FBFM40 GR6 and GS4 in every release, with more of the GR, SH, TU and SB models missing in the earlier releases; FBFM13 code 3 in every release after LF2016 Remap and code 13 until LF2024). The non-burnable codes 91, 92, 93, 98 and 99 are present in every file.</p>`,
    "grid.agreement": `
<p><strong>What it is.</strong> The pixel-level counterpart of the headline matrix D. Both products are mapped to the five categories (nonburnable, grass, shrub, tree, slash) and compared cell by cell over all of California, release by release. Where the Matrices tab asks "do the two products agree where FEMS sites are?", this asks "do they agree everywhere?".</p>
<p><strong>How it is computed.</strong> For each release the FBFM13 and FBFM40 clips are both passed through the crosswalk look-up table and a 5 × 5 contingency table of all valid cells is accumulated in blocks. The diagonal share is the sum of the diagonal divided by all valid cells. The non-burnable coincidence table restricts the same comparison to one question: is the cell non-burnable (codes 91–99) in FBFM13, in FBFM40, in both, or in neither?</p>
<p><strong>How to read it.</strong> Agreement rises from 78.4 % in LF2016 Remap to 89.7 % in LF2022 and 98.0 % in LF2025, so the two products have converged over time. The crosstab shows what the remaining disagreement is: in LF2025 it is exactly one cell of the crosstab, tree in FBFM13 against grass in FBFM40 (9,102,962 cells), and the raw code crosstab shows what it is: cells coded FM8 (closed timber litter) in FBFM13 and GR1 (short sparse grass) in FBFM40. No crosswalk decision is involved: FM8 → tree and GR1 → grass are both unambiguous, so this is a genuine disagreement between the two products. The non-burnable table isolates a different, older problem: in LF2016 Remap 36.5 M cells are non-burnable in FBFM13 but carry a burnable FBFM40 code; from LF2022 on the two products agree exactly on burnability. The map shows where those LF2016 Remap cells are.</p>`,
    "crosswalk.table": `
<p><strong>What it is.</strong> The rule that turns a fuel-model code into one of five categories, written out for every code of both products. Everything that compares FBFM13 with FBFM40 (matrices A, B and D, the two "cat_from" schemes, the category-level change analysis) depends on this table, so it is generated by the pipeline from a single source and never hand-edited.</p>
<p><strong>How it is built.</strong> FBFM13 codes 1–13 are Anderson's (1982) thirteen fire behavior fuel models; FBFM40 codes 101–204 are Scott and Burgan's (2005) forty, grouped by their two-letter prefix (GR grass, GS grass-shrub, SH shrub, TU timber-understory, TL timber litter, SB slash-blowdown). Codes 91, 92, 93, 98 and 99 are LANDFIRE's non-burnable classes (urban, snow/ice, agriculture, water, barren) in both products. Most groups map unambiguously; the mixed groups follow five explicit project decisions shown in the tiles above: grass-shrub (GS) → shrub, timber-understory (TU) → tree, slash-blowdown (SB) → slash, FBFM13 FM2 (timber with grass understory) → grass, and FM6 (dormant brush) → shrub. The <em>note</em> column records the provenance of each row.</p>
<p><strong>How to read it.</strong> Filter by scheme or search by code, name or category. When a result elsewhere looks surprising, this is the place to check whether a decision, rather than the data, is responsible. The FM2 → grass decision is the most consequential: FM2 covers 81.3 M California cells (17.9 % of the state) in LF2025 and FBFM40 codes 81.3 M of them GR2 or GR3, so mapping FM2 to grass keeps them on the diagonal of the pixel-level matrix D; mapping FM2 to tree instead would lower that release's category agreement from 98.0 % to about 80 %. Changing a decision in the pipeline's configuration regenerates every dependent table.</p>`,
    "crosswalk.mapping": `
<p><strong>What it is.</strong> The same crosswalk drawn two ways by the pipeline, and a coverage check proving that it is complete for California.</p>
<p><strong>How to read it.</strong> The flow table reads left to right from each category to the code groups of both products that feed it, with decided groups marked; it is the quickest way to see that "shrub" collects FBFM13 4, 5, 6, 7 and FBFM40 GS and SH, while "slash" is FBFM13 11–13 and FBFM40 SB. The long table is one row per code. The coverage report counts, per file, the codes present in California against the codes the table maps and the valid cells against the mapped cells; both are 100 % in every file, so no reading and no cell is left without a category.</p>`,
    "counts": `
<p><strong>What it is.</strong> The distribution of QC-passed FEMS fuel-moisture readings across fuel classes: how many readings California has in grass, shrub, tree, non-burnable or slash land, under each of the four classification schemes, per year and per fuel-moisture component. This is the EDA's main link between the moisture observations and the fuel map, and the margins of every matrix on the next tab reconcile exactly with these counts.</p>
<p><strong>How it is computed.</strong> Each reading inherits the fuel class of the 30 m cell that contains its site's coordinates, read from the release chosen for the reading's local year by the convention (matched: nearest release year, ties to the earlier release; fixed: the latest release). A reading that falls on a nodata cell would be counted as <em>unassigned</em>; none does in this run. Components come from the FEMS <em>Category</em> and <em>Fuel Type</em> fields: Tree, Shrub, Grass and Forb categories are <em>live</em>; Dead is split into 1-hour, 10-hour, 100-hour, 1000-hour and duff. The per-year table counts readings in each local calendar year; the cumulative table is its running sum; the total table is the sum over all years. A reading contributes to exactly one class per scheme, so the class totals of any scheme add up to 49,772.</p>
<p><strong>How to read it.</strong> Choose a scheme (raw FBFM13 or FBFM40 codes, or the five categories derived from either), a component and a view. In the per-year view, bar height is the year's reading volume and the segments show its split by class; in the cumulative view, the slope of each line is that class's yearly intake; the total view is the headline split. Under cat_from_40 and the matched convention, shrub land holds 50 % of all readings, tree 25 %, non-burnable 14 % and grass 12 %; slash has none. Live fuels dominate every class because FEMS sampling in California is mostly live-fuel moisture. Switching to the fixed convention moves readings between classes only where the map changed under a site between the matched release and LF2025.</p>
<p><strong>Caveats.</strong> A site's class is that of a single 30 m cell, so a site at a fuel boundary is attributed to whichever side its coordinates land on. The non-burnable share is real: many FEMS sites sit on urban, agricultural or barren cells even though they sample nearby vegetation. These counts describe where the sampling is, not how representative it is of the state's fuel area; compare with the class share per release on the Change tab for the area-weighted picture.</p>`,
    "matrices": `
<p><strong>What it is.</strong> Four cross-tabulations of the same QC-passed readings by their class under two schemes at once. They answer, for the land FEMS actually samples, whether the two LANDFIRE products and the crosswalk tell a consistent story. Matrix D is the headline: category from FBFM13 against category from FBFM40.</p>
<p><strong>How it is computed.</strong> Every reading has a class under each scheme (see Counts); a matrix counts readings for each pair of classes. A: category derived from FBFM40 (rows) × raw FBFM13 code (columns), which shows which Anderson models fall into each category when the category comes from the other product. B: category derived from FBFM13 × raw FBFM40 code, the mirror. C: raw FBFM13 code × raw FBFM40 code, the full pairing with no crosswalk involved. D: category × category. Each is computed for all components together and for each component separately, for all years and for each year, under both release conventions, and the pipeline asserts that every row and column sum equals the corresponding count from the Counts tab.</p>
<p><strong>How to read it.</strong> Dark cells carry the readings. In D the diagonal is agreement; its share of all readings is 91.4 % under the matched convention and 97.2 % under the fixed convention, so the two products agree far more where FEMS samples than over the whole state (78 % to 98 % by release, Grid tab) because sampling avoids the ambiguous land. The off-diagonal mass in D sits in three cells: grass in FBFM13 but shrub in FBFM40 (3,024 readings), shrub in FBFM13 but grass in FBFM40 (822) and tree in FBFM13 but grass in FBFM40 (436). Use A and B to see which raw models produce those disagreements, C to see the exact code pairs, the row/column normalisation to turn counts into conditional shares, and the period control to check whether a disagreement is persistent or confined to the years classified by one release. The per-year small multiples give the same drift at a glance.</p>
<p><strong>Caveats.</strong> Cells with few readings are dominated by a handful of sites, so a small off-diagonal count can be one site on a fuel boundary. Under the matched convention a year's readings are classified by a single release, so a change of release between years (2019 → 2020, 2022 → 2023, …) can move a site from one cell to another without any change in sampling.</p>`,
    "change.summary": `
<p><strong>What it is.</strong> The headline measure of how much California's fuel classification moves from one LANDFIRE release to the next, for each scheme and each release pair. It frames everything below it: the per-class detail, the transition matrices, the stability count and the maps all decompose these percentages.</p>
<p><strong>How it is computed.</strong> For a pair of releases A → B, the clipped rasters are compared cell by cell on the master grid in blocks; a cell counts as changed when its class under the scheme differs. <em>cells_valid_both</em> is the denominator (cells valid in both releases), <em>pct_changed</em> is cells changed over that denominator, and <em>area_changed_km2</em> converts cells to area at 0.09 ha each. The table also counts cells that are valid in A but nodata in B and vice versa (only the 2,434 LF2016 Remap gap), and cells that enter or leave the non-burnable class. Spec pairs are the consecutive releases plus LF2016 Remap → LF2025; the remaining pairs (e.g. LF2016 Remap → LF2023) are computed for completeness and shown when the checkbox is cleared.</p>
<p><strong>How to read it.</strong> The LF2016 Remap → LF2022 step dominates: 13 % of cells change category under cat_from_40, 32 % under cat_from_13 and 52 % under the raw FBFM13 codes. That is also the step where FBFM13 FM1/FM3 disappear (see the anomaly below). The three later steps are small (about 5–14 %), with LF2023 → LF2024 larger than its neighbours in every scheme. For cat_from_13 and FBFM13 the full-span pair LF2016 Remap → LF2025 barely exceeds the first step (34.2 % vs 32.1 %, 53.3 % vs 52.3 %), so the later steps mostly touch cells the first step had already changed, or reverse it; for cat_from_40 and FBFM40 the full span is clearly larger than the first step (23.6 % vs 13.2 %, 43.2 % vs 32.3 %), so the later steps, LF2023 → LF2024 above all, add new change. The raw code schemes always exceed the category schemes because moves between codes of one category (for instance SH5 → SH7) do not change the category.</p>`,
    "change.category": `
<p><strong>What it is.</strong> The change between releases summarised by fuel category rather than by scheme: for each of nonburnable, grass, shrub, tree and slash, how much of the category is reassigned at each step and how much area it gains or loses on balance. It is the category-level answer to "what changed?", read straight off the per-class summary the pipeline writes for the two category schemes.</p>
<p><strong>How it is computed.</strong> For each spec pair and category scheme the transition matrix is reduced to three numbers per category: the share of the category's earlier cells that change class (the off-diagonal mass of its row divided by the row total), the net change in area (cells in the later release minus cells in the earlier one, at 0.09 ha per cell), and the category's area before the step. The all-category row repeats the pair's overall percentage from the summary above.</p>
<p><strong>How to read it.</strong> Under cat_from_40 the first step (LF2016 Remap → LF2022) reassigns 13–16 % of every burnable category and 8 % of non-burnable land, with grass losing about 7,000 km² net and shrub and non-burnable each gaining 4,300–4,500 km². The later steps are quieter except LF2023 → LF2024, where grass loses about 34,500 km² net and shrub gains about 36,700 km²: 32 % of the grass cells of LF2023 hold another category in LF2024. Over the full span LF2016 Remap → LF2025, grass is down about 39,600 km² and shrub up 42,900 km², tree down about 6,200 km² and non-burnable up about 2,800 km². Switch to cat_from_13 to see the same steps through the FBFM13 crosswalk, where the first step looks completely different (grass down 37,100 km², non-burnable down 28,500 km², shrub up 30,100 km², tree up 36,400 km²) because of the FM1/FM3 anomaly and the LF2016 Remap non-burnable disagreement.</p>`,
    "change.perclass": `
<p><strong>What it is.</strong> The change summary broken down by class, so that "13 % of cells changed" becomes "grass lost 7,000 km² net while shrub gained 4,500 km²". It separates churn (cells leaving a class) from net change (the class's area after minus before).</p>
<p><strong>How it is computed.</strong> From the transition matrix of each spec pair, per class: <em>cells_a</em> and <em>cells_b</em> are the class's valid cells in the earlier and later release; <em>pct_of_a_changed</em> is the share of the class's earlier cells that hold a different class later (the row's off-diagonal mass over the row total); <em>net_change</em> is cells_b − cells_a, in cells and km². Net changes across classes sum to the nodata difference of the pair, which is zero for all pairs after LF2016 Remap.</p>
<p><strong>How to read it.</strong> With "net change" selected, bars above zero are classes that grew and below zero classes that shrank, so a pair with large bars in both directions is a reclassification between those classes. Under cat_from_40, LF2016 Remap → LF2025 shows grass losing about 39,600 km² while shrub gains 42,900 km²: a large net grass-to-shrub reassignment, most of it in the LF2023 → LF2024 step. With "% of class changed" selected, you see churn irrespective of direction: under cat_from_40, 13–16 % of every burnable class is reassigned in the first step; in the later steps grass churns most (5 %, 32 % and 9 %, the 32 % at LF2023 → LF2024) while shrub, tree and non-burnable stay at or below 6 %. For the raw code schemes the seven largest classes are shown and the rest folded into Other; the table lists every class.</p>`,
    "change.transition": `
<p><strong>What it is.</strong> The full from → to accounting of a release pair under one scheme: for every class in the earlier release, where its cells end up in the later release. This is the primary data product of the change analysis; the summary percentages and per-class figures are all derived from it.</p>
<p><strong>How it is computed.</strong> Both clipped rasters are mapped through the scheme's look-up table and a joint histogram of (class in A, class in B) is accumulated over every cell of the master grid, in parallel blocks. The <em>cells</em> unit is the raw count; <em>km²</em> multiplies by 0.09 ha; <em>row-normalised</em> divides each row by its total so that each row reads as "of the cells that were class X in A, this fraction became class Y in B". The CSV includes a nodata row and column (cells outside the valid footprint of one release); they are omitted from the heatmap because the nodata → nodata cell, which is simply everything outside California's valid area, would otherwise set the colour scale.</p>
<p><strong>How to read it.</strong> The diagonal is unchanged land and always dominates. Read along a row to see where a class went; read down a column to see where a class came from. In the cat_from_40 LF2016 Remap → LF2022 matrix, for example, about 11.9 M grass cells became shrub and 7.0 M grass cells became non-burnable, while 3.8 M non-burnable cells became grass: the net grass loss hides a two-way exchange with non-burnable land that the summary alone cannot show. Switch to row-normalised to compare classes of very different size: under cat_from_40 every category keeps 84–92 % of its LF2016 Remap cells in LF2022, whereas under cat_from_13 only 48 % of grass stays grass (38 % becomes shrub) and 91 % of slash becomes tree, the FBFM13 anomaly seen through the crosswalk. The raw code schemes (18 × 18 and 45 × 45) are best read row-normalised. The pipeline's own heatmap below shows the same matrix in km² with colour as row share.</p>`,
    "change.stability": `
<p><strong>What it is.</strong> A per-cell view of change over the whole release sequence rather than one pair at a time: how many times each California cell changes class as the releases are stepped through in order (LF2016 Remap → LF2022 → LF2023 → LF2024 → LF2025, four steps, so 0 to 4 changes).</p>
<p><strong>How it is computed.</strong> In the same block pass that builds the transition matrices, the pipeline keeps a counter raster per scheme and increments a cell each time its class differs from the previous release. The histogram shows the share of valid cells with 0, 1, 2, 3 and 4 changes; the maps (rendered by the pipeline on a coarsened display grid) colour each cell by that count.</p>
<p><strong>How to read it.</strong> Under cat_from_40, 73 % of California never changes category across all five releases, 21 % changes once, 4 % twice and about 1.4 % three or more times; under cat_from_13 the never-changed share drops to 62 % because of the LF2016 Remap recoding of FBFM13, and under the raw codes it is lower still (53 % for FBFM40, 43 % for FBFM13). A cell with two or more changes is land that LANDFIRE has reclassified repeatedly, and the maps show those cells cluster: the Coast Ranges, the Klamath Mountains and the Sierra Nevada foothills, where grass, grass-shrub, chaparral and oak woodland interleave, churn far more than the Central Valley floor, the deserts or the urban areas. A high count is a signal that a site's class is unreliable, which matters for the Counts and Matrices tabs.</p>`,
    "change.share": `
<p><strong>What it is.</strong> The composition of California by fuel class in each release, as a share of valid cells. Where the transition matrices show flows, this shows the stock: how much of the state is grass, shrub, tree, non-burnable or slash at each point in time, and how that mix drifts.</p>
<p><strong>How it is computed.</strong> From the code inventory, cells per class are summed per release and divided by valid cells in that release. For the raw code schemes the same is done per code; the chart shows the seven largest codes and folds the rest into Other, while the CSV holds every code.</p>
<p><strong>How to read it.</strong> Under cat_from_40 the state is about 23 % non-burnable and 21–22 % tree in every release, while grass falls from 30 % in LF2016 Remap to 20 % in LF2025 and shrub rises from 26 % to 36 %; most of that grass-to-shrub shift happens in one step, LF2023 → LF2024. Under cat_from_13 the LF2016 Remap composition is very different (31 % non-burnable, 27 % grass, 20 % shrub, 23 % tree) and converges on the cat_from_40 mix from LF2024 on, another view of the FBFM13 anomaly. Compare these area shares with the reading shares on the Counts tab: shrub carries 50 % of readings but 36 % of the land, tree 25 % of readings for 21 % of the land, grass 12 % of readings for 20 % of the land and non-burnable 14 % for 23 %, so FEMS sampling leans toward shrub and tree and away from grass and non-burnable land relative to area.</p>`,
    "change.maps": `
<p><strong>What it is.</strong> Where the changes counted above actually are. For each scheme and spec pair the pipeline renders two maps on a coarsened display grid: a binary map of cells whose class differs between the two releases, and a from → to map coloured by the dominant transition.</p>
<p><strong>How to read them.</strong> The binary map answers "is the change spread evenly or concentrated?" For the LF2016 Remap → LF2022 pair the answer is concentrated: the Coast Ranges from the Klamath to San Diego, the Sierra Nevada foothills and the Transverse and Peninsular ranges carry most of the change, while the Central Valley floor, the Mojave and the Great Basin deserts and the urban cores are largely untouched. The from → to map adds direction; use it together with the transition matrix, which gives the exact counts behind each colour. Later pairs show sparser, patchier change.</p>`,
    "change.anomaly": `
<p><strong>What it is.</strong> A data-quality finding the pipeline reports but does not correct: two of Anderson's thirteen models, FM1 (short grass) and FM3 (tall grass), cover a substantial part of California in LF2016 Remap and then vanish entirely from every later FBFM13 release, while the FBFM40 product keeps mapping grass throughout. Anyone using FBFM13 across releases needs to know this before interpreting grass trends.</p>
<p><strong>How it is computed.</strong> From the code inventory: area per release for FM1, FM2, FM3 and for all FBFM40 grass codes (GR1–GR9) together. From the FBFM13 transition matrices: for the cells that were FM1 or FM3 in LF2016 Remap, the share landing on each FBFM13 code in each later release. From the per-release code crosstabs: for cells that FBFM40 maps as grass, the distribution of FBFM13 codes in the same release.</p>
<p><strong>How to read it.</strong> FM1 covers 51,190 km² and FM3 418 km² in LF2016 Remap and 0 km² in LF2022, LF2023, LF2024 and LF2025; FBFM40 grass stays between 81,000 and 121,000 km². The former FM1/FM3 cells end up mostly as FM2 (about two thirds) with the remainder in FM5, FM8 and FM4, and under FBFM40 grass the FBFM13 code is FM2 in 63–90 % of cells from LF2022 on. In the data, then, FM1 and FM3 are not assigned anywhere in California from LF2022 on, and the land they covered is coded mostly FM2, "timber with grass understory". This is why the project decision FM2 → grass matters so much, why FBFM13 shows 52 % of cells changing code at the first step, and why this EDA treats cat_from_40 as the safer category scheme for trends.</p>`,
    "sampling.map": `
<p><strong>What it is.</strong> The notebook's "map with sites" view, rebuilt as a pipeline output: each of the ten LANDFIRE clips (five releases × two products) drawn over California with the FEMS sites that carry QC readings on top. It is the single most direct check on the whole analysis: are the sites where the fuels are?</p>
<p><strong>How it is computed.</strong> The map shows every 30th cell of the clipped raster (statistics elsewhere use every cell). Colour follows the notebook's convention: one hue per fuel-model family (GR grass, GS grass-shrub, SH shrub, TU timber-understory, TL timber litter, SB slash-blowdown for FBFM40; the model ranges 1–3, 4–7, 8–10, 11–13 for FBFM13; grey for the non-burnable codes), with the models of a family stepped from darker to lighter. Each site is a dot at its metadata coordinates, coloured by the live fuel it most often samples (tree, shrub, grass or forb, from the FEMS <em>Category</em> of its QC readings) or black if it reports only dead fuels. The data twin lists, per code, its area and the number of sites whose 30 m cell carries it; the bar chart sums that by family.</p>
<p><strong>How to read it.</strong> The sites follow the chaparral and the foothills: 332 of the 376 sites mostly sample shrub fuels, 35 tree and 9 dead fuels only, and none grass or forb as a dominant category. The Coast Ranges, the Sierra foothills and the Transverse and Peninsular ranges are densely sampled; the Central Valley floor (agriculture, non-burnable), the deserts and the high Sierra timber-litter country have few or no sites. In the bar chart the shrub families sit far right of their area share while grass and non-burnable sit left of theirs. Switch releases to see that the site pattern is fixed while the map under it moves.</p>`,
    "sampling.representativeness": `
<p><strong>What it is.</strong> The notebook's "area share versus site share" panel, with readings added: for each fuel class, how much of California it covers against how much of the FEMS record it receives. It quantifies the over- and under-sampling that the map shows qualitatively, under any of the four schemes.</p>
<p><strong>How it is computed.</strong> Area share is the class's valid cells in the latest release on disk divided by all valid cells, taken from the code inventory. Readings share and sites share come from the classified readings of the Counts page under the chosen convention: a class's QC readings over all QC readings, and the distinct sites with at least one reading in the class over all sites (under the matched convention a site whose cell changes class between releases counts in each class it visits, so the site shares can sum to slightly more than 100 %). Readings per 1,000 km² divides readings by the class's area.</p>
<p><strong>How to read it.</strong> Under cat_from_40 and the matched convention, shrub covers 36 % of the state but holds 50 % of readings and 44 % of sites; tree is close to proportional (21 % of area, 25 % of readings); grass (20 % of area, 12 % of readings) and non-burnable (23 % of area, 14 % of readings) are under-sampled; slash has no site, which the red ring marks. Switch to the raw FBFM40 codes to see the gap in detail: the grass-shrub model GS2 alone carries 22 % of the readings on 13 % of the area, urban NB1 13 % on 6 %, and the chaparral model SH5 9 % on 4 %, whereas the dominant grass model GR2 gets 10 % of the readings on 17 % of the area. Seventeen of the 35 FBFM40 codes present in California have no site at all, among them the wetter grass models GR4–GR9 and all four slash-blowdown models. These shares are what a model trained on FEMS readings will inherit as its prior.</p>`,
    "sampling.effort": `
<p><strong>What it is.</strong> The notebook's sampling-effort grid: how many QC readings and how many distinct sites report in each local month of each year. It explains the gaps and the noise in every time-resolved view on this site.</p>
<p><strong>How it is computed.</strong> QC-passed California readings are grouped by local calendar year and month; the sites value is the number of distinct site IDs with at least one reading in that cell. The year axis runs from the first FEMS year on disk to the current, partial year.</p>
<p><strong>How to read it.</strong> Effort peaks from May to September, the live-fuel moisture season for chaparral, with June to August each holding more than three times the readings of December or January over the record. Year to year, the busiest month sees about 160–175 reporting sites in 2015–2019 and about 200 from 2020 on, so the releases that classify the later years (LF2022 onward under the matched convention) carry most of the record. When a seasonal curve on the next page looks erratic in winter, check this grid first: it is usually a month with a handful of readings.</p>`,
    "moisture": `
<p><strong>What it is.</strong> The notebook's seasonal-moisture panels, computed per fuel class rather than per species: month-of-year fuel moisture for each of the five categories, separately for live fuels and for each dead time-lag component. It is where the fuel classification finally meets the quantity FEMS measures.</p>
<p><strong>How it is computed.</strong> Each QC reading has a class (its cell under the chosen scheme and convention), a component (live, or dead 1-, 10-, 100-, 1000-hour or duff, from the FEMS category and fuel type) and a local month. For every class, component and month the pipeline records the number of readings, the median, the 25th and 75th percentiles and the mean of the moisture values. Live and dead fuels are never pooled: live fuel moisture runs from about 60 % to over 150 % of dry weight, dead fine fuels from 2 % to 15 %.</p>
<p><strong>How to read it.</strong> The live curves have the familiar shape: moisture rises through spring to an April–June peak with medians of roughly 105–115 %, then declines through summer to a September–October minimum of roughly 63–70 %, with grass drying earliest and tree fuels staying highest in autumn. The dead 1-hour and 10-hour fuels show the reverse, drier in summer and wetter in late autumn, and the 1000-hour fuels trace a smooth cycle from about 30 % in winter to under 10 % in August. Differences between classes are modest compared with the interquartile band, which is the spread across sites, species and years within the class. Use the component control to move between fuels and the convention control to confirm the curves barely change when every reading is classified by the latest release.</p>
<p><strong>Caveats.</strong> Winter months, dead 100-hour fuels and duff have few readings (hover shows n), so their curves are noisy. A class's curve mixes all species sampled on that class; the species-level view in the notebook is not reproduced here because the site stays at aggregate level.</p>`,
    "figures": `
<p><strong>What it is.</strong> Every figure the pipeline wrote, in the original SVG, with the CSV it was drawn from. The interactive tabs cover the same ground, but the pipeline figures are the fixed, reproducible record: they are regenerated identically on every run and are what the README refers to.</p>
<p><strong>How to use it.</strong> Filter by output folder (grid, crosswalk, counts, matrices, change) or search by any part of the path or of the generated description (try "live 2021", "row_normalised" or "stability"). Each card names the file and says what it shows; click a figure to enlarge it, and use the links to open the SVG or download the data. The matrices folder is the bulk: one heatmap per pair, component, period and release convention, 736 in all.</p>`,
    "data": `
<p><strong>What it is.</strong> The complete inventory of published files: 904 CSV tables and 825 SVG figures mirroring the pipeline's output folders, 32 MB in total. Nothing else from the run is published: the clipped rasters, stability GeoTIFFs and PNG twins stay with the pipeline.</p>
<p><strong>How to use it.</strong> Search by path or by the description to find a table, then download it. Long-form count tables have one row per class, period and component; wide tables pivot the components into columns; matrix and transition tables have the row class in the first column and one column per column class. The manifest records every input file with its SHA-256 hash, the releases used, row counts per filter stage, the crosswalk decisions and the headline numbers; the README is the pipeline's report for this run.</p>`,
  };
  function about(key) {
    const html = ABOUT[key];
    if (!html) return null;
    const d = h("details", { class: "about", open: "" }, h("summary", {}, "About this analysis"), h("div", { class: "about-body", html }));
    return d;
  }

  const tile = (k, v, u) => h("div", { class: "tile" }, h("div", { class: "k" }, k), h("div", { class: "v" }, v), u ? h("div", { class: "u" }, u) : null);
  const loading = () => h("p", { class: "muted" }, "Loading…");
  const ABOUT_BY_TITLE = {
    "FEMS filter stages": "overview.stages", "Change between releases": "overview.change", "Pipeline README": "overview.readme",
    "Valid cells per file": "grid.valid", "Code inventory": "grid.inventory", "Code inventory summary": "grid.summary",
    "Category agreement between products, per release": "grid.agreement",
    "Crosswalk table": "crosswalk.table", "Mapping tables and coverage": "crosswalk.mapping",
    "Share of cells changing class": "change.summary", "Change by fuel category": "change.category", "Net change per class": "change.perclass",
    "Transition matrix": "change.transition", "Stability across releases": "change.stability", "Class share per release": "change.share",
    "Change maps": "change.maps", "FBFM13 grass anomaly": "change.anomaly",
    "Fuel map with FEMS sites": "sampling.map", "Representativeness: area versus readings versus sites": "sampling.representativeness",
    "Sampling effort by year and month": "sampling.effort",
  };
  async function section(title, build) {
    const box = panel(title ? h("h2", {}, title) : null, about(ABOUT_BY_TITLE[title]), loading());
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
      panel(h("h2", {}, "The story in eight steps"),
        h("p", { class: "note" }, "The pages follow one line of argument. Each builds on the one before; the strip at the top of every page says where you are and what question the page answers."),
        h("div", { class: "story" }, ...STORY.filter(s => !s.appendix).map(s => h("a", { href: "#" + s.id }, h("div", {}, h("b", {}, s.tab), h("span", {}, {
          overview: "The two data sets, how they were filtered, and the numbers the rest of the site unpacks.",
          grid: "Five LANDFIRE releases of two fuel products on one 30 m grid: which fuel models cover California, and how far the products agree pixel by pixel.",
          crosswalk: "The rule that turns 53 fuel-model codes into grass, shrub, tree, slash and non-burnable, including the five decisions that could have gone another way.",
          sampling: "The FEMS sites drawn on the fuel map, what they sample, how their coverage compares with each class's area, and when they report.",
          counts: "Every QC reading given the class of its cell: readings per class, year and component under two release conventions.",
          matrices: "The same readings cross-tabulated under two schemes at once: the diagonal share of matrix D is the headline agreement figure.",
          moisture: "What the classes buy us: seasonal fuel-moisture curves per class, live and dead fuels apart.",
          change: "How much the map moves between releases, where, which categories gain or lose, and the FBFM13 grass anomaly that any trend must allow for.",
        }[s.id]))))),
        h("p", { class: "note" }, "Two appendices follow: every figure the pipeline wrote, and every data file with its description.")),
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
    view.append(panel(about("counts"), ctl, box));
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
    view.append(panel(about("matrices"), ctl, stats, box));
    await draw();
  };

  /* ---------------------------------------------------------------- change */
  VIEWS.change = async () => {
    const st = ui.change ??= { specOnly: true, catScheme: "cat_from_40", scheme: "cat_from_40", pair: null, unit: "cells", classMetric: "net_change_km2", mapScheme: "cat_from_40", mapPair: null, shareScheme: "cat_from_40" };
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

    view.append(await section("Change by fuel category", async () => {
      const all = await csv("change/pair_summary_per_class.csv");
      const sum = await csv("change/pair_summary.csv");
      const box = h("div");
      const draw = () => {
        const rows = all.filter(r => r.scheme === st.catScheme && (r.spec_pair === true || r.spec_pair === "True"));
        const pairs = [...new Set(rows.map(r => r.pair))];
        const classes = CAT.classes.filter(c => rows.some(r => r.class === c));
        const pivot = (field, f) => classes.map(c => Object.fromEntries([["category", c], ...pairs.map(p => [p, f(rows.find(r => r.class === c && r.pair === p))])]));
        const totals = Object.fromEntries([["category", "all categories"], ...pairs.map(p => [p, sum.find(r => r.scheme === st.catScheme && r.pair === p)?.pct_changed ?? null])]);
        const pctRows = [...pivot("pct", r => r?.pct_of_a_changed ?? null), totals];
        const netRows = pivot("net", r => r?.net_change_km2 ?? null);
        const areaRows = pivot("area", r => r ? km2(r.cells_a) : null);
        const fmtPairs = Object.fromEntries(pairs.map(p => [p, v => v == null ? "" : fmt(v, 1) + " %"]));
        const fmtKm = Object.fromEntries(pairs.map(p => [p, v => v == null ? "" : (v > 0 ? "+" : "") + fmt(v, 0)]));
        box.innerHTML = "";
        box.append(
          h("h3", {}, "Share of each category's cells that change class"),
          note("Rows are the five fuel categories; columns are the release pairs. A cell is the percentage of the category's cells in the earlier release that hold a different category in the later release. The last row is the all-category figure from the summary above."),
          table(pctRows, { format: fmtPairs }),
          h("h3", {}, "Net change in area, km²"),
          note("Positive: the category covers more land in the later release; negative: less. Within one pair the values sum to the change in valid area, which is zero for every pair after LF2016 Remap."),
          table(netRows, { format: fmtKm }),
          h("h3", {}, "Area of each category in the earlier release, km²"),
          note("The denominator of the percentages above: how much of California each category covered before the step."),
          table(areaRows, { format: Object.fromEntries(pairs.map(p => [p, v => v == null ? "" : fmt(v, 0)])) }),
          tablefoot("change/pair_summary_per_class.csv", rows.length));
      };
      const ctl = controls(st, [{ key: "catScheme", label: "category scheme", options: CAT.schemes.filter(s => s.startsWith("cat_")).map(s => [s, s]) }], draw);
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
      return [note("FBFM13 FM1 and FM3 (short and tall grass) cover 51,600 km² in LF2016 Remap and nothing afterwards, while FBFM40 grass stays between 81,000 and 121,000 km². The former FM1/FM3 cells are coded mostly FM2 (63–68 % depending on release), then FM5 (15–20 %), with smaller shares in FM8 and FM4. Reported, not corrected."),
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
    view.append(panel(about("figures"), box));
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
    view.append(panel(about("data"), ctl, box));
    draw();
  };

  /* ------------------------------------------------------- where FEMS samples */
  VIEWS.sampling = async () => {
    const st = ui.sampling ??= { release: CAT.releases[CAT.releases.length - 1], product: "FBFM40", conv: CAT.conventions[0], scheme: "cat_from_40" };
    view.append(h("h1", {}, "Where FEMS samples on the fuel map"),
      h("p", { class: "lede" }, "The FEMS network is not a random sample of California. Before trusting any class-level statistic, this page shows where the sites sit on the LANDFIRE fuel map, which fuels they mostly sample, how their coverage compares with the area each fuel class occupies, and how sampling effort is spread over years and months. Sites appear only as dots on the map and as counts; there is no per-site table."));

    view.append(await section("Fuel map with FEMS sites", async () => {
      const box = h("div");
      const draw = async () => {
        const key = `${st.release}_${st.product}`;
        box.innerHTML = ""; box.append(loading());
        const rows = await csv(`sampling/map_overlay_${key}_data.csv`);
        const fams = [...new Set(rows.map(r => r.family))];
        const famRows = fams.map(f => { const g = rows.filter(r => r.family === f); return { family: f, codes: g.length, area_km2: g.reduce((s, r) => s + r.area_km2, 0), area_share_pct: g.reduce((s, r) => s + r.share_pct, 0), sites: g.reduce((s, r) => s + r.sites, 0) }; });
        const nSites = famRows.reduce((s, r) => s + r.sites, 0);
        famRows.forEach(r => { r.sites_share_pct = nSites ? 100 * r.sites / nSites : 0; });
        box.innerHTML = "";
        const div = chartDiv("short");
        box.append(h("div", { class: "row" },
          figure(`sampling/map_overlay_${key}.svg`, `LANDFIRE ${st.release} ${st.product} with the FEMS sites`),
          h("div", {},
            note("Chart: for each fuel-model family of the chosen map, the share of California's valid area it covers against the share of FEMS sites that sit on it. A family far to the right of its area share is over-sampled; one with no sites is a gap."),
            div,
            note("Table: every code of the chosen map with its family, area and the number of FEMS sites whose 30 m cell carries that code."),
            table(rows, { columns: ["code", "label", "family", "area_km2", "share_pct", "sites"], format: { area_km2: v => fmt(v, 0), share_pct: v => fmt(v, 2) + " %" }, maxHeight: "360px" }),
            tablefoot(`sampling/map_overlay_${key}_data.csv`, rows.length))));
        plot(div, [
          { type: "bar", name: "% of valid area", x: famRows.map(r => r.area_share_pct), y: famRows.map(r => r.family), orientation: "h", marker: { color: cssVar("--ink-2") }, hovertemplate: "%{y}<br>%{x:.1f} % of area<extra></extra>" },
          { type: "bar", name: "% of FEMS sites", x: famRows.map(r => r.sites_share_pct), y: famRows.map(r => r.family), orientation: "h", marker: { color: PALETTE()[1] }, customdata: famRows.map(r => r.sites), hovertemplate: "%{y}<br>%{x:.1f} % of sites (%{customdata})<extra></extra>" },
        ], { barmode: "group", margin: { l: 10, t: 30, b: 40 }, xaxis: { title: { text: "percent" }, ticksuffix: " %" }, yaxis: { autorange: "reversed", automargin: true } });
      };
      const ctl = controls(st, [
        { key: "release", label: "release", options: CAT.releases.map(r => [r, r]) },
        { key: "product", label: "product", options: [["FBFM40", "FBFM40"], ["FBFM13", "FBFM13"]] },
      ], draw);
      await draw();
      const forms = await csv("sampling/sites_by_growth_form.csv");
      return [ctl, box, h("h3", {}, "What the sites sample"),
        note("Table: the sites by the live fuel they mostly sample (the most frequent live category among a site's QC readings), or dead-only when a site reports no live fuel. This is the colour of the dots on the map."),
        table(forms, { maxHeight: "200px" }), tablefoot("sampling/sites_by_growth_form.csv")];
    }));

    view.append(await section("Representativeness: area versus readings versus sites", async () => {
      const box = h("div");
      const draw = async () => {
        const file = `sampling/representativeness_${st.scheme}_${st.conv}_data.csv`;
        box.innerHTML = ""; box.append(loading());
        const rows = await csv(file);
        box.innerHTML = "";
        const div = chartDiv();
        div.style.minHeight = Math.max(320, 22 * rows.length + 120) + "px";
        box.append(note(`Chart: one row per ${st.scheme} class. The grey dot is the class's share of California's valid area in ${rows[0]?.reference_release ?? "the latest release"}; the blue dot its share of QC readings and the orange diamond its share of sites (${CONV_LABEL[st.conv]}). The further a blue or orange marker sits to the right of the grey one, the more that class is over-sampled relative to its area; a class with a red ring has no FEMS site at all.`),
          div, note("Table: the numbers behind the chart, plus readings per 1,000 km² as a density of sampling."),
          table(rows, { columns: ["class", "area_km2", "area_share_pct", "readings", "readings_share_pct", "sites", "sites_share_pct", "readings_per_1000km2"], format: { area_km2: v => fmt(v, 0), area_share_pct: v => fmt(v, 1) + " %", readings_share_pct: v => fmt(v, 1) + " %", sites_share_pct: v => fmt(v, 1) + " %", readings_per_1000km2: v => fmt(v, 0) }, maxHeight: "420px" }),
          tablefoot(file, rows.length), figure(`sampling/representativeness_${st.scheme}_${st.conv}.svg`, `${st.scheme} representativeness (pipeline figure)`, { maxWidth: "760px" }));
        const y = rows.map(r => r.class);
        const seg = rows.flatMap(r => [{ x: Math.min(r.area_share_pct, r.readings_share_pct, r.sites_share_pct), y: r.class }, { x: Math.max(r.area_share_pct, r.readings_share_pct, r.sites_share_pct), y: r.class }, { x: null, y: null }]);
        const none = rows.filter(r => r.sites === 0);
        plot(div, [
          { type: "scatter", mode: "lines", x: seg.map(p => p.x), y: seg.map(p => p.y), line: { color: cssVar("--grid"), width: 3 }, hoverinfo: "skip", showlegend: false },
          { type: "scatter", mode: "markers", name: "% of valid area", x: rows.map(r => r.area_share_pct), y, marker: { color: cssVar("--ink-2"), size: 10 }, hovertemplate: "%{y}<br>%{x:.1f} % of area<extra></extra>" },
          { type: "scatter", mode: "markers", name: "% of QC readings", x: rows.map(r => r.readings_share_pct), y, marker: { color: PALETTE()[0], size: 10 }, customdata: rows.map(r => r.readings), hovertemplate: "%{y}<br>%{x:.1f} % of readings (%{customdata:,})<extra></extra>" },
          { type: "scatter", mode: "markers", name: "% of sites", x: rows.map(r => r.sites_share_pct), y, marker: { color: PALETTE()[1], size: 10, symbol: "diamond" }, customdata: rows.map(r => r.sites), hovertemplate: "%{y}<br>%{x:.1f} % of sites (%{customdata})<extra></extra>" },
          { type: "scatter", mode: "markers", name: "no FEMS site", x: none.map(r => r.area_share_pct), y: none.map(r => r.class), marker: { color: "rgba(0,0,0,0)", size: 18, line: { color: PALETTE()[7], width: 2 } }, hovertemplate: "%{y}: no site<extra></extra>" },
        ], { margin: { l: 10, t: 40, b: 40 }, xaxis: { title: { text: "percent" }, ticksuffix: " %", rangemode: "tozero" }, yaxis: { type: "category", autorange: "reversed", automargin: true, categoryorder: "array", categoryarray: y }, legend: { orientation: "h", x: 0, y: 1.08 } });
      };
      const ctl = controls(st, [
        { key: "scheme", label: "scheme", options: CAT.schemes.map(s => [s, s]) },
        { key: "conv", label: "release convention", options: CAT.conventions.map(c => [c, CONV_LABEL[c]]) },
      ], draw);
      await draw();
      return [ctl, box];
    }));

    view.append(await section("Sampling effort by year and month", async () => {
      const rows = await csv("sampling/effort_data.csv");
      const years = [...new Set(rows.map(r => r.year))].sort();
      const months = [...Array(12).keys()].map(m => m + 1);
      const mk = field => ({ type: "heatmap", x: months.map(String), y: years.map(String), z: years.map(yv => months.map(m => rows.find(r => r.year === yv && r.month === m)?.[field] ?? null)), colorscale: SEQ(), xgap: 2, ygap: 2, hoverongaps: false, texttemplate: "%{z:,}", textfont: { size: 9 }, colorbar: { thickness: 10, len: 0.8, outlinewidth: 0 }, hovertemplate: `%{y}-%{x}: %{z:,} ${field}<extra></extra>` });
      const d1 = chartDiv(), d2 = chartDiv();
      const lay = t => ({ title: t, margin: { l: 50, t: 40, b: 40 }, xaxis: { title: { text: "month (local)" }, type: "category", showgrid: false }, yaxis: { type: "category", autorange: "reversed", showgrid: false } });
      plot(d1, [mk("readings")], lay("QC readings per year × month"));
      plot(d2, [mk("sites")], lay("Distinct sites per year × month"));
      return [note("Heatmaps: the number of QC-passed readings (left) and of distinct sites reporting (right) in each local month of each year. Blank cells are months with no California sample. The seasonal cycle of FEMS sampling (busy fire season, quiet winter) is what limits the winter months of the moisture curves on the next page."),
        h("div", { class: "row" }, d1, d2), tablefoot("sampling/effort_data.csv", rows.length),
        figure("sampling/effort.svg", "Sampling effort (pipeline figure)", { maxWidth: "900px" })];
    }));
  };

  /* -------------------------------------------------------- moisture by season */
  VIEWS.moisture = async () => {
    const st = ui.moisture ??= { scheme: "cat_from_40", conv: CAT.conventions[0], comp: "live" };
    view.append(h("h1", {}, "Fuel moisture through the year, by fuel class"),
      h("p", { class: "lede" }, "The payoff of attaching a fuel class to every reading: the seasonal cycle of fuel moisture can be compared between fuel classes, separately for live fuels and for each dead time-lag class, whose moisture scales differ by an order of magnitude. Curves are month-of-year medians with the interquartile band across all QC readings of the class."));
    const box = h("div");
    const draw = async () => {
      const file = `sampling/seasonal_moisture_${st.scheme}_${st.conv}_data.csv`;
      box.innerHTML = ""; box.append(loading());
      const all = await csv(file);
      const rows = all.filter(r => r.component === st.comp);
      const classes = CAT.classes.filter(c => rows.some(r => r.class === c));
      box.innerHTML = "";
      const div = chartDiv("tall");
      box.append(note(`Chart: for the ${nice(st.comp)} component, the median fuel moisture of QC readings in each local month, one line per ${st.scheme} class (${CONV_LABEL[st.conv]}), with the shaded band spanning the 25th to 75th percentile. Hover a point for the number of readings behind it; months with few readings are noisy.`), div);
      const traces = [];
      for (const c of classes) {
        const g = rows.filter(r => r.class === c).sort((a, b) => a.month - b.month);
        const col = classColor(c);
        traces.push({ type: "scatter", mode: "lines", x: [...g.map(r => r.month), ...g.map(r => r.month).reverse()], y: [...g.map(r => r.q75), ...g.map(r => r.q25).reverse()], fill: "toself", fillcolor: col + "22", line: { color: "rgba(0,0,0,0)" }, hoverinfo: "skip", showlegend: false, legendgroup: c });
        traces.push({ type: "scatter", mode: "lines+markers", name: c, x: g.map(r => r.month), y: g.map(r => r.median), line: { color: col, width: 2 }, marker: { color: col, size: 7 }, customdata: g.map(r => [r.n, r.q25, r.q75]), hovertemplate: `${c}<br>month %{x}: median %{y:.1f} % (IQR %{customdata[1]:.1f}–%{customdata[2]:.1f}, n=%{customdata[0]:,})<extra></extra>`, legendgroup: c });
      }
      plot(div, traces, { xaxis: { title: { text: "month (local)" }, dtick: 1, range: [0.5, 12.5] }, yaxis: { title: { text: "fuel moisture (%)" }, rangemode: "tozero" }, hovermode: "x unified", legend: { orientation: "h", x: 0, y: 1.08 }, margin: { t: 50 } });
      box.append(note("Table: the full seasonal summary for every class and component: readings, median, quartiles and mean per month."),
        table(all, { columns: ["class", "component", "month", "n", "median", "q25", "q75", "mean"], format: { median: v => fmt(v, 1), q25: v => fmt(v, 1), q75: v => fmt(v, 1), mean: v => fmt(v, 1) }, maxHeight: "400px" }),
        tablefoot(file, all.length), h("h3", {}, "All components at once (pipeline figure)"),
        figure(`sampling/seasonal_moisture_${st.scheme}_${st.conv}.svg`, `${st.scheme}: seasonal moisture per component (${st.conv})`));
    };
    const comps = INDEX.catalogue.metrics.filter(m => m !== "n_readings_total").map(m => m.replace("n_readings_", ""));
    const ctl = controls(st, [
      { key: "scheme", label: "category scheme", options: CAT.schemes.filter(s => s.startsWith("cat_")).map(s => [s, s]) },
      { key: "conv", label: "release convention", options: CAT.conventions.map(c => [c, CONV_LABEL[c]]) },
      { key: "comp", label: "component", options: comps.map(c => [c, nice(c)]) },
    ], draw);
    view.append(panel(about("moisture"), ctl, box));
    await draw();
  };

  /* ---------- the story: ordered pages, plain names, the question each answers ---------- */
  const STORY = [
    { id: "overview", tab: "Start here", q: "What data is this, and what are the headline findings?" },
    { id: "grid", tab: "Fuel maps", q: "What do the two LANDFIRE fuel products say about California, and do they agree with each other?" },
    { id: "crosswalk", tab: "Codes to categories", q: "How are the 13 and 40 fuel-model codes reduced to five categories, and which decisions does that take?" },
    { id: "sampling", tab: "Where FEMS samples", q: "Where are the FEMS sites on the fuel map, and how representative are they of the state's fuels?" },
    { id: "counts", tab: "Readings by class", q: "How do the fuel-moisture readings split across fuel classes, years and components?" },
    { id: "matrices", tab: "Product agreement", q: "Under the readings, do the two products and the crosswalk tell the same story?" },
    { id: "moisture", tab: "Moisture by season", q: "How does fuel moisture move through the year in each fuel class?" },
    { id: "change", tab: "Change over releases", q: "How much does the fuel map change from release to release, where, and what does that do to the classes?" },
    { id: "figures", tab: "All figures", q: "Every figure the pipeline wrote, searchable.", appendix: true },
    { id: "data", tab: "All data", q: "Every CSV and SVG, with a description and a download link.", appendix: true },
  ];
  function storybar(id) {
    const i = STORY.findIndex(s => s.id === id);
    if (i < 0) return null;
    const s = STORY[i], prev = STORY[i - 1], next = STORY[i + 1];
    const main = STORY.filter(x => !x.appendix).length;
    const nav = h("span", { class: "nav" });
    if (prev) nav.append(h("a", { href: "#" + prev.id }, "‹ " + prev.tab));
    if (next) nav.append(h("a", { href: "#" + next.id }, next.tab + " ›"));
    return h("div", { class: "storybar" },
      h("span", { class: "step" }, s.appendix ? "Appendix" : `Step ${i + 1} of ${main}`),
      h("span", { class: "q" }, s.q), nav);
  }
  function buildNav() {
    const nav = $("#tabs");
    nav.innerHTML = "";
    let n = 0;
    for (const s of STORY) {
      const a = h("a", { href: "#" + s.id, "data-tab": s.id, class: s.appendix ? "appendix" : "" });
      if (!s.appendix) a.append(h("span", { class: "n" }, String(++n)));
      a.append(s.tab);
      nav.append(a);
    }
  }

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
    const sb = storybar(VIEWS[tab] ? tab : "overview");
    if (sb) view.append(sb);
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
    buildNav();
    window.addEventListener("hashchange", route);
    route();
  }
  init();
})();
