/* Page 2: FEMS stations only. */
window.PageStations = (() => {
  "use strict";
  const { h, panel, note, csv, fmt, table, tablefoot, dl, controls, ui, chartDiv, plot, section, toc, tiles, tile, cssVar, isTrue, classColor, stationMap, esc } = FX;
  const relLabel = r => r.replace("_", " ");
  const COMPONENTS = [["live", "Live"], ["dead_1hr", "Dead 1-hour"], ["dead_10hr", "Dead 10-hour"], ["dead_100hr", "Dead 100-hour"], ["dead_1000hr", "Dead 1000-hour"], ["dead_duff", "Dead duff"]];
  const CATEGORIES = ["grass", "shrub", "tree", "slash"];
  const STATUS = () => [
    { key: "all match", label: "All fuels match", color: cssVar("--s3"), symbol: "circle" },
    { key: "some match", label: "Some match", color: cssVar("--s4"), symbol: "diamond" },
    { key: "none match", label: "None match", color: cssVar("--s8"), symbol: "x" },
    { key: "no live fuel reported", label: "No live fuel reported", color: cssVar("--muted"), symbol: "circle-open" },
    { key: "cell has no data", label: "Cell has no data", color: cssVar("--s7"), symbol: "square" },
  ];
  const by = (rows, key) => { const m = new Map(); for (const r of rows) { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };
  const S = (v) => String(v ?? "");
  const matchFile = (r, p) => `stations/match_${r}_${p}.csv`;
  const empty = text => h("p", { class: "muted" }, text);

  /* ---------- 1. yearly measurements ---------- */
  function histogram(values) {
    const max = Math.max(...values);
    const size = max <= 30 ? 1 : 5;
    const bins = new Map();
    for (const v of values) { const lo = Math.floor((v - 1) / size) * size + 1; bins.set(lo, (bins.get(lo) || 0) + 1); }
    const lows = [...bins.keys()].sort((a, b) => a - b);
    return { size, x: lows.map(l => l + (size - 1) / 2), y: lows.map(l => bins.get(l)), range: lows.map(l => size === 1 ? `${l}` : `${l} to ${l + size - 1}`) };
  }
  function measurementsSection(body, summary) {
    return Promise.all([csv("stations/measurements.csv"), csv("stations/measurements_yearly.csv")]).then(([per, yearly]) => {
      const years = [...new Set(yearly.map(r => r.year))].sort((a, b) => a - b);
      const partial = +summary.partial_year;
      const st = ui.fems_hist ||= { year: "all" };
      const yrLabel = y => y === partial ? `${y} (partial)` : String(y);
      const box = h("div", {});
      const draw = () => {
        box.innerHTML = "";
        const grid = h("div", { class: "row" });
        for (const [comp, label] of COMPONENTS) {
          const rows = per.filter(r => r.component === comp && (st.year === "all" || r.year === +st.year));
          const yr = yearly.filter(r => r.component === comp);
          const total = rows.reduce((s, r) => s + r.measurements, 0);
          const stations = new Set(rows.map(r => r.site_id)).size;
          const card = panel(h("h3", {}, label), note(`${fmt(total)} measurements from ${fmt(stations)} stations, ${fmt(rows.length)} station-years${st.year === "all" ? "" : ` in ${yrLabel(+st.year)}`}.`));
          if (rows.length) {
            const H = histogram(rows.map(r => r.measurements));
            const d = chartDiv("short");
            plot(d, [{ type: "bar", x: H.x, y: H.y, width: H.size * 0.9, marker: { color: cssVar("--s1") }, customdata: H.range,
              hovertemplate: "%{customdata} measurements in the year: %{y} station-years<extra></extra>" }],
              { margin: { l: 48, r: 8, t: 8, b: 44 }, xaxis: { title: { text: "measurements in a station-year" } }, yaxis: { title: { text: "station-years" } } });
            card.append(d);
          } else card.append(empty("No measurements of this fuel in the selected year."));
          const d2 = chartDiv("short");
          plot(d2, [{ type: "bar", x: yr.map(r => String(r.year)), y: yr.map(r => r.measurements), customdata: yr.map(r => r.stations),
            marker: { color: yr.map(r => r.year === partial ? cssVar("--axis") : cssVar("--s3")) },
            hovertemplate: "%{x}: %{y:,} measurements from %{customdata} stations<extra></extra>" }],
            { margin: { l: 48, r: 8, t: 8, b: 44 }, xaxis: { type: "category", title: { text: "year (paler bar is the partial year)" } }, yaxis: { title: { text: "measurements" } } });
          card.append(d2);
          grid.append(card);
        }
        const pivot = years.map(y => {
          const o = { year: y === partial ? `${y} (partial)` : String(y) };
          for (const [c, l] of COMPONENTS) o[l] = yearly.find(r => r.year === y && r.component === c)?.measurements ?? 0;
          return o;
        });
        box.append(grid, panel(h("h3", {}, "Measurements per year, as a table"), table(pivot, { columns: ["year", ...COMPONENTS.map(c => c[1])], maxHeight: "none" }),
          h("div", { class: "tablefoot" }, dl("stations/measurements.csv", "per station and year CSV"), dl("stations/measurements_yearly.csv", "per year CSV"))));
      };
      draw();
      body.innerHTML = "";
      body.append(controls(st, [{ key: "year", label: "Histogram year", options: [["all", "All years"], ...years.map(y => [y, yrLabel(y)])] }], draw), box);
    });
  }

  /* ---------- 2. fuel mapping ---------- */
  async function mappingSection(body) {
    const rows = await csv("stations/fuel_mapping.csv");
    const live = rows.filter(r => r.fems_category !== "Dead");
    const count = e => live.filter(r => r.evidence === e).length;
    const differ = live.filter(r => isTrue(r.fems_label_differs));
    const conflict = live.filter(r => r.crosswalk_category_FBFM13 !== r.category || r.crosswalk_category_FBFM40 !== r.category);
    const st = ui.fems_map ||= { q: "" };
    const box = h("div", {});
    const draw = () => {
      box.innerHTML = "";
      const q = st.q.trim().toLowerCase();
      const shown = rows.filter(r => !q || `${r.fuel_type} ${r.closest_fbfm13} ${r.closest_fbfm40} ${r.category}`.toLowerCase().includes(q));
      box.append(table(shown, {
        columns: ["fuel_type", "fems_category", "stations", "readings", "closest_fbfm13", "closest_fbfm40", "category", "evidence", "rationale"],
        labels: { fuel_type: "reported fuel", fems_category: "FEMS category", closest_fbfm13: "closest FBFM13", closest_fbfm40: "closest FBFM40" },
        wrap: ["rationale"], maxHeight: "640px" }), tablefoot("stations/fuel_mapping.csv", shown.length));
    };
    draw();
    body.innerHTML = "";
    body.append(panel(
      note(`<strong>This table is a judgement, so please review it.</strong> Fuel models describe fuelbeds, not plant species, and neither source assigns species to models. ${fmt(count("direct"))} of the ${fmt(live.length)} live fuels are named by the source at plant, genus or plant-type level; ${fmt(count("inferred"))} are inferred from growth form. ${fmt(differ.length)} are labelled differently by FEMS (${differ.map(r => esc(r.fuel_type)).join("; ")}), and they are mapped by growth form. ${fmt(conflict.length)} have a closest code whose crosswalk category differs from the plant's category (${conflict.map(r => esc(r.fuel_type)).join("; ")}).`),
      controls(st, [{ key: "q", label: "Search", type: "text", placeholder: "fuel, code or category" }], draw), box));
  }

  /* ---------- 3. changes ---------- */
  async function changesSection(body, stations, summary) {
    const [events, per] = await Promise.all([csv("stations/fuel_changes.csv"), csv("stations/measurements.csv")]);
    const st = ui.fems_changes ||= { track: "both", labels: true, partial: true };
    const box = h("div", {});
    const draw = async () => {
      box.innerHTML = "";
      const ev = events.filter(e => (st.track === "both" || e.track === st.track)
        && (st.labels || e.kind !== "growth-stage label only") && (st.partial || !isTrue(e.partial_year)));
      const years = new Map();
      for (const r of per) {
        const track = r.component === "live" ? "live" : "dead";
        if (st.track !== "both" && track !== st.track) continue;
        const k = `${r.site_id}|${track}`;
        if (!years.has(k)) years.set(k, new Set());
        years.get(k).add(r.year);
      }
      const eligible = new Set([...years].filter(([, s]) => s.size >= 2).map(([k]) => +k.split("|")[0]));
      const perStation = by(ev, "site_id");
      const yrs = [...new Set(ev.map(e => e.year))].sort((a, b) => a - b);
      const kinds = [["different species", cssVar("--s1")], ["growth-stage label only", cssVar("--s4")], ["dead fuel class", cssVar("--s2")]];
      const d = chartDiv("short");
      plot(d, kinds.map(([k, c]) => ({ type: "bar", name: k, x: yrs.map(String), y: yrs.map(y => ev.filter(e => e.year === y && e.kind === k).length), marker: { color: c },
        hovertemplate: `%{x}: %{y} ${k} changes<extra></extra>` })).filter(t => t.y.some(v => v)),
        { barmode: "stack", margin: { l: 48, r: 8, t: 32, b: 44 }, xaxis: { type: "category", title: { text: "year the change first appears" } }, yaxis: { title: { text: "changes" } } });
      const pts = stations.map(s => {
        const n = (perStation.get(s.site_id) || []).length;
        return { lat: s.lat, lon: s.lon, group: n === 0 ? "none" : n === 1 ? "1" : n === 2 ? "2" : "3+",
          text: `<b>${esc(S(s.site_name))}</b>: ${n} change${n === 1 ? "" : "s"}` };
      });
      const map = chartDiv();
      await stationMap(map, pts, [
        { key: "none", label: "No change listed", color: cssVar("--axis"), size: 6 },
        { key: "1", label: "1 change", color: cssVar("--s4") },
        { key: "2", label: "2 changes", color: cssVar("--s2"), symbol: "diamond" },
        { key: "3+", label: "3 or more", color: cssVar("--s8"), symbol: "square" },
      ]);
      box.append(tiles(
        tile("Stations with a change", fmt(perStation.size), `of ${fmt(eligible.size)} with two or more reporting years`),
        tile("Changes", fmt(ev.length), "between consecutive reporting years")),
        h("div", { class: "row" }, panel(h("h3", {}, "When changes appear"), d), panel(h("h3", {}, "Where the stations are"), map)),
        panel(h("h3", {}, "Every change"),
          table(ev.map(e => ({ ...e, partial: isTrue(e.partial_year) ? "partial year" : "" })), {
            columns: ["site_name", "track", "year", "previous_report_year", "skipped_years", "added", "dropped", "kind", "partial"],
            labels: { site_name: "station", previous_report_year: "compared with", skipped_years: "years skipped", partial: "note" },
            format: { previous_report_year: v => String(v), skipped_years: v => String(v) }, wrap: ["added", "dropped"], sort: "year", asc: true, maxHeight: "560px" }),
          tablefoot("stations/fuel_changes.csv", ev.length)));
    };
    await draw();
    body.innerHTML = "";
    body.append(controls(st, [
      { key: "track", label: "Fuels", options: [["both", "Live and dead"], ["live", "Live only"], ["dead", "Dead only"]] },
      { key: "labels", type: "check", label: "Include growth-stage label changes" },
      { key: "partial", type: "check", label: `Include the partial year (${summary.partial_year})` },
    ], draw), box);
  }

  /* ---------- 4. fuels against the cell ---------- */
  const fileControls = (st, releases, extra) => [
    { key: "release", label: "Release", options: releases.map(r => [r, relLabel(r)]) },
    { key: "product", label: "Product", options: [["FBFM40", "FBFM40"], ["FBFM13", "FBFM13"]] }, ...(extra || []),
  ];
  const LEVEL = { category: "Category", family: "Fuel-model family", code: "Exact code" };
  async function matchSection(body, stations, summary, releases) {
    const fuels = await csv("stations/fuel_mapping.csv");
    const reported = new Set(fuels.filter(r => r.fems_category !== "Dead").map(r => r.category));
    const neverReported = CATEGORIES.filter(c => !reported.has(c));
    const coords = new Map(stations.map(s => [s.site_id, s]));
    const st = ui.fems_match ||= { release: releases[releases.length - 1], product: "FBFM40", level: "category", some: true };
    const box = h("div", {});
    const draw = async () => {
      box.innerHTML = "";
      box.append(FX.h("p", { class: "muted" }, "Loading…"));
      const rows = await csv(matchFile(st.release, st.product));
      const col = `status_${st.level}`, miss = `unmatched_${st.level}`;
      const closest = `closest_${st.level === "code" ? "code" : st.level}`;
      const cellCol = st.level === "code" ? "cell_code" : `cell_${st.level}`;
      const statuses = STATUS();
      const count = k => rows.filter(r => r[col] === k).length;
      const cats = [...new Set(rows.map(r => r.cell_category))].sort();
      const xt = cats.map(c => {
        const o = { "cell category": c };
        for (const s of statuses) if (count(s.key)) o[s.label] = rows.filter(r => r.cell_category === c && r[col] === s.key).length;
        o.total = rows.filter(r => r.cell_category === c).length;
        return o;
      });
      const pts = rows.map(r => {
        const s = coords.get(r.site_id);
        return { lat: s.lat, lon: s.lon, group: r[col], text: `<b>${esc(S(r.site_name))}</b>: ${r[col]}<br>Cell ${esc(S(r.cell_code))} (${esc(S(r.cell_category))})<br>Reports ${esc(S(r.species) || "dead fuels only")}` };
      });
      const map = chartDiv();
      await stationMap(map, pts, statuses);
      const list = rows.filter(r => r[col] === "none match" || (st.some && r[col] === "some match")).map(r => ({ ...r, status: r[col], cell: r[cellCol], unmatched: r[miss], closest: r[closest] }));
      const all = [];
      for (const rel of releases) for (const p of ["FBFM13", "FBFM40"]) {
        const t = await csv(matchFile(rel, p));
        const o = { release: relLabel(rel), product: p };
        for (const s of statuses) o[s.label] = t.filter(r => r[col] === s.key).length;
        all.push(o);
      }
      box.innerHTML = "";
      box.append(
        tiles(...statuses.filter(s => count(s.key)).map(s => tile(s.label, fmt(count(s.key)), `of ${fmt(rows.length)} stations`))),
        neverReported.length && st.level === "category" ? note(`<strong>Read this first.</strong> No fuel any California station reports maps to ${neverReported.join(" or ")}, so a station on a ${neverReported.join(" or ")} cell can never match at this level. That is a limit of what FEMS samples, not evidence that LANDFIRE is wrong. Those stations appear below as mismatches.`) : null,
        h("div", { class: "row" },
          panel(h("h3", {}, `${relLabel(st.release)}, ${st.product}, ${LEVEL[st.level].toLowerCase()}`), map),
          panel(h("h3", {}, "Status by the category of the cell"), table(xt, { maxHeight: "none" }),
            h("h3", {}, `Every file at this level`), table(all, { maxHeight: "none" }))),
        panel(h("h3", {}, "Stations with a discrepancy"), note(`${fmt(list.length)} stations listed.`),
          table(list, { columns: ["site_name", "status", "cell", "cell_name", "species", "closest", "unmatched"],
            labels: { site_name: "station", cell: "LANDFIRE cell", cell_name: "cell description", species: "live species reported", closest: "closest mapped", unmatched: "species that do not match" },
            wrap: ["cell_name", "species", "closest", "unmatched"], sort: "site_name", asc: true, maxHeight: "560px" }),
          tablefoot(matchFile(st.release, st.product), rows.length)));
    };
    await draw();
    body.innerHTML = "";
    body.append(controls(st, fileControls(st, releases, [
      { key: "level", label: "Compare at", options: Object.entries(LEVEL) },
      { key: "some", type: "check", label: "List partial matches too" },
    ]), draw), box);
  }

  /* ---------- 5. stations on non-burnable cells ---------- */
  async function nonburnableSection(body, stations, releases) {
    const counts = await csv("stations/nonburnable_counts.csv");
    const coords = new Map(stations.map(s => [s.site_id, s]));
    const st = ui.fems_nb ||= { release: releases[releases.length - 1], product: "FBFM40" };
    const box = h("div", {});
    const persistence = ["FBFM13", "FBFM40"].map(p => {
      const o = { product: p };
      for (let n = 0; n <= releases.length; n++) o[`${n} release${n === 1 ? "" : "s"}`] = stations.filter(s => s[`nonburnable_releases_${p}`] === n).length;
      return o;
    });
    const draw = async () => {
      box.innerHTML = "";
      box.append(FX.h("p", { class: "muted" }, "Loading…"));
      const rows = (await csv(matchFile(st.release, st.product)));
      const nb = rows.filter(r => isTrue(r.on_nonburnable));
      const others = rows.filter(r => !isTrue(r.on_nonburnable));
      const pt = r => {
        const s = coords.get(r.site_id);
        return { lat: s.lat, lon: s.lon, group: isTrue(r.on_nonburnable) ? r.recorded : "other",
          text: `<b>${esc(S(r.site_name))}</b>: cell ${esc(S(r.cell_code))} (${esc(S(r.cell_name))})<br>Reports ${esc(S(r.species) || "dead fuels only")}` };
      };
      const map = chartDiv();
      await stationMap(map, [...others, ...nb].map(pt), [
        { key: "other", label: "On a burnable cell", color: cssVar("--axis"), size: 6 },
        { key: "live fuel recorded", label: "Non-burnable cell, live fuel recorded", color: cssVar("--s8") },
        { key: "dead fuel classes only", label: "Non-burnable cell, dead classes only", color: cssVar("--s7"), symbol: "diamond" },
      ]);
      const stationsById = coords;
      const list = nb.map(r => ({ ...r, dead: S(stationsById.get(r.site_id).dead_fuels), other: stationsById.get(r.site_id)[`nonburnable_releases_${st.product}`] }));
      box.innerHTML = "";
      const withLive = nb.filter(r => r.recorded === "live fuel recorded").length;
      box.append(tiles(
        tile("On a non-burnable cell", fmt(nb.length), `of ${fmt(rows.length)} stations`),
        tile("Live fuel recorded", fmt(withLive), "a plant species that burns"),
        tile("Dead classes only", fmt(nb.length - withLive), "no plant species recorded")),
        h("div", { class: "row" }, panel(h("h3", {}, `${relLabel(st.release)}, ${st.product}`), map),
          panel(h("h3", {}, "Every file"), table(counts.map(c => ({ ...c, release: relLabel(c.release) })), { labels: { on_nonburnable: "on non-burnable", with_live_fuel: "live fuel recorded", dead_classes_only: "dead classes only" }, maxHeight: "none" }), tablefoot("stations/nonburnable_counts.csv", counts.length),
            h("h3", {}, "How many releases put a station on a non-burnable cell"), table(persistence, { maxHeight: "none" }))),
        panel(h("h3", {}, "The stations"),
          table(list, { columns: ["site_name", "cell_code", "cell_name", "recorded", "species", "closest_code", "dead", "other"],
            labels: { site_name: "station", cell_code: "LANDFIRE cell", cell_name: "cell description", species: "live species reported", closest_code: "closest mapped code", dead: "dead fuels reported", other: `releases on non-burnable (${st.product})` },
            format: { other: v => String(v) }, wrap: ["species", "dead", "closest_code"], sort: "site_name", asc: true, maxHeight: "560px" }),
          tablefoot(matchFile(st.release, st.product), rows.length)));
    };
    await draw();
    body.innerHTML = "";
    body.append(controls(st, fileControls(st, releases), draw), box);
  }

  /* ---------- 6. neighbourhood ---------- */
  const SCHEME = { FBFM13: ["FBFM13", "FBFM13"], FBFM40: ["FBFM40", "FBFM40"], cat_from_13: ["Categories from FBFM13", "FBFM13"], cat_from_40: ["Categories from FBFM40", "FBFM40"] };
  async function windowSection(body, stations, summary, releases) {
    const [fuels, sf] = await Promise.all([csv("stations/fuel_mapping.csv"), csv("stations/station_fuels.csv")]);
    const fuelsAt = by(sf, "site_id");
    const coords = new Map(stations.map(s => [s.site_id, s]));
    const st = ui.fems_window ||= { scheme: "FBFM40", release: releases[releases.length - 1], fuel: "any", reported: "any", cell: "any", value: "cells" };
    const box = h("div", {});
    const draw = async () => {
      box.innerHTML = "";
      box.append(FX.h("p", { class: "muted" }, "Loading…"));
      const product = SCHEME[st.scheme][1], isCat = st.scheme.startsWith("cat_");
      const [win, match, map13] = await Promise.all([csv(`stations/window_${st.release}_${product}.csv`), csv(matchFile(st.release, product)), csv(`landfire/mapping_${product}.csv`)]);
      const codeInfo = new Map(map13.map(r => [r.code, r]));
      const cellOf = new Map(match.map(r => [r.site_id, r]));
      const keep = s => {
        const c = cellOf.get(s.site_id), fs = fuelsAt.get(s.site_id) || [];
        if (st.fuel !== "any" && !fs.some(f => f.fuel_type === st.fuel)) return false;
        if (st.reported !== "any" && !fs.some(f => f.category === st.reported)) return false;
        if (st.cell.startsWith("cat:") && c.cell_category !== st.cell.slice(4)) return false;
        if (st.cell.startsWith("code:") && c.cell_code !== st.cell.slice(5)) return false;
        return true;
      };
      const chosen = stations.filter(keep);
      const ids = new Set(chosen.map(s => s.site_id));
      const totals = new Map();
      for (const w of win) {
        if (!ids.has(w.site_id)) continue;
        const info = codeInfo.get(w.code);
        const label = w.code === -1 ? "nodata" : isCat ? info.category : info.abbrev;
        totals.set(label, (totals.get(label) || 0) + w.cells);
      }
      const order = isCat ? ["nonburnable", ...CATEGORIES, "nodata"] : [...map13.map(r => r.abbrev), "nodata"];
      const present = order.filter(l => totals.has(l));
      const sum = [...totals.values()].reduce((a, b) => a + b, 0);
      const expected = chosen.length * +summary.window_cells;
      const catOf = l => isCat ? l : (map13.find(r => r.abbrev === l)?.category ?? "nodata");
      const groups = ["nonburnable", ...CATEGORIES, "nodata"].filter(c => present.some(l => catOf(l) === c));
      const y = l => st.value === "share" ? 100 * totals.get(l) / sum : totals.get(l);
      const d = chartDiv();
      plot(d, groups.map(g => {
        const ls = present.filter(l => catOf(l) === g);
        return { type: "bar", name: g, x: ls, y: ls.map(y), marker: { color: g === "nodata" ? cssVar("--axis") : classColor(g) },
          customdata: ls.map(l => [fmt(totals.get(l)), (100 * totals.get(l) / sum).toFixed(2)]),
          hovertemplate: "%{x}: %{customdata[0]} cells, %{customdata[1]} % of selected cells<extra></extra>" };
      }), {
        barmode: "overlay", margin: { l: 64, r: 8, t: 36, b: 60 },
        xaxis: { type: "category", categoryorder: "array", categoryarray: present, title: { text: isCat ? "category" : "fuel code" }, tickangle: present.length > 14 ? -60 : 0 },
        yaxis: { title: { text: st.value === "share" ? "% of selected cells" : "cells" } },
      });
      const rows = [...totals.keys()].length ? present.map(l => ({ class: l, category: catOf(l), cells: totals.get(l), "share of selected cells": (100 * totals.get(l) / sum).toFixed(2) + " %" })) : [];
      const pts = stations.map(s => {
        const c = cellOf.get(s.site_id), on = ids.has(s.site_id);
        return { lat: s.lat, lon: s.lon, group: on ? "selected" : "other",
          text: `<b>${esc(S(s.site_name))}</b>${on ? "" : " (not selected)"}<br>Cell ${esc(S(c.cell_code))} (${esc(S(c.cell_category))})<br>Reports ${esc([S(s.live_fuels), S(s.dead_fuels)].filter(Boolean).join("; "))}` };
      });
      const map = chartDiv();
      await stationMap(map, pts, [
        { key: "other", label: "Other stations", color: cssVar("--axis"), size: 6 },
        { key: "selected", label: "Selected stations", color: cssVar("--s1") },
      ]);
      const list = chosen.map(s => ({ station: S(s.site_name), cell: S(cellOf.get(s.site_id).cell_code), "cell category": S(cellOf.get(s.site_id).cell_category), "live fuels": S(s.live_fuels), "dead fuels": S(s.dead_fuels) }));
      box.innerHTML = "";
      box.append(tiles(
        tile("Stations selected", fmt(chosen.length), `of ${fmt(stations.length)}`),
        tile("Cells in their windows", fmt(sum), sum === expected ? `${fmt(chosen.length)} × ${fmt(+summary.window_cells)}, as expected` : `expected ${fmt(expected)}`),
        tile("Distinct classes present", fmt(present.length), SCHEME[st.scheme][0])));
      if (!chosen.length) {
        box.append(note(st.reported !== "any"
          ? `<strong>No station matches.</strong> No station reports a fuel mapped to ${esc(st.reported)} together with the other filters.`
          : `<strong>No station matches</strong> these filters in ${esc(relLabel(st.release))}.`));
      }
      box.append(h("div", { class: "row" },
        panel(h("h3", {}, "Fuel classes in the selected stations' windows"), chosen.length ? d : empty("Nothing to draw."), rows.length ? table(rows, { maxHeight: "320px" }) : null,
          h("div", { class: "tablefoot" }, dl(`stations/window_${st.release}_${product}.csv`, "per-station window CSV"))),
        panel(h("h3", {}, "Where they are"), map)),
        panel(h("h3", {}, "The selected stations"), table(list, { wrap: ["live fuels", "dead fuels"], sort: "station", asc: true, maxHeight: "480px" })));
    };
    const cellOptions = async () => {
      const product = SCHEME[st.scheme][1];
      const m = await csv(`landfire/mapping_${product}.csv`);
      return [["any", "Any cell"], ...["nonburnable", ...CATEGORIES].map(c => [`cat:${c}`, `Any ${c} cell`]), ...m.map(r => [`code:${r.abbrev}`, `${r.abbrev}: ${r.name}`])];
    };
    const rebuild = async () => {
      const opts = await cellOptions();
      body.innerHTML = "";
      body.append(controls(st, [
        { key: "scheme", label: "Histogram classes", options: Object.entries(SCHEME).map(([k, v]) => [k, v[0]]) },
        { key: "release", label: "Release", options: releases.map(r => [r, relLabel(r)]) },
        { key: "fuel", label: "Filter: reported fuel", options: [["any", "Any fuel"], ...fuels.map(f => [f.fuel_type, f.fuel_type])] },
        { key: "reported", label: "Filter: category of a reported fuel", options: [["any", "Any category"], ...CATEGORIES.map(c => [c, c])] },
        { key: "cell", label: "Filter: LANDFIRE cell the station is on", options: opts },
        { key: "value", label: "Bars show", options: [["cells", "Cells"], ["share", "Share of selected cells"]] },
      ], () => { const p = SCHEME[st.scheme][1]; if (p !== rebuild.product) { rebuild.product = p; rebuild(); } else draw(); }), box);
      await draw();
    };
    rebuild.product = SCHEME[st.scheme][1];
    await rebuild();
  }

  /* ---------- page ---------- */
  return async (view, INDEX) => {
    const { releases } = INDEX;
    const [stations, sumRows] = await Promise.all([csv("stations/stations.csv"), csv("stations/summary.csv")]);
    const summary = Object.fromEntries(sumRows.map(r => [r.key, r.value]));
    view.append(h("h1", {}, "FEMS stations only"),
      h("p", { class: "lede" }, `What the FEMS fuel-moisture stations in California measure, and how that compares with the LANDFIRE cell under each one. A station here is a California site with at least one reading that passed quality control: ${fmt(+summary.stations)} of the ${fmt(+summary.sites_in_california)} sites in the metadata, with ${fmt(+summary.qc_readings)} readings from ${summary.first_year} to ${summary.last_reading_date}. ${summary.partial_year} is a partial year. ${fmt(+summary.stations_sharing_a_cell)} stations share a 30 m cell with another station, so some map markers overlap; hovering lists all stations at a location.`),
      tiles(tile("Stations", fmt(+summary.stations)), tile("With live fuel", fmt(+summary.stations_with_live)), tile("With dead fuel", fmt(+summary.stations_with_dead)), tile("Dead fuel only", fmt(+summary.stations_dead_only))),
      toc([["fm-hist", "Measurements"], ["fm-map", "Fuel mapping"], ["fm-change", "Year-by-year changes"], ["fm-match", "Fuel vs cell"], ["fm-nb", "Non-burnable cells"], ["fm-win", "Neighbourhood"]]));
    await section(view, "fm-hist", "How many measurements stations make each year",
      `<p><strong>What it shows.</strong> One panel for live fuel and one for each dead fuel type. The first chart in a panel is a histogram: for every station and year with that fuel, count the measurements, then see how those counts are distributed. The second chart gives total measurements per calendar year.</p>
       <p><strong>Who counts.</strong> Any station with that fuel contributes to its panel, whatever else it reports, so one station can appear in several panels. A measurement is one quality-controlled sample row. A station measuring two species on one day has two live measurements.</p>
       <p><strong>How to read it.</strong> Years in which a station has no measurement of that fuel are absent, not zero. Pick a year above to restrict the histograms; the yearly totals always show all years.</p>`,
      body => measurementsSection(body, summary));
    await section(view, "fm-map", "Reported fuels and their closest LANDFIRE classes",
      `<p><strong>What it shows.</strong> Every distinct fuel California stations report, one per row, with the closest FBFM13 code, closest FBFM40 code and category.</p>
       <p><strong>How it was built.</strong> By hand, using the fuel model descriptions in Anderson (1982) and Scott and Burgan (2005) and the crosswalk tables in the latter. The evidence column says <em>direct</em> if the source names the plant or genus or plant type, <em>inferred</em> if the row relies on growth form. The rationale gives the reasoning per row.</p>
       <p><strong>Dead fuels.</strong> The 1-hour to 1000-hour classes and duff are size classes or forest-floor layers found in any burnable fuel model, so they have no mapping. New Growth and Old Growth labels of one plant always map together.</p>`,
      body => mappingSection(body));
    await section(view, "fm-change", "Do a station's reported fuels change from year to year?",
      `<p><strong>What it shows.</strong> Each time a station's set of reported fuels differs from its previous reporting year, with what was added and dropped. Live and dead fuels are tracked separately.</p>
       <p><strong>How it is computed.</strong> For each station, the fuels reported in a year are compared with those in the most recent earlier year that had a report. A year with no report is skipped, not counted as a change, and the table shows how many years were skipped.</p>
       <p><strong>Three kinds of change.</strong> <em>Growth-stage label only</em>: the plant species are the same and only the New Growth or Old Growth labels differ, which can reflect how a sample was recorded and is not a change of plant. <em>Different species</em>: at least one species entered or left. <em>Dead fuel class</em>: a dead size class entered or left.</p>
       <p><strong>Caution.</strong> A change can mean that crews sampled a fuel less regularly, not that the site changed. A fuel that is skipped for one year and returns counts as two changes. Fuels dropped in the partial year may simply not have been sampled yet.</p>`,
      body => changesSection(body, stations, summary));
    await section(view, "fm-match", "Do a station's fuels match the LANDFIRE cell it sits on?",
      `<p><strong>What it shows.</strong> For the release and product you pick, whether each station's live species agree with the code of the 30 m cell containing its coordinates, using the mapping table above.</p>
       <p><strong>Three levels.</strong> <em>Category</em> compares grass, shrub, tree, slash and non-burnable. <em>Fuel-model family</em> compares groups such as SH or TL. <em>Exact code</em> compares the closest code with the cell's code; this is strict because the mapping names one code for a plant that can occur under several.</p>
       <p><strong>Statuses.</strong> A station may report several species, so each species is compared with the cell. <em>All</em>, <em>some</em> or <em>none</em> of them can match. Stations reporting only dead fuels have no species to compare, so they get their own status and are never counted as mismatches. A station's species are everything it reported in any year.</p>
       <p><strong>Cautions.</strong> A coordinate error of one cell can change the result. Crews may sample a shrub growing under trees, and a timber-understory cell then counts as a category mismatch under the project's timber-understory decision, even though both can be correct. Treat discrepancies as things to inspect, not as errors.</p>`,
      body => matchSection(body, stations, summary, releases));
    await section(view, "fm-nb", "Stations on non-burnable cells",
      `<p><strong>What it shows.</strong> Stations whose 30 m cell has a non-burnable LANDFIRE code in the file you pick (urban, snow or ice, agriculture, water or bare ground), and whether they record a burnable plant.</p>
       <p><strong>How to read it.</strong> <em>Live fuel recorded</em> means the station samples a living plant species, so burnable vegetation is present near the point even though the cell is non-burnable. <em>Dead classes only</em> means it reports only dead size classes or duff. Those are also burnable material, but they do not name a vegetation type.</p>
       <p><strong>Cautions.</strong> A 30 m cell can differ from the patch that crews actually sample, so a non-burnable cell does not by itself mean a wrong coordinate or a wrong map. The right-hand tables show how the count moves across releases and how many stations stay on non-burnable cells.</p>`,
      body => nonburnableSection(body, stations, releases));
    await section(view, "fm-win", `The ${summary.window_size} × ${summary.window_size} neighbourhood around each station`,
      `<p><strong>What it shows.</strong> For each station, a block of ${summary.window_size} × ${summary.window_size} cells (${fmt(+summary.window_cells)} cells, about ${fmt(+summary.window_km2, 2)} km²) centred on the cell it sits on. The histogram sums the classes across all stations you select, so it shows what surrounds those stations, not only the cell under them.</p>
       <p><strong>The filters combine.</strong> <em>Reported fuel</em> keeps stations that report that fuel in any year. <em>Category of a reported fuel</em> keeps stations with at least one live fuel mapped to that category. <em>LANDFIRE cell</em> keeps stations on that code or category in the chosen release. For example, reported category shrub with cell "Any nonburnable cell" gives stations recording a shrub while sitting on a non-burnable cell.</p>
       <p><strong>How to read it.</strong> Counts are exact, not sampled. A window that reaches outside the California mask counts those cells as <em>nodata</em>. Bars are coloured by category. Stations close together can share cells, and each station's window is counted in full.</p>`,
      body => windowSection(body, stations, summary, releases));
  };
})();
