/* Page 3: MET, trends in RAWS weather. */
window.PageMet = (() => {
  "use strict";
  const { h, panel, note, csv, fmt, table, tablefoot, controls, ui, chartDiv, plot, section, toc, tiles, tile, cssVar, classColor, stationMap, esc } = FX;
  const S = v => String(v ?? "");
  const VARS = {
    temp_mean: ["Air temperature, mean", "°F"], temp_dmax: ["Air temperature, mean daily maximum", "°F"], temp_dmin: ["Air temperature, mean daily minimum", "°F"],
    rh_mean: ["Relative humidity, mean", "%"], rh_dmin: ["Relative humidity, mean daily minimum", "%"], rain_total: ["Rain, total", "in"],
    wind_mean: ["Wind speed, mean", "mph"], gust_mean: ["Peak wind speed, mean of hourly peaks", "mph"], gust_max: ["Peak wind speed, highest in the period", "mph"],
    solar_mean: ["Solar radiation, mean", "W/m²"], fm10_mean: ["10-hour fuel moisture, modelled, mean", "%"], fm10_dmin: ["10-hour fuel moisture, modelled, mean daily minimum", "%"],
  };
  const varOptions = Object.entries(VARS).map(([k, v]) => [k, v[0]]);
  const defaultPolicy = v => v === "solar_mean" ? "filled" : "strict";
  const policyOf = (st, v) => st.qc === "default" ? defaultPolicy(v) : st.qc;
  const QC_OPTIONS = [["default", "Default (original values; solar uses all values)"], ["strict", "Original values only, every variable"], ["filled", "All values FEMS serves, every variable"]];
  const QC_VAR = { temp_mean: "temperature", temp_dmax: "temperature", temp_dmin: "temperature", rh_mean: "humidity", rh_dmin: "humidity", rain_total: "rain", wind_mean: "wind", gust_mean: "gust", gust_max: "gust", solar_mean: "solar" };
  const yearSpan = ys => { const out = []; let a = null, b = null; for (const y of ys) { if (a === null) { a = b = y; } else if (y === b + 1) { b = y; } else { out.push(a === b ? `${a}` : `${a} to ${b}`); a = b = y; } } if (a !== null) out.push(a === b ? `${a}` : `${a} to ${b}`); return out.join(", "); };
  async function trendContext() {
    const [yrs, breaks, trendRows] = await Promise.all([csv("met/trend_years.csv"), csv("met/qc_breaks.csv"), csv("met/trends.csv")]);
    const years = (v, p) => { const r = yrs.find(x => x.var === v && x.policy === p); return r ? String(r.years).split(";").map(Number) : []; };
    const caution = (v, pol) => {
      const b = breaks.filter(x => x.variable === QC_VAR[v]);
      const parts = [];
      if (b.length) parts.push(`Original values make up an unusual share of hours in ${b.map(x => `${x.year} (${x.flag0_pct} %, usually ${x.median_pct} %)`).join(", ")}, so part of this variable's trend may come from processing and not weather.`);
      const pick = p => trendRows.find(r => r.source === "cell" && r.region === "All" && r.fuel === "All" && r.var === v && r.policy === p);
      const a = pick("strict"), f = pick("filled");
      if (a && f && a.slope_per_decade !== "" && f.slope_per_decade !== "" && a.slope_per_decade != null && f.slope_per_decade != null && a.slope_per_decade * f.slope_per_decade < 0)
        parts.push(`The statewide trend changes sign between the two QC rules (${signed(a.slope_per_decade)} on original values, ${signed(f.slope_per_decade)} on all values), so its direction is not reliable.`);
      if (v === "solar_mean" && pol === "filled") parts.push("Daytime values are mostly estimates.");
      if (v.startsWith("fm10")) parts.push("This is a model output, not a measurement.");
      return parts.length ? `<strong>Caution.</strong> ${parts.join(" ")}` : "";
    };
    return { years, caution };
  }
  const SOURCE_OPTIONS = [["cell", "LANDFIRE class of the station's cell"], ["window", "Most common burnable class within 35 × 35 cells"]];
  const pval = p => p == null || p === "" ? "" : p < 0.001 ? "under 0.001" : (+p).toFixed(3);
  const signed = (v, d = 2) => v == null || v === "" ? "" : `${v > 0 ? "+" : ""}${(+v).toFixed(d)}`;
  const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const compass = deg => COMPASS[Math.floor(((deg % 360) / 22.5) + 0.5) % 16];

  /* ---------- 1. fields ---------- */
  async function fieldsSection(body, summary) {
    const [qc, limits] = await Promise.all([csv("met/qc_flags.csv"), csv("met/limits.csv")]);
    const q = v => qc.find(r => r.variable === v && r.policy === "strict");
    const share = (v, f) => { const r = q(v); return r ? `${(100 * r[`flag_${f}`] / r.hours).toFixed(1)} %` : ""; };
    const row = (field, status, source, unit, how, v) => ({ field, status, source, unit, how, "flag 0": v ? share(v, 0) : "", "flag 1": v ? share(v, 1) : "", "flag 2": v ? share(v, 2) : "", "not reviewed": v ? share(v, "blank") : "" });
    const rows = [
      row("Station name", "Available", "Station metadata", "", "Shown in the station table and on the map."),
      row("WX ID", "Closest match", "fems_station_id", "", "No field is called WX ID. The FEMS API's internal station key is shown as the closest match; please confirm this is the one you mean."),
      row("NESS ID", "Dropped", "nesdis_id", "", "Dropped from the page as you suggested, after confirming the kept key is unique. It stays in the station CSV."),
      row("NWS ID", "Dropped", "station_id, wims_id", "", "Dropped from the page as you suggested. It stays in the station CSV, and the API uses it to look up stations."),
      row("Observation date and time", "Available", "DateTime", "UTC", "Hourly. Converted to Pacific time for daily and monthly grouping."),
      row("Elevation, latitude, longitude", "Available", "Station metadata", "ft, degrees", "Shown in the station table and on the map."),
      row("Agency", "Available", "Station metadata", "", "Shown in the station table and on the map."),
      row("Rain accumulation", "Available", "Precipitation(in)", "in", "The API serves hourly amounts, not the running total the gauge records. Hours are summed into monthly and annual totals.", "rain"),
      row("Wind speed", "Available", "WindSpeed(mph)", "mph", "Monthly and annual means of hourly values.", "wind"),
      row("Wind direction", "Available", "WindAzimuth(degrees)", "degrees", "Vector mean and wind roses, because an ordinary average of compass degrees is wrong near north. Calm hours have no direction and are left out.", "wind_dir"),
      row("Air temperature", "Available", "Temperature(F)", "°F", "Mean, and means of daily maximum and minimum.", "temperature"),
      row("Fuel temperature", "Not available", "None", "°F", "The public FEMS API does not offer it. The archives that do need credentials."),
      row("Relative humidity", "Available", "RelativeHumidity(%)", "%", "Mean, and mean of daily minimum.", "humidity"),
      row("FM (10-hour dead fuel moisture)", "Modelled instead", "tenHR_TL_FuelMoisture", "%", "The dowel reading is not offered by the public FEMS API. This is the value NFDRS calculates from weather, so it is a model output and not a measurement. It carries no QC flags."),
      row("Peak wind speed", "Available", "GustSpeed(mph)", "mph", "Mean of hourly peaks, and the highest value in the period.", "gust"),
      row("Peak wind direction", "Available", "GustAzimuth(degrees)", "degrees", "Vector mean and wind roses.", "gust_dir"),
      row("Solar radiation", "Mostly estimated in daytime", "SolarRadiation(W/m2)", "W/m²", "Mean of hourly values, day and night. See the note on flags below.", "solar"),
    ];
    const byYear = await csv("met/qc_by_year.csv");
    const flagState = ui.met_flag ||= { variable: "temperature" };
    const flagBox = h("div", {});
    const drawFlags = () => {
      flagBox.innerHTML = "";
      const rs = byYear.filter(r => r.variable === flagState.variable);
      const years = [...new Set(rs.map(r => r.year))].sort((a, b) => a - b);
      const total = y => rs.filter(r => r.year === y).reduce((t, r) => t + r.hours, 0);
      const d = chartDiv("short");
      plot(d, [[0, "Flag 0, original", "--s1"], [1, "Flag 1, estimate for a missing value", "--s4"], [2, "Flag 2, estimate replacing a suspicious value", "--s2"], [-1, "Blank, not reviewed yet", "--axis"]].map(([f, name, c]) => ({
        type: "bar", name, x: years.map(String), y: years.map(y => { const r = rs.find(x => x.year === y && x.flag === f); return r ? 100 * r.hours / total(y) : 0; }), marker: { color: cssVar(c) },
        hovertemplate: `%{x}: %{y:.1f} % of hours<extra>${name}</extra>` })),
        { barmode: "stack", margin: { l: 48, r: 8, t: 64, b: 36 }, legend: { y: 1.3 }, xaxis: { type: "category" }, yaxis: { title: { text: "% of hours" }, range: [0, 100] } });
      flagBox.append(d, tablefoot("met/qc_by_year.csv", rs.length));
    };
    drawFlags();
    body.innerHTML = "";
    body.append(panel(table(rows, { columns: ["field", "status", "source", "unit", "how", "flag 0", "flag 1", "flag 2", "not reviewed"], labels: { how: "how it is used" }, wrap: ["how"], maxHeight: "none" }),
      tablefoot("met/qc_flags.csv", rows.length)),
    panel(h("h3", {}, "What the flags mean"),
      note(`The API marks each hourly value. <strong>Flag 0</strong> means the original value was kept. <strong>Flag 1</strong> means it was missing and has been replaced by an estimate. <strong>Flag 2</strong> means it was judged suspicious and has been replaced by an estimate. So flags 1 and 2 are both estimates, not measurements (Brown, Desert Research Institute, RAWS QC and Gap Fill, May 2024; FEMS's API guide describes flag 2 without mentioning the replacement). <strong>From ${esc(S(summary.first_unreviewed_month))} onward the flags are blank</strong>, so those hours appear not to have been through this QC yet. By default this page uses original values only, meaning flag 0.`),
      note(`<strong>Solar radiation is the exception, and it needs care.</strong> Only ${(100 * +summary.solar_midday_flag0_share).toFixed(1)} % of hours between 10:00 and 15:00 Pacific time carry flag 0. Original values alone miss most daylight and fail the coverage rule below, so solar uses all the values FEMS serves by default. Under "Original values only", solar keeps only October to March months, with values far below the all-values series and no annual values, so it should not be read as a series. <strong>Treat daytime solar on this page as mostly estimated, not measured.</strong> Every trend section has a selector to see any variable under either rule.`),
      note(`<strong>Check for false trends.</strong> If the share of estimates changes over the years, a trend can reflect the processing and not the weather. The chart below shows that share per year for each variable. Years more than ${summary.break_points} percentage points from a variable's usual share are listed next to its trends.`),
      controls(flagState, [{ key: "variable", label: "Variable", options: [["temperature", "Air temperature"], ["humidity", "Relative humidity"], ["rain", "Rain"], ["wind", "Wind speed"], ["gust", "Peak wind speed"], ["solar", "Solar radiation"]] }], drawFlags), flagBox,
      h("h3", {}, "Plausibility limits"),
      note("Values outside these limits are dropped, whatever their flag. The last column counts how many were dropped from the filled series."),
      table(limits.map(l => ({ ...l, "values dropped": (qc.find(r => r.variable === l.variable && r.policy === (l.variable === "fm10" ? "strict" : "filled")) || {}).beyond_limits ?? 0 })), { maxHeight: "none" })));
  }

  /* ---------- 2. location ---------- */
  async function whereSection(body, raws, summary) {
    const near = await csv("met/fems_nearest.csv");
    const map = chartDiv();
    const pts = [
      ...raws.map(r => ({ lat: r.lat, lon: r.lon, group: "raws", text: `<b>${esc(S(r.station_name))}</b> (RAWS)<br>${esc(S(r.agency))}, ${fmt(r.elevation_ft)} ft<br>${esc(S(r.region))}, cell ${esc(S(r.fuel_cell))}<br>${fmt(r.nearest_fems_km)} km to nearest FEMS station` })),
      ...near.map(f => ({ lat: f.lat, lon: f.lon, group: "fems", text: `<b>${esc(S(f.fems_station))}</b> (FEMS)<br>Nearest RAWS: ${esc(S(f.nearest_raws))}, ${fmt(f.distance_km)} km` })),
    ];
    await stationMap(map, pts, [
      { key: "fems", label: "FEMS fuel-moisture stations", color: cssVar("--s2"), symbol: "circle", size: 7 },
      { key: "raws", label: "RAWS weather stations", color: cssVar("--s1"), symbol: "triangle-up", size: 9 },
    ]);
    const d = near.map(r => r.distance_km);
    const size = 2, bins = new Map();
    for (const v of d) { const lo = Math.floor(v / size) * size; bins.set(lo, (bins.get(lo) || 0) + 1); }
    const lows = [...bins.keys()].sort((a, b) => a - b);
    const hist = chartDiv("short");
    plot(hist, [{ type: "bar", x: lows.map(l => l + size / 2), y: lows.map(l => bins.get(l)), width: size * 0.9, marker: { color: cssVar("--s1") },
      customdata: lows.map(l => `${l} to ${l + size}`), hovertemplate: "%{customdata} km: %{y} FEMS stations<extra></extra>" }],
      { margin: { l: 48, r: 8, t: 8, b: 44 }, xaxis: { title: { text: "km from a FEMS station to its nearest RAWS" } }, yaxis: { title: { text: "FEMS stations" } } });
    const within = km => d.filter(v => v <= km).length;
    const st = ui.met_raws ||= { q: "" };
    const box = h("div", {});
    const draw = () => {
      box.innerHTML = "";
      const q = st.q.trim().toLowerCase();
      const shown = raws.filter(r => !q || `${r.station_name} ${r.agency} ${r.region} ${r.fuel_cell} ${r.county_name}`.toLowerCase().includes(q));
      box.append(table(shown, { columns: ["station_name", "fems_station_id", "lat", "lon", "elevation_ft", "agency", "county_name", "region", "cell_code", "fuel_cell", "fuel_window", "nearest_fems_km", "valid_temp_months"],
        labels: { station_name: "station", fems_station_id: "station key (closest to WX ID)", elevation_ft: "elevation (ft)", county_name: "county", cell_code: "LANDFIRE cell", fuel_cell: "cell class", fuel_window: "window class", nearest_fems_km: "km to nearest FEMS", valid_temp_months: `months with valid temperature, of ${summary.months_in_span}` },
        format: { fems_station_id: v => String(v) }, sort: "station_name", asc: true, maxHeight: "480px" }), tablefoot("met/stations.csv", shown.length));
    };
    draw();
    body.innerHTML = "";
    body.append(tiles(
      tile("RAWS stations", fmt(+summary.stations), `${fmt(+summary.stations_with_data)} with weather data`),
      tile("FEMS stations", fmt(+summary.fems_stations)),
      tile("Median FEMS to RAWS", `${fmt(+summary.median_fems_to_raws_km)} km`, `maximum ${fmt(+summary.max_fems_to_raws_km)} km`),
      tile("FEMS within 10 km of a RAWS", fmt(within(10)), `of ${fmt(d.length)}`)),
    h("div", { class: "row" }, panel(h("h3", {}, "RAWS and FEMS stations"), map),
      panel(h("h3", {}, "How far FEMS stations are from a RAWS"), hist,
        h("h3", {}, "Each FEMS station and its nearest RAWS"),
        table(near, { columns: ["fems_station", "area", "nearest_raws", "distance_km", "fems_elevation_ft", "raws_elevation_ft", "elevation_difference_ft"], labels: { fems_station: "FEMS station", nearest_raws: "nearest RAWS", distance_km: "km", fems_elevation_ft: "FEMS ft", raws_elevation_ft: "RAWS ft", elevation_difference_ft: "ft difference" }, sort: "distance_km", asc: false, maxHeight: "420px" }),
        tablefoot("met/fems_nearest.csv", near.length))),
    panel(h("h3", {}, "All RAWS stations"), controls(st, [{ key: "q", label: "Search", type: "text", placeholder: "name, agency, region, class or county" }], draw), box));
  }

  /* ---------- 3. statewide ---------- */
  async function stateSection(body, summary) {
    const [monthly, seasonal, annual, trends] = await Promise.all([csv("met/state_monthly.csv"), csv("met/state_seasonal.csv"), csv("met/annual.csv"), csv("met/trends.csv")]);
    const ctx = await trendContext();
    const st = ui.met_state ||= { var: "temp_mean", qc: "default" };
    const box = h("div", {});
    const draw = () => {
      box.innerHTML = "";
      const v = st.var, pol = policyOf(st, v), [name, unit] = VARS[v];
      const m = monthly.filter(r => r.var === v && r.policy === pol);
      const s = seasonal.filter(r => r.var === v && r.policy === pol);
      const a = annual.filter(r => r.source === "cell" && r.region === "All" && r.fuel === "All" && r.var === v && r.policy === pol);
      const t = trends.find(r => r.source === "cell" && r.region === "All" && r.fuel === "All" && r.var === v && r.policy === pol);
      const d1 = chartDiv();
      plot(d1, [{ type: "scatter", mode: "lines", x: m.map(r => `${r.year}-${String(r.month).padStart(2, "0")}-15`), y: m.map(r => r.value), line: { color: cssVar("--s1"), width: 2 },
        customdata: m.map(r => r.n_stations), hovertemplate: `%{x|%b %Y}: %{y:,.2f} ${unit}, %{customdata} stations<extra></extra>` }],
        { margin: { l: 56, r: 8, t: 24, b: 40 }, xaxis: { type: "date" }, yaxis: { title: { text: `${name} (${unit})` } },
          shapes: pol === "filled" ? [{ type: "line", xref: "x", yref: "paper", x0: `${summary.first_unreviewed_month}-01`, x1: `${summary.first_unreviewed_month}-01`, y0: 0, y1: 1, line: { color: cssVar("--muted"), width: 1, dash: "dot" } }] : [],
          annotations: pol === "filled" ? [{ xref: "x", yref: "paper", x: `${summary.first_unreviewed_month}-01`, y: 1.08, text: "not reviewed from here", showarrow: false, xanchor: "right", font: { size: 11, color: cssVar("--muted") } }] : [] });
      const d2 = chartDiv();
      plot(d2, [
        { type: "scatter", mode: "lines", x: s.map(r => r.month), y: s.map(r => r.q25), line: { width: 0 }, hoverinfo: "skip", showlegend: false },
        { type: "scatter", mode: "lines", name: "middle half of stations", x: s.map(r => r.month), y: s.map(r => r.q75), fill: "tonexty", fillcolor: "rgba(42,120,214,0.15)", line: { width: 0 }, hoverinfo: "skip" },
        { type: "scatter", mode: "lines+markers", name: "mean of stations", x: s.map(r => r.month), y: s.map(r => r.mean), line: { color: cssVar("--s1"), width: 2 }, marker: { size: 6 },
          customdata: s.map(r => r.n_stations), hovertemplate: `Month %{x}: %{y:,.2f} ${unit}, %{customdata} stations<extra></extra>` },
      ], { margin: { l: 56, r: 8, t: 32, b: 40 }, xaxis: { title: { text: "month" }, dtick: 1 }, yaxis: { title: { text: unit } } });
      const d3 = chartDiv();
      const fx = a.filter(r => r.fixed_value != null && r.fixed_value !== "");
      plot(d3, [
        { type: "scatter", mode: "lines+markers", name: "all stations with a full year", x: a.map(r => r.year), y: a.map(r => r.value), line: { color: cssVar("--axis"), width: 2 }, marker: { size: 6 }, customdata: a.map(r => r.n_stations), hovertemplate: `%{x}: %{y:,.2f} ${unit}, %{customdata} stations<extra></extra>` },
        { type: "scatter", mode: "lines+markers", name: "stations present every year", x: fx.map(r => r.year), y: fx.map(r => r.fixed_value), line: { color: cssVar("--s1"), width: 2 }, marker: { size: 6 }, customdata: fx.map(r => r.n_fixed), hovertemplate: `%{x}: %{y:,.2f} ${unit}, %{customdata} stations<extra></extra>` },
      ], { margin: { l: 56, r: 8, t: 32, b: 40 }, xaxis: { title: { text: "year" }, dtick: 1 }, yaxis: { title: { text: unit } } });
      const ys = ctx.years(v, pol);
      const words = t && t.n_years >= 3
        ? `<strong>Trend.</strong> ${signed(t.slope_per_decade)} ${unit} per decade over ${t.n_years} years (${yearSpan(ys)}), from the ${fmt(t.n_fixed)} stations with a valid value in every one of them. The Mann-Kendall p value is ${pval(t.p_value)}.`
        : `<strong>Trend.</strong> No trend: not enough stations have a valid value in every usable year.`;
      const warn = ctx.caution(v, pol);
      if (!m.length) { box.append(note(`<strong>No data under this rule.</strong> ${esc(name)} has no station-month with enough original values. Choose another QC rule.`)); return; }
      box.append(note(words), ...(warn ? [note(warn)] : []), panel(h("h3", {}, "Monthly"), d1), h("div", { class: "row" }, panel(h("h3", {}, "Month-of-year pattern"), d2), panel(h("h3", {}, "Annual"), d3)));
    };
    draw();
    body.innerHTML = "";
    body.append(controls(st, [{ key: "var", label: "Variable", options: varOptions }, { key: "qc", label: "QC flags", options: QC_OPTIONS }], draw), box);
  }

  /* ---------- 4. region x fuel ---------- */
  async function groupSection(body, raws, summary) {
    const [annual, trends] = await Promise.all([csv("met/annual.csv"), csv("met/trends.csv")]);
    const ctx = await trendContext();
    const st = ui.met_group ||= { var: "temp_mean", qc: "default", source: "cell", scale: "shared" };
    const box = h("div", {});
    const draw = () => {
      box.innerHTML = "";
      const v = st.var, pol = policyOf(st, v), [name, unit] = VARS[v];
      const col = st.source === "cell" ? "fuel_cell" : "fuel_window";
      const regions = ["All", ...[...new Set(raws.map(r => r.region))].sort()];
      const order = ["grass", "shrub", "tree", "slash", "nonburnable", "nodata"];
      const fuels = ["All", ...order.filter(f => raws.some(r => r[col] === f))];
      const count = (rg, f) => raws.filter(r => (rg === "All" || r.region === rg) && (f === "All" || r[col] === f)).length;
      const A = annual.filter(r => r.source === st.source && r.var === v && r.policy === pol);
      const T = trends.filter(r => r.source === st.source && r.var === v && r.policy === pol);
      const vals = A.flatMap(r => [r.value, r.fixed_value]).filter(x => x != null && x !== "");
      if (!vals.length) { box.append(note(`<strong>No data under this rule.</strong> ${esc(name)} has no station-year with enough original values. Choose another QC rule.`)); return; }
      const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.05 || 1;
      const grid = h("div", { class: "smallgrid", style: `grid-template-columns: 110px repeat(${fuels.length}, minmax(190px, 1fr))` });
      grid.append(h("div", {}), ...fuels.map(f => h("div", { class: "smallhead" }, f === "All" ? "All classes" : f)));
      for (const rg of regions) {
        grid.append(h("div", { class: "smallhead side" }, rg === "All" ? "All regions" : rg));
        for (const f of fuels) {
          const n = count(rg, f), a = A.filter(r => r.region === rg && r.fuel === f), t = T.find(r => r.region === rg && r.fuel === f);
          const cell = h("div", { class: "smallcell" });
          if (!n) { cell.append(h("p", { class: "muted small" }, "No stations")); grid.append(cell); continue; }
          const tline = t && t.n_years >= 3 ? `${signed(t.slope_per_decade)} ${unit}/decade, p ${pval(t.p_value)}` : "no trend: too few stations with every year";
          cell.append(h("div", { class: "smalltitle" }, `${fmt(n)} station${n === 1 ? "" : "s"}, ${fmt(t ? t.n_fixed : 0)} used for the trend`), h("div", { class: "small muted" }, tline));
          if (a.length) {
            const d = chartDiv("mini");
            const fx = a.filter(r => r.fixed_value != null && r.fixed_value !== "");
            plot(d, [
              { type: "scatter", mode: "lines", x: a.map(r => r.year), y: a.map(r => r.value), line: { color: cssVar("--axis"), width: 1.5 }, customdata: a.map(r => r.n_stations), hovertemplate: `%{x}: %{y:,.2f} ${unit}, %{customdata} stations with a full year<extra></extra>`, showlegend: false },
              { type: "scatter", mode: "lines+markers", x: fx.map(r => r.year), y: fx.map(r => r.fixed_value), line: { color: f === "All" || f === "nonburnable" || f === "nodata" ? cssVar("--s1") : classColor(f), width: 2 }, marker: { size: 4 }, customdata: fx.map(r => r.n_fixed), hovertemplate: `%{x}: %{y:,.2f} ${unit}, %{customdata} fixed stations<extra></extra>`, showlegend: false },
            ], { margin: { l: 36, r: 4, t: 4, b: 20 }, xaxis: { dtick: 5, tickfont: { size: 9 } }, yaxis: { ...(st.scale === "shared" ? { range: [lo - pad, hi + pad] } : {}), tickfont: { size: 9 } } });
            cell.append(d);
          } else cell.append(h("p", { class: "muted small" }, "No station has a full year."));
          grid.append(cell);
        }
      }
      const tested = T.filter(t => t.p_value !== "" && t.p_value != null);
      const low = tested.filter(t => t.p_value < 0.05).length;
      const chance = `<strong>Many groups are tested at once.</strong> In this view, ${fmt(low)} of ${fmt(tested.length)} groups have a p value below 0.05, and about ${fmt(Math.round(tested.length * 0.05))} would be expected by chance alone even with no real trend. Small p values in small groups deserve particular doubt.`;
      const rows = T.map(t => ({ region: t.region, class: t.fuel, stations: t.n_members, "stations in trend": t.n_fixed, "years used": t.n_years, [`mean (${unit})`]: t.mean === "" ? null : t.mean,
        [`change per decade (${unit})`]: t.slope_per_decade, "p value": pval(t.p_value), note: t.n_fixed < 5 ? "fewer than 5 stations" : "" }));
      const warn = ctx.caution(v, pol), ys = ctx.years(v, pol);
      box.append(note(`<strong>${esc(name)}.</strong> ${st.scale === "shared" ? "The same vertical scale is used in every panel, so panels can be compared directly." : "Each panel has its own vertical scale, which shows year-to-year shape but exaggerates small changes, so read the axis."} In each panel, the coloured line follows only stations with a valid value in every year the trend uses (${yearSpan(ys) || "none"}), and the trend comes from that line. The grey line is every station with a full year, so its mix of stations can change from year to year.`), ...(warn ? [note(warn)] : []), note(chance),
        h("div", { class: "smallscroll" }, grid),
        panel(h("h3", {}, "Every group"), table(rows, { format: { [`mean (${unit})`]: x => x == null ? "" : (+x).toFixed(2), [`change per decade (${unit})`]: x => signed(x) }, sort: "stations", maxHeight: "480px" }),
          h("div", { class: "tablefoot" }, FX.dl("met/trends.csv", "trends CSV"), FX.dl("met/annual.csv", "annual values CSV"))));
    };
    draw();
    body.innerHTML = "";
    body.append(controls(st, [{ key: "var", label: "Variable", options: varOptions }, { key: "qc", label: "QC flags", options: QC_OPTIONS }, { key: "source", label: "Fuel type from", options: SOURCE_OPTIONS }, { key: "scale", label: "Vertical scale", options: [["shared", "Same in every panel"], ["own", "Own scale per panel"]] }], draw), box);
  }

  /* ---------- 5. roses ---------- */
  async function roseSection(body, raws) {
    const [roses, dirs] = await Promise.all([csv("met/roses.csv"), csv("met/directions.csv")]);
    const st = ui.met_rose ||= { kind: "wind_dir", source: "cell", region: "All" };
    const SPEEDS = ["under 5", "5 to 10", "10 to 15", "15 to 20", "20 or more"];
    const ramp = ["#cde2fb", "#9ec5f4", "#3987e5", "#184f95", "#0d366b"];
    const regions = ["All", ...[...new Set(raws.map(r => r.region))].sort()];
    const box = h("div", {});
    const draw = () => {
      box.innerHTML = "";
      const R = roses.filter(r => r.kind === st.kind && r.source === st.source && r.region === st.region);
      const fuels = ["All", ...["grass", "shrub", "tree", "slash", "nonburnable", "nodata"].filter(f => R.some(r => r.fuel === f))];
      const rmax = Math.max(...fuels.map(f => { const by = new Map(); for (const r of R.filter(x => x.fuel === f)) by.set(r.sector, (by.get(r.sector) || 0) + r.share); return Math.max(0, ...by.values()); }));
      const grid = h("div", { class: "row" });
      for (const f of fuels) {
        const sub = R.filter(r => r.fuel === f);
        if (!sub.length) continue;
        const d = chartDiv();
        const traces = SPEEDS.map((sp, i) => ({ type: "barpolar", name: `${sp} mph`, marker: { color: ramp[i] }, theta: COMPASS, r: COMPASS.map((_, k) => { const x = sub.find(r => r.sector === k && r.speed === sp); return x ? 100 * x.share : 0; }),
          hovertemplate: `%{theta}, ${sp} mph: %{r:.1f} %<extra></extra>` }));
        plot(d, traces, { margin: { l: 24, r: 24, t: 24, b: 24 }, polar: { bgcolor: "rgba(0,0,0,0)", angularaxis: { direction: "clockwise", rotation: 90, tickfont: { size: 10 } }, radialaxis: { range: [0, 100 * rmax], ticksuffix: " %", tickfont: { size: 9 }, angle: 90 } }, showlegend: false });
        const dd = dirs.find(r => r.kind === st.kind && r.source === st.source && r.region === st.region && r.fuel === f);
        grid.append(panel(h("h3", {}, f === "All" ? "All classes" : f), note(dd ? `${fmt(dd.n_stations)} station${dd.n_stations === 1 ? "" : "s"}. Vector mean ${(+dd.direction_deg).toFixed(0)}° (${compass(+dd.direction_deg)}), consistency ${(+dd.resultant_length).toFixed(2)} on a scale of 0 to 1.` : ""), d));
      }
      const tab = dirs.filter(r => r.kind === st.kind && r.source === st.source).map(r => ({ region: r.region, class: r.fuel, stations: r.n_stations, "vector mean (degrees)": (+r.direction_deg).toFixed(0), compass: compass(+r.direction_deg), consistency: (+r.resultant_length).toFixed(2) }));
      const key = h("div", { class: "legend-chips" }, SPEEDS.map((sp, i) => { const e = h("span", {}, `${sp} mph`); e.style.setProperty("--c", ramp[i]); return e; }));
      box.append(key, grid, panel(h("h3", {}, "Vector-mean direction, every group"), table(tab, { maxHeight: "420px" }), tablefoot("met/directions.csv", tab.length)));
    };
    draw();
    body.innerHTML = "";
    body.append(controls(st, [
      { key: "kind", label: "Wind", options: [["wind_dir", "Mean wind"], ["gust_dir", "Peak wind"]] },
      { key: "region", label: "Region", options: regions.map(r => [r, r === "All" ? "All regions" : r]) },
      { key: "source", label: "Fuel type from", options: SOURCE_OPTIONS },
    ], draw), box);
  }

  /* ---------- page ---------- */
  return async (view) => {
    const [raws, sumRows] = await Promise.all([csv("met/stations.csv"), csv("met/summary.csv")]);
    const summary = Object.fromEntries(sumRows.map(r => [r.key, r.value]));
    view.append(h("h1", {}, "MET"),
      h("p", { class: "lede" }, `Weather from California's ${fmt(+summary.stations)} RAWS stations, hourly from ${summary.first_year} through the partial year ${summary.partial_year}, downloaded from the public FEMS Climatology API. The page shows what is available, where the stations are relative to FEMS, and how the weather has moved, statewide and by region and fuel type. Group sizes are very unequal, and every panel says how many stations it rests on.`),
      toc([["met-fields", "What is measured"], ["met-where", "Where stations are"], ["met-state", "Statewide trends"], ["met-group", "Region × fuel type"], ["met-rose", "Wind roses"]]));
    await section(view, "met-fields", "What is measured",
      `<p><strong>What it shows.</strong> Each field you asked for, where it comes from, and how often FEMS's quality control accepted it.</p>
       <p><strong>Two fields are not available as measurements.</strong> Fuel temperature and the 10-hour dowel reading are not offered by the public FEMS API. The page shows modelled 10-hour moisture instead, labelled as modelled everywhere. Because it is calculated from weather, it cannot serve as an independent check on that weather.</p>`,
      body => fieldsSection(body, summary));
    await section(view, "met-where", "Where RAWS stations are, relative to FEMS",
      `<p><strong>What it shows.</strong> Both networks on one map, and for each FEMS station the great-circle distance to its nearest RAWS, with the elevation difference. RAWS measures weather continuously, while FEMS crews sample fuel moisture on visits, so the distance limits how directly the two can be paired.</p>
       <p><strong>How to read it.</strong> Distance is horizontal only. In steep terrain, a nearby station can sit in different weather, so check the elevation difference too.</p>`,
      body => whereSection(body, raws, summary));
    await section(view, "met-state", "Statewide trends",
      `<p><strong>What it shows.</strong> For the chosen variable, the monthly series, the month-of-year pattern, and annual values.</p>
       <p><strong>How it is computed.</strong> Each hour's value is kept or dropped by the QC rule you pick and the plausibility limits. A station-month counts only with at least ${100 * +summary.min_month_coverage} % valid hours, and a daily maximum or minimum needs ${summary.min_day_hours} valid hours in that day. A station-year needs all 12 months. Each station counts equally, so the statewide value is the mean across stations. Rain is summed within a station before averaging, and annual "highest" values are each station's highest, averaged across stations. Rain totals in a month with missing hours are not adjusted upward, so they lean slightly low.</p>
       <p><strong>The trend.</strong> The slope is the Theil-Sen estimate over reviewed years, ending in ${summary.last_reviewed_year}, the last full year with QC flags. A year is skipped if fewer than ${100 * +summary.min_year_station_share} % of stations have a valid value under the chosen rule; original rain values, for example, are too sparse in some years, and the sentence above each chart lists the years used. Only stations with a valid value in every used year count, so stations joining or leaving cannot create a false trend. The Mann-Kendall p value assumes independent years. Ten years or so is short for climate conclusions: drought and wet periods can dominate a span this length, and these slopes describe this period and do not attribute a cause.</p>`,
      body => stateSection(body, summary));
    await section(view, "met-group", "Trends by region and fuel type",
      `<p><strong>What it shows.</strong> Annual values and trends for each region and fuel type, with an All row and column. Groups are kept even when small, with a note below 5 stations.</p>
       <p><strong>Regions.</strong> The FEMS areas: Northern California, Southern California and Great Basin, from the public fire-coordination-area boundaries. On FEMS stations, this assignment matches FEMS's own area label for ${fmt(+summary.fems_area_agreement)} of ${fmt(+summary.fems_stations)}. ${+summary.other_area_stations ? `${fmt(+summary.other_area_stations)} RAWS stations fall in a different coordination area and are shown under its name.` : ""}</p>
       <p><strong>Fuel type.</strong> The LANDFIRE ${esc(S(summary.fuel_release))} FBFM40 category of the station's cell, kept fixed through time. ${fmt(raws.filter(r => r.fuel_cell === "nonburnable").length)} stations sit on a non-burnable cell, so the selector can instead use the most common burnable category within 35 × 35 cells around the station. Neither says what fuel the station samples, because RAWS does not sample fuel.</p>`,
      body => groupSection(body, raws, summary));
    await section(view, "met-rose", "Wind roses by group",
      `<p><strong>What it shows.</strong> How often wind comes from each of 16 compass directions, split by speed. Peak wind uses the direction of the hour's highest gust.</p>
       <p><strong>How it is computed.</strong> Only hours where direction and speed both carry flag 0 and speed is above zero. Each station's hours become shares first, then stations are averaged, so each station counts equally. The vector mean is the mean direction, and <em>consistency</em> is the length of the mean unit vector: near 1 means wind keeps to one direction, and near 0 means it has none. A low value means the vector mean says little. All roses in a view share one radial scale.</p>`,
      body => roseSection(body, raws));
  };
})();
