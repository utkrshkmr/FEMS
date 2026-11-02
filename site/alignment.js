/* Page 4: Alignment. Questions for the human expert on how every FEMS station gets a LANDFIRE fuel label, the
   probable form of each answer, and the supporting EDAs. Three tests are assumed throughout: the category
   ("uber level"), FBFM13 and FBFM40. The station's cell is always the single 30 m LANDFIRE cell. Answers are free
   text, kept in this browser (localStorage) and downloadable; nothing is sent anywhere. */
window.PageAlignment = (() => {
  "use strict";
  const { h, panel, note, csv, fmt, pct, table, tablefoot, controls, ui, chartDiv, plot, section, toc, tiles, tile, cssVar, isTrue, stationMap, esc } = FX;
  const S = v => String(v ?? "");
  const SEP = "; ";
  const split = v => S(v) ? S(v).split(SEP) : [];
  const BURNABLE = ["grass", "shrub", "tree", "slash"];
  const CATS = ["nonburnable", "grass", "shrub", "tree", "slash"];
  const TESTS = [["cat40", "Category (uber level)", "FBFM40", false, "cat_from_40"], ["fbfm13", "FBFM13", "FBFM13", true, "FBFM13"], ["fbfm40", "FBFM40", "FBFM40", true, "FBFM40"]];
  const TEST = Object.fromEntries(TESTS.map(t => [t[0], { name: t[1], product: t[2], raw: t[3], scheme: t[4] }]));
  const CONV = { fixed: "the latest file for every reading", nearest: "the file whose year is nearest the reading's year", before: "the latest file available at or before the reading's year" };
  const STORE = "fireset-alignment-answers-v2";
  const loadAnswers = () => { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch (e) { return {}; } };
  const saveAnswers = a => { try { localStorage.setItem(STORE, JSON.stringify(a)); } catch (e) { /* ignore */ } };
  function download(name, text, type = "text/plain") {
    const a = h("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a); a.click(); a.remove();
  }
  const csvText = rows => { const cols = Object.keys(rows[0] || {}); const q = v => { const s = S(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }; return [cols.join(","), ...rows.map(r => cols.map(c => q(r[c])).join(","))].join("\n"); };

  /* ---------- the questions ---------- */
  function questions(X) {
    const s = X.summary, cs = X.classSupport, latest = S(s.latest_release).replace("_", " ");
    const first = S(s.releases).split(SEP)[0].replace("_", " ");
    const none = scheme => cs[scheme].filter(r => r.stations_on_cell === 0);
    const noneArea = scheme => none(scheme).reduce((t, r) => t + r.area_share, 0);
    const few = scheme => cs[scheme].filter(r => r.stations_on_cell > 0 && r.stations_on_cell < 5).length;
    const vary = conv => TESTS.map(t => `${fmt(X.varies[t[0]][conv])} under ${t[1]}`).join(", ");
    return [
      { id: "q1", title: "Which LANDFIRE file labels a reading: a fixed file, or the file that goes with the reading's year?", evidence: "e1",
        text: `LANDFIRE releases are snapshots (${S(s.releases).split(SEP).map(r => r.replace("_", " ")).join(", ")}), and FEMS readings run from 2015. Between ${first} and ${latest} the label at a station's cell changes for ${fmt(+s.class_changed_across_releases_cat40)} of ${fmt(+s.stations)} stations under the category test and ${fmt(+s.class_changed_across_releases_fbfm40)} under FBFM40. If the file follows the reading's year, a station's label and its fallback can change from year to year: the stations whose label varies across their own reading years number ${vary("nearest")} when the nearest file is used, and ${vary("before")} when the latest file available before the reading is used.`,
        answer: `One of: fixed latest file (${latest}); nearest file by year; latest file available at or before the reading's year; or a year-to-file table of your own. If dynamic, whether the fallback rules below are re-applied per file.` },
      { id: "q2", title: "What label does a station on a non-burnable 30 m cell get?", evidence: "e2",
        text: `In ${latest} FBFM40, ${fmt(+s.stations_nonburnable_latest)} stations sit on a non-burnable cell (urban, agriculture, water or bare ground) and ${fmt(+s.nonburnable_with_live)} of them record live plant species. Non-burnable has no fuel moisture to predict. For ${fmt(+s.nearest_burnable_within_100m)} of these stations a burnable cell lies within 100 m, ${fmt(+s.nearest_burnable_within_500m)} within 500 m, and ${fmt(+s.nonburnable_no_burnable_in_2km)} have none within 2 km. Under a dynamic file the set of such stations changes with the file.`,
        answer: `A fallback rule and its limit: for example "the nearest burnable cell if within N m, otherwise the class the reported species map to, otherwise exclude", with N. Whether the same rule holds for all three tests.` },
      { id: "q3", title: "When a station's reported species disagree with its LANDFIRE cell, which wins?", evidence: "e3",
        text: `Crews name the plant they sample. Under the species mapping (question 9), ${fmt(X.disagree.n)} of the ${fmt(X.disagree.of)} stations on a burnable cell with species report no species in the cell's category (${latest} FBFM40): ${fmt(X.disagree.shrubOnTree)} are shrub species on a tree cell, which can be understory sampling, and ${fmt(X.disagree.onGrass)} are stations on a grass cell, a class no California station samples at all.`,
        answer: `A rule such as "LANDFIRE wins", "species win", "LANDFIRE wins except on grass cells", or "exclude", possibly different per test (at FBFM40 code level almost every station disagrees, see E3).` },
      { id: "q4", title: "A station that samples several species: one label per station, or one per reading?", evidence: "e4",
        text: `${fmt(+s.multi_species_stations)} stations report more than one species, and ${fmt(+s.shrub_and_tree_stations)} report both a shrub and a tree. A single station label ignores that; a per-reading label needs the species mapping for every reading and makes the station label only a fallback.`,
        answer: `Per station or per reading; if per reading, what a reading gets when its species disagrees with the cell.` },
      { id: "q5", title: "Several stations in one 30 m cell: merge them into one site?", evidence: "e5",
        text: `${fmt(+s.colocated_stations)} stations share a cell with another, in ${fmt(+s.shared_cells)} cells; usually a New Growth and an Old Growth site of one plant, sometimes different species at one point. They always carry the same LANDFIRE label.`,
        answer: `Merge or keep separate; if merged, whether different species at one point are kept apart.` },
      { id: "q6", title: "Stations that report only dead fuels: do they need a fuel label at all?", evidence: "e6",
        text: `${fmt(+s.dead_only_stations)} stations report only dead size classes (1-hour to 1000-hour, duff) and name no plant, and ${fmt(X.deadReadings)} readings in total are dead fuels across all stations. Dead fuel moisture follows weather more than the fuel model.`,
        answer: `Whether dead readings take the station's LANDFIRE label, no label, or are modelled separately.` },
      { id: "q7", title: "Classes that no station samples: predict them, fold them into another class, or mask them?", evidence: "e7",
        text: `The model is to predict everywhere in California. Under the category test, grass covers ${pct(cs.cat_from_40.find(r => r.class === "grass").area_share, 1)} of the state with ${fmt(cs.cat_from_40.find(r => r.class === "grass").stations_on_cell)} stations on it but no station reporting a grass fuel, and slash covers ${pct(cs.cat_from_40.find(r => r.class === "slash").area_share, 2)} with none. Under FBFM13, ${fmt(none("FBFM13").length)} classes have no station (${pct(noneArea("FBFM13"), 2)} of the state) and ${fmt(few("FBFM13"))} have fewer than 5; under FBFM40, ${fmt(none("FBFM40").length)} have none (${pct(noneArea("FBFM40"), 2)}) and ${fmt(few("FBFM40"))} have fewer than 5.`,
        answer: `Per test, a list of classes to predict as-is, to fold into a named class, or to mask; and the minimum number of stations a class needs to be trained.` },
      { id: "q8", title: "Station coordinates are uncertain by about one cell: accept the cell as-is, or flag fragile stations?", evidence: "e8",
        text: `${fmt(+s.seconds_rounded_both)} of ${fmt(+s.stations)} stations have coordinates that are whole arc-seconds, about 30 m, which is one cell. For ${fmt(+s.neighbours_differ_any)} stations at least one of the 8 surrounding cells has a different category, and for ${fmt(X.neighboursDifferCode)} a different FBFM40 code. The cell itself stays the 30 m LANDFIRE cell; the question is what to do with stations whose label would change if they moved one cell.`,
        answer: `Accept as-is; or flag, down-weight or exclude stations with a given number of differing neighbours; or correct named stations by hand.` },
      { id: "q9", title: "Is the species-to-fuel-model mapping right?", evidence: "e9",
        text: `Every rule that lets the reported species decide depends on a hand-made table assigning each of the ${fmt(X.mappingLive)} live fuels FEMS reports to a closest FBFM13 code, a closest FBFM40 code and a category, drawn from the fuel model descriptions. ${fmt(X.mappingInferred)} rows are inferred from growth form rather than named by the sources.`,
        answer: `Corrections to specific rows of the table (fuel, new code or category), or confirmation.` },
    ];
  }

  /* ---------- the rule explorer engine ---------- */
  function engine(X, r) {
    const T = TEST[r.test], CTX = X.ctx[T.product], releases = X.releases, latest = releases[releases.length - 1];
    const catOf = code => X.codeCat[T.product][code] || (code === "nodata" ? "nodata" : "");
    const speciesLabel = s => {
      const u = [...new Set(T.raw ? split(T.product === "FBFM40" ? s.species_fbfm40 : s.species_fbfm13) : split(s.categories))];
      return { label: u.join(SEP), cat: T.raw ? [...new Set(u.map(catOf))].join(SEP) : u.join(SEP), multiple: u.length > 1 };
    };
    const nearest = row => T.raw ? { label: S(row.nearest_burnable_code), cat: S(row.nearest_burnable_category) } : { label: S(row.nearest_burnable_category), cat: S(row.nearest_burnable_category) };
    const one = (s, rel) => {
      const row = CTX[rel][s.site_id];
      const out = { site_id: s.site_id, station: S(s.site_name), release: rel, label: "", category: "", source: "", excluded: false, reason: "", flags: [] };
      let b = T.raw ? { label: S(row.cell_code), cat: catOf(S(row.cell_code)) || S(row.cell_category) } : { label: S(row.cell_category), cat: S(row.cell_category) };
      let source = "cell";
      if (!BURNABLE.includes(b.cat)) {
        out.flags.push(b.cat === "nodata" ? "no data" : "non-burnable cell");
        const d = row.nearest_burnable_m === "" ? null : +row.nearest_burnable_m;
        const near = d != null && d <= +r.nbd;
        if ((r.nb === "nearest" || r.nb === "nearest_species") && near) { b = nearest(row); source = `nearest burnable cell (${fmt(d)} m)`; }
        else if ((r.nb === "nearest_species" || r.nb === "species") && !isTrue(s.dead_only)) { const sp = speciesLabel(s); b = { label: sp.label, cat: sp.cat }; source = "reported species"; if (sp.multiple) out.flags.push("several species"); }
        else { out.excluded = true; out.reason = r.nb === "exclude" ? "non-burnable cell" : (r.nb === "nearest" ? `no burnable cell within ${r.nbd} m` : "non-burnable cell and no species reported"); }
      }
      if (!out.excluded && !isTrue(s.dead_only) && source !== "reported species") {
        const own = T.raw ? split(T.product === "FBFM40" ? s.species_fbfm40 : s.species_fbfm13) : split(s.categories);
        const catAgree = split(s.categories).includes(b.cat);
        const agree = T.raw ? own.includes(b.label) : catAgree;
        if (own.length && !agree) {
          out.flags.push(T.raw && catAgree ? "species disagree on code, agree on category" : "species disagree");
          if (r.dis === "code" || !catAgree) {
            if (r.win === "species" || (r.win === "grass_species" && b.cat === "grass")) { const sp = speciesLabel(s); b = { label: sp.label, cat: sp.cat }; source = "reported species"; if (sp.multiple) out.flags.push("several species"); }
            else if (r.win === "exclude") { out.excluded = true; out.reason = "reported species disagree with the LANDFIRE label"; }
          }
        }
      }
      if (isTrue(s.dead_only)) {
        out.flags.push("dead fuels only");
        if (r.dead === "exclude") { out.excluded = true; out.reason = "dead fuels only"; }
        else if (r.dead === "none" && !out.excluded) { b = { label: "none needed", cat: "" }; source = "dead fuels need no fuel label"; }
      }
      if (!out.excluded) { out.label = b.label; out.category = b.cat; out.source = source; }
      return out;
    };
    const relOf = y => r.conv === "fixed" ? latest : r.conv === "nearest" ? X.yearRel[y]?.nearest : X.yearRel[y]?.before;
    return X.stations.map(s => {
      const rels = r.conv === "fixed" ? [latest] : [...new Set(X.years[s.site_id].map(relOf).filter(Boolean))];
      const outs = rels.map(x => one(s, x));
      const o = outs[outs.length - 1];
      if (r.conv !== "fixed") {
        o.by_release = rels.map((x, i) => `${x.replace("_", " ")}: ${outs[i].excluded ? "excluded" : outs[i].label}`).join(SEP);
        if (new Set(outs.map(x => x.excluded ? "excluded" : x.label)).size > 1) o.flags.push("label varies by reading year");
      }
      if (+s.colocated_with > 0) o.flags.push("co-located");
      o.flags = o.flags.join(SEP);
      return o;
    });
  }
  const summarise = rows => {
    const inc = rows.filter(r => !r.excluded);
    const by = (key, list) => { const m = {}; for (const r of list) m[r[key]] = (m[r[key]] || 0) + 1; return m; };
    return { labelled: inc.length, excluded: rows.length - inc.length, varies: rows.filter(r => r.flags.includes("varies")).length, by_label: by("label", inc), by_source: by("source", inc), by_reason: by("reason", rows.filter(r => r.excluded)) };
  };

  /* ---------- page ---------- */
  return async (view, INDEX) => {
    const [stations, sumRows, yr, meas, m40, m13, mapping] = await Promise.all([csv("alignment/stations.csv"), csv("alignment/summary.csv"), csv("alignment/year_release.csv"), csv("stations/measurements.csv"), csv("landfire/mapping_FBFM40.csv"), csv("landfire/mapping_FBFM13.csv"), csv("stations/fuel_mapping.csv")]);
    const summary = Object.fromEntries(sumRows.map(r => [r.key, r.value]));
    const releases = S(summary.releases).split(SEP);
    const latest = releases[releases.length - 1];
    const X = { stations, summary, releases, yearRel: Object.fromEntries(yr.map(r => [+r.year, { nearest: r.nearest_release, before: r.latest_before_release }])), years: {}, ctx: {}, codeCat: {}, classSupport: {} };
    for (const r of meas) (X.years[r.site_id] ||= []).push(+r.year);
    for (const k in X.years) X.years[k] = [...new Set(X.years[k])].sort((x, y) => x - y);
    X.deadReadings = meas.filter(r => r.component !== "live").reduce((t, r) => t + r.measurements, 0);
    for (const [p, m] of [["FBFM40", m40], ["FBFM13", m13]]) X.codeCat[p] = Object.fromEntries(m.map(r => [S(r.abbrev), S(r.category)]));
    for (const p of ["FBFM40", "FBFM13"]) { X.ctx[p] = {}; for (const rel of releases) X.ctx[p][rel] = Object.fromEntries((await csv(`alignment/context_${rel}_${p}.csv`)).map(r => [r.site_id, r])); }
    for (const sc of ["FBFM40", "FBFM13", "cat_from_40"]) X.classSupport[sc] = await csv(`alignment/class_support_${sc}.csv`);
    const c40 = X.ctx.FBFM40[latest];
    const withSp = stations.filter(s => BURNABLE.includes(c40[s.site_id].cell_category) && s.categories);
    const dis = withSp.filter(s => !split(s.categories).includes(c40[s.site_id].cell_category));
    X.disagree = { n: dis.length, of: withSp.length, shrubOnTree: dis.filter(s => c40[s.site_id].cell_category === "tree" && s.categories === "shrub").length, onGrass: dis.filter(s => c40[s.site_id].cell_category === "grass").length };
    X.neighboursDifferCode = Object.values(c40).filter(r => +r.neighbours_differ_code > 0).length;
    X.mappingLive = mapping.filter(r => r.fems_category !== "Dead").length;
    X.mappingInferred = mapping.filter(r => r.evidence === "inferred").length;
    X.varies = {};
    for (const t of TESTS) X.varies[t[0]] = Object.fromEntries(["nearest", "before"].map(c => [c, summarise(engine(X, { test: t[0], conv: c, nb: "nearest", nbd: "50", win: "landfire", dis: "category", dead: "landfire" })).varies]));
    const a = ui.align_answers2 ||= loadAnswers();
    const Q = questions(X);

    view.append(h("h1", {}, "Alignment: how every FEMS station gets a LANDFIRE fuel label"),
      h("p", { class: "lede" }, `The fuel-moisture model will be trained three ways, with the station's fuel taken from LANDFIRE as the category (grass, shrub, tree, slash, non-burnable), as the FBFM13 code and as the FBFM40 code. A station's cell is always the single 30 m LANDFIRE cell containing its coordinates. The ${fmt(+summary.stations)} California stations do not all sit on a burnable cell of the class they sample, and the file can change with the reading's year, so nine questions need the expert's answer. Each gives the numbers that bear on it and the form an answer is likely to take; the evidence sections below hold the full tables, and the rule explorer applies any candidate rule set to every station so its consequences can be seen before answering. Answers are kept in this browser and downloaded as a file.`),
      toc([["al-q", "Questions"], ["al-x", "Rule explorer"], ["e1", "E1 files and years"], ["e2", "E2 non-burnable"], ["e3", "E3 species vs cell"], ["e4", "E4 several species"], ["e5", "E5 co-located"], ["e6", "E6 dead only"], ["e7", "E7 class support"], ["e8", "E8 coordinates"], ["e9", "E9 species mapping"]]));

    const status = h("span", { class: "muted" });
    const setStatus = () => { const n = Q.filter(q => (a[q.id] || "").trim()).length; status.textContent = `${n} of ${Q.length} answered`; };
    view.append(h("div", { class: "sheet" }, h("b", {}, "Answers"), status,
      h("button", { onclick: () => download(`alignment_answers_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ saved: new Date().toISOString(), data_built: INDEX.built, tests: TESTS.map(t => t[1]), cell: "single 30 m LANDFIRE cell", answers: Object.fromEntries(Q.map(q => [q.id, { question: q.title, answer: a[q.id] || "" }])) }, null, 1), "application/json") }, "Download answers (JSON)"),
      h("button", { class: "secondary", onclick: () => download(`alignment_answers_${new Date().toISOString().slice(0, 10)}.md`, Q.map((q, i) => `## ${i + 1}. ${q.title}\n\n${a[q.id] || "(no answer)"}\n`).join("\n"), "text/markdown") }, "Download answers (Markdown)"),
      h("button", { class: "secondary", onclick: () => { for (const q of Q) delete a[q.id]; saveAnswers(a); view.querySelectorAll(".q textarea").forEach(t => { t.value = ""; }); setStatus(); } }, "Clear answers")));
    setStatus();

    view.append(h("h2", { id: "al-q" }, "The questions"));
    for (const [i, q] of Q.entries()) {
      const ta = h("textarea", { placeholder: "your answer" });
      ta.value = a[q.id] || "";
      ta.addEventListener("input", () => { a[q.id] = ta.value; saveAnswers(a); setStatus(); });
      view.append(h("div", { class: "q", id: q.id }, h("h3", {}, `Question ${i + 1}. ${q.title}`), h("p", { class: "why", html: q.text }),
        h("p", { class: "why" }, h("strong", {}, "Probable form of the answer. "), q.answer),
        h("p", { class: "ev" }, "Evidence: ", h("a", { href: "#", onclick: e => { e.preventDefault(); document.getElementById(q.evidence)?.scrollIntoView({ behavior: "smooth" }); } }, q.evidence.toUpperCase()), " and the rule explorer"), ta));
    }

    /* rule explorer */
    view.append(h("h2", { id: "al-x" }, "Rule explorer: what a candidate rule set implies for every station"),
      note("These controls are not answers. They apply one candidate rule set, for one of the three tests, to all stations, so the consequences of an answer can be seen. The starting values are only a starting point. The station table can be downloaded for any combination."));
    const xBox = h("div", {});
    const rs = ui.align_rules ||= { test: "cat40", conv: "fixed", nb: "nearest", nbd: "50", win: "landfire", dis: "category", dead: "landfire" };
    let rows = [];
    const drawX = async () => {
      xBox.innerHTML = "";
      rows = engine(X, rs);
      window.__alignment = { rules: { ...rs }, rows };
      const sm = summarise(rows);
      const inc = rows.filter(r => !r.excluded);
      const T = TEST[rs.test];
      const srcGroup = s => s === "cell" ? "LANDFIRE cell" : s.startsWith("nearest") ? "nearest burnable cell" : s.startsWith("reported") ? "reported species" : s.startsWith("dead") ? "no label needed" : "other";
      const pts = rows.map(r => { const s = X.stations.find(x => x.site_id === r.site_id); return { lat: s.lat, lon: s.lon, group: r.excluded ? "excluded" : srcGroup(r.source), text: `<b>${esc(r.station)}</b><br>${r.excluded ? "Excluded: " + esc(r.reason) : esc(r.label) + " (" + esc(r.source) + ")"}${r.flags ? "<br>" + esc(r.flags) : ""}` }; });
      const map = chartDiv();
      await stationMap(map, pts, [
        { key: "LANDFIRE cell", label: "LANDFIRE cell", color: cssVar("--s1") },
        { key: "nearest burnable cell", label: "Nearest burnable cell", color: cssVar("--s4"), symbol: "diamond" },
        { key: "reported species", label: "Reported species", color: cssVar("--s3"), symbol: "square" },
        { key: "no label needed", label: "No label needed", color: cssVar("--muted"), symbol: "circle-open" },
        { key: "excluded", label: "Excluded", color: cssVar("--s8"), symbol: "x" },
      ]);
      const readings = Object.fromEntries(X.stations.map(s => [s.site_id, +s.readings]));
      const labelRows = Object.entries(sm.by_label).map(([l, n]) => ({ label: l, category: inc.find(r => r.label === l)?.category || "", stations: n, readings: inc.filter(r => r.label === l).reduce((t, r) => t + readings[r.site_id], 0) })).sort((x, y) => y.stations - x.stations);
      const srcRows = Object.entries(sm.by_source).map(([s, n]) => ({ source: s, stations: n })).sort((x, y) => y.stations - x.stations);
      const exRows = Object.entries(sm.by_reason).map(([s, n]) => ({ reason: s, stations: n }));
      const st = ui.align_table ||= { q: "", only: "all" };
      const tbox = h("div", {});
      const cols = ["station", "label", "category", "source", "release", "flags", ...(rs.conv !== "fixed" ? ["by_release"] : []), "reason"];
      const drawTable = () => {
        tbox.innerHTML = "";
        const q = st.q.trim().toLowerCase();
        const list = rows.filter(r => (st.only === "all" || (st.only === "excluded" ? r.excluded : st.only === "flagged" ? !!r.flags : !r.excluded)) && (!q || `${r.station} ${r.label} ${r.source} ${r.flags} ${r.reason}`.toLowerCase().includes(q)));
        tbox.append(table(list.map(r => ({ ...r, release: S(r.release).replace("_", " ") })), { columns: cols, labels: { by_release: "label by file", release: rs.conv === "fixed" ? "file" : "file of last reading year" }, wrap: ["flags", "by_release", "source", "reason", "label"], sort: "station", asc: true, maxHeight: "560px" }),
          h("div", { class: "tablefoot" }, `${fmt(list.length)} rows`, h("a", { href: "#", onclick: e => { e.preventDefault(); download(`station_assignment_${rs.test}_${rs.conv}.csv`, csvText(rows), "text/csv"); } }, "download this assignment as CSV")));
      };
      drawTable();
      xBox.append(
        tiles(tile("Stations labelled", fmt(sm.labelled), `of ${fmt(rows.length)}`), tile("Excluded", fmt(sm.excluded)), tile("Distinct labels", fmt(labelRows.length), T.name), tile("Label varies by reading year", rs.conv === "fixed" ? "n/a" : fmt(sm.varies), rs.conv === "fixed" ? "one file" : CONV[rs.conv])),
        note(`<strong>Rule set in force.</strong> Test: ${esc(T.name)}. File: ${esc(CONV[rs.conv])}. Non-burnable cell: ${rs.nb === "nearest" ? `nearest burnable cell within ${rs.nbd} m, else exclude` : rs.nb === "nearest_species" ? `nearest burnable cell within ${rs.nbd} m, else the reported species` : rs.nb === "species" ? "the reported species" : "exclude"}. Disagreement judged at the ${rs.dis === "category" ? "category" : "code"} level: ${rs.win === "landfire" ? "LANDFIRE wins" : rs.win === "species" ? "species win" : rs.win === "grass_species" ? "LANDFIRE wins except on grass cells" : "exclude"}. Dead-only stations: ${rs.dead === "landfire" ? "labelled from LANDFIRE" : rs.dead === "exclude" ? "excluded" : "no label"}.`),
        h("div", { class: "row" }, panel(h("h3", {}, "Where each label comes from"), map),
          panel(h("h3", {}, "Stations per label"), table(labelRows, { maxHeight: "300px" }), h("h3", {}, "Stations per source"), table(srcRows, { wrap: ["source"], maxHeight: "none" }), ...(exRows.length ? [h("h3", {}, "Why stations are excluded"), table(exRows, { wrap: ["reason"], maxHeight: "none" })] : []))),
        panel(h("h3", {}, "Every station"), controls(st, [{ key: "q", type: "text", label: "Search", placeholder: "station, label, source or flag" }, { key: "only", label: "Show", options: [["all", "All stations"], ["labelled", "Labelled"], ["flagged", "With a flag"], ["excluded", "Excluded"]] }], drawTable), tbox));
    };
    view.append(controls(rs, [
      { key: "test", label: "Test", options: TESTS.map(t => [t[0], t[1]]) },
      { key: "conv", label: "File", options: Object.entries(CONV) },
      { key: "nb", label: "Non-burnable cell", options: [["nearest", "Nearest burnable cell within the distance, else exclude"], ["nearest_species", "Nearest burnable cell within the distance, else reported species"], ["species", "Reported species"], ["exclude", "Exclude"]] },
      { key: "nbd", label: "Distance", options: [["50", "50 m (adjacent cell)"], ["100", "100 m"], ["300", "300 m"], ["1000", "1 km"]] },
      { key: "dis", label: "Disagreement judged at", options: [["category", "Category level"], ["code", "Code level (FBFM tests)"]] },
      { key: "win", label: "When species disagree", options: [["landfire", "LANDFIRE wins"], ["species", "Species win"], ["grass_species", "LANDFIRE wins except on grass cells"], ["exclude", "Exclude the station"]] },
      { key: "dead", label: "Dead-only stations", options: [["landfire", "Label from LANDFIRE"], ["none", "No label"], ["exclude", "Exclude"]] },
    ], drawX), xBox);
    await drawX();

    /* ---------- evidence ---------- */
    await section(view, "e1", "E1. Files and years: how station cells change between releases",
      `<p><strong>What it shows.</strong> The year-to-file tables for the two dynamic conventions, the label at each station's cell in every release, and how many stations change. Under a dynamic file the fallback rules of questions 2 and 3 apply per file, so a station can be on a burnable cell in one year and need a fallback in another; the rule explorer counts those as "label varies by reading year".</p>`,
      async body => {
        const stab = await csv("alignment/release_stability.csv");
        const st = ui.align_e1 ||= { scheme: "cat_from_40" };
        const box = h("div", {});
        const draw = () => {
          box.innerHTML = "";
          const list = stab.filter(r => r.scheme === st.scheme), changed = list.filter(r => isTrue(r.changed));
          const seq = {}; for (const r of changed) seq[r.labels] = (seq[r.labels] || 0) + 1;
          const seqRows = Object.entries(seq).map(([k, n]) => ({ sequence: k, stations: n })).sort((x, y) => y.stations - x.stations);
          const names = Object.fromEntries(X.stations.map(s => [s.site_id, s.site_name]));
          box.append(tiles(tile("Stations whose cell label changes", fmt(changed.length), `of ${fmt(list.length)}`), tile("Distinct change patterns", fmt(seqRows.length))),
            h("div", { class: "row" }, panel(h("h3", {}, `Most common sequences (${releases.map(r => r.replace("_", " ")).join(" → ")})`), table(seqRows.slice(0, 25), { wrap: ["sequence"], maxHeight: "420px" })),
              panel(h("h3", {}, "FEMS year to file"), table(yr.map(r => ({ year: r.year, "nearest by year": r.nearest_release.replace("_", " "), "latest available before": r.latest_before_release.replace("_", " "), fixed: r.fixed_release.replace("_", " ") })), { maxHeight: "none" }), tablefoot("alignment/year_release.csv", yr.length))),
            panel(h("h3", {}, "Every station whose label changes"), table(changed.map(r => ({ station: names[r.site_id], labels: r.labels, distinct: r.n_distinct, first: r.first, last: r.last })), { wrap: ["labels"], sort: "station", asc: true, maxHeight: "480px" }), tablefoot("alignment/release_stability.csv", changed.length)));
        };
        draw();
        FX.fill(body, controls(st, [{ key: "scheme", label: "Test", options: [["cat_from_40", "Category"], ["FBFM13", "FBFM13"], ["FBFM40", "FBFM40"]] }], draw), box);
      });

    await section(view, "e2", "E2. Stations on non-burnable cells and their candidate fallbacks",
      `<p><strong>What it shows.</strong> Every station whose cell is non-burnable in the chosen file, with the candidates side by side: the nearest burnable cell with its distance and class, and the class its reported species map to; the last column says whether they agree. The 35 × 35 dominant class is shown for context only, since the cell stays 30 m.</p>`,
      async body => {
        const st = ui.align_e2 ||= { release: latest, product: "FBFM40" };
        const box = h("div", {});
        const draw = () => {
          box.innerHTML = "";
          const sMap = Object.fromEntries(X.stations.map(s => [s.site_id, s]));
          const list = Object.values(X.ctx[st.product][st.release]).filter(r => r.cell_category === "nonburnable").map(r => {
            const s = sMap[r.site_id], cats = split(s.categories);
            return { station: s.site_name, cell: r.cell_code, species: s.species, "species category": s.categories, "species closest code": st.product === "FBFM40" ? s.species_fbfm40 : s.species_fbfm13, "nearest burnable": r.nearest_burnable_code, "distance m": r.nearest_burnable_m === "" ? null : +r.nearest_burnable_m, "nearest category": r.nearest_burnable_category, "35×35 dominant": r.dom35_burnable, "nearest agrees with species": cats.length ? (cats.includes(r.nearest_burnable_category) ? "yes" : "no") : "no species" };
          });
          const dist = list.map(r => r["distance m"]).filter(v => v != null);
          const d = chartDiv("short");
          plot(d, [{ type: "histogram", x: dist, xbins: { start: 0, end: Math.max(...dist, 100) + 30, size: 30 }, marker: { color: cssVar("--s1") }, hovertemplate: "%{x} m: %{y} stations<extra></extra>" }], { margin: { l: 48, r: 8, t: 8, b: 44 }, xaxis: { title: { text: "distance to the nearest burnable cell (m)" } }, yaxis: { title: { text: "stations" } } });
          const withSp2 = list.filter(r => r["nearest agrees with species"] !== "no species").length;
          box.append(tiles(tile("On a non-burnable cell", fmt(list.length), `${st.release.replace("_", " ")} ${st.product}`), tile("Nearest burnable agrees with species", fmt(list.filter(r => r["nearest agrees with species"] === "yes").length), `of ${fmt(withSp2)} with species`)),
            panel(h("h3", {}, "Distance to the nearest burnable cell"), d),
            panel(h("h3", {}, "Every such station"), table(list, { wrap: ["species", "species category", "species closest code"], sort: "station", asc: true, maxHeight: "560px" }), tablefoot(`alignment/context_${st.release}_${st.product}.csv`, list.length)));
        };
        draw();
        FX.fill(body, controls(st, [{ key: "release", label: "File", options: releases.map(r => [r, r.replace("_", " ")]) }, { key: "product", label: "Product", options: [["FBFM40", "FBFM40"], ["FBFM13", "FBFM13"]] }], draw), box);
      });

    await section(view, "e3", "E3. Reported species against the LANDFIRE cell",
      `<p><strong>What it shows.</strong> The cell's category against the categories the station's species map to, then the same comparison at code level for the FBFM tests, and the list of disagreeing stations. Purity is the share of the 35 × 35 cells around the station in the cell's category: a low value with shrub species on a tree cell suggests a mixed stand rather than a wrong map.</p>`,
      async body => {
        const st = ui.align_e3 ||= { release: latest, product: "FBFM40" };
        const box = h("div", {});
        const draw = () => {
          box.innerHTML = "";
          const sMap = Object.fromEntries(X.stations.map(s => [s.site_id, s]));
          const list = Object.values(X.ctx[st.product][st.release]);
          const xt = {};
          for (const r of list) { const k = sMap[r.site_id].categories || "(no species)"; (xt[r.cell_category] ||= {})[k] = ((xt[r.cell_category] || {})[k] || 0) + 1; }
          const keys = [...new Set(list.map(r => sMap[r.site_id].categories || "(no species)"))].sort();
          const xRows = CATS.concat("nodata").filter(c => xt[c]).map(c => ({ "cell category": c, ...Object.fromEntries(keys.map(k => [k, xt[c][k] || 0])), total: Object.values(xt[c]).reduce((a2, b) => a2 + b, 0) }));
          const codeCol = st.product === "FBFM40" ? "species_fbfm40" : "species_fbfm13";
          const burn = list.filter(r => BURNABLE.includes(r.cell_category) && sMap[r.site_id].categories);
          const codeAgree = burn.filter(r => split(sMap[r.site_id][codeCol]).includes(r.cell_code)).length;
          const catAgree = burn.filter(r => split(sMap[r.site_id].categories).includes(r.cell_category)).length;
          const disList = burn.filter(r => !split(sMap[r.site_id].categories).includes(r.cell_category)).map(r => { const s = sMap[r.site_id]; return { station: s.site_name, cell: r.cell_code, "cell category": r.cell_category, species: s.species, "species category": s.categories, "species closest code": s[codeCol], "purity 35": +r.purity35_category }; });
          box.append(tiles(tile("Burnable cell with species", fmt(burn.length)), tile("Agree at category level", fmt(catAgree), `${fmt(burn.length - catAgree)} disagree`), tile("Agree at exact code level", fmt(codeAgree), `${fmt(burn.length - codeAgree)} disagree`), tile("Shrub species on a tree cell", fmt(disList.filter(r => r["cell category"] === "tree" && r["species category"] === "shrub").length)), tile("Any species on a grass cell", fmt(disList.filter(r => r["cell category"] === "grass").length))),
            panel(h("h3", {}, "Cell category against the station's species categories"), table(xRows, { maxHeight: "none" })),
            panel(h("h3", {}, "Stations whose species disagree with a burnable cell at category level"), table(disList, { wrap: ["species", "species closest code"], sort: "station", asc: true, maxHeight: "560px" })));
        };
        draw();
        FX.fill(body, controls(st, [{ key: "release", label: "File", options: releases.map(r => [r, r.replace("_", " ")]) }, { key: "product", label: "Product", options: [["FBFM40", "FBFM40"], ["FBFM13", "FBFM13"]] }], draw), box);
      });

    await section(view, "e4", "E4. Stations that sample several species",
      `<p><strong>What it shows.</strong> How many species each station reports and which category mixes occur. New Growth and Old Growth of one plant count as one species.</p>`,
      body => {
        const n = {}; for (const s of X.stations) n[s.n_species] = (n[s.n_species] || 0) + 1;
        const mix = {}; for (const s of X.stations) { const k = s.categories || "(dead only)"; mix[k] = (mix[k] || 0) + 1; }
        FX.fill(body, h("div", { class: "row" }, panel(h("h3", {}, "Species per station"), table(Object.keys(n).sort((x, y) => x - y).map(k => ({ species: k, stations: n[k] })), { maxHeight: "none" })),
          panel(h("h3", {}, "Category mix"), table(Object.entries(mix).map(([k, v]) => ({ categories: k, stations: v })).sort((x, y) => y.stations - x.stations), { maxHeight: "none" }))),
          panel(h("h3", {}, "Stations with more than one species"), table(X.stations.filter(s => +s.n_species > 1).map(s => ({ station: s.site_name, species: s.species, categories: s.categories, "closest FBFM13": s.species_fbfm13, "closest FBFM40": s.species_fbfm40 })), { wrap: ["species", "closest FBFM40", "closest FBFM13"], sort: "station", asc: true, maxHeight: "480px" }), tablefoot("alignment/stations.csv", X.stations.filter(s => +s.n_species > 1).length)));
      });

    await section(view, "e5", "E5. Stations that share a cell",
      `<p><strong>What it shows.</strong> Every 30 m cell holding more than one station, the stations in it, and whether they report the same species.</p>`,
      async body => {
        const co = await csv("alignment/colocated.csv");
        FX.fill(body, panel(table(co.map(r => ({ cell: r.cell_key, stations: r.stations, names: r.names, species: r.species, "same species": isTrue(r.same_species) ? "yes" : "no" })), { wrap: ["names", "species"], sort: "stations", maxHeight: "480px" }), tablefoot("alignment/colocated.csv", co.length)));
      });

    await section(view, "e6", "E6. Stations that report only dead fuels",
      `<p><strong>What it shows.</strong> The stations with no live species, what they report, and the cell they sit on in ${esc(latest.replace("_", " "))} FBFM40.</p>`,
      body => {
        const list = X.stations.filter(s => isTrue(s.dead_only)).map(s => ({ station: s.site_name, "dead fuels": s.dead_fuels, readings: +s.readings, years: `${s.first_year} to ${s.last_year}`, cell: c40[s.site_id]?.cell_code, "cell category": c40[s.site_id]?.cell_category }));
        FX.fill(body, panel(table(list, { wrap: ["dead fuels"], sort: "station", asc: true, maxHeight: "none" })));
      });

    await section(view, "e7", "E7. How many stations support each class, per test",
      `<p><strong>What it shows.</strong> For each test, every class with its area share of California in ${esc(latest.replace("_", " "))}, the stations whose 30 m cell carries it, their readings, and the stations whose reported species map to it. A class with large area and no station is one the model must extrapolate to; a class with stations on its cell but no species mapped to it, such as grass, is sampled only by accident of location.</p>`,
      body => {
        const st = ui.align_e7 ||= { scheme: "cat_from_40" };
        const box = h("div", {});
        const draw = () => {
          box.innerHTML = "";
          const list = X.classSupport[st.scheme], tot = list.reduce((t, r) => t + r.stations_on_cell, 0);
          const d = chartDiv();
          plot(d, [{ type: "bar", name: "share of California area", x: list.map(r => r.class), y: list.map(r => 100 * r.area_share), marker: { color: cssVar("--axis") } },
                   { type: "bar", name: "share of stations (cell)", x: list.map(r => r.class), y: list.map(r => 100 * r.stations_on_cell / tot), marker: { color: cssVar("--s1") } }],
            { barmode: "group", margin: { l: 48, r: 8, t: 36, b: 60 }, xaxis: { type: "category", tickangle: list.length > 12 ? -60 : 0 }, yaxis: { title: { text: "%" } } });
          box.append(d, table(list.map(r => ({ ...r, area_share: pct(r.area_share, 2) })), { columns: ["class", "category", "area_share", "stations_on_cell", "readings_on_cell", "stations_reporting_species_mapped_here"], labels: { area_share: "area share", stations_on_cell: "stations on cell", readings_on_cell: "readings on cell", stations_reporting_species_mapped_here: "stations whose species map here" }, maxHeight: "480px" }), tablefoot(`alignment/class_support_${st.scheme}.csv`, list.length));
        };
        draw();
        FX.fill(body, panel(controls(st, [{ key: "scheme", label: "Test", options: [["cat_from_40", "Category"], ["FBFM13", "FBFM13"], ["FBFM40", "FBFM40"]] }], draw), box));
      });

    await section(view, "e8", "E8. How fragile the single cell is",
      `<p><strong>What it shows.</strong> For the chosen file: how many of the 8 neighbouring cells differ from the station's cell, how often the majority of a window would differ from the cell (context only, the cell stays 30 m), the purity of the surroundings, and how precise the coordinates are. A coordinate that is a whole number of arc-seconds was most likely recorded in degrees, minutes and seconds; one second is about 30 m of latitude and 25 m of longitude here, so the station may sit in any neighbouring cell.</p>`,
      body => {
        const st = ui.align_e8 ||= { release: latest, product: "FBFM40" };
        const box = h("div", {});
        const draw = () => {
          box.innerHTML = "";
          const list = Object.values(X.ctx[st.product][st.release]);
          const nb = {}, nbc = {}; for (const r of list) { nb[r.neighbours_differ_category] = (nb[r.neighbours_differ_category] || 0) + 1; nbc[r.neighbours_differ_code] = (nbc[r.neighbours_differ_code] || 0) + 1; }
          const nbRows = [...Array(9).keys()].map(k => ({ "neighbours that differ": k, "by category": nb[k] || 0, "by code": nbc[k] || 0 }));
          const diff = [3, 5, 11, 35].map(k => ({ window: `${k} × ${k}`, "majority category differs from cell": list.filter(r => r[`maj${k}_category`] !== r.cell_category).length, "majority code differs from cell": list.filter(r => r[`maj${k}_code`] !== r.cell_code).length }));
          const d = chartDiv("short");
          plot(d, [3, 35].map(k => ({ type: "histogram", name: `${k} × ${k}`, x: list.map(r => +r[`purity${k}_category`]), xbins: { start: 0, end: 1.0001, size: 0.1 }, opacity: 0.6 })), { barmode: "overlay", margin: { l: 48, r: 8, t: 36, b: 44 }, xaxis: { title: { text: "share of the surrounding cells in the cell's category" } }, yaxis: { title: { text: "stations" } } });
          const dec = {}; for (const s of X.stations) { const k = Math.min(+s.lat_decimals, +s.lon_decimals); dec[k] = (dec[k] || 0) + 1; }
          const both = X.stations.filter(s => isTrue(s.lat_seconds_rounded) && isTrue(s.lon_seconds_rounded)).length;
          box.append(h("div", { class: "row" }, panel(h("h3", {}, "Neighbours that differ from the cell"), table(nbRows, { maxHeight: "none" }), h("h3", {}, "Window majority against the cell (context)"), table(diff, { maxHeight: "none" })),
            panel(h("h3", {}, "Purity of the surroundings"), d, h("h3", {}, "Coordinate precision"), note(`${fmt(both)} of ${fmt(X.stations.length)} stations have both coordinates at whole arc-seconds.`), table(Object.keys(dec).sort((x, y) => x - y).map(k => ({ "decimal places (fewer of lat, lon)": k, stations: dec[k] })), { maxHeight: "none" }))),
            panel(h("h3", {}, "Every station"), table(list.map(r => { const s = X.stations.find(x => x.site_id === r.site_id); return { station: s.site_name, cell: r.cell_code, "neighbours differ (category)": +r.neighbours_differ_category, "neighbours differ (code)": +r.neighbours_differ_code, "purity 3": +r.purity3_category, "purity 35": +r.purity35_category, "arc-second coordinates": isTrue(s.lat_seconds_rounded) && isTrue(s.lon_seconds_rounded) ? "yes" : "no" }; }), { sort: "neighbours differ (category)", maxHeight: "480px" }), tablefoot(`alignment/context_${st.release}_${st.product}.csv`, list.length)));
        };
        draw();
        FX.fill(body, controls(st, [{ key: "release", label: "File", options: releases.map(r => [r, r.replace("_", " ")]) }, { key: "product", label: "Product", options: [["FBFM40", "FBFM40"], ["FBFM13", "FBFM13"]] }], draw), box);
      });

    await section(view, "e9", "E9. The species-to-fuel-model mapping",
      `<p><strong>What it shows.</strong> Every live fuel California stations report, with the closest FBFM13 code, closest FBFM40 code and category it was given, the evidence level and the reasoning. This table is the same as the one on the FEMS tab; it is a judgement drawn from Anderson (1982) and Scott and Burgan (2005), and every rule that lets the species decide depends on it. To change it, edit <code>fireset_eda/fems_fuel_mapping.csv</code> and rebuild.</p>`,
      body => {
        const list = mapping.filter(r => r.fems_category !== "Dead");
        FX.fill(body, panel(table(list, { columns: ["fuel_type", "fems_category", "stations", "readings", "closest_fbfm13", "closest_fbfm40", "category", "evidence", "rationale"], labels: { fuel_type: "reported fuel", fems_category: "FEMS category", closest_fbfm13: "closest FBFM13", closest_fbfm40: "closest FBFM40" }, wrap: ["rationale"], sort: "fuel_type", asc: true, maxHeight: "640px" }), tablefoot("stations/fuel_mapping.csv", list.length)));
      });
  };
})();
