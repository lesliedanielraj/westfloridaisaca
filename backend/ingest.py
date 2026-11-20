"""Load ISACA chapter reports into the site's database, without personal details.

Usage:
    python -m backend.ingest --roster raw/MemberRoster_041.xlsx \\
        [--new raw/NewChapterMembers_041.xlsx --inbound raw/InboundChapterTransfer.xlsx \\
         --outbound raw/OutboundChapterTransfer.xlsx] [--db data/members.db]

The database gets one row per member holding only what the charts need: seniority,
job function, member level and type, gender, employer, home city, ZIP and county,
join and expiry dates, and credentials. Names, emails, phone numbers, street
addresses, job titles and ISACA member IDs are never written. Rows are shuffled, so
a row's id says nothing about its place in the roster.

Each run replaces the database.
"""
import argparse
import pathlib
import random
import re
import sqlite3

import pandas as pd
import zipcodes

from . import classify

SCHEMA = """
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE members (
    id INTEGER PRIMARY KEY,
    seniority TEXT NOT NULL, job_function TEXT NOT NULL, professional_area TEXT,
    member_level TEXT, member_type TEXT NOT NULL, gender TEXT NOT NULL, employer TEXT,
    city TEXT, zip TEXT, county TEXT, in_florida INTEGER NOT NULL, region TEXT NOT NULL,
    join_date TEXT, expiry_date TEXT, tenure_years REAL, tenure_band TEXT,
    n_certs INTEGER NOT NULL
);
CREATE TABLE member_certs (member_id INTEGER NOT NULL REFERENCES members(id), cert TEXT NOT NULL);
CREATE TABLE zips (zip TEXT PRIMARY KEY, place TEXT, county TEXT, lat REAL, lon REAL);
CREATE TABLE movements (
    id INTEGER PRIMARY KEY, date TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('new', 'transfer_in', 'transfer_out')),
    member_type TEXT, chapter TEXT
);
CREATE INDEX members_seniority ON members(seniority);
CREATE INDEX members_county ON members(county);
CREATE INDEX members_function ON members(job_function);
CREATE INDEX member_certs_member ON member_certs(member_id);
CREATE INDEX member_certs_cert ON member_certs(cert);
"""


def report_date(path):
    """The 'as of' date ISACA prints in the first cell of a report."""
    head = str(pd.read_excel(path, header=None, nrows=1).iloc[0, 0])
    return pd.to_datetime(re.search(r"(\d{1,2}/\d{1,2}/\d{4})", head).group(1), format="%m/%d/%Y")


def iso(value):
    return None if pd.isna(value) else value.strftime("%Y-%m-%d")


def text(value):
    return None if pd.isna(value) else str(value)


def zip_lookup(codes):
    found = {}
    for code in codes:
        try:
            hit = zipcodes.matching(code) if re.match(r"^\d{5}$", code) else None
        except Exception:
            hit = None
        found[code] = hit[0] if hit else None
    return found


def read_roster(path):
    as_of = report_date(path)
    df = pd.read_excel(path, header=1, dtype=str)
    df = df[df["Member ID"].notna()].copy()

    area = df["Professional Area"]
    out = pd.DataFrame(index=df.index)
    out["seniority"] = area.map(classify.seniority)
    out["job_function"] = area.map(classify.job_function)
    out["professional_area"] = area
    out["member_level"] = df["Member Level"]
    out["member_type"] = df["Member Type"].fillna("Not stated").replace(classify.MEMBER_TYPES)
    out["gender"] = df["Gender"].fillna("Not stated").replace(
        {"I do not wish to answer": "Not stated", "Prefer not to answer": "Not stated"})
    out["employer"] = df["Company"].map(classify.employer)

    zip5 = df["Home Zip"].str.strip().str[:5]
    info = zip_lookup(zip5.dropna().unique())
    state = zip5.map(lambda z: (info.get(z) or {}).get("state"))
    in_fl = (df["Home State"].str.strip() == "Florida") | (state == "FL")
    county = zip5.map(lambda z: (info.get(z) or {}).get("county")).str.replace(" County", "", regex=False)
    county = county.where(state == "FL")
    out["city"] = df["Home City"].map(classify.city).where(in_fl)
    out["zip"] = zip5.where(state == "FL")
    out["county"] = county
    out["in_florida"] = in_fl.astype(int)
    top = list(county.value_counts().index[:6])
    out["region"] = [c if c in top else ("Other Florida" if fl else "Outside Florida") for c, fl in zip(county, in_fl)]

    join = pd.to_datetime(df["Join Date"], format="%m/%d/%y", errors="coerce")
    expiry = pd.to_datetime(df["Expiry Date"], format="%m/%d/%y", errors="coerce")
    tenure = (as_of - join).dt.days / 365.25
    out["join_date"] = join.map(iso)
    out["expiry_date"] = expiry.map(iso)
    out["tenure_years"] = tenure
    out["tenure_band"] = pd.cut(tenure, classify.TENURE_EDGES, labels=classify.TENURE_BANDS).astype(object)

    certs = pd.DataFrame({c: df[c].notna() for c in classify.CERTS}, index=df.index)
    out["n_certs"] = certs.sum(axis=1)

    zips = [
        {"zip": z, "place": hit.get("city"), "county": hit["county"].replace(" County", ""),
         "lat": float(hit["lat"]), "lon": float(hit["long"])}
        for z, hit in info.items() if hit and hit.get("state") == "FL" and hit.get("lat")
    ]
    return as_of, out, certs, zips, top


def read_transfers(path, chapter_column, kind):
    raw = pd.read_excel(path, header=None, dtype=str)
    header = next(i for i in range(len(raw)) if "Transfer Date" in [str(v) for v in raw.iloc[i]])
    df = raw.iloc[header + 1:].copy()
    df.columns = [str(v) for v in raw.iloc[header]]
    df = df[df["ID"].notna()]
    dates = pd.to_datetime(df["Transfer Date"], format="%Y%m%d")
    return [{"date": iso(d), "kind": kind, "member_type": None, "chapter": classify.chapter(c)}
            for d, c in zip(dates, df[chapter_column])]


def read_movements(new_path, inbound_path, outbound_path):
    as_of = report_date(new_path)
    new = pd.read_excel(new_path, header=1, dtype=str)
    new = new[new["ID"].notna()]
    dates = pd.to_datetime(new["Join Date"], format="%m/%d/%Y")
    types = new["Type"].map(lambda t: classify.MEMBER_TYPES.get(t, t))
    rows = [{"date": iso(d), "kind": "new", "member_type": text(t), "chapter": None} for d, t in zip(dates, types)]
    rows += read_transfers(inbound_path, "Chapter From", "transfer_in")
    rows += read_transfers(outbound_path, "Chapter To", "transfer_out")
    return as_of, rows


def write_db(db_path, as_of, members, certs, zips, top_counties, movements=None, movement_as_of=None):
    db_path = pathlib.Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()
    con = sqlite3.connect(db_path)
    con.executescript(SCHEMA)

    order = list(members.index)
    random.shuffle(order)
    columns = list(members.columns)
    for new_id, idx in enumerate(order, start=1):
        row = members.loc[idx]
        values = [None if pd.isna(row[c]) else row[c].item() if hasattr(row[c], "item") else row[c] for c in columns]
        con.execute("INSERT INTO members (id, %s) VALUES (?, %s)" % (", ".join(columns), ", ".join("?" * len(columns))),
                    [new_id] + values)
        con.executemany("INSERT INTO member_certs VALUES (?, ?)",
                        [(new_id, c) for c in classify.CERTS if certs.loc[idx, c]])
    con.executemany("INSERT INTO zips VALUES (:zip, :place, :county, :lat, :lon)", zips)

    meta = {"as_of": iso(as_of), "top_counties": "|".join(top_counties)}
    if movements is not None:
        random.shuffle(movements)
        con.executemany("INSERT INTO movements (date, kind, member_type, chapter) VALUES (:date, :kind, :member_type, :chapter)",
                        movements)
        meta["movement_from"] = iso(movement_as_of - pd.Timedelta(days=90))
        meta["movement_to"] = iso(movement_as_of)
    con.executemany("INSERT INTO meta VALUES (?, ?)", meta.items())
    con.commit()
    con.close()
    return len(order), len(movements or [])


def main():
    parser = argparse.ArgumentParser(description="Load ISACA chapter reports into the site's database.")
    parser.add_argument("--roster", required=True, help="Member Roster - Full report (.xlsx)")
    parser.add_argument("--new", help="New Member report (.xlsx)")
    parser.add_argument("--inbound", help="Transfer IN report (.xlsx)")
    parser.add_argument("--outbound", help="Transfer OUT report (.xlsx)")
    parser.add_argument("--db", default="data/members.db", help="database file to write (default: data/members.db)")
    args = parser.parse_args()

    given = [args.new, args.inbound, args.outbound]
    if any(given) and not all(given):
        parser.error("--new, --inbound and --outbound go together: give all three or none")

    as_of, members, certs, zips, top = read_roster(args.roster)
    movement_as_of, movements = read_movements(*given) if all(given) else (None, None)
    n_members, n_moves = write_db(args.db, as_of, members, certs, zips, top, movements, movement_as_of)
    print("Wrote %s: %d members as of %s, %d joins and transfers" % (args.db, n_members, iso(as_of), n_moves))


if __name__ == "__main__":
    main()
