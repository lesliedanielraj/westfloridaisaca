"""Make a stand-in site for testing: a database of made-up members and one made-up account.

Usage:  python tools/demo_setup.py <folder>

Writes <folder>/members.db and <folder>/accounts.db, and prints one line: the session token of the
made-up account, ready to send as the wf_session cookie. Nothing here comes from a real roster. The
pull-request checks use it to start the site and probe it; it is also a way to try the site out
without member data:

    TOKEN=$(python tools/demo_setup.py /tmp/demo)
    MEMBERS_DB=/tmp/demo/members.db ACCOUNTS_DB=/tmp/demo/accounts.db uvicorn backend.main:app
"""
import pathlib
import secrets
import secrets
import sys

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from backend import accounts, classify, ingest  # noqa: E402

AREAS = ["IT Auditor (External/Internal Staff)", "Security Director/Manager/Consultant", "CISO/CSO, Security Executive/VP/EVP",
         "Compliance/Risk/Privacy Director/Manager/Consultant", "IT Director/Manager/Consultant", "Student", None]
PLACES = [("33602", "Tampa"), ("33606", "Tampa"), ("33701", "Saint Petersburg"), ("33511", "Brandon"), ("34652", "New Port Richey"),
          ("34236", "Sarasota"), ("33801", "Lakeland"), ("10001", "New York")]
FIRMS = ["Northwind Bank", "Contoso Health", "Fabrikam Insurance", "Tailspin Energy", None]
LEVELS = ["Platinum", "Gold", "Silver", "Bronze", "Member"]


def roster(count):
    """`count` invented members, in the columns of ISACA's Member Roster report."""
    pick = secrets.SystemRandom()
    rows = []
    for n in range(count):
        zip_code, city = pick.choice(PLACES)
        joined = "%02d/%02d/%02d" % (pick.randint(1, 12), pick.randint(1, 28), pick.choice([10, 15, 19, 22, 24, 25, 26]))
        row = {
            "Member ID": "DEMO-%04d" % n, "Professional Area": pick.choice(AREAS), "Member Level": pick.choice(LEVELS),
            "Member Type": "Professional Membership", "Gender": pick.choice(["Female", "Male", None]), "Company": pick.choice(FIRMS),
            "Home City": city, "Home State": "New York" if zip_code == "10001" else "Florida", "Home Zip": zip_code,
            "Join Date": joined, "Expiry Date": pick.choice(["12/31/26", "12/31/26", "12/31/26", "12/31/27"]),
        }
        row.update({cert: ("Y" if pick.random() < 0.18 else None) for cert in classify.CERTS})
        rows.append(row)
    return pd.DataFrame(rows)


def main():
    folder = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "demo")
    folder.mkdir(parents=True, exist_ok=True)
    for old in ("members.db", "accounts.db", "roster.xlsx"):
        (folder / old).unlink(missing_ok=True)

    report = folder / "roster.xlsx"
    with pd.ExcelWriter(report, engine="openpyxl") as writer:
        roster(160).to_excel(writer, index=False, startrow=1)
        writer.sheets["Sheet1"].cell(row=1, column=1, value="ISACA Chapter Member Roster\nDemo Chapter (000)\nas of 11/18/2026 08:00:00 PM Chicago Time")
    key = secrets.token_bytes(32)
    as_of, members, now, zips, top, figures = ingest.read_roster(report, key)
    ingest.load(folder / "members.db", key, report, as_of, members, now, zips, top, figures, stand_in=True)
    report.unlink()

    con = accounts.connect(folder / "accounts.db")
    phrase = secrets.token_urlsafe(18)
    accounts.add_user(con, "demo@example.org", phrase, "admin")
    print(accounts.sign_in(con, "demo@example.org", phrase))
    con.close()


if __name__ == "__main__":
    main()
