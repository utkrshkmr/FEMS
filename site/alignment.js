/* Page 4: Alignment. Questions for a human expert, the evidence behind each, and a live preview of what the
   answers imply for every FEMS station. Answers stay in this browser (localStorage) and can be downloaded. */
window.PageAlignment = (() => {
  "use strict";
  const { h, panel, note, csv, fmt, pct, table, tablefoot, dl, controls, ui, chartDiv, plot, section, toc, tiles, tile, cssVar, isTrue, classColor, stationMap, esc } = FX;
  const S = v => String(v ?? "");
  const SEP = "; ";
  const split = v => S(v) ? S(v).split(SEP) : [];
  const SIZES = [3, 5, 11, 35];
  const BURNABLE = ["grass", "shrub", "tree", "slash"];
  const CATS = ["nonburnable", "grass", "shrub", "tree", "slash"];
  const PRODUCT = { fbfm40: "FBFM40", fbfm13: "FBFM13", cat40: "FBFM40", cat13: "FBFM13" };
  const RAW = { fbfm40: true, fbfm13: true, cat40: false, cat13: false };
  const SCHEME_NAME = { fbfm40: "FBFM40 code", fbfm13: "FBFM13 code", cat40: "category from FBFM40", cat13: "category from FBFM13" };
  const SUPPORT_NAME = { cell: "the 30 m cell", maj3: "majority of 3 × 3 cells", maj5: "majority of 5 × 5 cells", maj11: "majority of 11 × 11 cells", maj35: "majority of 35 × 35 cells" };
  const DEFAULTS = { q1: "cat40", q2: "latest", q3: "cell", q4: "nearest", q4d: "50", q5: "landfire", q6: "station", q7: "merge", q8: "landfire", q9: "predict" };
  const STORE = "fireset-alignment-answers";

  function loadAnswers() {
    let a = { ...DEFAULTS, notes: {}, reviewer: "" };
    try { const s = localStorage.getItem(STORE); if (s) a = { ...a, ...JSON.parse(s) }; } catch (e) { /* ignore */ }
    return a;
  }
  function saveAnswers(a) { try { localStorage.setItem(STORE, JSON.stringify(a)); } catch (e) { /* ignore */ } }

  /* ---------- the questions ---------- */
  function questions(X) {
    const sup = X.summary, cs = X.classSupport;
    const nClasses = (scheme, lo, hi) => cs[scheme].filter(r => r.stations_on_cell >= lo && r.stations_on_cell <= hi).length;
    const noStationArea = scheme => cs[scheme].filter(r => r.stations_on_cell === 0).reduce((t, r) => t + r.area_share, 0);
    const latest = S(sup.latest_release).replace("_", " ");
    return [
      { id: "q1", title: "What is the fuel label a station should carry?", evidence: "e1",
        why: `The model predicts moisture for a fuel class, so the class system decides how many classes there are and how many stations support each. Under FBFM40 codes, ${fmt(nClasses("FBFM40", 5, 1e9))} classes have 5 or more stations on their cell and ${fmt(nClasses("FBFM40", 1, 4))} have 1 to 4; classes with no station cover ${pct(noStationArea("FBFM40"), 2)} of California. Under FBFM13 codes the numbers are ${fmt(nClasses("FBFM13", 5, 1e9))}, ${fmt(nClasses("FBFM13", 1, 4))} and ${pct(noStationArea("FBFM13"), 2)}. Under the five categories from FBFM40 they are ${fmt(nClasses("cat_from_40", 5, 1e9))}, ${fmt(nClasses("cat_from_40", 1, 4))} and ${pct(noStationArea("cat_from_40"), 2)}.`,
        options: [["fbfm40", "FBFM40 code", "Scott and Burgan's 40 models. Finest, and the native LANDFIRE product most used in fire behaviour."],
                  ["fbfm13", "FBFM13 code", "Anderson's 13 models. Coarser, with a grass-dominated timber class (FM2) that covers much of California."],
                  ["cat40", "Category derived from FBFM40", "Grass, shrub, tree, slash or non-burnable, by the project's logic table. Few classes, many stations each."],
                  ["cat13", "Category derived from FBFM13", "The same five categories, derived from FBFM13 instead."]] },
      { id: "q2", title: "Which LANDFIRE release labels a station?", evidence: "e2",
        why: `LANDFIRE releases are snapshots. Between ${S(sup.releases).split(SEP)[0].replace("_", " ")} and ${latest}, the FBFM40 code at a station's cell changed for ${fmt(+sup.class_changed_across_releases_fbfm40)} of ${fmt(+sup.stations)} stations and the category for ${fmt(+sup.class_changed_across_releases_cat40)}. FEMS readings run from 2015, so a reading can be older than the map that labels it.`,
        options: [["latest", `The latest release (${latest}) for every reading`, "One label per station for all years. Simple and consistent, but a 2016 reading is labelled by a map made nine years later."],
                  ["matched", "The release nearest the reading's year", "The convention the pipeline already uses: 2015 to 2019 use LF2016 Remap, 2020 to 2022 LF2022, then the year's own release. A station's label can change between years."],
                  ["burnable_release", `The latest release, falling back to the newest release in which the cell is burnable`, "Keeps one label per station but rescues stations whose cell became non-burnable in a recent release."]] },
      { id: "q3", title: "How much ground around the station defines its cell?", evidence: "e3",
        why: `A 30 m cell is one pixel. ${fmt(+sup.seconds_rounded_both)} of ${fmt(+sup.stations)} stations have coordinates rounded to whole arc-seconds, about 30 m, so their true cell is uncertain by about one pixel; and for ${fmt(+sup.neighbours_differ_any)} stations at least one of the 8 surrounding cells has a different category. Taking a majority over a window trades that fragility for a coarser description: the majority category differs from the cell's for ${fmt(+sup.maj3_differs_from_cell)} stations at 3 × 3, ${fmt(+sup.maj5_differs_from_cell)} at 5 × 5, ${fmt(+sup.maj11_differs_from_cell)} at 11 × 11 and ${fmt(+sup.maj35_differs_from_cell)} at 35 × 35 (${latest}, FBFM40).`,
        options: [["cell", "The single 30 m cell", "Exact but fragile to coordinate error."],
                  ["maj3", "Majority of the 3 × 3 cells around it (90 m)", "Absorbs a one-cell coordinate error."],
                  ["maj5", "Majority of 5 × 5 cells (150 m)", ""],
                  ["maj11", "Majority of 11 × 11 cells (330 m)", "Roughly the area a crew samples within."],
                  ["maj35", "Majority of 35 × 35 cells (about 1 km)", "Describes the landscape rather than the site."]] },
      { id: "q4", title: "What label does a station on a non-burnable cell get?", evidence: "e4",
        why: `${fmt(+sup.stations_nonburnable_latest)} stations sit on a non-burnable cell in ${latest} FBFM40 (urban, agriculture, water or bare ground), and ${fmt(+sup.nonburnable_with_live)} of them record live plant species. Non-burnable has no fuel moisture to predict, so these stations need a fallback. For ${fmt(+sup.nearest_burnable_within_100m)} of them a burnable cell lies within 100 m, and ${fmt(+sup.nonburnable_no_burnable_in_2km)} have none within 2 km.`,
        options: [["nearest", "The nearest burnable cell, if it is within the distance set below", "Keeps LANDFIRE as the source; the station is assumed to be sampling the vegetation next to the road or building it sits on."],
                  ["window", "The most common burnable class in the window chosen in question 3 (or 35 × 35 when the single cell is chosen)", "Describes the surroundings rather than the nearest patch."],
                  ["species", "The class the station's reported species map to", "Trusts the crew's own description of what they sample over the map."],
                  ["exclude", "Exclude the station from training", "Loses the station and its readings."]],
        extra: { key: "q4d", label: "Maximum distance for the nearest burnable cell", options: [["50", "50 m (adjacent cell only)"], ["100", "100 m"], ["300", "300 m"], ["1000", "1 km"]] } },
      { id: "q5", title: "When the station's reported species disagree with its LANDFIRE label, which wins?", evidence: "e5",
        why: `Crews name what they sample. Under the species mapping on the FEMS tab, a station's species can fall in a different category from its cell: most often a shrub species on a tree cell (sampling understory) or on a grass cell. No California station reports a grass fuel at all, so a grass cell can never agree with its station. The evidence section counts every combination.`,
        options: [["landfire", "The LANDFIRE label wins", "The model is trained to the map it will predict on, and the mismatch is treated as noise."],
                  ["species", "The reported species win", "Labels follow the sampled plant, so grass cells never produce a label and understory shrubs become shrub."],
                  ["grass_species", "LANDFIRE wins except on grass cells, where the species win", "Keeps the map except where it names a class no station samples."],
                  ["exclude", "Exclude stations whose species disagree", "Keeps only clean agreements; the evidence section says how many that leaves."]] },
      { id: "q6", title: "A station that samples several species: one label or one per reading?", evidence: "e6",
        why: `${fmt(+sup.multi_species_stations)} stations report more than one species, and ${fmt(+sup.shrub_and_tree_stations)} report both a shrub and a tree. A single station label ignores that; a per-reading label needs the species mapping for every reading.`,
        options: [["station", "One label per station, from LANDFIRE", "The reading's species is a feature, not the label."],
                  ["reading", "Each reading labelled by its own species", "The station label from the questions above becomes the fallback for dead fuels and unmapped species."],
                  ["split", "Split such stations into one virtual station per species", "Each gets the LANDFIRE label unless the species disagrees, resolved by question 5."]] },
      { id: "q7", title: "Several stations in one 30 m cell: merge them?", evidence: "e7",
        why: `${fmt(+sup.colocated_stations)} stations share a cell with another, in ${fmt(+sup.shared_cells)} cells; usually a New Growth and an Old Growth site of one plant, sometimes different species at one point. They always get the same LANDFIRE label.`,
        options: [["merge", "Merge them into one site per cell", "One site, all readings, one label."],
                  ["separate", "Keep them separate with identical labels", "Preserves the station identity; identical inputs with different sites."]] },
      { id: "q8", title: "Stations that report only dead fuels: do they need a fuel label?", evidence: "e8",
        why: `${fmt(+sup.dead_only_stations)} stations report only dead size classes (1-hour to 1000-hour, duff) and name no plant. Dead fuel moisture responds to weather rather than to the fuel model, so the label may not matter for them.`,
        options: [["landfire", "Label them from LANDFIRE like any other station", "They enter every class they land on."],
                  ["exclude", "Exclude them from the live-fuel model", "They stay available for a dead-fuel model."],
                  ["independent", "Give them no fuel label", "Dead fuel moisture is modelled without a fuel class."]] },
      { id: "q9", title: "Classes that no station samples: predict them or not?", evidence: "e1",
        why: `The model is to predict everywhere in California, but some classes have no training station. Under the categories from FBFM40, grass covers ${pct(cs.cat_from_40.find(r => r.class === "grass").area_share)} of the state and ${fmt(cs.cat_from_40.find(r => r.class === "grass").stations_on_cell)} stations sit on it, yet none reports a grass fuel; slash covers ${pct(cs.cat_from_40.find(r => r.class === "slash").area_share, 2)} with no station.`,
        options: [["predict", "Predict them anyway", "The model extrapolates from the nearest sampled classes; say so in the output."],
                  ["merge", "Fold them into the nearest sampled class", "Grass cells are predicted as the class the expert names (for example shrub), and the output says so."],
                  ["mask", "Mask them out of the prediction map", "No prediction where no station could have trained it."]] },
    ];
  }

  /* ---------- the decision engine ---------- */
  function engine(X, a) {
    const raw = RAW[a.q1], product = PRODUCT[a.q1];
    const CTX = X.ctx[product];
    const releases = X.releases;
    const latest = releases[releases.length - 1];
    const catOf = code => X.codeCat[product][code] || (code === "nodata" ? "nodata" : "");
    const size = a.q3 === "cell" ? 35 : +a.q3.slice(3);
    const speciesLabel = s => {
      const vals = raw ? split(product === "FBFM40" ? s.species_fbfm40 : s.species_fbfm13) : split(s.categories);
      const u = [...new Set(vals)];
      return { label: u.join(SEP), cat: raw ? [...new Set(u.map(catOf))].join(SEP) : u.join(SEP), multiple: u.length > 1 };
    };
    const base = (row, support) => {
      const code = support === "cell" ? row.cell_code : row[`${support}_code`];
      const cat = support === "cell" ? row.cell_category : row[`${support}_category`];
      return raw ? { label: S(code), cat: catOf(S(code)) || S(cat) } : { label: S(cat), cat: S(cat) };
    };
    const one = (s, rel) => {
      const row = CTX[rel][s.site_id];
      const out = { site_id: s.site_id, station: S(s.site_name), release: rel, label: "", category: "", source: "", excluded: false, reason: "", flags: [] };
      if (!row) { out.excluded = true; out.reason = "no LANDFIRE context"; return out; }
      let b = base(row, a.q3), source = a.q3 === "cell" ? "cell" : `majority ${size}×${size}`;
      if (a.q2 === "burnable_release" && !BURNABLE.includes(b.cat)) {
        for (let i = releases.length - 1; i >= 0; i--) {
          const r2 = CTX[releases[i]][s.site_id]; const b2 = r2 ? base(r2, a.q3) : null;
          if (b2 && BURNABLE.includes(b2.cat)) { b = b2; source = `${source}, ${releases[i].replace("_", " ")} (cell burnable there)`; out.release = releases[i]; out.flags.push("older release"); break; }
        }
      }
      if (!BURNABLE.includes(b.cat)) {
        out.flags.push(b.cat === "nodata" ? "no data" : "non-burnable cell");
        if (a.q4 === "nearest") {
          const d = row.nearest_burnable_m === "" ? null : +row.nearest_burnable_m;
          if (d != null && d <= +a.q4d) { b = raw ? { label: S(row.nearest_burnable_code), cat: S(row.nearest_burnable_category) } : { label: S(row.nearest_burnable_category), cat: S(row.nearest_burnable_category) }; source = `nearest burnable cell (${fmt(d)} m)`; }
          else { out.excluded = true; out.reason = `no burnable cell within ${a.q4d} m`; }
        } else if (a.q4 === "window") {
          const dom = S(row[`dom${size}_burnable`]);
          if (dom === "none") { out.excluded = true; out.reason = `no burnable cell in the ${size}×${size} window`; }
          else { b = raw ? { label: S(row[`dom${size}_burnable_code`]), cat: dom } : { label: dom, cat: dom }; source = `dominant burnable class in ${size}×${size} window`; }
        } else if (a.q4 === "species") {
          if (isTrue(s.dead_only)) { out.excluded = true; out.reason = "non-burnable cell and no species reported"; }
          else { const sp = speciesLabel(s); b = { label: sp.label, cat: sp.cat }; source = "reported species"; if (sp.multiple) out.flags.push("several species"); }
        } else { out.excluded = true; out.reason = "non-burnable cell"; }
      }
      if (!out.excluded && !isTrue(s.dead_only) && source !== "reported species") {
        const cats = split(s.categories);
        if (cats.length && !cats.includes(b.cat)) {
          out.flags.push("species disagree");
          if (a.q5 === "species" || (a.q5 === "grass_species" && b.cat === "grass")) { const sp = speciesLabel(s); b = { label: sp.label, cat: sp.cat }; source = "reported species"; if (sp.multiple) out.flags.push("several species"); }
          else if (a.q5 === "exclude") { out.excluded = true; out.reason = "reported species disagree with the LANDFIRE label"; }
        } else if (cats.length && cats.length > 1) out.flags.push("species partly agree");
      }
      if (isTrue(s.dead_only)) {
        out.flags.push("dead fuels only");
        if (a.q8 === "exclude") { out.excluded = true; out.reason = "dead fuels only"; }
        else if (a.q8 === "independent") { b = { label: "none needed", cat: "" }; source = "dead fuels need no fuel label"; }
      }
      if (!out.excluded) { out.label = b.label; out.category = b.cat; out.source = source; }
      return out;
    };
    const rows = X.stations.map(s => {
      const rel = a.q2 === "matched" ? (X.yearRel[s.last_year] || latest) : latest;
      const r = one(s, rel);
      if (a.q2 === "matched") {
        const rels = [...new Set(X.years[s.site_id].map(y => X.yearRel[y]).filter(Boolean))];
        const labels = rels.map(x => one(s, x)).map(o => o.excluded ? "excluded" : o.label);
        r.by_release = rels.map((x, i) => `${x.replace("_", " ")}: ${labels[i]}`).join(SEP);
        if (new Set(labels).size > 1) r.flags.push("label varies by reading year");
      }
      r.merged_cell = a.q7 === "merge" && +s.colocated_with > 0 ? S(s.cell_key) : "";
      if (+s.colocated_with > 0) r.flags.push(a.q7 === "merge" ? "merged with co-located" : "co-located");
      r.flags = r.flags.join(SEP);
      return r;
    });
    return rows;
  }

  /* ---------- downloads ---------- */
  function download(name, text, type = "text/plain") {
    const a = h("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a); a.click(); a.remove();
  }
  const csvText = rows => { const cols = Object.keys(rows[0] || {}); const q = v => { const s = S(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }; return [cols.join(","), ...rows.map(r => cols.map(c => q(r[c])).join(","))].join("\n"); };

  /* ---------- page ---------- */
  return async (view, INDEX) => {
    const [stations, sumRows, yr, meas, m40, m13] = await Promise.all([csv("alignment/stations.csv"), csv("alignment/summary.csv"), csv("alignment/year_release.csv"), csv("stations/measurements.csv"), csv("landfire/mapping_FBFM40.csv"), csv("landfire/mapping_FBFM13.csv")]);
    const summary = Object.fromEntries(sumRows.map(r => [r.key, r.value]));
    const releases = S(summary.releases).split(SEP);
    const X = { stations, summary, releases, yearRel: Object.fromEntries(yr.map(r => [+r.year, r.matched_release])), years: {}, ctx: {}, codeCat: {}, classSupport: {} };
    for (const r of meas) (X.years[r.site_id] ||= []).push(+r.year);
    for (const [p, m] of [["FBFM40", m40], ["FBFM13", m13]]) X.codeCat[p] = Object.fromEntries(m.map(r => [S(r.abbrev), S(r.category)]));
    for (const p of ["FBFM40", "FBFM13"]) { X.ctx[p] = {}; for (const rel of releases) X.ctx[p][rel] = Object.fromEntries((await csv(`alignment/context_${rel}_${p}.csv`)).map(r => [r.site_id, r])); }
    for (const sc of ["FBFM40", "FBFM13", "cat_from_40", "cat_from_13"]) X.classSupport[sc] = await csv(`alignment/class_support_${sc}.csv`);
    const latest = releases[releases.length - 1];
    const a = ui.align_answers ||= loadAnswers();
    const Q = questions(X);

    view.append(h("h1", {}, "Alignment: how every FEMS station gets a LANDFIRE fuel label"),
      h("p", { class: "lede" }, `The fuel-moisture model needs one fuel label per station, taken from LANDFIRE wherever possible. The ${fmt(+summary.stations)} California stations do not all sit cleanly on a burnable cell of the class they sample, so nine decisions are needed. Each question below states the decision, the numbers that bear on it, and the options; the evidence sections further down hold the full tables. Answers are kept in this browser, and the preview applies them to every station at once. Download the answer sheet and the station assignment when done.`),
      toc([["al-q", "Questions"], ["al-preview", "What the answers imply"], ["e1", "E1 class support"], ["e2", "E2 releases"], ["e3", "E3 spatial support"], ["e4", "E4 non-burnable"], ["e5", "E5 species vs cell"], ["e6", "E6 several species"], ["e7", "E7 co-located"], ["e8", "E8 dead only"]]));

    /* answer sheet */
    const status = h("span", { class: "muted" });
    const reviewer = h("input", { type: "text", placeholder: "your name (optional)", value: a.reviewer || "" });
    reviewer.addEventListener("input", () => { a.reviewer = reviewer.value; saveAnswers(a); });
    let assignment = [];
    const sheet = h("div", { class: "sheet" }, h("b", {}, "Answer sheet"), reviewer, status,
      h("button", { onclick: () => download(`alignment_answers_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ saved: new Date().toISOString(), reviewer: a.reviewer, built: INDEX.built, answers: Object.fromEntries(Q.map(q => [q.id, a[q.id]])), max_distance_m: a.q4d, notes: a.notes, counts: summarise(assignment) }, null, 1), "application/json") }, "Download answers (JSON)"),
      h("button", { class: "secondary", onclick: () => download(`station_assignment_${new Date().toISOString().slice(0, 10)}.csv`, csvText(assignment), "text/csv") }, "Download station assignment (CSV)"),
      h("button", { class: "secondary", onclick: () => { Object.assign(a, DEFAULTS); a.notes = {}; saveAnswers(a); FX.purge(); view.innerHTML = ""; window.PageAlignment(view, INDEX); } }, "Reset"));
    view.append(sheet);

    /* questions */
    view.append(h("h2", { id: "al-q" }, "The questions"));
    const previewBox = h("div", {});
    const redraw = () => { saveAnswers(a); drawPreview(); };
    for (const [i, q] of Q.entries()) {
      const opts = h("div", { class: "opts" });
      for (const [key, label, desc] of q.options) {
        const inp = h("input", { type: "radio", name: q.id, value: key });
        inp.checked = a[q.id] === key;
        inp.addEventListener("change", () => { a[q.id] = key; redraw(); });
        opts.append(h("label", {}, inp, h("div", {}, h("b", {}, label), desc ? h("span", {}, desc) : null)));
      }
      const ta = h("textarea", { placeholder: "notes, conditions, or a different answer" });
      ta.value = (a.notes || {})[q.id] || "";
      ta.addEventListener("input", () => { (a.notes ||= {})[q.id] = ta.value; saveAnswers(a); });
      const card = h("div", { class: "q", id: q.id }, h("h3", {}, `Question ${i + 1}. ${q.title}`), h("p", { class: "why", html: q.why }), opts);
      if (q.extra) {
        const sel = h("select");
        for (const [v, l] of q.extra.options) sel.append(h("option", { value: v }, l));
        sel.value = a[q.extra.key];
        sel.addEventListener("change", () => { a[q.extra.key] = sel.value; redraw(); });
        card.append(h("div", { class: "controls" }, h("label", {}, q.extra.label, sel)));
      }
      card.append(h("p", { class: "ev" }, "Evidence: ", h("a", { href: "#", onclick: e => { e.preventDefault(); document.getElementById(q.evidence)?.scrollIntoView({ behavior: "smooth" }); } }, q.evidence.toUpperCase())), ta);
      view.append(card);
    }

    /* preview */
    view.append(h("h2", { id: "al-preview" }, "What the current answers imply for every station"),
      note("Recomputed in the browser whenever an answer changes. The starting answers are only a starting point, not a recommendation. Questions 6 and 9 shape the model rather than the station label, so they appear in the downloaded answers but do not change this table."),
      previewBox);
    function summarise(rows) {
      const inc = rows.filter(r => !r.excluded);
      const by = (key, list) => { const m = {}; for (const r of list) m[r[key]] = (m[r[key]] || 0) + 1; return m; };
      return { stations: rows.length, labelled: inc.length, excluded: rows.length - inc.length, merged_cells: new Set(rows.filter(r => r.merged_cell).map(r => r.merged_cell)).size,
        by_label: by("label", inc), by_source: by("source", inc), by_reason: by("reason", rows.filter(r => r.excluded)) };
    }
    async function drawPreview() {
      previewBox.innerHTML = "";
      assignment = engine(X, a);
      window.__alignment = { answers: { ...a }, rows: assignment };
      const sm = summarise(assignment);
      status.textContent = `${fmt(sm.labelled)} labelled, ${fmt(sm.excluded)} excluded`;
      const inc = assignment.filter(r => !r.excluded);
      const flagged = assignment.filter(r => r.flags).length;
      const varies = assignment.filter(r => r.flags.includes("varies")).length;
      const srcGroup = s => s.startsWith("cell") || s.startsWith("majority") ? "LANDFIRE at the station" : s.startsWith("nearest") ? "nearest burnable cell" : s.startsWith("dominant") ? "window dominant class" : s.startsWith("reported") ? "reported species" : s.startsWith("dead") ? "no label needed" : "other";
      const pts = assignment.map(r => { const s = X.stations.find(x => x.site_id === r.site_id); return { lat: s.lat, lon: s.lon, group: r.excluded ? "excluded" : srcGroup(r.source), text: `<b>${esc(r.station)}</b><br>${r.excluded ? "Excluded: " + esc(r.reason) : esc(r.label) + " (" + esc(r.source) + ")"}${r.flags ? "<br>" + esc(r.flags) : ""}` }; });
      const map = chartDiv();
      await stationMap(map, pts, [
        { key: "LANDFIRE at the station", label: "LANDFIRE at the station", color: cssVar("--s1") },
        { key: "nearest burnable cell", label: "Nearest burnable cell", color: cssVar("--s4"), symbol: "diamond" },
        { key: "window dominant class", label: "Window dominant class", color: cssVar("--s7"), symbol: "diamond" },
        { key: "reported species", label: "Reported species", color: cssVar("--s3"), symbol: "square" },
        { key: "no label needed", label: "No label needed", color: cssVar("--muted"), symbol: "circle-open" },
        { key: "excluded", label: "Excluded", color: cssVar("--s8"), symbol: "x" },
      ]);
      const labelRows = Object.entries(sm.by_label).map(([l, n]) => ({ label: l, category: inc.find(r => r.label === l)?.category || "", stations: n, readings: inc.filter(r => r.label === l).reduce((t, r) => t + (+X.stations.find(x => x.site_id === r.site_id).readings), 0) })).sort((x, y) => y.stations - x.stations);
      const srcRows = Object.entries(sm.by_source).map(([s, n]) => ({ source: s, stations: n })).sort((x, y) => y.stations - x.stations);
      const exRows = Object.entries(sm.by_reason).map(([s, n]) => ({ reason: s, stations: n }));
      const cols = ["station", "label", "category", "source", "release", "flags", ...(a.q2 === "matched" ? ["by_release"] : []), "merged_cell", "reason"];
      const st = ui.align_table ||= { q: "", only: "all" };
      const tbox = h("div", {});
      const drawTable = () => {
        tbox.innerHTML = "";
        const q = st.q.trim().toLowerCase();
        const rows = assignment.filter(r => (st.only === "all" || (st.only === "excluded" ? r.excluded : st.only === "flagged" ? !!r.flags : !r.excluded)) && (!q || `${r.station} ${r.label} ${r.source} ${r.flags} ${r.reason}`.toLowerCase().includes(q)));
        tbox.append(table(rows.map(r => ({ ...r, release: S(r.release).replace("_", " ") })), { columns: cols, labels: { by_release: "label by reading-year release", merged_cell: "merged cell", release: "release used" }, wrap: ["flags", "by_release", "source", "reason", "label"], sort: "station", asc: true, maxHeight: "560px" }),
          h("div", { class: "tablefoot" }, `${fmt(rows.length)} rows`, h("a", { href: "#", onclick: e => { e.preventDefault(); download("station_assignment.csv", csvText(assignment), "text/csv"); } }, "download this assignment as CSV")));
      };
      drawTable();
      previewBox.append(
        tiles(tile("Stations labelled", fmt(sm.labelled), `of ${fmt(sm.stations)}`), tile("Excluded", fmt(sm.excluded)), tile("With a flag to check", fmt(flagged)), tile("Distinct labels", fmt(labelRows.length), SCHEME_NAME[a.q1]), ...(a.q2 === "matched" ? [tile("Label varies by reading year", fmt(varies))] : []), ...(a.q7 === "merge" ? [tile("Co-located stations merged", fmt(assignment.filter(r => r.merged_cell).length), `into ${fmt(sm.merged_cells)} sites`)] : [])),
        note(`<strong>Rule in force.</strong> Label = ${esc(SCHEME_NAME[a.q1])} at ${esc(SUPPORT_NAME[a.q3])}, from ${a.q2 === "latest" ? "the latest release" : a.q2 === "matched" ? "the release nearest each reading's year (table shows the release of the last reading year)" : "the latest release, falling back to the newest release in which the cell is burnable"}. Non-burnable: ${a.q4 === "nearest" ? `nearest burnable cell within ${a.q4d} m` : a.q4 === "window" ? "dominant burnable class in the window" : a.q4 === "species" ? "the reported species" : "exclude"}. Species disagreement: ${a.q5 === "landfire" ? "LANDFIRE wins" : a.q5 === "species" ? "species win" : a.q5 === "grass_species" ? "LANDFIRE wins except on grass cells" : "exclude"}. Dead-only stations: ${a.q8 === "landfire" ? "labelled from LANDFIRE" : a.q8 === "exclude" ? "excluded" : "no label"}. Co-located: ${a.q7 === "merge" ? "merged" : "kept separate"}.`),
        h("div", { class: "row" }, panel(h("h3", {}, "Where each label comes from"), map),
          panel(h("h3", {}, "Stations per label"), table(labelRows, { maxHeight: "300px" }), h("h3", {}, "Stations per source"), table(srcRows, { wrap: ["source"], maxHeight: "none" }), exRows.length ? h("h3", {}, "Why stations are excluded") : null, exRows.length ? table(exRows, { wrap: ["reason"], maxHeight: "none" }) : null)),
        panel(h("h3", {}, "Every station"), controls(st, [{ key: "q", type: "text", label: "Search", placeholder: "station, label, source or flag" }, { key: "only", label: "Show", options: [["all", "All stations"], ["labelled", "Labelled"], ["flagged", "With a flag"], ["excluded", "Excluded"]] }], drawTable), tbox));
    }
    await drawPreview();

    /* ---------- evidence ---------- */
    await section(view, "e1", "E1. How many stations support each class",
      `<p><strong>What it shows.</strong> For each scheme, every class with its area share of California in ${esc(latest.replace("_", " "))}, the stations whose cell carries it, their readings, and the stations whose reported species map to it. Area is from the full LANDFIRE file; station counts use the single 30 m cell.</p>
       <p><strong>How to read it.</strong> A class with large area and no station is one the model must extrapolate to (question 9). A class with stations on its cell but no species mapped to it, such as grass, is sampled only by accident of location.</p>`,
      async body => {
        const st = ui.align_e1 ||= { scheme: "cat_from_40" };
        const box = h("div", {});
        const draw = () => {
          box.innerHTML = "";
          const rows = X.classSupport[st.scheme];
          const d = chartDiv();
          const tot = rows.reduce((t, r) => t + r.stations_on_cell, 0);
          plot(d, [{ type: "bar", name: "share of California area", x: rows.map(r => r.class), y: rows.map(r => 100 * r.area_share), marker: { color: cssVar("--axis") } },
                   { type: "bar", name: "share of stations (cell)", x: rows.map(r => r.class), y: rows.map(r => 100 * r.stations_on_cell / tot), marker: { color: cssVar("--s1") } }],
            { barmode: "group", margin: { l: 48, r: 8, t: 36, b: 60 }, xaxis: { type: "category", tickangle: rows.length > 12 ? -60 : 0 }, yaxis: { title: { text: "%" } } });
          box.append(d, table(rows.map(r => ({ ...r, area_share: pct(r.area_share, 2) })), { columns: ["class", "category", "area_share", "stations_on_cell", "readings_on_cell", "stations_reporting_species_mapped_here"], labels: { area_share: "area share", stations_on_cell: "stations on cell", readings_on_cell: "readings on cell", stations_reporting_species_mapped_here: "stations whose species map here" }, maxHeight: "480px" }), tablefoot(`alignment/class_support_${st.scheme}.csv`, rows.length));
        };
        draw();
        FX.fill(body, panel(controls(st, [{ key: "scheme", label: "Scheme", options: [["FBFM40", "FBFM40 codes"], ["FBFM13", "FBFM13 codes"], ["cat_from_40", "Categories from FBFM40"], ["cat_from_13", "Categories from FBFM13"]] }], draw), box));
      });

    await section(view, "e2", "E2. How station cells change between releases",
      `<p><strong>What it shows.</strong> The label at each station's single cell in every release, and how many stations change. The year table is the pipeline's matched-release convention.</p>
       <p><strong>How to read it.</strong> A station whose cell is non-burnable only in recent releases is a candidate for the fallback in question 2. Changes between burnable classes show how unstable a per-release label would be.</p>`,
      async body => {
        const stab = await csv("alignment/release_stability.csv");
        const st = ui.align_e2 ||= { scheme: "cat_from_40" };
        const box = h("div", {});
        const draw = () => {
          box.innerHTML = "";
          const rows = stab.filter(r => r.scheme === st.scheme);
          const changed = rows.filter(r => isTrue(r.changed));
          const seq = {}; for (const r of changed) seq[r.labels] = (seq[r.labels] || 0) + 1;
          const seqRows = Object.entries(seq).map(([k, n]) => ({ sequence: k, stations: n })).sort((x, y) => y.stations - x.stations);
          const names = Object.fromEntries(X.stations.map(s => [s.site_id, s.site_name]));
          box.append(tiles(tile("Stations whose label changes", fmt(changed.length), `of ${fmt(rows.length)}`), tile("Distinct change patterns", fmt(seqRows.length))),
            h("div", { class: "row" }, panel(h("h3", {}, `Most common sequences (${releases.map(r => r.replace("_", " ")).join(" → ")})`), table(seqRows.slice(0, 25), { wrap: ["sequence"], maxHeight: "420px" })),
              panel(h("h3", {}, "FEMS year to release"), table(yr.map(r => ({ year: r.year, matched: r.matched_release.replace("_", " "), fixed: r.fixed_release.replace("_", " ") })), { labels: { matched: "nearest release", fixed: "latest release" }, maxHeight: "none" }))),
            panel(h("h3", {}, "Every station"), table(changed.map(r => ({ station: names[r.site_id], labels: r.labels, distinct: r.n_distinct, first: r.first, last: r.last })), { wrap: ["labels"], sort: "station", asc: true, maxHeight: "480px" }), tablefoot("alignment/release_stability.csv", changed.length)));
        };
        draw();
        FX.fill(body, controls(st, [{ key: "scheme", label: "Scheme", options: [["FBFM40", "FBFM40 codes"], ["FBFM13", "FBFM13 codes"], ["cat_from_40", "Categories from FBFM40"], ["cat_from_13", "Categories from FBFM13"]] }], draw), box);
      });

    await section(view, "e3", "E3. How fragile the single cell is",
      `<p><strong>What it shows.</strong> For the chosen release and product: how often the majority of a window around the station differs from the cell itself, how pure each window is (the share of its cells in the cell's category), how many of the 8 neighbours differ, and how precise the station coordinates are.</p>
       <p><strong>Coordinates.</strong> A coordinate that is a whole number of arc-seconds was most likely recorded in degrees, minutes and seconds; one second is about 30 m of latitude and 25 m of longitude at this latitude, so the station may sit in any of the neighbouring cells.</p>`,
      async body => {
        const st = ui.align_e3 ||= { release: latest, product: "FBFM40" };
        const box = h("div", {});
        const draw = () => {
          box.innerHTML = "";
          const rows = Object.values(X.ctx[st.product][st.release]);
          const diff = SIZES.map(k => ({ window: `${k} × ${k}`, "majority category differs from cell": rows.filter(r => r[`maj${k}_category`] !== r.cell_category).length, "majority code differs from cell": rows.filter(r => r[`maj${k}_code`] !== r.cell_code).length, "median purity (category)": (() => { const v = rows.map(r => +r[`purity${k}_category`]).sort((x, y) => x - y); return v[Math.floor(v.length / 2)].toFixed(2); })() }));
          const nb = {}; for (const r of rows) nb[r.neighbours_differ_category] = (nb[r.neighbours_differ_category] || 0) + 1;
          const nbRows = Object.keys(nb).sort((x, y) => x - y).map(k => ({ "neighbours with a different category": k, stations: nb[k] }));
          const d = chartDiv("short");
          plot(d, SIZES.map(k => ({ type: "histogram", name: `${k} × ${k}`, x: rows.map(r => +r[`purity${k}_category`]), xbins: { start: 0, end: 1.0001, size: 0.1 }, opacity: 0.6 })), { barmode: "overlay", margin: { l: 48, r: 8, t: 36, b: 44 }, xaxis: { title: { text: "share of the window in the cell's category" } }, yaxis: { title: { text: "stations" } } });
          const both = X.stations.filter(s => isTrue(s.lat_seconds_rounded) && isTrue(s.lon_seconds_rounded)).length;
          const dec = {}; for (const s of X.stations) { const k = Math.min(+s.lat_decimals, +s.lon_decimals); dec[k] = (dec[k] || 0) + 1; }
          box.append(h("div", { class: "row" }, panel(h("h3", {}, "Window majority against the cell"), table(diff, { maxHeight: "none" }), h("h3", {}, "Neighbours that differ"), table(nbRows, { maxHeight: "none" })),
            panel(h("h3", {}, "Window purity"), d, h("h3", {}, "Coordinate precision"), note(`${fmt(both)} of ${fmt(X.stations.length)} stations have both coordinates at whole arc-seconds.`), table(Object.keys(dec).sort((x, y) => x - y).map(k => ({ "decimal places (fewer of lat, lon)": k, stations: dec[k] })), { maxHeight: "none" }))),
            panel(h("h3", {}, "Every station"), table(rows.map(r => ({ station: X.stations.find(s => s.site_id === r.site_id).site_name, cell: r.cell_code, ...Object.fromEntries(SIZES.map(k => [`maj ${k}`, r[`maj${k}_code`]])), ...Object.fromEntries(SIZES.map(k => [`purity ${k}`, +r[`purity${k}_category`]])), "neighbours differ": r.neighbours_differ_category })), { sort: "station", asc: true, maxHeight: "480px" }), tablefoot(`alignment/context_${st.release}_${st.product}.csv`, rows.length)));
        };
        draw();
        FX.fill(body, controls(st, [{ key: "release", label: "Release", options: releases.map(r => [r, r.replace("_", " ")]) }, { key: "product", label: "Product", options: [["FBFM40", "FBFM40"], ["FBFM13", "FBFM13"]] }], draw), box);
      });

    await section(view, "e4", "E4. Stations on non-burnable cells and their fallbacks",
      `<p><strong>What it shows.</strong> Every station whose cell is non-burnable in the chosen release and product, with each candidate fallback side by side: the nearest burnable cell and its distance, the dominant burnable class of each window, and the class its reported species map to. The last columns say whether those candidates agree.</p>`,
      async body => {
        const st = ui.align_e4 ||= { release: latest, product: "FBFM40" };
        const box = h("div", {});
        const draw = () => {
          box.innerHTML = "";
          const sMap = Object.fromEntries(X.stations.map(s => [s.site_id, s]));
          const rows = Object.values(X.ctx[st.product][st.release]).filter(r => r.cell_category === "nonburnable").map(r => {
            const s = sMap[r.site_id], cats = split(s.categories);
            return { station: s.site_name, cell: r.cell_code, species: s.species, "species category": s.categories, "nearest burnable": r.nearest_burnable_code, "distance m": r.nearest_burnable_m === "" ? null : +r.nearest_burnable_m, "nearest category": r.nearest_burnable_category,
              ...Object.fromEntries(SIZES.map(k => [`dominant ${k}`, r[`dom${k}_burnable`]])), "nearest agrees with species": cats.length ? (cats.includes(r.nearest_burnable_category) ? "yes" : "no") : "no species", "35×35 agrees with species": cats.length ? (cats.includes(r.dom35_burnable) ? "yes" : "no") : "no species" };
          });
          const dist = rows.map(r => r["distance m"]).filter(v => v != null);
          const d = chartDiv("short");
          plot(d, [{ type: "histogram", x: dist, xbins: { start: 0, end: Math.max(...dist, 100) + 30, size: 30 }, marker: { color: cssVar("--s1") }, hovertemplate: "%{x} m: %{y} stations<extra></extra>" }], { margin: { l: 48, r: 8, t: 8, b: 44 }, xaxis: { title: { text: "distance to the nearest burnable cell (m)" } }, yaxis: { title: { text: "stations" } } });
          const agree = k => rows.filter(r => r[k] === "yes").length, withSp = rows.filter(r => r["nearest agrees with species"] !== "no species").length;
          box.append(tiles(tile("On a non-burnable cell", fmt(rows.length)), tile("Nearest burnable agrees with species", fmt(agree("nearest agrees with species")), `of ${fmt(withSp)} with species`), tile("35 × 35 dominant agrees with species", fmt(agree("35×35 agrees with species")), `of ${fmt(withSp)}`)),
            panel(h("h3", {}, "Distance to the nearest burnable cell"), d),
            panel(h("h3", {}, "Every such station"), table(rows, { wrap: ["species", "species category"], sort: "station", asc: true, maxHeight: "560px" }), tablefoot(`alignment/context_${st.release}_${st.product}.csv`, rows.length)));
        };
        draw();
        FX.fill(body, controls(st, [{ key: "release", label: "Release", options: releases.map(r => [r, r.replace("_", " ")]) }, { key: "product", label: "Product", options: [["FBFM40", "FBFM40"], ["FBFM13", "FBFM13"]] }], draw), box);
      });

    await section(view, "e5", "E5. Reported species against the LANDFIRE cell",
      `<p><strong>What it shows.</strong> For the chosen release and product, the cell's category against the set of categories the station's reported species map to, and the list of stations where none of its species agrees with the cell. Purity is the share of the 35 × 35 window in the cell's category: a low value with shrub species on a tree cell suggests a mixed stand rather than a wrong map.</p>`,
      async body => {
        const st = ui.align_e5 ||= { release: latest, product: "FBFM40" };
        const box = h("div", {});
        const draw = () => {
          box.innerHTML = "";
          const sMap = Object.fromEntries(X.stations.map(s => [s.site_id, s]));
          const rows = Object.values(X.ctx[st.product][st.release]);
          const xt = {};
          for (const r of rows) { const s = sMap[r.site_id]; const k = s.categories || "(no species)"; (xt[r.cell_category] ||= {})[k] = ((xt[r.cell_category] || {})[k] || 0) + 1; }
          const keys = [...new Set(rows.map(r => sMap[r.site_id].categories || "(no species)"))].sort();
          const xRows = CATS.concat("nodata").filter(c => xt[c]).map(c => ({ "cell category": c, ...Object.fromEntries(keys.map(k => [k, xt[c][k] || 0])), total: Object.values(xt[c]).reduce((a, b) => a + b, 0) }));
          const dis = rows.filter(r => { const c = split(sMap[r.site_id].categories); return c.length && BURNABLE.includes(r.cell_category) && !c.includes(r.cell_category); }).map(r => { const s = sMap[r.site_id]; return { station: s.site_name, cell: r.cell_code, "cell category": r.cell_category, species: s.species, "species category": s.categories, "purity 35": +r.purity35_category, "dominant 35": r.dom35_burnable }; });
          box.append(tiles(tile("Burnable cell, species disagree", fmt(dis.length), `of ${fmt(rows.filter(r => BURNABLE.includes(r.cell_category) && split(sMap[r.site_id].categories).length).length)} burnable with species`), tile("Shrub species on a tree cell", fmt(dis.filter(r => r["cell category"] === "tree" && r["species category"] === "shrub").length)), tile("Any species on a grass cell", fmt(rows.filter(r => r.cell_category === "grass" && split(sMap[r.site_id].categories).length).length))),
            panel(h("h3", {}, "Cell category against the station's species categories"), table(xRows, { maxHeight: "none" })),
            panel(h("h3", {}, "Stations whose species disagree with a burnable cell"), table(dis, { wrap: ["species"], sort: "station", asc: true, maxHeight: "560px" })));
        };
        draw();
        FX.fill(body, controls(st, [{ key: "release", label: "Release", options: releases.map(r => [r, r.replace("_", " ")]) }, { key: "product", label: "Product", options: [["FBFM40", "FBFM40"], ["FBFM13", "FBFM13"]] }], draw), box);
      });

    await section(view, "e6", "E6. Stations that sample several species",
      `<p><strong>What it shows.</strong> How many species each station reports and which category mixes occur. New Growth and Old Growth of one plant count as one species.</p>`,
      body => {
        const n = {}; for (const s of X.stations) n[s.n_species] = (n[s.n_species] || 0) + 1;
        const mix = {}; for (const s of X.stations) { const k = s.categories || "(dead only)"; mix[k] = (mix[k] || 0) + 1; }
        FX.fill(body, h("div", { class: "row" }, panel(h("h3", {}, "Species per station"), table(Object.keys(n).sort((x, y) => x - y).map(k => ({ species: k, stations: n[k] })), { maxHeight: "none" })),
          panel(h("h3", {}, "Category mix"), table(Object.entries(mix).map(([k, v]) => ({ categories: k, stations: v })).sort((x, y) => y.stations - x.stations), { maxHeight: "none" }))),
          panel(h("h3", {}, "Stations with more than one species"), table(X.stations.filter(s => +s.n_species > 1).map(s => ({ station: s.site_name, species: s.species, categories: s.categories, "closest FBFM40": s.species_fbfm40 })), { wrap: ["species", "closest FBFM40"], sort: "station", asc: true, maxHeight: "480px" }), tablefoot("alignment/stations.csv", X.stations.filter(s => +s.n_species > 1).length)));
      });

    await section(view, "e7", "E7. Stations that share a cell",
      `<p><strong>What it shows.</strong> Every 30 m cell holding more than one station, the stations in it, and whether they report the same species.</p>`,
      async body => {
        const co = await csv("alignment/colocated.csv");
        FX.fill(body, panel(table(co.map(r => ({ cell: r.cell_key, stations: r.stations, names: r.names, species: r.species, "same species": isTrue(r.same_species) ? "yes" : "no" })), { wrap: ["names", "species"], sort: "stations", maxHeight: "480px" }), tablefoot("alignment/colocated.csv", co.length)));
      });

    await section(view, "e8", "E8. Stations that report only dead fuels",
      `<p><strong>What it shows.</strong> The stations with no live species, what they report, and the cell they sit on in ${esc(latest.replace("_", " "))} FBFM40.</p>`,
      body => {
        const c = X.ctx.FBFM40[latest];
        const rows = X.stations.filter(s => isTrue(s.dead_only)).map(s => ({ station: s.site_name, "dead fuels": s.dead_fuels, readings: +s.readings, years: `${s.first_year} to ${s.last_year}`, cell: c[s.site_id]?.cell_code, "cell category": c[s.site_id]?.cell_category }));
        FX.fill(body, panel(table(rows, { wrap: ["dead fuels"], sort: "station", asc: true, maxHeight: "none" })));
      });
  };
})();
