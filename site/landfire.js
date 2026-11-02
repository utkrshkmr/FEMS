/* Page 1: LANDFIRE only. */
window.PageLandfire = (() => {
  "use strict";
  const { h, panel, note, csv, matrix, fmt, table, tablefoot, controls, ui, figure, chartDiv, plot, section, toc, km2, cssVar, isDark } = FX;
  const SCHEME_LABEL = { FBFM13: "FBFM13", FBFM40: "FBFM40", cat_from_13: "Categories from FBFM13", cat_from_40: "Categories from FBFM40" };
  const relLabel = r => r.replace("_", " ");
  const pairLabel = (a, b) => {
    const years = +b.slice(2, 6) - +a.slice(2, 6);
    return `${relLabel(a)} to ${relLabel(b)} (${years} year${years === 1 ? "" : "s"})`;
  };

  /* ---------- cells per value ---------- */
  function countPanel(scheme, title, what, releases) {
    const body = h("div", {}, FX.h("p", { class: "muted" }, "Loading…"));
    const path = `landfire/counts_${scheme}.csv`;
    csv(path).then(rows => {
      body.innerHTML = "";
      const raw = !scheme.startsWith("cat_");
      const columns = raw ? ["class", "code", "name", "category", ...releases] : ["class", "code", ...releases];
      const labels = { class: raw ? "value" : "category", code: raw ? "code" : "codes it collects", ...Object.fromEntries(releases.map(r => [r, relLabel(r)])) };
      const fmtCode = raw ? {} : { code: v => String(v ?? "").replaceAll(";", ", ") };
      body.append(table(rows, { columns, labels, format: fmtCode, wrap: raw ? ["name"] : ["code"], pinned: r => r.kind !== "class", maxHeight: "none" }), tablefoot(path, rows.length));
    });
    return panel(h("h3", {}, title), note(what), body);
  }

  /* ---------- map ---------- */
  function mapPanel(key, schemes, releases) {
    const st = ui[key] ||= { release: releases[releases.length - 1], scheme: schemes[0] };
    const box = h("div", {});
    const draw = () => {
      box.innerHTML = "";
      box.append(figure(`landfire/maps/map_${st.release}_${st.scheme}.svg`, `${relLabel(st.release)}, ${SCHEME_LABEL[st.scheme]}`,
        "Colours match the legend. Legend shares are computed from every cell in the file; the map itself is thinned for drawing, so very small classes may not be visible. Click to enlarge."));
    };
    const ctl = controls(st, [
      { key: "release", label: "Release", options: releases.map(r => [r, relLabel(r)]) },
      { key: "scheme", label: "Type", options: schemes.map(s => [s, SCHEME_LABEL[s]]) },
    ], draw);
    draw();
    return panel(ctl, box);
  }

  /* ---------- net movement ---------- */
  function divergingScale() {
    const mid = isDark() ? "#2c2c2a" : "#f0efec";
    return [[0, cssVar("--s8")], [0.5, mid], [1, cssVar("--s1")]];
  }
  function netPanel(key, schemes, pairs) {
    const st = ui[key] ||= { scheme: schemes[0], pair: pairs[0], unit: "cells" };
    const box = h("div", {});
    const draw = async () => {
      box.innerHTML = "";
      box.append(FX.h("p", { class: "muted" }, "Loading…"));
      const [a, b] = st.pair.split("|");
      const base = `landfire/net/${st.scheme}/${a}_to_${b}`;
      const [N, G] = await Promise.all([matrix(`${base}_net.csv`), matrix(`${base}_gross.csv`)]);
      box.innerHTML = "";
      const conv = st.unit === "km2" ? km2 : v => v;
      const unitWord = st.unit === "km2" ? "km²" : "cells";
      const z = N.z.map(r => r.map(conv));
      const n = N.rows.length;
      const lim = conv(Math.max(1, ...N.z.flat().map(Math.abs)));
      const hover = N.rows.map((rn, i) => N.cols.map((cn, j) => {
        const v = fmt(z[i][j], st.unit === "km2" ? 1 : undefined);
        if (i === j) return `<b>${rn} (diagonal)</b><br>Net change between releases: ${v} ${unitWord}<br>Stayed ${rn}: ${fmt(conv(G.z[i][i]), st.unit === "km2" ? 1 : undefined)} ${unitWord}`;
        return `<b>${rn} row, ${cn} column</b><br>Net given by ${rn} to ${cn}: ${v} ${unitWord}<br>${rn} to ${cn}: ${fmt(conv(G.z[i][j]), st.unit === "km2" ? 1 : undefined)}<br>${cn} to ${rn}: ${fmt(conv(G.z[j][i]), st.unit === "km2" ? 1 : undefined)}`;
      }));
      const big = n * n > 450;
      const trace = {
        type: "heatmap", x: N.cols, y: N.rows, z, zmin: -lim, zmax: lim, zmid: 0, colorscale: divergingScale(), xgap: 1, ygap: 1,
        text: hover, hovertemplate: "%{text}<extra></extra>",
        colorbar: { thickness: 10, len: 0.8, outlinewidth: 0, title: { text: unitWord, side: "right" } },
      };
      if (!big) {
        trace.texttemplate = st.unit === "km2" ? "%{z:,.0f}" : (n <= 8 ? "%{z:,}" : "%{z:.3~s}");
        trace.textfont = { size: n <= 8 ? 12 : 9 };
      }
      const shapes = N.rows.map((_, i) => ({ type: "rect", x0: i - 0.5, x1: i + 0.5, y0: i - 0.5, y1: i + 0.5, line: { color: cssVar("--ink"), width: 1.5 } }));
      const div = chartDiv();
      div.style.minHeight = Math.max(380, 24 * n + 150) + "px";
      plot(div, [trace], {
        shapes, margin: { l: 90, r: 16, t: 16, b: n > 12 ? 80 : 60 },
        xaxis: { type: "category", title: { text: "column: the other class" }, tickangle: n > 12 ? -60 : 0, showgrid: false },
        yaxis: { type: "category", title: { text: "row: the class being read" }, autorange: "reversed", showgrid: false },
      });

      /* the reading guide and closure check, computed from this matrix */
      const rowSums = N.z.map(r => r.reduce((s, v) => s + v, 0));
      const worst = Math.max(...rowSums.map(Math.abs));
      let idx = 0;
      N.z.forEach((r, i) => { if (Math.abs(r[i]) > Math.abs(N.z[idx][idx])) idx = i; });
      const row = N.z[idx], rn = N.rows[idx];
      let top = -1;
      row.forEach((v, j) => { if (j !== idx && (top < 0 || Math.abs(v) > Math.abs(row[top]))) top = j; });
      const dir = row[idx] < 0 ? "lost" : "gained";
      const topWord = row[top] > 0 ? `gave ${fmt(row[top])} net cells to ${N.cols[top]}` : `took ${fmt(-row[top])} net cells from ${N.cols[top]}`;
      const example = `<strong>Example from this matrix.</strong> ${rn} has the largest net change: its diagonal is ${fmt(row[idx])}, so it ${dir} ${fmt(Math.abs(row[idx]))} cells (${fmt(km2(Math.abs(row[idx])), 0)} km²) between the two releases. Its largest single movement is with ${N.cols[top]}: it ${topWord}.`;
      const check = worst === 0
        ? `<strong>Check.</strong> All ${n} rows of this matrix sum to exactly zero.`
        : `<strong>Check failed.</strong> A row sums to ${fmt(worst)}.`;

      const rows = N.rows.map((rl, i) => {
        const o = { class: rl };
        N.cols.forEach((c, j) => { o[c] = z[i][j]; });
        o["row sum"] = rowSums[i] === 0 ? 0 : conv(rowSums[i]);
        return o;
      });
      const f = st.unit === "km2" ? Object.fromEntries(N.cols.map(c => [c, v => fmt(v, 1)])) : {};
      box.append(note(example), note(check), div,
        h("h3", {}, "The same matrix as a table"),
        table(rows, { columns: ["class", ...N.cols, "row sum"], format: f, maxHeight: "480px" }),
        h("div", { class: "tablefoot" }, FX.dl(`${base}_net.csv`, "download net CSV (cells)"), FX.dl(`${base}_gross.csv`, "download gross transitions CSV (cells)")));
    };
    const spec = [
      { key: "pair", label: "Releases compared", options: pairs.map(p => { const [a, b] = p.split("|"); return [p, pairLabel(a, b)]; }) },
      { key: "unit", label: "Unit", options: [["cells", "cells"], ["km2", "km²"]] },
    ];
    if (schemes.length > 1) spec.unshift({ key: "scheme", label: "Type", options: schemes.map(s => [s, SCHEME_LABEL[s]]) });
    draw();
    return panel(controls(st, spec, draw), box);
  }
  const NET_ABOUT = `<p><strong>What it shows.</strong> Where each class's net gain or loss came from between two LANDFIRE releases. Releases are snapshots, not annual maps, so the first step spans several years and the selector states each step's length.</p>
    <p><strong>How to read a row.</strong> The outlined diagonal cell is the class's net change: cells in the later release minus cells in the earlier one. Negative means the class shrank. Every other cell in the row is the net number of cells this class gave to the column's class. Positive means this class lost those cells to that class, and negative means it took them.</p>
    <p><strong>Why rows sum to zero.</strong> A class's net change is fully accounted for by its exchanges with the other classes, so the diagonal plus the rest of its row is zero. The page recomputes this for every matrix and reports it below.</p>
    <p><strong>How it is computed.</strong> From the cell-by-cell transition counts over every California cell. For classes i and j, the row i, column j value is the cells going from i to j minus the cells going from j to i. Cells going in both directions cancel, so this matrix shows net movement, not total churn; hover over a cell for both gross directions. Columns do not sum to zero: each column sums to twice its diagonal, which follows from the definition. The <em>nodata</em> row and column are kept when cells enter or leave it, because rows would not close without them.</p>`;

  /* ---------- mapping tables ---------- */
  function mappingPanel(product) {
    const body = h("div", {}, FX.h("p", { class: "muted" }, "Loading…"));
    const path = `landfire/mapping_${product}.csv`;
    csv(path).then(rows => {
      body.innerHTML = "";
      const dec = rows.filter(r => r.decision === "yes");
      body.append(note(dec.length ? `${fmt(rows.length)} codes. ${fmt(dec.length)} of them (${dec.map(r => r.abbrev).join(", ")}) follow a project decision, marked in the last column.` : `${fmt(rows.length)} codes.`),
        table(rows, { columns: ["code", "abbrev", "name", "group", "category", "decision"], labels: { abbrev: "value", decision: "project decision" }, wrap: ["name"], maxHeight: "none" }), tablefoot(path, rows.length));
    });
    return panel(h("h3", {}, `${product} to category`), body);
  }

  /* ---------- page ---------- */
  return async (view, INDEX) => {
    const { releases, pairs } = INDEX;
    const totals = await csv("landfire/counts_FBFM13.csv");
    const mask = totals.find(r => r.kind === "total")[releases[0]];
    view.append(h("h1", {}, "LANDFIRE only"),
      h("p", { class: "lede" }, `What the LANDFIRE fuel maps say about California on their own. There are ${releases.length} releases (${releases.map(relLabel).join(", ")}) of two products: FBFM13, Anderson's 13 fuel models, and FBFM40, Scott and Burgan's 40. Each California cell is 30 m on a side, and the California mask holds ${fmt(mask)} cells (${fmt(km2(mask), 0)} km²). The page first looks at the raw fuel codes, then maps them to grass, shrub, tree and slash, then repeats the same views for those categories.`),
      toc([["lf-counts", "Cells per value"], ["lf-map", "Map"], ["lf-net", "Net movement"], ["lf-logic", "Mapping logic"], ["lf-cat-counts", "Category cells"], ["lf-cat-map", "Category map"], ["lf-cat-net", "Category net movement"]]));
    view.append(h("h2", { class: "part" }, "Part 1: raw fuel model codes"));
    await section(view, "lf-counts", "Cells per fuel code in each file",
      `<p><strong>What it shows.</strong> How many California cells carry each distinct value in each LANDFIRE file, one table per product. Rows are the codes present in at least one release, and columns are the releases.</p>
       <p><strong>How it is computed.</strong> Every cell inside the California mask is counted, not a sample. The last two rows are cells with no data inside California and the mask total, so each column adds up to the total row. A zero means the code does not occur in California in that release. To convert cells to area, multiply by 0.0009 km².</p>`,
      body => FX.fill(body, 
        countPanel("FBFM13", "FBFM13", "Anderson's fuel models and the non-burnable codes. Codes that never occur in California in any release are left out.", releases),
        countPanel("FBFM40", "FBFM40", "Scott and Burgan's fuel models and the same non-burnable codes. Codes that never occur in California in any release are left out.", releases)));
    await section(view, "lf-map", "California map by fuel code",
      `<p><strong>What it shows.</strong> Where each fuel code sits in California, for the release and product you pick.</p>
       <p><strong>How to read it.</strong> Hue groups the codes into families (grass, shrub, timber and so on) and shade separates the models within a family, so colours mean the same across all releases of a product. The legend lists every code in the file with its share of valid cells.</p>`,
      body => FX.fill(body, mapPanel("lf_map", ["FBFM13", "FBFM40"], releases)));
    await section(view, "lf-net", "Net movement between fuel codes", NET_ABOUT, body => FX.fill(body, netPanel("lf_net", ["FBFM13", "FBFM40"], pairs)));

    view.append(h("h2", { class: "part" }, "Part 2: mapping to grass, shrub, tree and slash"));
    await section(view, "lf-logic", "The logic tables",
      `<p><strong>What it shows.</strong> The rule that assigns each fuel code to one of grass, shrub, tree or slash, built separately for each product. Non-burnable codes stay in their own non-burnable class.</p>
       <p><strong>Why two tables.</strong> The products have different codes and different fuel groups, so each needs its own rule, and a cell's category from one product can differ from its category from the other.</p>
       <p><strong>Project decisions.</strong> Rows marked in the last column follow a choice set in <code>config.yaml</code>. Changing one changes every category result on this page.</p>`,
      body => FX.fill(body, h("div", { class: "row" }, mappingPanel("FBFM13"), mappingPanel("FBFM40"))));

    view.append(h("h2", { class: "part" }, "Part 3: the same views for the categories"));
    await section(view, "lf-cat-counts", "Cells per category in each file",
      `<p><strong>What it shows.</strong> The fuel code tables above, added up by the mapping in the logic tables. One table uses categories derived from FBFM13 and the other from FBFM40.</p>
       <p><strong>How to read it.</strong> The same release has the same California cells in both tables, so any difference between them comes from the two products and their mappings. Each column adds up to the total row.</p>`,
      body => FX.fill(body, 
        countPanel("cat_from_13", "Categories from FBFM13", "Each row adds up the FBFM13 codes listed beside it.", releases),
        countPanel("cat_from_40", "Categories from FBFM40", "Each row adds up the FBFM40 codes listed beside it.", releases)));
    await section(view, "lf-cat-map", "California map by category",
      `<p><strong>What it shows.</strong> The same maps recoloured by category, for the release and source product you pick. Colours are fixed per category across all maps.</p>`,
      body => FX.fill(body, mapPanel("lf_cat_map", ["cat_from_13", "cat_from_40"], releases)));
    await section(view, "lf-cat-net", "Net movement between categories", NET_ABOUT, body => FX.fill(body, netPanel("lf_cat_net", ["cat_from_13", "cat_from_40"], pairs)));
  };
})();
