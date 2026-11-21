"""Checks on the ingest and the API, using a small made-up roster. No real member data is needed.

Run from the repository root:  python -m pytest backend
"""
import sqlite3
import unittest

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend import classify, ingest, main, privacy

TITLE = "ISACA Chapter Member Roster\nTest Chapter (999)\nas of 11/18/2026 08:00:00 PM Chicago Time"
check = unittest.TestCase()  # assertEqual and friends; a failure shows both sides
KEY = bytes(range(32))  # a fixed pseudonym key for the tests
MARKER = "ZZ-PRIVATE"  # stands in for every personal detail; must never reach the database


def member(n, area, zip_code, city, company, joined, certs=(), level="Gold", state="Florida", expiry="12/31/26"):
    row = {
        "Member ID": f"{MARKER}-{n}", "First Name": f"{MARKER}-first", "Last / Family Name": f"{MARKER}-last",
        "Email": f"{MARKER}@example.org", "Home Phone": f"{MARKER}-phone", "Home Address 1": f"{MARKER} Street",
        "Title": f"{MARKER}-title",
        "Professional Area": area, "Member Level": level, "Member Type": "Professional Membership", "Gender": "Female",
        "Company": company, "Home City": city, "Home State": state, "Home Zip": zip_code,
        "Join Date": joined, "Expiry Date": expiry,
    }
    row.update({c: ("Y" if c in certs else None) for c in classify.CERTS})
    return row


def write_report(path, title, rows, blank_rows=0):
    frame = pd.DataFrame(rows)
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        frame.to_excel(writer, index=False, startrow=1 + blank_rows)
        writer.sheets["Sheet1"].cell(row=1, column=1, value=title)


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    folder = tmp_path_factory.mktemp("reports")
    roster = [
        member(1, "CISO/CSO, Security Executive/VP/EVP", "33602", "TAMPA", "PricewaterhouseCoopers LLP", "10/01/26", ["CISM", "CISA"]),
        member(2, "Security Director/Manager/Consultant", "33602", "Tampa", "PwC", "01/15/20", ["CISM"]),
        member(3, "IT Auditor (External/Internal Staff)", "33606", "tampa", "pwc", "03/01/15", ["CISA"]),
        member(4, "IT Auditor (External/Internal Staff)", "33701", "Saint Petersburg", "Solo Shop", "06/01/26"),
        member(5, "Student", "33701", "St Petersburg", "student", "09/01/26"),
        member(6, None, "10001", "New York", None, "02/01/10", state="New York"),
    ]
    write_report(folder / "roster.xlsx", TITLE, roster)
    people = {"ID": [f"{MARKER}-7", f"{MARKER}-8"], "First Name": [MARKER, MARKER], "Email": [MARKER, MARKER]}
    write_report(folder / "new.xlsx", "New ISACA Chapter Members as of 11/18/2026", {
        **people, "Type": ["Professional Membership", "Student Membership"], "Join Date": ["10/05/2026", "11/02/2026"]})
    transfer = lambda day, src, dst: {"ID": [f"{MARKER}-9"], "Transfer Date": [day], "FirstName": [MARKER], "Email": [MARKER],
                                      "Chapter From": [src], "Chapter To": [dst]}
    write_report(folder / "in.xlsx", "Incoming transfers 11/18/2026", transfer("20261014", "Austin Chapter", "Test Chapter"), 3)
    write_report(folder / "out.xlsx", "Outgoing transfers 11/18/2026", transfer("20261007", "Test Chapter", "Denver Chapter"), 3)

    db_path = folder / "members.db"
    # The made-up chapter is tiny, so these tests use a floor of 2 where the real one is 5.
    as_of, members, now, zips, top, figures = ingest.read_roster(folder / "roster.xlsx", KEY, k=2)
    movement_as_of, movements = ingest.read_movements(folder / "new.xlsx", folder / "in.xlsx", folder / "out.xlsx", KEY)
    ingest.load(db_path, KEY, folder / "roster.xlsx", as_of, members, now, zips, top, figures, movements, movement_as_of)

    patch = pytest.MonkeyPatch()
    patch.setattr(main, "DB_PATH", db_path)
    patch.setattr(main, "MIN_GROUP", 3)
    patch.setattr(main, "MIN_SELECTION", 1)
    yield TestClient(main.app), db_path
    patch.undo()


def roster_file(path, as_of, rows):
    write_report(path, "ISACA Chapter Member Roster\nTest Chapter (999)\nas of %s 08:00:00 PM Chicago Time" % as_of, rows)
    return path


def add_month(db_path, path, k=2):
    as_of, members, now, zips, top, figures = ingest.read_roster(path, KEY, k=k)
    return ingest.load(db_path, KEY, path, as_of, members, now, zips, top, figures)


def test_no_personal_details_are_stored(client):
    _, db_path = client
    check.assertNotIn(MARKER.encode(), db_path.read_bytes())
    con = sqlite3.connect(db_path)
    for table in ("members", "versions", "changes", "movements"):
        columns = {r[1] for r in con.execute("SELECT * FROM pragma_table_info(?)", [table])}
        check.assertFalse(columns & {"name", "first_name", "last_name", "email", "phone", "address", "member_id", "title"})
    # Join and expiry dates are kept to the month, and the API's view of members carries no member key.
    check.assertEqual(con.execute("SELECT COUNT(*) FROM versions WHERE join_date NOT LIKE '%-01' OR expiry_date NOT LIKE '%-01'").fetchone()[0], 0)
    check.assertNotIn("pid", {r[1] for r in con.execute("SELECT * FROM pragma_table_info('members')")})


def test_summary_counts_everyone(client):
    api, _ = client
    s = api.get("/api/summary").json()
    check.assertEqual((s["members"], s["in_florida"], s["outside_florida"]), (6, 5, 1))
    check.assertEqual((s["certified"], s["no_cert"]), (3, 3))
    check.assertEqual(s["new_90d"], 2)
    check.assertEqual(s["new_12mo"], 3)
    check.assertEqual(s["top_county"], "Hillsborough")
    check.assertEqual(s["top_county_members"], 3)


def test_filters_combine(client):
    api, _ = client
    check.assertEqual(api.get("/api/summary", params={"credential": "CISM"}).json()["members"], 2)
    both = api.get("/api/summary", params={"credential": "CISM", "seniority": "C-suite and executives"}).json()
    check.assertEqual(both["members"], 1)
    check.assertEqual(both["share_of_all"], 16.7)
    check.assertEqual(api.get("/api/summary", params={"county": "Pinellas", "job_function": "Audit"}).json()["members"], 1)
    check.assertEqual(api.get("/api/summary", params={"county": "Pinellas", "credential": "CISM"}).json()["members"], 0)


def test_exclude_keeps_the_other_choices(client):
    api, _ = client
    picked = {"seniority": "Staff and senior staff"}
    check.assertEqual(len(api.get("/api/breakdown/seniority", params=picked).json()["rows"]), 1)
    faceted = api.get("/api/breakdown/seniority", params={**picked, "exclude": "seniority"}).json()
    check.assertEqual(faceted["total"], 6)
    check.assertEqual(len(faceted["rows"]), 5)


def test_groupings(client):
    api, _ = client
    by = lambda dim: {r["category"]: r["members"] for r in api.get(f"/api/breakdown/{dim}").json()["rows"]}
    check.assertEqual(by("seniority"), {"C-suite and executives": 1, "Directors, managers and consultants": 1,
                               "Staff and senior staff": 2, "Students and academics": 1, "Not stated": 1})
    check.assertEqual(by("job_function"), {"Security": 2, "Audit": 2, "Student and academic": 1, "Not stated": 1})
    check.assertEqual(by("credentials_held"), {"None": 3, "1": 2, "2": 1})


def test_small_groups_are_not_named(client):
    api, _ = client
    # Three known spellings of one employer merge and are listed; the one-person employer is not.
    check.assertEqual(api.get("/api/employers").json()["rows"], [{"employer": "PwC", "members": 3, "share": 50.0}])
    check.assertEqual([r["city"] for r in api.get("/api/cities").json()["rows"]], ["Tampa"])


def test_geography(client):
    api, _ = client
    check.assertEqual({r["county"]: r["members"] for r in api.get("/api/counties").json()["rows"]}, {"Hillsborough": 3, "Pinellas": 2})
    # ZIP code 33606 has one member, under the floor, so it is not stored; that member still counts in the county.
    check.assertEqual({r["zip"]: r["members"] for r in api.get("/api/zips").json()["rows"]}, {"33602": 2, "33701": 2})


def test_movement(client):
    api, _ = client
    everything = api.get("/api/movement").json()
    check.assertEqual(everything["totals"], {"new_members": 2, "transferred_in": 1, "transferred_out": 1, "joined": 3, "net": 2})
    check.assertEqual(len(everything["daily"]), 91)
    october = api.get("/api/movement", params={"month": "2026-10"}).json()
    check.assertEqual(october["totals"]["joined"], 2)
    check.assertEqual(october["transferred_out_to"], [{"name": "Denver", "members": 1}])


def test_bad_requests(client):
    api, _ = client
    check.assertEqual(api.get("/api/breakdown/shoe_size").status_code, 404)
    check.assertEqual(api.get("/api/movement", params={"month": "1999-01"}).status_code, 404)
    check.assertEqual(api.get("/api/joins/decade").status_code, 404)


def test_filter_values_are_data_not_sql(client):
    """The SQL text is built from fixed pieces in main.py; whatever a caller sends is bound as a value."""
    api, db_path = client
    for hostile in ["' OR '1'='1", "x'; DROP TABLE members; --", '" OR 1=1 --']:
        for name in ("seniority", "county", "job_function", "credential", "exclude"):
            answer = api.get("/api/summary", params={name: hostile})
            check.assertEqual(answer.status_code, 200)
            check.assertEqual(answer.json()["members"], (6 if name == "exclude" else 0))
    check.assertEqual(api.get("/api/breakdown/seniority; DROP TABLE members").status_code, 404)
    check.assertEqual(sqlite3.connect(db_path).execute("SELECT COUNT(*) FROM members").fetchone()[0], 6)


def test_renewal_by_group(client):
    api, _ = client
    r = api.get("/api/renewal/seniority").json()
    # Every made-up member's membership ends on 31 December of the report year, so nobody has renewed.
    check.assertEqual((r["total"], r["renewed"], r["due"], r["renewed_share"]), (6, 0, 6, 0.0))
    check.assertEqual((r["year"], r["days_left"]), (2026, 43))
    check.assertEqual([x["category"] for x in r["rows"]][:2], ["C-suite and executives", "Directors, managers and consultants"])
    check.assertEqual(sum(x["members"] for x in r["rows"]), 6)
    check.assertEqual(api.get("/api/renewal/shoe_size").status_code, 404)


MONTH_1 = [
    member(1, "CISO/CSO, Security Executive/VP/EVP", "33602", "Tampa", "PwC", "10/01/26", ["CISM"]),
    member(2, "Security Director/Manager/Consultant", "33602", "Tampa", "PwC", "01/15/20"),
    member(3, "IT Auditor (External/Internal Staff)", "33602", "Tampa", "Citi", "03/01/15"),
    member(4, "IT Auditor (External/Internal Staff)", "33701", "Saint Petersburg", "Citi", "06/01/26"),
]


def test_changes_from_month_to_month(tmp_path):
    db_path = tmp_path / "members.db"
    first = add_month(db_path, roster_file(tmp_path / "m1.xlsx", "11/18/2026", MONTH_1))
    check.assertEqual((first["first"], first["joined"], first["left"]), (True, 0, 0))

    # A month on: member 1 renews and gains CRISC, member 2 moves to Pinellas, member 4 is gone, member 5 is new.
    month_2 = [
        member(1, "CISO/CSO, Security Executive/VP/EVP", "33602", "Tampa", "PwC", "10/01/26", ["CISM", "CRISC"], expiry="12/31/27"),
        member(2, "Security Director/Manager/Consultant", "33701", "Saint Petersburg", "PwC", "01/15/20"),
        member(3, "IT Auditor (External/Internal Staff)", "33602", "Tampa", "Citi", "03/01/15"),
        member(5, "Student", "33701", "Saint Petersburg", "Citi", "12/01/26"),
    ]
    second = add_month(db_path, roster_file(tmp_path / "m2.xlsx", "12/18/2026", month_2))
    check.assertEqual((second["joined"], second["left"], second["rejoined"], second["changed"]), (1, 1, 0, 2))

    con = sqlite3.connect(db_path)
    kinds = [tuple(r) for r in con.execute("SELECT kind, COALESCE(field, ''), COALESCE(new_value, '') FROM changes ORDER BY kind, field, new_value")]
    check.assertEqual(kinds, [("changed", "county", "Pinellas"), ("credential_gained", "certs", "CRISC"), ("joined", "", ""),
                              ("left", "", ""), ("renewed", "expiry_date", "2027-12-01")])
    # History: six rows in all, four of them current; the member who left keeps a closed row.
    check.assertEqual(con.execute("SELECT COUNT(*), SUM(valid_to IS NULL) FROM versions").fetchone(), (7, 4))
    check.assertEqual(con.execute("SELECT COUNT(*) FROM members").fetchone()[0], 4)
    check.assertNotIn(MARKER.encode(), db_path.read_bytes())

    # Member 4 comes back: the same pseudonym, so it counts as a return, not a stranger.
    third = add_month(db_path, roster_file(tmp_path / "m3.xlsx", "01/18/2027", month_2 + [MONTH_1[3]]))
    check.assertEqual((third["joined"], third["rejoined"], third["left"]), (0, 1, 0))


def test_loads_that_are_refused(tmp_path):
    db_path = tmp_path / "members.db"
    path = roster_file(tmp_path / "m1.xlsx", "11/18/2026", MONTH_1)
    add_month(db_path, path)
    with check.assertRaisesRegex(privacy.PrivacyError, "already been loaded"):
        add_month(db_path, path)
    with check.assertRaisesRegex(privacy.PrivacyError, "not later"):
        add_month(db_path, roster_file(tmp_path / "old.xlsx", "10/18/2026", MONTH_1[:3]))
    with check.assertRaisesRegex(privacy.PrivacyError, "different pseudonym key"):
        ingest.open_db(db_path, bytes(32))
    check.assertEqual(sqlite3.connect(db_path).execute("SELECT COUNT(*) FROM loads").fetchone()[0], 1)


def test_floor_blanks_what_few_members_share(tmp_path):
    _, members, _, zips, _, figures = ingest.read_roster(roster_file(tmp_path / "m.xlsx", "11/18/2026", MONTH_1), KEY, k=5)
    for column in ("employer", "zip", "city"):
        check.assertTrue(members[column].isna().all())
    check.assertEqual((figures["blanked"], zips), ({"employer": 4, "zip": 4, "city": 4}, []))
    check.assertTrue(members["county"].notna().all())  # the county is still known


def test_personal_details_in_text_stop_the_load(tmp_path):
    for company, kind in [("jane.doe@example.org", "EMAIL_ADDRESS"), ("Call 813-555-0142", "PHONE_NUMBER"), ("John Smith", "PERSON")]:
        rows = [member(n, "Student", "33602", "Tampa", company, "10/01/26") for n in (1, 2)]
        with check.assertRaisesRegex(privacy.PrivacyError, kind):
            ingest.read_roster(roster_file(tmp_path / "bad.xlsx", "11/18/2026", rows), KEY, k=2)
    extra = MONTH_1[:1] + [dict(MONTH_1[1], **{"Unexpected": "x"})]
    frame = ingest.read_roster(roster_file(tmp_path / "ok.xlsx", "11/18/2026", extra), KEY, k=2)[1]
    check.assertNotIn("Unexpected", frame.columns)  # a column the ingest does not name is never read in
    with check.assertRaisesRegex(privacy.PrivacyError, "Columns differ"):
        privacy.check_frame(frame.assign(email="x"), ("pid",) + ingest.VERSION_COLUMNS, ingest.CATEGORIES)


def test_a_selection_of_a_few_members_shows_nothing(client, monkeypatch):
    api, _ = client
    monkeypatch.setattr(main, "MIN_SELECTION", 5)
    few = api.get("/api/summary", params={"credential": "CISM"}).json()  # two members hold it
    check.assertEqual((few["members"], few["withheld"]), (0, True))
    check.assertEqual(api.get("/api/breakdown/seniority", params={"credential": "CISM"}).json()["rows"], [])
    everyone = api.get("/api/summary").json()
    check.assertEqual((everyone["members"], everyone["withheld"]), (6, False))


def test_reports_are_deleted_after_loading(tmp_path, monkeypatch):
    path = roster_file(tmp_path / "m1.xlsx", "11/18/2026", [dict(row) for row in MONTH_1] * 1)
    monkeypatch.setenv("MEMBERS_KEY", KEY.hex())
    monkeypatch.setattr(privacy, "K", 2)
    monkeypatch.setattr("sys.argv", ["ingest", "--roster", str(path), "--db", str(tmp_path / "members.db")])
    monkeypatch.setattr(ingest.read_roster, "__defaults__", (2,))
    ingest.main()
    check.assertFalse(path.exists())
    check.assertEqual(sqlite3.connect(tmp_path / "members.db").execute("SELECT COUNT(*) FROM members").fetchone()[0], 4)
