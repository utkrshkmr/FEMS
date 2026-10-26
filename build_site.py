#!/usr/bin/env python3
"""Build the static dashboard from a FireSET EDA output folder.

Copies every CSV and SVG (nothing else: no PNG, no rasters) from the EDA output folder into
``site/data/`` keeping the folder layout, scrubs local absolute paths, and writes
``site/data/index.json`` (file catalogue + headline numbers) that the page reads at load.

    python build_site.py --source /path/to/eda-outputs/fireset [--out site]

Standard library only.
"""
import argparse
import json
import re
import shutil
from pathlib import Path

TASK_DIRS = ["grid", "crosswalk", "counts", "matrices", "change"]
KEEP_EXT = {".csv", ".svg"}
CONVENTIONS = ["matched_release", "fixed_release"]
PAIR_RE = re.compile(r"^([A-D])_(\w+?)_x_(\w+?)_(n_readings_[a-z0-9_]+?)_(total|\d{4})\.csv$")
CHANGE_RE = re.compile(r"^(LF\d{4}(?:_Remap)?)_to_(LF\d{4}(?:_Remap)?)_(cells|km2|row_normalised)\.csv$")
MAP_RE = re.compile(r"^(\w+?)_(LF\d{4}(?:_Remap)?)_to_(LF\d{4}(?:_Remap)?)_(binary|from_to)\.svg$")


def scrub(text, roots):
    """Replace absolute local prefixes so no machine paths end up on the web."""
    for r in roots:
        text = text.replace(r, "<project>")
    return text


def copy_tree(src, dst, roots):
    files = []
    for d in TASK_DIRS:
        for p in sorted((src / d).rglob("*")):
            if not p.is_file() or p.suffix not in KEEP_EXT:
                continue
            rel = p.relative_to(src)
            target = dst / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            if p.suffix == ".csv" and rel.parts[0] == "grid" and rel.name in ("file_metadata.csv", "release_discovery.csv"):
                target.write_text(scrub(p.read_text(), roots))
            else:
                shutil.copyfile(p, target)
            files.append({"path": rel.as_posix(), "bytes": target.stat().st_size, "kind": p.suffix[1:]})
    return files


def catalogue(files, manifest):
    paths = {f["path"] for f in files}
    schemes, pairs, metrics, periods = [], {}, set(), set()
    for f in files:
        parts = Path(f["path"]).parts
        if parts[0] == "counts" and len(parts) == 3 and parts[1] in CONVENTIONS and parts[2].endswith("_total.csv"):
            s = parts[2][: -len("_total.csv")]
            if s not in schemes:
                schemes.append(s)
        if parts[0] == "matrices" and len(parts) == 3:
            m = PAIR_RE.match(parts[2])
            if m:
                letter, rows, cols, metric, period = m.groups()
                pairs.setdefault(letter, {"id": f"{letter}_{rows}_x_{cols}", "rows": rows, "cols": cols})
                metrics.add(metric)
                periods.add(period)
    change = {}
    for f in files:
        parts = Path(f["path"]).parts
        if parts[0] == "change" and len(parts) == 3 and parts[1] != "maps":
            m = CHANGE_RE.match(parts[2])
            if m:
                change.setdefault(parts[1], set()).add(f"{m.group(1)}->{m.group(2)}")
    maps = []
    for f in files:
        parts = Path(f["path"]).parts
        if parts[:2] == ("change", "maps") and f["kind"] == "svg":
            m = MAP_RE.match(parts[2])
            if m:
                maps.append({"scheme": m.group(1), "pair": f"{m.group(2)}->{m.group(3)}", "kind": m.group(4),
                             "path": f["path"]})
    years = sorted(int(p) for p in periods if p != "total")
    order = {"nonburnable": 0, "grass": 1, "shrub": 2, "tree": 3, "slash": 4}
    metric_order = ["n_readings_total", "n_readings_live", "n_readings_dead_1hr", "n_readings_dead_10hr",
                    "n_readings_dead_100hr", "n_readings_dead_1000hr", "n_readings_dead_duff", "n_readings_dead_moss"]
    return {
        "schemes": sorted(schemes, key=lambda s: ["FBFM13", "FBFM40", "cat_from_13", "cat_from_40"].index(s)
                          if s in ["FBFM13", "FBFM40", "cat_from_13", "cat_from_40"] else 9),
        "conventions": [c for c in CONVENTIONS if any(p.startswith(f"counts/{c}/") for p in paths)],
        "pairs": [pairs[k] for k in sorted(pairs)],
        "metrics": [m for m in metric_order if m in metrics] + sorted(metrics - set(metric_order)),
        "years": years,
        "change": {k: sorted(v, key=lambda s: (int(re.search(r"LF(\d{4})", s).group(1)), s)) for k, v in change.items()},
        "maps": maps,
        "classes": sorted(order, key=order.get),
        "releases": manifest.get("releases_used", []),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", required=True, help="FireSET EDA output folder (holds manifest.json)")
    ap.add_argument("--out", default="site", help="site folder (default: site)")
    a = ap.parse_args()
    src = Path(a.source).resolve()
    out = Path(a.out).resolve()
    manifest = json.loads((src / "manifest.json").read_text())
    roots = sorted({str(Path(manifest["config_path"]).parent), str(Path.home())}, key=len, reverse=True)

    data = out / "data"
    if data.exists():
        shutil.rmtree(data)
    data.mkdir(parents=True)
    files = copy_tree(src, data, roots)

    readme = scrub((src / "README.md").read_text(), roots)
    (data / "README.md").write_text(readme)
    man = json.loads(scrub(json.dumps(manifest), roots))
    (data / "manifest.json").write_text(json.dumps(man, indent=1))

    index = {
        "built_from": man.get("timestamp_utc"),
        "runtime_s": man.get("runtime_s"),
        "headline": man.get("headline", {}),
        "master_grid": {k: v for k, v in man.get("master_grid", {}).items() if k != "crs_wkt"},
        "row_counts_by_stage": man.get("row_counts_by_stage", []),
        "matched_release_table": man.get("matched_release_table", {}),
        "fixed_release_table": man.get("fixed_release_table", {}),
        "decisions": man.get("crosswalk_decisions", {}),
        "release_discovery": man.get("release_discovery", []),
        "catalogue": catalogue(files, man),
        "files": files,
    }
    (data / "index.json").write_text(json.dumps(index, indent=1))
    (out / ".nojekyll").touch()
    n_csv = sum(f["kind"] == "csv" for f in files)
    n_svg = sum(f["kind"] == "svg" for f in files)
    mb = sum(f["bytes"] for f in files) / 1e6
    print(f"{n_csv} CSV + {n_svg} SVG ({mb:.1f} MB) -> {data}")


if __name__ == "__main__":
    main()
