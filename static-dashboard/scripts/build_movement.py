"""Count who joined and left the chapter in the last 90 days, by day.

Inputs : NewChapterMembers_041.xlsx, InboundChapterTransfer.xlsx, OutboundChapterTransfer.xlsx
         (ISACA Chapter Leader Portal reports, each covering the previous 90 days)
Output : movement.json (one row per day) and movement_detail.json (new-member types and
         the chapters members transferred from and to). Counts only: no names or contact details.
"""
import json, re, sys, pathlib
import pandas as pd

NEW, INB, OUTB, OUT = [pathlib.Path(p) for p in sys.argv[1:5]]
CODE = pathlib.Path(__file__).read_text()

head = str(pd.read_excel(NEW, header=None, nrows=1).iloc[0, 0])
AS_OF = pd.to_datetime(re.search(r"(\d{1,2}/\d{1,2}/\d{4})", head).group(1), format="%m/%d/%Y")
START = AS_OF - pd.Timedelta(days=90)

new = pd.read_excel(NEW, header=1, dtype=str)
new = new[new["ID"].notna()]
new["date"] = pd.to_datetime(new["Join Date"], format="%m/%d/%Y")

def transfers(path):
    raw = pd.read_excel(path, header=None, dtype=str)
    h = next(i for i in range(len(raw)) if "Transfer Date" in [str(v) for v in raw.iloc[i]])
    df = raw.iloc[h + 1:].copy()
    df.columns = [str(v) for v in raw.iloc[h]]
    df = df[df["ID"].notna()]
    df["date"] = pd.to_datetime(df["Transfer Date"], format="%Y%m%d")
    return df
inb, outb = transfers(INB), transfers(OUTB)

rows = []
for day in pd.date_range(START, AS_OF, freq="D"):
    count = lambda d: int((d["date"] == day).sum())
    n, i, o = count(new), count(inb), count(outb)
    rows.append({"date": day.strftime("%Y-%m-%d"), "month": day.strftime("%Y-%m"),
                 "new_members": n, "transferred_in": i, "transferred_out": o})
assert sum(r["new_members"] for r in rows) == len(new), "a new member falls outside the 90 days"
assert sum(r["transferred_in"] for r in rows) == len(inb) and sum(r["transferred_out"] for r in rows) == len(outb)

TYPES = {"Professional Membership": "Professional", "Student Membership": "Student", "Recent Graduate Membership": "Recent graduate"}
short = lambda c: re.sub(r"\s+Chapter$", "", str(c).strip())
detail = []
for month in ["all"] + sorted({r["month"] for r in rows}):
    pick = lambda d: d if month == "all" else d[d["date"].dt.strftime("%Y-%m") == month]
    for kind, series in [("New member type", pick(new)["Type"].map(lambda t: TYPES.get(t, t))),
                         ("Transferred in from", pick(inb)["Chapter From"].map(short)),
                         ("Transferred out to", pick(outb)["Chapter To"].map(short))]:
        for name, k in series.value_counts().items():
            detail.append({"month": month, "kind": kind, "name": name, "members": int(k)})

def write(name, data, note):
    meta = [{"label": "build_movement.py", "value": CODE, "type": "code", "lang": "python"},
            {"label": "Input", "value": "NewChapterMembers_041.xlsx, InboundChapterTransfer.xlsx, OutboundChapterTransfer.xlsx (ISACA Chapter Leader Portal)"},
            {"label": "Reports generated", "value": AS_OF.strftime("%d %B %Y")},
            {"label": "What this table is", "value": note}]
    (OUT / f"{name}.json").write_text(json.dumps({"rows": data, "meta": meta}, allow_nan=False))
    print(name, len(data))
write("movement", rows, "New members, transfers in and transfers out for each day of the 90 days the reports cover. Transfers out are the only departures ISACA reports; lapsed memberships are not included.")
write("movement_detail", detail, "New members by membership type, and the chapters members transferred from and to, for the whole 90 days (month \"all\") and for each calendar month in it.")
