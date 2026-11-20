"""Aggregate the ISACA "Member Roster - Full" export into count-only tables.

Input : MemberRoster_041.xlsx (West Florida Chapter roster, one row per member)
Output: one JSON file per table, each {rows, meta}. No names, emails, phone
        numbers or street addresses are written; every table is counts.
"""
import json, re, sys, pathlib
import pandas as pd
import zipcodes

SRC = pathlib.Path(sys.argv[1])
OUT = pathlib.Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
CODE = pathlib.Path(__file__).read_text()

head = str(pd.read_excel(SRC, header=None, nrows=1).iloc[0, 0])
m = re.search(r"(\d{2}/\d{2}/\d{4})", head)
AS_OF = pd.to_datetime(m.group(1), format="%m/%d/%Y")

df = pd.read_excel(SRC, header=1, dtype=str)
df = df[df["Member ID"].notna()].copy()
N = len(df)
df["join"] = pd.to_datetime(df["Join Date"], format="%m/%d/%y", errors="coerce")
df["expiry"] = pd.to_datetime(df["Expiry Date"], format="%m/%d/%y", errors="coerce")
df["tenure_years"] = (AS_OF - df["join"]).dt.days / 365.25

CERTS = ["CISA", "CISM", "CRISC", "CDPSE", "CGEIT", "CCP", "CCA", "AAISM", "AAIA", "CSXF", "CSXA", "AAIR", "CCOA"]
for c in CERTS:
    df[c] = df[c].notna()
df["n_certs"] = df[CERTS].sum(axis=1)

# ---- geography from the home ZIP (5 digits) ----
def zinfo(z):
    if not isinstance(z, str) or not re.match(r"^\d{5}", z.strip()):
        return None
    try:
        hit = zipcodes.matching(z.strip()[:5])
    except Exception:
        return None
    return hit[0] if hit else None

df["zip5"] = df["Home Zip"].str.strip().str[:5]
info = {z: zinfo(z) for z in df["zip5"].dropna().unique()}
df["county"] = df["zip5"].map(lambda z: (info.get(z) or {}).get("county"))
df["zstate"] = df["zip5"].map(lambda z: (info.get(z) or {}).get("state"))
df["lat"] = df["zip5"].map(lambda z: float((info.get(z) or {}).get("lat") or "nan"))
df["lon"] = df["zip5"].map(lambda z: float((info.get(z) or {}).get("long") or "nan"))
df["in_fl"] = (df["Home State"].str.strip() == "Florida") | (df["zstate"] == "FL")
df["county"] = df["county"].str.replace(" County", "", regex=False)
df.loc[df["zstate"] != "FL", "county"] = None

def city_norm(c):
    if not isinstance(c, str):
        return None
    c = re.sub(r"\s+", " ", c.strip()).title()
    c = re.sub(r"^(St\.?|Saint)\s+", "St. ", c)
    c = c.replace("Land O Lakes", "Land O' Lakes").replace("Land O'Lakes", "Land O' Lakes")
    return c
df["city"] = df["Home City"].map(city_norm)

# ---- role grouping from ISACA's "Professional Area" ----
def function_of(a):
    if not isinstance(a, str): return "Not stated"
    s = a.lower()
    if "student" in s or "professor" in s or "teacher" in s: return "Student and academic"
    if "audit" in s: return "Audit"
    if "security" in s or "ciso" in s: return "Security"
    if "compliance" in s or "risk" in s or "privacy" in s: return "Risk, compliance and privacy"
    if s.startswith("it ") or "cio/cto" in s or "technology" in s: return "IT and technology"
    if "ceo" in s or "cfo" in s or "finance" in s: return "Executive and finance"
    return "Other"

def seniority_of(a):
    if not isinstance(a, str): return "Not stated"
    s = a.lower()
    if "student" in s or "professor" in s or "teacher" in s: return "Students and academics"
    if any(k in s for k in ["ciso", "cio/cto", "ceo", "cfo", "cae", "chief", "vp/evp"]): return "C-suite and executives"
    if "director/manager" in s: return "Directors, managers and consultants"
    if "staff" in s or "auditor" in s: return "Staff and senior staff"
    return "Other"
SENIORITY = ["C-suite and executives", "Directors, managers and consultants", "Staff and senior staff",
             "Students and academics", "Other", "Not stated"]
ALL = "All members"
df["function"] = df["Professional Area"].map(function_of)
df["seniority"] = df["Professional Area"].map(seniority_of)

# ---- employer clean-up (light, name variants only) ----
ALIASES = {
    "pricewaterhousecoopers": "PwC", "pwc": "PwC", "pricewaterhousecoopers llp": "PwC", "pwc llp": "PwC",
    "citigroup": "Citi", "citi": "Citi", "citibank": "Citi", "citigroup inc": "Citi",
    "ernst & young": "EY", "ernst and young": "EY", "ey": "EY", "ernst & young llp": "EY",
    "raymond james financial": "Raymond James", "raymond james": "Raymond James",
    "jpmorgan chase": "JPMorgan Chase", "jp morgan chase": "JPMorgan Chase", "jpmorgan chase & co": "JPMorgan Chase", "jpmorgan": "JPMorgan Chase", "jp morgan": "JPMorgan Chase",
    "deloitte": "Deloitte", "deloitte & touche": "Deloitte", "deloitte & touche llp": "Deloitte", "deloitte llp": "Deloitte",
    "kpmg": "KPMG", "kpmg llp": "KPMG", "rsm us llp": "RSM", "rsm": "RSM", "rsm us": "RSM",
    "usf": "University of South Florida", "university of south florida": "University of South Florida",
    "jpmc": "JPMorgan Chase", "the university of tampa": "University of Tampa", "publix super markets inc": "Publix Super Markets", "crowe llp": "Crowe", "crowe": "Crowe", "a-lign": "A-LIGN", "protiviti": "Protiviti",
}
BLANK = {"tbd", "not applicable", "not employed", "unknown", "n/a", "na", "none", "self", "self employed", "self-employed", "unemployed", "retired", "student", "-", "."}
def employer(c):
    if not isinstance(c, str): return None
    k = re.sub(r"[.,]", "", c.strip().lower())
    k = re.sub(r"\s+", " ", k)
    if not k or k in BLANK: return None
    return ALIASES.get(k, c.strip())
df["employer"] = df["Company"].map(employer)


def write(name, rows, note):
    meta = [
        {"label": "build_roster_aggregates.py", "value": CODE, "type": "code", "lang": "python"},
        {"label": "Input", "value": "MemberRoster_041.xlsx (ISACA Chapter Leader Portal, Member Roster - Full)"},
        {"label": "Roster generated", "value": AS_OF.strftime("%d %B %Y")},
        {"label": "What this table is", "value": note + " The seniority column says which group each row counts: every table is repeated for all members and for each seniority group, and shares are a percentage of that group."},
    ]
    (OUT / f"{name}.json").write_text(json.dumps({"rows": rows, "meta": meta}, allow_nan=False))
    print(name, len(rows))

d90 = AS_OF - pd.Timedelta(days=90)
d365 = AS_OF - pd.Timedelta(days=365)
TOP6 = list(df["county"].value_counts().index[:6])
FUNCS = list(df["function"].value_counts().index)
T = {k: [] for k in ["summary", "breakdowns", "join_year", "join_month", "certifications", "employers",
                     "counties", "zips", "cities", "region_function"]}

def build(seg, d):
    n = len(d)
    def share(k):
        return round(100 * k / n, 1) if n else 0.0
    def out(name, rows):
        T[name].extend({"seniority": seg, **r} for r in rows)

    new12 = int((d["join"] >= d365).sum())
    due = int((d["expiry"] <= pd.Timestamp(AS_OF.year, 12, 31)).sum())
    certified = int((d["n_certs"] > 0).sum())
    fl = int(d["in_fl"].sum())
    tc = d["county"].value_counts()
    out("summary", [{
        "as_of": AS_OF.strftime("%Y-%m-%d"),
        "members": n,
        "share_of_all": round(100 * n / N, 1),
        "new_90d": int((d["join"] >= d90).sum()),
        "new_12mo": new12,
        "new_12mo_share": share(new12),
        "certified": certified,
        "certified_share": share(certified),
        "no_cert": n - certified,
        "no_cert_share": share(n - certified),
        "renewal_due": due,
        "renewal_due_share": share(due),
        "renewed_ahead": n - due,
        "median_tenure_years": round(float(d["tenure_years"].median()), 1),
        "in_florida": fl,
        "outside_florida": n - fl,
        "top_county": tc.index[0] if len(tc) else "",
        "top_county_members": int(tc.iloc[0]) if len(tc) else 0,
        "top_county_share": share(int(tc.iloc[0])) if len(tc) else 0.0,
        "top3_county_share": share(int(tc.iloc[:3].sum())),
        "ai_cert_holders": int((d[["AAIA", "AAISM", "AAIR"]].any(axis=1)).sum()),
    }])

    rows = []
    def add(dim, counts, order=None):
        items = list(counts.items())
        if order:
            items = [(k, counts.get(k, 0)) for k in order if counts.get(k, 0)]
        for i, (k, v) in enumerate(items):
            rows.append({"dimension": dim, "category": str(k), "members": int(v), "share": share(int(v)), "sort": i})
    add("Member level", d["Member Level"].value_counts().to_dict(), ["Platinum", "Gold", "Silver", "Bronze", "Member"])
    mt = d["Member Type"].fillna("Not stated").replace({
        "Recent Graduate (1st year)": "Recent graduate", "Recent Graduate (2nd year)": "Recent graduate",
        "Professional Membership": "Professional", "Student Membership": "Student",
        "Expired Professional Membership": "Expired professional", "Retired Membership": "Retired"})
    add("Member type", mt.value_counts().to_dict())
    g = d["Gender"].fillna("Not stated").replace({"I do not wish to answer": "Not stated", "Prefer not to answer": "Not stated"})
    add("Gender", g.value_counts().to_dict(), ["Male", "Female", "Not stated"])
    labels = ["Under 1 year", "1 to 3 years", "3 to 5 years", "5 to 10 years", "10 to 20 years", "20 years or more"]
    bands = pd.cut(d["tenure_years"], [-1, 1, 3, 5, 10, 20, 100], labels=labels)
    add("Tenure", bands.value_counts().to_dict(), labels)
    nc = d["n_certs"].map(lambda k: "None" if k == 0 else ("1" if k == 1 else ("2" if k == 2 else "3 or more")))
    add("Certifications held", nc.value_counts().to_dict(), ["None", "1", "2", "3 or more"])
    add("Job function", d["function"].value_counts().to_dict())
    add("Seniority", d["seniority"].value_counts().to_dict(), SENIORITY)
    rs = d["expiry"].map(lambda e: f"Due by 31 Dec {AS_OF.year}" if e <= pd.Timestamp(AS_OF.year, 12, 31) else f"Paid into {AS_OF.year + 1}")
    add("Renewal status", rs.value_counts().to_dict(), [f"Due by 31 Dec {AS_OF.year}", f"Paid into {AS_OF.year + 1}"])
    add("Professional area", d["Professional Area"].fillna("Not stated").value_counts().to_dict())
    out("breakdowns", rows)

    jy = d["join"].dt.year.value_counts()
    out("join_year", [{"year": y, "members": int(jy.get(y, 0))} for y in range(2000, AS_OF.year + 1)])
    start = (AS_OF - pd.DateOffset(months=24)).replace(day=1)
    jm = d[d["join"] >= start]["join"].dt.to_period("M").value_counts()
    out("join_month", [{"month": str(p) + "-01", "members": int(jm.get(p, 0))} for p in pd.period_range(start, AS_OF, freq="M")])

    out("certifications", sorted(
        [{"cert": c, "holders": int(d[c].sum()), "share": share(int(d[c].sum()))} for c in CERTS if int(d[c].sum())],
        key=lambda r: -r["holders"]))

    ec = d["employer"].value_counts()
    out("employers", [{"employer": k, "members": int(v), "share": share(int(v))} for k, v in ec.items() if v >= 3])

    rows = []
    for name, gdf in d[d["county"].notna()].groupby("county"):
        rows.append({"county": name, "members": int(len(gdf)), "share": share(int(len(gdf))),
                     "new_12mo": int((gdf["join"] >= d365).sum()), "certified": int((gdf["n_certs"] > 0).sum())})
    out("counties", sorted(rows, key=lambda r: -r["members"]))

    rows = []
    for z, gdf in d[d["lat"].notna() & (d["zstate"] == "FL")].groupby("zip5"):
        rows.append({"zip": z, "place": (info[z] or {}).get("city"), "county": gdf["county"].iloc[0],
                     "lat": round(float(gdf["lat"].iloc[0]), 4), "lon": round(float(gdf["lon"].iloc[0]), 4), "members": int(len(gdf))})
    out("zips", sorted(rows, key=lambda r: -r["members"]))

    rows = []
    for name, gdf in d[d["in_fl"] & d["city"].notna()].groupby("city"):
        if len(gdf) < 3: continue
        cty = gdf["county"].mode()
        rows.append({"city": name, "county": cty.iloc[0] if len(cty) else "", "members": int(len(gdf)), "share": share(int(len(gdf))),
                     "new_12mo": int((gdf["join"] >= d365).sum()), "certified": int((gdf["n_certs"] > 0).sum())})
    out("cities", sorted(rows, key=lambda r: -r["members"]))

    def region(r):
        if r["county"] in TOP6: return r["county"]
        return "Other Florida" if r["in_fl"] else "Outside Florida"
    reg = d.apply(region, axis=1) if n else pd.Series(dtype=str)
    rows = []
    for name in TOP6 + ["Other Florida", "Outside Florida"]:
        sub = d[reg == name]
        if not len(sub): continue
        for f in FUNCS:
            rows.append({"region": name, "function": f, "members": int((sub["function"] == f).sum()), "region_total": int(len(sub))})
    out("region_function", rows)

build(ALL, df)
for seg in SENIORITY:
    build(seg, df[df["seniority"] == seg])

NOTES = {
    "summary": "One row of headline counts per group.",
    "breakdowns": "Member counts by category for several dimensions. Job function and seniority are groupings of ISACA's Professional Area field made by this script.",
    "join_year": "Current members by the year they joined (2000 onward). Members who have since left are not on the roster, so earlier years understate how many joined then.",
    "join_month": "Current members by the month they joined, last 24 months. The latest month is partial.",
    "certifications": "Members holding each ISACA credential. A member with several is counted under each.",
    "employers": "Employers with three or more members in the group. Common name variants are merged; blank and placeholder entries are left out.",
    "counties": "Members by Florida county of their home ZIP code. Members with a home address outside Florida or an unrecognised ZIP are not included.",
    "zips": "Members by Florida home ZIP code, with the ZIP's centre point for the map.",
    "cities": "Florida home cities with three or more members in the group, as members entered them (St. Petersburg spellings merged).",
    "region_function": "Members by home region (the chapter's six largest counties, the rest of Florida, outside Florida) and job function.",
}
for name, rows in T.items():
    write(name, rows, NOTES[name])
