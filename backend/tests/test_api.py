"""Checks on the ingest and the API, using a small made-up roster. No real member data is needed.

Run from the repository root:  python -m pytest backend
"""
import sqlite3

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend import classify, ingest, main

TITLE = "ISACA Chapter Member Roster\nTest Chapter (999)\nas of 11/18/2026 08:00:00 PM Chicago Time"
MARKER = "ZZ-PRIVATE"  # stands in for every personal detail; must never reach the database


def member(n, area, zip_code, city, company, joined, certs=(), level="Gold", state="Florida"):
    row = {
        "Member ID": f"{MARKER}-{n}", "First Name": f"{MARKER}-first", "Last / Family Name": f"{MARKER}-last",
        "Email": f"{MARKER}@example.org", "Home Phone": f"{MARKER}-phone", "Home Address 1": f"{MARKER} Street",
        "Title": f"{MARKER}-title",
        "Professional Area": area, "Member Level": level, "Member Type": "Professional Membership", "Gender": "Female",
        "Company": company, "Home City": city, "Home State": state, "Home Zip": zip_code,
        "Join Date": joined, "Expiry Date": "12/31/26",
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
    as_of, members, certs, zips, top = ingest.read_roster(folder / "roster.xlsx")
    movement_as_of, movements = ingest.read_movements(folder / "new.xlsx", folder / "in.xlsx", folder / "out.xlsx")
    ingest.write_db(db_path, as_of, members, certs, zips, top, movements, movement_as_of)

    patch = pytest.MonkeyPatch()
    patch.setattr(main, "DB_PATH", db_path)
    yield TestClient(main.app), db_path
    patch.undo()


def test_no_personal_details_are_stored(client):
    _, db_path = client
    assert MARKER.encode() not in db_path.read_bytes()
    columns = {r[1] for r in sqlite3.connect(db_path).execute("PRAGMA table_info(members)")}
    assert not columns & {"name", "first_name", "last_name", "email", "phone", "address", "member_id", "title"}


def test_summary_counts_everyone(client):
    api, _ = client
    s = api.get("/api/summary").json()
    assert (s["members"], s["in_florida"], s["outside_florida"]) == (6, 5, 1)
    assert (s["certified"], s["no_cert"]) == (3, 3)
    assert s["new_90d"] == 2 and s["new_12mo"] == 3
    assert s["top_county"] == "Hillsborough" and s["top_county_members"] == 3


def test_filters_combine(client):
    api, _ = client
    assert api.get("/api/summary", params={"credential": "CISM"}).json()["members"] == 2
    both = api.get("/api/summary", params={"credential": "CISM", "seniority": "C-suite and executives"}).json()
    assert both["members"] == 1 and both["share_of_all"] == 16.7
    assert api.get("/api/summary", params={"county": "Pinellas", "job_function": "Audit"}).json()["members"] == 1
    assert api.get("/api/summary", params={"county": "Pinellas", "credential": "CISM"}).json()["members"] == 0


def test_exclude_keeps_the_other_choices(client):
    api, _ = client
    picked = {"seniority": "Staff and senior staff"}
    assert len(api.get("/api/breakdown/seniority", params=picked).json()["rows"]) == 1
    faceted = api.get("/api/breakdown/seniority", params={**picked, "exclude": "seniority"}).json()
    assert faceted["total"] == 6 and len(faceted["rows"]) == 5


def test_groupings(client):
    api, _ = client
    by = lambda dim: {r["category"]: r["members"] for r in api.get(f"/api/breakdown/{dim}").json()["rows"]}
    assert by("seniority") == {"C-suite and executives": 1, "Directors, managers and consultants": 1,
                               "Staff and senior staff": 2, "Students and academics": 1, "Not stated": 1}
    assert by("job_function") == {"Security": 2, "Audit": 2, "Student and academic": 1, "Not stated": 1}
    assert by("credentials_held") == {"None": 3, "1": 2, "2": 1}


def test_small_groups_are_not_named(client):
    api, _ = client
    # Three known spellings of one employer merge and are listed; the one-person employer is not.
    assert api.get("/api/employers").json()["rows"] == [{"employer": "PwC", "members": 3, "share": 50.0}]
    assert [r["city"] for r in api.get("/api/cities").json()["rows"]] == ["Tampa"]


def test_geography(client):
    api, _ = client
    assert {r["county"]: r["members"] for r in api.get("/api/counties").json()["rows"]} == {"Hillsborough": 3, "Pinellas": 2}
    assert {r["zip"]: r["members"] for r in api.get("/api/zips").json()["rows"]} == {"33602": 2, "33606": 1, "33701": 2}


def test_movement(client):
    api, _ = client
    everything = api.get("/api/movement").json()
    assert everything["totals"] == {"new_members": 2, "transferred_in": 1, "transferred_out": 1, "joined": 3, "net": 2}
    assert len(everything["daily"]) == 91
    october = api.get("/api/movement", params={"month": "2026-10"}).json()
    assert october["totals"]["joined"] == 2 and october["transferred_out_to"] == [{"name": "Denver", "members": 1}]


def test_bad_requests(client):
    api, _ = client
    assert api.get("/api/breakdown/shoe_size").status_code == 404
    assert api.get("/api/movement", params={"month": "1999-01"}).status_code == 404
    assert api.get("/api/joins/decade").status_code == 404


def test_filter_values_are_data_not_sql(client):
    """The SQL text is built from fixed pieces in main.py; whatever a caller sends is bound as a value."""
    api, db_path = client
    for hostile in ["' OR '1'='1", "x'; DROP TABLE members; --", '" OR 1=1 --']:
        for name in ("seniority", "county", "job_function", "credential", "exclude"):
            answer = api.get("/api/summary", params={name: hostile})
            assert answer.status_code == 200
            assert answer.json()["members"] == (6 if name == "exclude" else 0)
    assert api.get("/api/breakdown/seniority; DROP TABLE members").status_code == 404
    assert sqlite3.connect(db_path).execute("SELECT COUNT(*) FROM members").fetchone()[0] == 6
