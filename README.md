# FireSET fuel-type EDA — dashboard

Static dashboard over the FireSET fuel-type EDA for California: LANDFIRE FBFM13 / FBFM40
releases on one 30 m grid, the fuel crosswalk to five categories, FEMS fuel-moisture reading
counts per class, cross-product matrices, and release-to-release change.

Live site: https://utkrshkmr.github.io/FEMS/

Everything on the page is drawn in the browser from the CSV files under `site/data/`; the
pipeline's own SVG figures sit next to the interactive charts. No PNG, no rasters.

## Layout

| path | what |
|---|---|
| `site/index.html`, `site/app.js`, `site/styles.css` | the dashboard (vanilla JS; Plotly and PapaParse from cdnjs) |
| `site/data/<grid,crosswalk,counts,matrices,change,sampling>/` | every CSV and SVG the EDA pipeline wrote, same folder layout |
| `site/data/index.json` | catalogue the page reads at load: file list, schemes, pairs, years, headline numbers |
| `site/data/README.md`, `site/data/manifest.json` | the pipeline's report and manifest |
| `build_site.py` | copies CSV + SVG from an EDA output folder into `site/data/` and writes `index.json` |
| `.github/workflows/pages.yml` | deploys `site/` to GitHub Pages on every push to `main` |

## The story (one page per step)

1. **Start here** — the two data sets, the FEMS filter stages, the headline numbers, the change summary, the pipeline README.
2. **Fuel maps** — the master grid, valid cells per file, raw code inventory per release and product, pixel-level category agreement, non-burnable coincidence.
3. **Codes to categories** — the searchable code → category crosswalk, the five decisions, coverage.
4. **Where FEMS samples** — the fuel map with the FEMS sites drawn on it, what the sites sample, representativeness (area vs readings vs sites per class), sampling effort by year × month.
5. **Readings by class** — FEMS readings per class, by year / cumulative / total, per component, for both release conventions.
6. **Product agreement** — the A–D cross-tabulations with any component and period, counts or row/column percentages, plus the per-year small multiples.
7. **Moisture by season** — month-of-year median fuel moisture with interquartile band per fuel class and component.
8. **Change over releases** — % of cells changing per release pair, change by fuel category, net change per class, transition matrices, stability, class share per release, change maps, the FBFM13 grass anomaly.

Appendices: **All figures** (every pipeline SVG, searchable, each with its CSV) and **All data** (every file with a description and a download link).

Every chart, table and figure carries a line saying what it shows, and every section opens with an "About this analysis" block (what it is, how it is computed, how to read it, what this run shows).

The `sampling/` outputs (steps 4 and 7) come from the pipeline's `fireset_eda.sampling` module, which reproduces the exploratory views of the second notebook at aggregate level (sites appear only as dots on the map and as counts).

## Rebuilding after a new EDA run

```bash
python build_site.py --source /path/to/eda-outputs/fireset --out site
git add site && git commit -m "Refresh dashboard data" && git push
```

`build_site.py` uses the standard library only. It scrubs local absolute paths from the two
metadata CSVs and the manifest before copying.

## Local preview

```bash
python -m http.server 8000 --directory site
```

then open http://localhost:8000/.

## GitHub Pages

One-time setup (the default workflow token cannot create the Pages site itself):

1. Open *Settings → Pages* in this repository.
2. Under *Build and deployment*, set *Source* to **GitHub Actions**.
3. Open *Actions*, pick the failed "Deploy dashboard to GitHub Pages" run and choose
   *Re-run all jobs* (or push any commit to `main`).

After that every push to `main` publishes `site/` to https://utkrshkmr.github.io/FEMS/ in
about a minute.
