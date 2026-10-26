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
| `site/data/<grid,crosswalk,counts,matrices,change>/` | every CSV and SVG the EDA pipeline wrote, same folder layout |
| `site/data/index.json` | catalogue the page reads at load: file list, schemes, pairs, years, headline numbers |
| `site/data/README.md`, `site/data/manifest.json` | the pipeline's report and manifest |
| `build_site.py` | copies CSV + SVG from an EDA output folder into `site/data/` and writes `index.json` |
| `.github/workflows/pages.yml` | deploys `site/` to GitHub Pages on every push to `main` |

## Sections

- **Overview** — headline numbers, FEMS filter stages, change summary, release conventions, the pipeline README.
- **Grid** — master grid, valid cells per file, raw code inventory per release and product, pixel-level category agreement, non-burnable coincidence, file alignment.
- **Crosswalk** — searchable code → category table, decisions, coverage.
- **Counts** — FEMS readings per class, by year / cumulative / total, per component, for both release conventions.
- **Matrices** — the A–D cross-tabulations with any component and period, counts or row/column percentages, plus the per-year small multiples.
- **Change** — % of cells changing per release pair, net change per class, transition matrices, stability, class share per release, change maps, the FBFM13 grass anomaly.
- **Figures** — all pipeline SVGs, filterable, each with its CSV.
- **Data** — the file list with download links.

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
