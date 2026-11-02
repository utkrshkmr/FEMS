#!/usr/bin/env python3
"""Copy the outputs behind the dashboard's LANDFIRE and FEMS pages into ``site/data/`` (CSV and SVG only)
and write ``site/data/index.json``. The Older section under ``site/older/`` is frozen and not touched.

    python build_site.py --source /path/to/eda-outputs/fireset [--out site]

Standard library only.
"""
import argparse
import csv
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

TASK_DIRS = ["landfire", "stations", "met"]
KEEP_EXT = {".csv", ".svg"}
NET_RE = re.compile(r"^(LF\d{4}(?:_Remap)?)_to_(LF\d{4}(?:_Remap)?)_net\.csv$")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", required=True, help="FireSET EDA output folder")
    ap.add_argument("--out", default="site", help="site folder (default: site)")
    a = ap.parse_args()
    src, out = Path(a.source).resolve(), Path(a.out).resolve()
    data = out / "data"
    if data.exists():
        shutil.rmtree(data)
    data.mkdir(parents=True)
    files = []
    for d in TASK_DIRS:
        for p in sorted((src / d).rglob("*")):
            if p.is_file() and p.suffix in KEEP_EXT:
                rel = p.relative_to(src)
                (data / rel).parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(p, data / rel)
                files.append({"path": rel.as_posix(), "bytes": p.stat().st_size})
    with (src / "landfire" / "counts_FBFM13.csv").open() as f:
        head = next(csv.reader(f))
    releases = [c for c in head if c.startswith("LF")]
    pairs = sorted({f"{m.group(1)}|{m.group(2)}" for p in (src / "landfire" / "net" / "FBFM13").glob("*_net.csv")
                    if (m := NET_RE.match(p.name))},
                   key=lambda s: (releases.index(s.split("|")[1]) - releases.index(s.split("|")[0]) > 1, releases.index(s.split("|")[0])))
    built = datetime.fromtimestamp((src / "stations" / "summary.csv").stat().st_mtime, timezone.utc).strftime("%Y-%m-%d")
    (data / "index.json").write_text(json.dumps({"built": built, "releases": releases, "pairs": pairs, "files": files}, indent=1))
    (out / ".nojekyll").touch()
    print(f"{len(files)} files ({sum(f['bytes'] for f in files) / 1e6:.1f} MB) -> {data}")


if __name__ == "__main__":
    main()
