"""Build the Member Insights dashboard as one self-contained HTML file.

Usage:  python build.py [--data DATA_DIR] [--out OUT_FILE]

Reads the page source in src/, the count tables in DATA_DIR (default: data/) and
the assets, and writes OUT_FILE (default: dist/member-insights.html). The output
needs no server and no internet connection: styles, scripts, data, the logo and
the font are all inlined.
"""
import argparse
import base64
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"

# Tables the page reads, and the script that makes each one.
TABLES = {
    "summary": "build_roster_aggregates.py", "breakdowns": "build_roster_aggregates.py",
    "join_year": "build_roster_aggregates.py", "join_month": "build_roster_aggregates.py",
    "certifications": "build_roster_aggregates.py", "employers": "build_roster_aggregates.py",
    "counties": "build_roster_aggregates.py", "zips": "build_roster_aggregates.py",
    "cities": "build_roster_aggregates.py", "region_function": "build_roster_aggregates.py",
    "movement": "build_movement.py", "movement_detail": "build_movement.py",
}

# Files the source refers to by path, inlined as data URIs in the output.
INLINE = {
    "assets/wf_isaca_logo.png": "image/png",
    "assets/fonts/inter-latin.woff2": "font/woff2",
}

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>West Florida ISACA Member Insights</title>
"""


def data_uri(path, mime):
    return "data:%s;base64,%s" % (mime, base64.b64encode((ROOT / path).read_bytes()).decode())


def inline_assets(text):
    for path, mime in INLINE.items():
        if path in text:
            text = text.replace(path, data_uri(path, mime))
    return text


def load_tables(data_dir):
    missing = [name for name in TABLES if not (data_dir / f"{name}.json").exists()]
    if missing:
        lines = ["Missing tables in %s:" % data_dir]
        lines += ["  %s.json  (made by scripts/%s)" % (name, TABLES[name]) for name in missing]
        sys.exit("\n".join(lines))
    return {name: json.loads((data_dir / f"{name}.json").read_text())["rows"] for name in TABLES}


def build(data_dir, out_file):
    read = lambda name: (SRC / name).read_text()
    tables = load_tables(data_dir)
    runtime = read("runtime.js").replace("__DATA__", json.dumps(tables, separators=(",", ":")))
    html = "".join([
        HEAD,
        "<style>", read("theme.css"), inline_assets(read("style.css")), "</style>\n</head>\n<body>\n",
        '<div id="dash-root" lang="en">\n', inline_assets(read("page.html")).rstrip("\n"), "\n</div>\n",
        "<script>", (ROOT / "vendor" / "d3.min.js").read_text(), "</script>\n",
        "<script>\n", runtime, "</script>\n",
        "<script>", read("geo.js"), "</script>\n",
        "<script>(function () {\n", read("app.js"), "\n})();\nwindow.__dashStart();</script>\n",
        "</body>\n</html>\n",
    ])
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(html)
    print("Wrote %s (%d KB, %d tables)" % (out_file, len(html) // 1024, len(tables)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--data", default=str(ROOT / "data"), help="folder holding the count tables (default: data/)")
    parser.add_argument("--out", default=str(ROOT / "dist" / "member-insights.html"), help="output file")
    args = parser.parse_args()
    build(pathlib.Path(args.data), pathlib.Path(args.out))
