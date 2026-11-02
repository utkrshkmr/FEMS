# FireSET fuel-type EDA: dashboard

Static dashboard for California's LANDFIRE fuel maps and FEMS fuel-moisture stations.

Live site: https://utkrshkmr.github.io/FEMS/

Everything is drawn in the browser from the CSV and SVG files under `site/data/`. There are no PNGs or rasters.

## Pages

**LANDFIRE** characterises only the LANDFIRE files:

1. Cells per fuel code in each file, one table for FBFM13 and one for FBFM40.
2. California map with a legend, with a release and product selector.
3. Net movement matrix between releases. The diagonal is a class's net change, other cells are net cells given to the column's class, and every row sums to zero.
4. Logic tables mapping each product to grass, shrub, tree and slash.
5. The same three views for the categories.

**FEMS stations** characterises only the stations:

1. Yearly measurements for live fuel and each dead fuel type.
2. Each reported fuel with its closest FBFM13 code, FBFM40 code and category.
3. Stations whose reported fuels change between reporting years.
4. Station fuels against the LANDFIRE cell they sit on, with discrepancies listed and mapped.
5. Stations on non-burnable cells, and whether they record a burnable plant.
6. The 35 × 35 cell neighbourhood around each station, with filters and a map.

**MET** shows trends in hourly RAWS weather from the public FEMS Climatology API:

1. Each requested field, its source, and how much of it is original versus estimated, per year.
2. RAWS stations relative to FEMS stations: map, distance to the nearest RAWS, and the station table.
3. Statewide monthly, month-of-year and annual values with trends.
4. Trends by region and fuel type.
5. Wind roses by group.

**Alignment** puts nine decisions to a human expert on how every FEMS station gets a LANDFIRE fuel label (scheme, release, spatial support, non-burnable fallback, species disagreement, several species, co-location, dead-only stations, unsampled classes), each with the evidence behind it. Answers stay in the browser, a preview applies them to every station, and both the answer sheet and the station assignment can be downloaded.

**Older** is the previous dashboard, frozen under `site/older/`.

## Layout

| path | what |
|---|---|
| `site/index.html`, `app.js`, `core.js`, `landfire.js`, `stations.js`, `met.js`, `alignment.js`, `styles.css` | the pages (vanilla JS; Plotly and PapaParse from cdnjs) |
| `site/data/` | CSV and SVG behind the pages, plus `index.json` |
| `site/older/` | the previous dashboard with its own code and data |
| `build_site.py` | copies `landfire/`, `stations/`, `met/` and `alignment/` from an EDA output folder into `site/data/` |
| `build_older.py` | the builder of the previous dashboard, kept for reference |
| `.github/workflows/pages.yml` | deploys `site/` to GitHub Pages on every push to `main` |

## Rebuilding

The pages come from `fireset_eda.pages`, which reuses the pipeline's caches. The species mapping is the editable file `fireset_eda/fems_fuel_mapping.csv`; after changing it, rerun these steps. To add newer weather first, run `python -m fireset_eda.raws --config config.yaml --refresh-current`; raw downloads stay under `data-dump/raws/` and are not published.

```bash
python -m fireset_eda.pages --config config.yaml
```

```bash
python build_site.py --source ../eda-outputs/fireset --out site
```

## Local preview

```bash
python -m http.server 8000 --directory site
```

Then open http://localhost:8000/.
