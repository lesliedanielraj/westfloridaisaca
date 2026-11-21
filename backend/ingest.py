"""Load one month's ISACA chapter reports into the site's database, without personal details.

Usage:
    python -m backend.ingest --roster raw/MemberRoster_041.xlsx \\
        [--new raw/NewChapterMembers_041.xlsx --inbound raw/InboundChapterTransfer.xlsx \\
         --outbound raw/OutboundChapterTransfer.xlsx] [--db data/members.db] [--keep-reports] [--truncate]
    python -m backend.ingest --clear [--db data/members.db]

Each run adds one report to the history; it does not replace what is there, unless --truncate
is given, which empties the database and loads the report as the only one. --clear empties it and stops. Members are
matched from month to month by a keyed hash of their ISACA member ID (see privacy.py), and
the run records who joined, who left, and what changed for those who stayed.

What is stored for a member: seniority, job function, member level and type, gender,
employer, home city, ZIP and county, the months they joined and their membership ends, and
credentials. Never stored: names, emails, phone numbers, street addresses, job titles and
member IDs. An employer, ZIP code or city shared by fewer than five members is blanked.

A load is refused, and nothing is stored, if a check in privacy.py fails. After a load the
report files are deleted unless --keep-reports is given.
"""
import argparse
import datetime as dt
import hashlib
import pathlib
import random
import re
import sqlite3

import pandas as pd
import zipcodes

from . import classify, privacy

SCHEMA = """
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE loads (
    id INTEGER PRIMARY KEY, report_date TEXT NOT NULL UNIQUE, file_sha256 TEXT NOT NULL UNIQUE, loaded_at TEXT NOT NULL,
    members INTEGER NOT NULL, joined INTEGER NOT NULL, left_chapter INTEGER NOT NULL, rejoined INTEGER NOT NULL,
    changed INTEGER NOT NULL, k INTEGER NOT NULL, rows_unique INTEGER NOT NULL,
    blanked_employer INTEGER NOT NULL, blanked_zip INTEGER NOT NULL, blanked_city INTEGER NOT NULL
);
-- One row per member per stretch of time in which nothing stored about them changed.
-- valid_to is empty while the row is the member's current one.
CREATE TABLE versions (
    id INTEGER PRIMARY KEY, pid TEXT NOT NULL, valid_from TEXT NOT NULL, valid_to TEXT,
    seniority TEXT NOT NULL, job_function TEXT NOT NULL, professional_area TEXT,
    member_level TEXT, member_type TEXT NOT NULL, gender TEXT NOT NULL, employer TEXT,
    city TEXT, zip TEXT, county TEXT, in_florida INTEGER NOT NULL,
    join_date TEXT, expiry_date TEXT, n_certs INTEGER NOT NULL, certs TEXT NOT NULL
);
CREATE TABLE version_certs (version_id INTEGER NOT NULL REFERENCES versions(id), cert TEXT NOT NULL);
-- The members on the latest roster, with the values that depend on the report date.
CREATE TABLE current (
    version_id INTEGER PRIMARY KEY REFERENCES versions(id), region TEXT NOT NULL,
    tenure_years REAL, tenure_band TEXT, joined_90d INTEGER NOT NULL, joined_12mo INTEGER NOT NULL
);
CREATE TABLE changes (
    id INTEGER PRIMARY KEY, load_id INTEGER NOT NULL REFERENCES loads(id), report_date TEXT NOT NULL, pid TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('joined', 'left', 'rejoined', 'changed', 'renewed', 'credential_gained', 'credential_dropped')),
    field TEXT, old_value TEXT, new_value TEXT
);
CREATE TABLE zips (zip TEXT PRIMARY KEY, place TEXT, county TEXT, lat REAL, lon REAL);
CREATE TABLE movements (
    id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, date TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('new', 'transfer_in', 'transfer_out')),
    member_type TEXT, chapter TEXT
);
CREATE INDEX versions_pid ON versions(pid);
CREATE INDEX version_certs_version ON version_certs(version_id);
CREATE INDEX changes_load ON changes(load_id);
-- What the API reads: today's members, with no member key.
CREATE VIEW members AS
    SELECT v.id AS id, v.seniority, v.job_function, v.professional_area, v.member_level, v.member_type, v.gender,
           v.employer, v.city, v.zip, v.county, v.in_florida, c.region, v.join_date, v.expiry_date,
           c.tenure_years, c.tenure_band, c.joined_90d, c.joined_12mo, v.n_certs
    FROM versions v JOIN current c ON c.version_id = v.id;
CREATE VIEW member_certs AS
    SELECT vc.version_id AS member_id, vc.cert AS cert
    FROM version_certs vc JOIN current c ON c.version_id = vc.version_id;
"""

# What a version row holds, besides its key and dates. A difference in any of these starts a new version.
VERSION_COLUMNS = ("seniority", "job_function", "professional_area", "member_level", "member_type", "gender", "employer",
                   "city", "zip", "county", "in_florida", "join_date", "expiry_date", "n_certs", "certs")
INSERT_VERSION = """
INSERT INTO versions (pid, valid_from, seniority, job_function, professional_area, member_level, member_type, gender, employer,
                      city, zip, county, in_florida, join_date, expiry_date, n_certs, certs)
VALUES (:pid, :valid_from, :seniority, :job_function, :professional_area, :member_level, :member_type, :gender, :employer,
        :city, :zip, :county, :in_florida, :join_date, :expiry_date, :n_certs, :certs)
"""
# Changes worth a line in the change log. Employer, ZIP and city can also flip to or from blank when
# a group crosses the five-member floor; that says nothing about the member, so it is not logged.
LOGGED_FIELDS = ("seniority", "job_function", "member_level", "member_type", "county", "employer")
# Values that only a short list may hold; anything else stops the load.
CATEGORIES = {
    "seniority": classify.SENIORITY, "member_level": classify.MEMBER_LEVELS, "gender": classify.GENDERS,
    "in_florida": [0, 1],
}
# Attributes someone outside could plausibly know about a member; used to report how exposed the rows are.
KNOWABLE = ["zip", "county", "employer", "gender", "seniority", "job_function", "join_date"]


def report_date(path):
    """The 'as of' date ISACA prints in the first cell of a report."""
    head = str(pd.read_excel(path, header=None, nrows=1).iloc[0, 0])
    return pd.to_datetime(re.search(r"(\d{1,2}/\d{1,2}/\d{4})", head).group(1), format="%m/%d/%Y")


def iso(value):
    return None if pd.isna(value) else value.strftime("%Y-%m-%d")


def month(value):
    """A date kept only to its month, written as the first of that month."""
    return None if pd.isna(value) else value.strftime("%Y-%m-01")


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


def read_roster(path, key, k=privacy.K):
    """The roster as (report date, members, as-of values, ZIP centres, largest counties, privacy figures).
    `members` has one row per member with a pseudonym and only the columns that may be stored."""
    as_of = report_date(path)
    df = pd.read_excel(path, header=1, dtype=str)
    df = df[df["Member ID"].notna()].copy()
    if df["Member ID"].duplicated().any():
        raise privacy.PrivacyError("The roster lists a member ID twice; refusing to guess which row is right")

    area = df["Professional Area"]
    out = pd.DataFrame(index=df.index)
    out["pid"] = df["Member ID"].map(lambda member_id: privacy.pseudonym(key, "member", member_id))
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

    join = pd.to_datetime(df["Join Date"], format="%m/%d/%y", errors="coerce")
    expiry = pd.to_datetime(df["Expiry Date"], format="%m/%d/%y", errors="coerce")
    out["join_date"] = join.map(month)
    out["expiry_date"] = expiry.map(month)
    held = pd.DataFrame({c: df[c].notna() for c in classify.CERTS}, index=df.index)
    out["n_certs"] = held.sum(axis=1)
    out["certs"] = held.apply(lambda row: ",".join(c for c in classify.CERTS if row[c]), axis=1)

    # Values that depend on the report date. They are worked out from the exact dates, which are not kept.
    top = list(county.value_counts().index[:6])
    tenure = (as_of - join).dt.days / 365.25
    now = pd.DataFrame(index=df.index)
    now["region"] = [c if c in top else ("Other Florida" if fl else "Outside Florida") for c, fl in zip(county, in_fl)]
    now["tenure_years"] = tenure.round(1)
    now["tenure_band"] = pd.cut(tenure, classify.TENURE_EDGES, labels=classify.TENURE_BANDS).astype(object)
    now["joined_90d"] = (join >= as_of - pd.Timedelta(days=90)).astype(int)
    now["joined_12mo"] = (join >= as_of - pd.Timedelta(days=365)).astype(int)

    blanked = privacy.floor_values(out, ["employer", "zip", "city"], k)
    figures = {"k": k, "blanked": blanked, "rows_unique": privacy.unique_rows(out, KNOWABLE)}
    check(out, k)

    zips = [
        {"zip": z, "place": hit.get("city"), "county": hit["county"].replace(" County", ""),
         "lat": float(hit["lat"]), "lon": float(hit["long"])}
        for z, hit in info.items() if hit and hit.get("state") == "FL" and hit.get("lat") and z in set(out["zip"].dropna())
    ]
    return as_of, out, now, zips, top, figures


def check(out, k):
    """The gates. Each raises PrivacyError, which stops the load before anything is written."""
    privacy.check_frame(out, ("pid",) + VERSION_COLUMNS, CATEGORIES)
    for column in ("employer", "zip", "city"):
        smallest = privacy.smallest_group(out, column)
        if smallest is not None and smallest < k:
            raise privacy.PrivacyError("A stored %s is shared by only %d members; the floor is %d" % (column, smallest, k))
    stored_text = [out[c].dropna().unique() for c in ("employer", "professional_area", "member_level", "member_type", "gender")]
    found = privacy.scan_text([v for values in stored_text for v in values])
    found += privacy.scan_text(out["city"].dropna().unique(), names=False)
    if found:
        lines = "\n".join("  %s in %r (matched %r)" % (kind, value, part) for value, kind, part in found[:20])
        raise privacy.PrivacyError(
            "Personal details found in text that would be stored:\n%s\n"
            "If a value is a firm that is only named after a person, add it to backend/pii_allowlist.txt." % lines)


def read_transfers(path, chapter_column, kind, key):
    raw = pd.read_excel(path, header=None, dtype=str)
    header = next(i for i in range(len(raw)) if "Transfer Date" in [str(v) for v in raw.iloc[i]])
    df = raw.iloc[header + 1:].copy()
    df.columns = [str(v) for v in raw.iloc[header]]
    df = df[df["ID"].notna()]
    dates = pd.to_datetime(df["Transfer Date"], format="%Y%m%d")
    return [{"key": privacy.pseudonym(key, "movement", "%s|%s|%s" % (kind, member_id, iso(d))), "date": iso(d), "kind": kind,
             "member_type": None, "chapter": classify.chapter(c)}
            for member_id, d, c in zip(df["ID"], dates, df[chapter_column])]


def read_movements(new_path, inbound_path, outbound_path, key):
    """Joins and transfers from the three 90-day reports. Each gets a key of its own, unrelated to the
    member's pseudonym, so that a report loaded twice adds nothing and a movement cannot be tied to a member row."""
    as_of = report_date(new_path)
    new = pd.read_excel(new_path, header=1, dtype=str)
    new = new[new["ID"].notna()]
    dates = pd.to_datetime(new["Join Date"], format="%m/%d/%Y")
    types = new["Type"].map(lambda t: classify.MEMBER_TYPES.get(t, t))
    rows = [{"key": privacy.pseudonym(key, "movement", "new|%s|%s" % (member_id, iso(d))), "date": iso(d), "kind": "new",
             "member_type": text(t), "chapter": None} for member_id, d, t in zip(new["ID"], dates, types)]
    rows += read_transfers(inbound_path, "Chapter From", "transfer_in", key)
    rows += read_transfers(outbound_path, "Chapter To", "transfer_out", key)
    found = privacy.scan_text([r["chapter"] for r in rows] + [r["member_type"] for r in rows], names=False)
    if found:
        raise privacy.PrivacyError("Personal details found in the transfer reports: %s" % found[:5])
    return as_of, rows


def file_hash(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def open_db(db_path, key, check_key=True):
    """The database, created on first use. Refuses a key other than the one the history was made with,
    unless `check_key` is off because the history is about to be cleared."""
    db_path = pathlib.Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        probe = sqlite3.connect(db_path)
        has_history = probe.execute("SELECT COUNT(*) FROM sqlite_master WHERE name = 'loads'").fetchone()[0]
        probe.close()
        if not has_history:
            # A database from before monthly loads: it held one report and no history, so nothing is lost.
            db_path.unlink()
            print("Replaced the old single-report database with one that keeps history.")
    fresh = not db_path.exists()
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    if fresh:
        con.executescript(SCHEMA)
        con.execute("INSERT INTO meta VALUES ('key_fingerprint', ?)", [privacy.fingerprint(key)])
        con.commit()
    if not check_key:
        return con
    found = con.execute("SELECT value FROM meta WHERE key = 'key_fingerprint'").fetchone()
    if found is None:  # a cleared database: it takes whichever key loads it next
        set_meta(con, "key_fingerprint", privacy.fingerprint(key))
        con.commit()
        return con
    known = found[0]
    stand_in = con.execute("SELECT COUNT(*) FROM meta WHERE key = 'stand_in'").fetchone()[0]
    if known != privacy.fingerprint(key) and stand_in:
        # Built elsewhere with a throwaway key, to show the site working. It has no history worth keeping.
        con.close()
        db_path.unlink()
        print("Replaced the stand-in database with one made with this computer's key.")
        return open_db(db_path, key)
    if known != privacy.fingerprint(key):
        con.close()
        raise privacy.PrivacyError(
            "This database was built with a different pseudonym key. Loading with this one would make every "
            "member look like they left and a stranger joined. Restore the original key and try again.")
    return con


CLEAR = ("changes", "current", "version_certs", "versions", "movements", "zips", "loads", "meta")


def clear(con):
    """Empty every table, keeping the tables themselves. Returns how many rows each held.
    The caller commits; `scrub` then removes the emptied pages from the file."""
    removed = {
        "loads": con.execute("SELECT COUNT(*) FROM loads").fetchone()[0],
        "member rows": con.execute("SELECT COUNT(*) FROM versions").fetchone()[0],
        "changes": con.execute("SELECT COUNT(*) FROM changes").fetchone()[0],
        "joins and transfers": con.execute("SELECT COUNT(*) FROM movements").fetchone()[0],
    }
    con.execute("DELETE FROM changes")
    con.execute("DELETE FROM current")
    con.execute("DELETE FROM version_certs")
    con.execute("DELETE FROM versions")
    con.execute("DELETE FROM movements")
    con.execute("DELETE FROM zips")
    con.execute("DELETE FROM loads")
    con.execute("DELETE FROM meta")
    return removed


def scrub(db_path):
    """Rewrite the file so that rows deleted from it are gone from the file too, not just marked free."""
    con = sqlite3.connect(db_path)
    con.execute("VACUUM")
    con.close()


def clear_db(db_path):
    """The --clear command: empty the database. Needs no key, since nothing is read or matched."""
    db_path = pathlib.Path(db_path)
    if not db_path.exists():
        return None
    con = sqlite3.connect(db_path)
    if not con.execute("SELECT COUNT(*) FROM sqlite_master WHERE name = 'loads'").fetchone()[0]:
        con.close()
        db_path.unlink()  # an old single-report database has no tables worth keeping
        return {"loads": 1}
    con.execute("PRAGMA secure_delete = ON")
    removed = clear(con)
    con.commit()
    con.close()
    scrub(db_path)
    return removed


def set_meta(con, key, value):
    con.execute("INSERT INTO meta VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, value])


def load(db_path, key, roster_path, as_of, members, now, zips, top_counties, figures, movements=None, movement_as_of=None,
         stand_in=False, truncate=False):
    """Add one roster to the history and record what changed since the last one. All or nothing.
    With `truncate`, the history is emptied first, in the same step: if the load is refused, the old data stays."""
    con = open_db(db_path, key, check_key=not truncate)
    try:
        report = iso(as_of)
        digest = file_hash(roster_path)
        if truncate:
            con.execute("PRAGMA secure_delete = ON")
            clear(con)
            set_meta(con, "key_fingerprint", privacy.fingerprint(key))
        latest = con.execute("SELECT MAX(report_date) FROM loads").fetchone()[0]
        if con.execute("SELECT COUNT(*) FROM loads WHERE file_sha256 = ?", [digest]).fetchone()[0]:
            raise privacy.PrivacyError("This roster file has already been loaded")
        if latest is not None and report <= latest:
            raise privacy.PrivacyError("This roster is dated %s, not later than the last one loaded (%s)" % (report, latest))
        first = latest is None

        load_id = con.execute(
            """INSERT INTO loads (report_date, file_sha256, loaded_at, members, joined, left_chapter, rejoined, changed,
                                  k, rows_unique, blanked_employer, blanked_zip, blanked_city)
               VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?, ?)""",
            [report, digest, dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), len(members), figures["k"],
             figures["rows_unique"], figures["blanked"]["employer"], figures["blanked"]["zip"], figures["blanked"]["city"]],
        ).lastrowid
        log = []

        def note(pid, kind, field=None, old=None, new=None):
            log.append((load_id, report, pid, kind, field, None if old is None else str(old), None if new is None else str(new)))

        open_rows = {r["pid"]: r for r in con.execute("SELECT * FROM versions WHERE valid_to IS NULL")}
        seen_before = {r[0] for r in con.execute("SELECT DISTINCT pid FROM versions")}
        counts = {"joined": 0, "left": 0, "rejoined": 0, "changed": 0}
        current = []

        order = list(members.index)
        random.shuffle(order)  # so a row's place says nothing about the member's place in the roster
        for idx in order:
            row = members.loc[idx]
            values = {c: None if pd.isna(row[c]) else row[c].item() if hasattr(row[c], "item") else row[c] for c in VERSION_COLUMNS}
            pid = row["pid"]
            was = open_rows.pop(pid, None)
            if was is not None and all(was[c] == values[c] for c in VERSION_COLUMNS):
                version_id = was["id"]
            else:
                if was is not None:
                    con.execute("UPDATE versions SET valid_to = ? WHERE id = ?", [report, was["id"]])
                    counts["changed"] += 1
                    describe_change(note, pid, was, values)
                elif not first:
                    kind = "rejoined" if pid in seen_before else "joined"
                    counts[kind] += 1
                    note(pid, kind)
                version_id = con.execute(INSERT_VERSION, dict(values, pid=pid, valid_from=report)).lastrowid
                con.executemany("INSERT INTO version_certs VALUES (?, ?)", [(version_id, c) for c in values["certs"].split(",") if c])
            extra = now.loc[idx]
            current.append((version_id, extra["region"], None if pd.isna(extra["tenure_years"]) else float(extra["tenure_years"]),
                            None if pd.isna(extra["tenure_band"]) else extra["tenure_band"], int(extra["joined_90d"]), int(extra["joined_12mo"])))

        for pid, was in open_rows.items():  # on the last roster, not on this one
            con.execute("UPDATE versions SET valid_to = ? WHERE id = ?", [report, was["id"]])
            counts["left"] += 1
            note(pid, "left")

        con.execute("DELETE FROM current")
        con.executemany("INSERT INTO current VALUES (?, ?, ?, ?, ?, ?)", current)
        con.executemany("INSERT INTO changes (load_id, report_date, pid, kind, field, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?, ?)", log)
        con.execute("UPDATE loads SET joined = ?, left_chapter = ?, rejoined = ?, changed = ? WHERE id = ?",
                    [counts["joined"], counts["left"], counts["rejoined"], counts["changed"], load_id])
        con.executemany("""INSERT INTO zips VALUES (:zip, :place, :county, :lat, :lon)
                           ON CONFLICT(zip) DO UPDATE SET place = excluded.place, county = excluded.county, lat = excluded.lat, lon = excluded.lon""", zips)
        set_meta(con, "as_of", report)
        if stand_in:
            set_meta(con, "stand_in", "1")
        set_meta(con, "top_counties", "|".join(top_counties))
        added = 0
        if movements is not None:
            random.shuffle(movements)
            for m in movements:
                added += con.execute("INSERT OR IGNORE INTO movements (key, date, kind, member_type, chapter) VALUES (:key, :date, :kind, :member_type, :chapter)", m).rowcount
            set_meta(con, "movement_from", iso(movement_as_of - pd.Timedelta(days=90)))
            set_meta(con, "movement_to", iso(movement_as_of))
        con.commit()
        if truncate:
            con.close()
            scrub(db_path)
        return dict(counts, members=len(members), movements=added, first=first)
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def describe_change(note, pid, was, values):
    """Write the change-log lines for a member whose stored details differ from last time."""
    for field in LOGGED_FIELDS:
        old, new = was[field], values[field]
        if old != new and not (field == "employer" and (old is None or new is None)):
            note(pid, "changed", field, old, new)
    if (values["expiry_date"] or "") > (was["expiry_date"] or ""):
        note(pid, "renewed", "expiry_date", was["expiry_date"], values["expiry_date"])
    before, after = set(filter(None, was["certs"].split(","))), set(filter(None, values["certs"].split(",")))
    for cert in sorted(after - before):
        note(pid, "credential_gained", "certs", None, cert)
    for cert in sorted(before - after):
        note(pid, "credential_dropped", "certs", cert, None)


def main():
    parser = argparse.ArgumentParser(description="Add one month's ISACA chapter reports to the site's database.")
    parser.add_argument("--roster", help="Member Roster - Full report (.xlsx)")
    parser.add_argument("--truncate", action="store_true",
                        help="truncate and load: empty the database, then load these reports as the only ones in it")
    parser.add_argument("--clear", action="store_true", help="empty the database and stop; give no reports")
    parser.add_argument("--new", help="New Member report (.xlsx)")
    parser.add_argument("--inbound", help="Transfer IN report (.xlsx)")
    parser.add_argument("--outbound", help="Transfer OUT report (.xlsx)")
    parser.add_argument("--db", default="data/members.db", help="database file (default: data/members.db)")
    parser.add_argument("--keep-reports", action="store_true", help="do not delete the report files after loading them")
    parser.add_argument("--stand-in", action="store_true",
                        help="mark the database as a stand-in made with a throwaway key; the first load made with another key replaces it")
    args = parser.parse_args()

    given = [args.new, args.inbound, args.outbound]
    if args.clear:
        if args.roster or any(given) or args.truncate:
            parser.error("--clear empties the database and loads nothing; to empty it and load, use --truncate with the reports")
        removed = clear_db(args.db)
        if removed is None:
            print("There is no database at %s, so there is nothing to clear." % args.db)
        else:
            print("Cleared %s: %s. The tables are kept, empty, and the file was rewritten so the rows are gone from it."
                  % (args.db, ", ".join("%d %s" % (n, name) for name, n in removed.items())))
        return
    if not args.roster:
        parser.error("give --roster, or --clear to empty the database")
    if any(given) and not all(given):
        parser.error("--new, --inbound and --outbound go together: give all three or none")

    try:
        key = privacy.load_key()
        as_of, members, now, zips, top, figures = read_roster(args.roster, key)
        movement_as_of, movements = read_movements(*given, key) if all(given) else (None, None)
        done = load(args.db, key, args.roster, as_of, members, now, zips, top, figures, movements, movement_as_of, args.stand_in, args.truncate)
    except privacy.PrivacyError as err:
        raise SystemExit("Load refused, nothing was stored.\n%s" % err)

    print("%s %s into %s: %d members." % ("Emptied the database and loaded" if args.truncate else "Loaded", iso(as_of), args.db, done["members"]))
    if args.truncate:
        print("The earlier history was removed, so month-to-month changes start again from this report.")
    elif done["first"]:
        print("This is the first report, so there is nothing to compare it with yet.")
    else:
        print("Since the last report: %(joined)d joined, %(left)d left, %(rejoined)d rejoined, %(changed)d changed." % done)
    print("Privacy: floor of %d. Blanked the employer of %d members, the ZIP code of %d and the city of %d. "
          "%d of %d rows are still unique on what an outsider could know, so keep the database confidential."
          % (figures["k"], figures["blanked"]["employer"], figures["blanked"]["zip"], figures["blanked"]["city"],
             figures["rows_unique"], done["members"]))
    if not args.keep_reports:
        for path in [args.roster] + [p for p in given if p]:
            pathlib.Path(path).unlink()
        print("Deleted the report files. (Deleting a file does not scrub it from the disk or from backups.)")


if __name__ == "__main__":
    main()
