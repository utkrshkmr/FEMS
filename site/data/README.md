# FireSET fuel-type EDA — California

Run `2026-10-26T20:15:45Z` · crosswalk from **notebook cell** · outputs in this folder · rerun with `python -m fireset_eda run --config config.yaml` or the driver notebook `fireset_eda.ipynb`.

## Decisions in effect

| decision | value |
|---|---|
| `GS_CATEGORY` | shrub |
| `SB_CATEGORY` | slash |
| `TU_CATEGORY` | tree |
| `FM2_CATEGORY` | grass |
| `FM6_CATEGORY` | shrub |

Five categories, all first-class: `nonburnable`=0, `grass`=1, `shrub`=2, `tree`=3, `slash`=4.
Non-burnable codes are LANDFIRE's 91 (urban), 92 (snow/ice), 93 (agriculture), 98 (water), 99 (barren) in **both** products (the spec's FBFM40 range 91–95 would leave water and barren unmapped).

## Releases

Used (LF2016 Remap onward, discovered on disk): LF2016_Remap, LF2022, LF2023, LF2024, LF2025.

- missing: LF2020  — expected in spec but not on disk (LF2020 is no longer offered for download)

Matched convention (headline): each FEMS year uses the temporally nearest release; ties go to the earlier release. Fixed convention (secondary): every year uses the latest release.

| FEMS year | matched | fixed |
|---|---|---|
| 2015 | LF2016_Remap | LF2025 |
| 2016 | LF2016_Remap | LF2025 |
| 2017 | LF2016_Remap | LF2025 |
| 2018 | LF2016_Remap | LF2025 |
| 2019 | LF2016_Remap | LF2025 |
| 2020 | LF2022 | LF2025 |
| 2021 | LF2022 | LF2025 |
| 2022 | LF2022 | LF2025 |
| 2023 | LF2023 | LF2025 |
| 2024 | LF2024 | LF2025 |
| 2025 | LF2025 | LF2025 |
| 2026 | LF2025 | LF2025 |

## Definitions

- **Scope (project decision, 2026-10-26)**: the EDA stays at aggregate level. FEMS enters only as reading counts per fuel class; there are no per-site tables, 3×3 purities, site patterns, 250 m locations or site-level change twins.
- **Reading** = one FEMS sample row, `Submitted`, moisture in [0, 400] %, whose site lies inside the California polygon (point-in-polygon on coordinates, not the `State` field). Missing and out-of-range rows are counted below and excluded.
- **Components**: live, dead_1hr, dead_10hr, dead_100hr, dead_1000hr, dead_duff. Live = Tree, Shrub, Grass, Forb categories (incl. live moss).
- **Year** = local (America/Los_Angeles) calendar year of the sample time.
- **Class of a reading** = the fuel class of the 30 m master-grid cell containing its site's coordinates, in the release chosen for the reading's year by the convention; a reading on a nodata cell is `unassigned`. Each reading counts toward exactly one class per scheme.

## Headline numbers

### Valid cells inside California per file

California mask: 455,354,314 cells (409,819 km²).

| file | valid CA cells | km² |
|---|---|---|
| LF2016_Remap FBFM13 | 455,351,880 | 409,817 |
| LF2016_Remap FBFM40 | 455,351,880 | 409,817 |
| LF2022 FBFM13 | 455,354,314 | 409,819 |
| LF2022 FBFM40 | 455,354,314 | 409,819 |
| LF2023 FBFM13 | 455,354,314 | 409,819 |
| LF2023 FBFM40 | 455,354,314 | 409,819 |
| LF2024 FBFM13 | 455,354,314 | 409,819 |
| LF2024 FBFM40 | 455,354,314 | 409,819 |
| LF2025 FBFM13 | 455,354,314 | 409,819 |
| LF2025 FBFM40 | 455,354,314 | 409,819 |

### FEMS after each filter stage

| stage | rows |
|---|---|
| rows in yearly files | 244,268 |
| Sample Status == Submitted | 244,268 |
| duplicate Sample Id rows removed | 0 |
| rows with unparseable time removed | 0 |
| local year 2015–present | 244,223 |
| site id present in site metadata | 244,223 |
| site inside California polygon | 49,785 |
| QC: moisture missing (reported, excluded) | 0 |
| QC: moisture out of range (reported, excluded) | 13 |
| California readings after QC | 49,772 |
| California sites in metadata (polygon) | 417 |
| California sites with >= 1 QC reading (used to locate readings) | 376 |

**Readings after QC 49,772 (located through 376 California sites).**

### % of California cells changed per release pair

| scheme | pair | % changed |
|---|---|---|
| cat_from_40 | LF2016_Remap->LF2022 | 13.2 % |
| cat_from_40 | LF2016_Remap->LF2025 | 23.6 % |
| cat_from_40 | LF2022->LF2023 | 5.7 % |
| cat_from_40 | LF2023->LF2024 | 11.2 % |
| cat_from_40 | LF2024->LF2025 | 4.7 % |
| cat_from_13 | LF2016_Remap->LF2022 | 32.1 % |
| cat_from_13 | LF2016_Remap->LF2025 | 34.2 % |
| cat_from_13 | LF2022->LF2023 | 5.9 % |
| cat_from_13 | LF2023->LF2024 | 11.6 % |
| cat_from_13 | LF2024->LF2025 | 4.9 % |
| FBFM13 | LF2016_Remap->LF2022 | 52.3 % |
| FBFM13 | LF2016_Remap->LF2025 | 53.3 % |
| FBFM13 | LF2022->LF2023 | 7.3 % |
| FBFM13 | LF2023->LF2024 | 12.5 % |
| FBFM13 | LF2024->LF2025 | 6.3 % |
| FBFM40 | LF2016_Remap->LF2022 | 32.3 % |
| FBFM40 | LF2016_Remap->LF2025 | 43.2 % |
| FBFM40 | LF2022->LF2023 | 9.3 % |
| FBFM40 | LF2023->LF2024 | 14.1 % |
| FBFM40 | LF2024->LF2025 | 8.4 % |

### Matrix D (cat_from_13 × cat_from_40) diagonal share

- matched_release, total: readings 91.4%
- fixed_release, total: readings 97.2%
- all California cells (pixel level): LF2016_Remap 78.4%, LF2022 89.7%, LF2023 90.0%, LF2024 97.9%, LF2025 98.0%

### Non-burnable coincidence (FBFM13 91–99 vs FBFM40 NB, same release)

- LF2016_Remap: 36,536,673 cells disagree
- LF2022: 0 cells disagree
- LF2023: 0 cells disagree
- LF2024: 0 cells disagree
- LF2025: 0 cells disagree

## Findings: FBFM13 grass anomaly (reported, not fixed)

FBFM13 FM1 covers 51,190 km² of California in LF2016_Remap and 0 km² in LF2022, 0 km² in LF2023, 0 km² in LF2024, 0 km² in LF2025; FM3 goes from 418 km² to 0, 0, 0, 0 km². FBFM40 grass (GR1–GR9) stays at 120,977, 114,001, 118,166, 83,630, 81,402 km² across the same releases. The LF2016_Remap FM1+FM3 cells end up mostly as LF2022: FM2 68%, FM5 15%, FM8 6%; LF2023: FM2 67%, FM5 15%, FM8 6%, FM4 5%; LF2024: FM2 65%, FM5 19%, FM4 5%; LF2025: FM2 63%, FM5 20%, FM4 5%. In the same releases FBFM40 GR cells carry FBFM13 codes LF2016_Remap: FM2 16%, FM1 42%, NB9 27%, FM5 10%; LF2022: FM2 63%, FM8 37%; LF2023: FM2 65%, FM8 35%; LF2024: FM2 90%, FM8 10%; LF2025: FM2 90%, FM8 10%. See `change/anomaly_fbfm13_grass.png` and the FBFM13 transition matrices.

## Layout

- `grid/` metadata, alignment, master_grid.json, CA caches (`grid/ca_cache/`), inventories, figures
- `crosswalk/` fuel_crosswalk.csv (generated; never hand-edited), mapping tables, mapping.md, coverage
- `counts/<run>/` long-form and wide reading counts per scheme and period type, figures
- `matrices/<run>/` one CSV + heatmap per pair × metric × period, per-year small multiples
- `change/` transition tables per scheme and pair, summaries, stability rasters/maps, change maps
- `images/` PNG twin of every CSV and figure, mirroring the task folders. Long-form count CSVs are rendered as their wide pivot; matrix CSVs are rendered as their annotated heatmap.
- `manifest.json` inputs + SHA-256, releases, row counts per stage, decisions, headline numbers
