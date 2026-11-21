"""The Member Insights API.

Run:  uvicorn backend.main:app --reload

Every /api endpoint that describes members takes the same optional filters, which
combine: seniority, county, job_function and credential. Each returns counts, never
a member row. All SQL here is fixed text; caller input is only ever bound as a value.
"""
import collections
import datetime as dt
import json
import os
import pathlib
import sqlite3
import statistics
import time
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import accounts, classify, privacy

ROOT = pathlib.Path(__file__).resolve().parent.parent
DB_PATH = pathlib.Path(os.environ.get("MEMBERS_DB", ROOT / "data" / "members.db"))
SITE = ROOT / "frontend" / "dist"

# Lists shorter than this are not broken out by name, so a row never points at a handful of people.
MIN_GROUP = privacy.K
# A set of filters that selects fewer members than this (but not none) shows nothing at all.
MIN_SELECTION = privacy.K

# The interactive documentation pages are off: they would describe the API to anyone who could reach the server.
# A signed-in user can read the same description at /api/openapi.json.
app = FastAPI(title="West Florida ISACA Member Insights API", version="1.1.0", docs_url=None, redoc_url=None, openapi_url=None)


# ---------------------------------------------------------------- who is asking

COOKIE = "wf_session"
# Routes anyone may call. Every other /api route needs a signed-in user: test_every_route_needs_sign_in
# fails if a route is added that answers without one and is not listed here.
PUBLIC = {"/api/health", "/api/auth/login", "/api/auth/logout", "/api/auth/me"}
SIGN_IN_TRIES = 10       # per address, per minute
_tries = collections.defaultdict(collections.deque)

HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    # Scripts, fonts and data only from this site. Inline styles are allowed because the charts set sizes that way.
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
                               "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; "
                               "frame-ancestors 'none'",
}


@app.middleware("http")
async def guard(request: Request, call_next):
    """Refuse a change that another site asked this browser to make, and add the security headers to every answer."""
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if origin and urlparse(origin).netloc != request.headers.get("host"):
            return JSONResponse({"detail": "This request came from another site"}, status_code=403, headers=HEADERS)
    response = await call_next(request)
    if response.status_code == 405 and "allow" not in response.headers:
        response.headers["Allow"] = "POST" if request.url.path in ("/api/auth/login", "/api/auth/logout") else "GET"
    for name, value in HEADERS.items():
        response.headers.setdefault(name, value)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


def account_db():
    con = accounts.connect()
    try:
        yield con
    finally:
        con.close()


def current_user(request: Request, con=Depends(account_db)):
    """The signed-in user, or a 401 that tells the site to show the sign-in page."""
    user = accounts.user_for(con, request.cookies.get(COOKIE))
    if user is None:
        raise HTTPException(401, "Sign in to continue")
    return user


SIGN_IN_NEEDED = {401: {"description": "Not signed in, or the session has ended"}}
NOT_FOUND = {404: {"description": "No such dimension, period or month"}}


class SignIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=accounts.MAX_PASSWORD)


@app.post("/api/auth/login", responses={401: {"description": "Wrong email or password, or the account is locked"}, 429: {"description": "Too many attempts from this address"}})
def login(body: SignIn, request: Request, response: Response, con=Depends(account_db)):
    """Sign in with an email and password. The answer sets the session cookie; it never says which of the two was wrong."""
    recent = _tries[request.client.host if request.client else "unknown"]
    moment = time.monotonic()
    while recent and moment - recent[0] > 60:
        recent.popleft()
    if len(recent) >= SIGN_IN_TRIES:
        raise HTTPException(429, "Too many attempts. Wait a minute and try again.")
    recent.append(moment)
    token = accounts.sign_in(con, body.email, body.password)
    if token is None:
        raise HTTPException(401, "The email or password is not right, or the account is locked. Try again in a few minutes.")
    secure = request.url.scheme == "https" or os.environ.get("WF_SECURE_COOKIES") == "1"
    response.set_cookie(COOKIE, token, max_age=accounts.SESSION_HOURS * 3600, httponly=True, samesite="strict", secure=secure, path="/")
    return accounts.user_for(con, token)


@app.post("/api/auth/logout")
def logout(request: Request, response: Response, con=Depends(account_db)):
    """End this session and clear its cookie."""
    accounts.sign_out(con, request.cookies.get(COOKIE))
    response.delete_cookie(COOKIE, path="/")
    return {"signed_out": True}


@app.get("/api/auth/me", responses=SIGN_IN_NEEDED)
def me(user=Depends(current_user)):
    """Who is signed in: their email and role. 401 if nobody is."""
    return user


# Everything about members hangs off this router, which lets nobody in without a session.
data = APIRouter(prefix="/api", dependencies=[Depends(current_user)], responses={
    **SIGN_IN_NEEDED, 503: {"description": "No member data has been loaded yet"}})


@data.get("/openapi.json", include_in_schema=False)
def api_description():
    """The machine-readable description of this API, for signed-in users."""
    return app.openapi()


# ---------------------------------------------------------------- database

def db():
    if not DB_PATH.exists():
        raise HTTPException(503, "No database yet. Run: python -m backend.ingest --roster <report.xlsx>")
    con = sqlite3.connect("file:%s?mode=ro" % DB_PATH, uri=True, check_same_thread=False)
    con.row_factory = sqlite3.Row
    try:
        if not con.execute("SELECT COUNT(*) FROM meta WHERE key = 'as_of'").fetchone()[0]:
            raise HTTPException(503, "The database is empty. Load a month's reports: python -m backend.ingest --roster <report.xlsx>")
        yield con
    finally:
        con.close()


def rows(con, sql, args=()):
    return [dict(r) for r in con.execute(sql, args)]


def meta(con):
    return {r["key"]: r["value"] for r in con.execute("SELECT key, value FROM meta")}


# ---------------------------------------------------------------- filters

# Every statement in this file is fixed text. Whatever a caller sends is bound as a value,
# never placed in the SQL. This one statement applies the member filters: it copies the
# members they select into `sel`, a temporary table that lives for one request, and every
# member query below reads `sel`.
SELECT_MEMBERS = """
CREATE TEMP TABLE sel AS
SELECT m.* FROM members m
WHERE (:seniority IS NULL OR m.seniority = :seniority)
  AND (:county IS NULL OR m.county = :county)
  AND (:job_function IS NULL OR m.job_function = :job_function)
  AND (:credential IS NULL OR EXISTS (SELECT 1 FROM member_certs c WHERE c.member_id = m.id AND c.cert = :credential))
"""


def selected(
    seniority: Optional[str] = Query(None, description="Seniority group, as listed by /api/meta"),
    county: Optional[str] = Query(None, description="Florida county of the member's home ZIP code"),
    job_function: Optional[str] = Query(None, description="Job function, as listed by /api/meta"),
    credential: Optional[str] = Query(None, description="An ISACA credential the member holds, such as CISA"),
    exclude: Optional[str] = Query(None, description="Name of one filter to ignore for this request"),
    con=Depends(db),
):
    """The filters every member endpoint accepts. `exclude` drops one of them for the request,
    so a chart that sets a filter can still show the options beside the chosen one."""
    values = {"seniority": seniority, "county": county, "job_function": job_function, "credential": credential}
    if exclude in values:
        values[exclude] = None
    con.execute(SELECT_MEMBERS, values)
    chosen = con.execute("SELECT COUNT(*) FROM sel").fetchone()[0]
    if 0 < chosen < MIN_SELECTION:
        # Too few members to describe without describing individuals: answer as if none matched, and say why.
        con.execute("DELETE FROM sel")
        con.execute("CREATE TEMP TABLE sel_withheld (reason TEXT)")
    return con


def withheld(con):
    return bool(con.execute("SELECT COUNT(*) FROM sqlite_temp_master WHERE name = 'sel_withheld'").fetchone()[0])


def share(count, total):
    return round(100 * count / total, 1) if total else 0.0


def total(con):
    return con.execute("SELECT COUNT(*) FROM sel").fetchone()[0]


def ordered(items, order=None):
    """Largest first, then by name; or in a fixed order, leaving out empty categories."""
    if order:
        by_name = {r["category"]: r for r in items}
        return [by_name[name] for name in order if name in by_name]
    return sorted(items, key=lambda r: (-r["members"], str(r["category"])))


# ---------------------------------------------------------------- endpoints

@app.get("/api/health")
def health():
    """Whether the server is up. Open to anyone, so it says nothing else."""
    return {"status": "ok"}


@data.get("/meta")
def get_meta(con=Depends(db)):
    """Report date and the values each filter can take."""
    m = meta(con)
    pick = lambda sql: [r[0] for r in con.execute(sql)]
    present = set(pick("SELECT DISTINCT seniority FROM members"))
    return {
        "as_of": m["as_of"],
        "members": con.execute("SELECT COUNT(*) FROM members").fetchone()[0],
        "has_movement": "movement_from" in m,
        "filters": {
            "seniority": [s for s in classify.SENIORITY if s in present],
            "county": pick("SELECT county FROM members WHERE county IS NOT NULL GROUP BY county ORDER BY COUNT(*) DESC, county"),
            "job_function": pick("SELECT job_function FROM members GROUP BY job_function ORDER BY COUNT(*) DESC, job_function"),
            "credential": pick("SELECT cert FROM member_certs GROUP BY cert ORDER BY COUNT(*) DESC, cert"),
        },
    }


@data.get("/summary")
def summary(con=Depends(selected)):
    """Headline counts for the members the filters select."""
    m = meta(con)
    as_of = dt.date.fromisoformat(m["as_of"])
    one = con.execute(
        """SELECT COUNT(*) AS members,
                  COALESCE(SUM(m.joined_90d), 0) AS new_90d,
                  COALESCE(SUM(m.joined_12mo), 0) AS new_12mo,
                  COALESCE(SUM(m.n_certs > 0), 0) AS certified,
                  COALESCE(SUM(m.expiry_date <= :year_end), 0) AS renewal_due,
                  COALESCE(SUM(m.in_florida), 0) AS in_florida,
                  COALESCE(SUM(EXISTS (SELECT 1 FROM member_certs c WHERE c.member_id = m.id
                                       AND c.cert IN (SELECT value FROM json_each(:ai_certs)))), 0) AS ai_cert_holders
           FROM sel m""",
        {"year_end": "%d-12-31" % as_of.year, "ai_certs": json.dumps(list(classify.AI_CERTS))},
    ).fetchone()
    n = one["members"]
    tenures = [r[0] for r in con.execute("SELECT m.tenure_years FROM sel m WHERE m.tenure_years IS NOT NULL")]
    top = rows(con, """SELECT m.county AS county, COUNT(*) AS members FROM sel m WHERE m.county IS NOT NULL
                       GROUP BY m.county ORDER BY members DESC, county""")
    everyone = con.execute("SELECT COUNT(*) FROM members").fetchone()[0]
    return {
        "as_of": m["as_of"],
        "withheld": withheld(con),
        "min_selection": MIN_SELECTION,
        "members": n,
        "share_of_all": share(n, everyone),
        "new_90d": one["new_90d"],
        "new_12mo": one["new_12mo"],
        "new_12mo_share": share(one["new_12mo"], n),
        "certified": one["certified"],
        "certified_share": share(one["certified"], n),
        "no_cert": n - one["certified"],
        "no_cert_share": share(n - one["certified"], n),
        "renewal_due": one["renewal_due"],
        "renewal_due_share": share(one["renewal_due"], n),
        "renewed_ahead": n - one["renewal_due"],
        "median_tenure_years": round(statistics.median(tenures), 1) if tenures else None,
        "in_florida": one["in_florida"],
        "outside_florida": n - one["in_florida"],
        "top_county": top[0]["county"] if top else "",
        "top_county_members": top[0]["members"] if top else 0,
        "top_county_share": share(top[0]["members"], n) if top else 0.0,
        "top3_county_share": share(sum(r["members"] for r in top[:3]), n),
        "ai_cert_holders": one["ai_cert_holders"],
    }


# One complete statement per dimension, with the order to list its categories in (None: largest first).
DIMENSIONS = {
    "seniority": ("SELECT m.seniority AS category, COUNT(*) AS members FROM sel m GROUP BY category", classify.SENIORITY),
    "job_function": ("SELECT m.job_function AS category, COUNT(*) AS members FROM sel m GROUP BY category", None),
    "professional_area": ("""SELECT COALESCE(m.professional_area, 'Not stated') AS category, COUNT(*) AS members
                             FROM sel m GROUP BY category""", None),
    "member_level": ("SELECT m.member_level AS category, COUNT(*) AS members FROM sel m GROUP BY category", classify.MEMBER_LEVELS),
    "member_type": ("SELECT m.member_type AS category, COUNT(*) AS members FROM sel m GROUP BY category", None),
    "gender": ("SELECT m.gender AS category, COUNT(*) AS members FROM sel m GROUP BY category", classify.GENDERS),
    "tenure": ("SELECT m.tenure_band AS category, COUNT(*) AS members FROM sel m GROUP BY category", classify.TENURE_BANDS),
    "credentials_held": ("""SELECT CASE m.n_certs WHEN 0 THEN 'None' WHEN 1 THEN '1' WHEN 2 THEN '2' ELSE '3 or more' END AS category,
                                   COUNT(*) AS members
                            FROM sel m GROUP BY category""", classify.CERT_COUNTS),
    "renewal": ("""SELECT CASE WHEN m.expiry_date <= :year_end THEN :due ELSE :paid END AS category, COUNT(*) AS members
                   FROM sel m GROUP BY category""", None),
}


@data.get("/breakdown/{dimension}", responses=NOT_FOUND)
def breakdown(dimension: str, con=Depends(selected)):
    """Members by category for one dimension. Shares are of the members the filters select."""
    if dimension not in DIMENSIONS:
        raise HTTPException(404, "Unknown dimension. Choose one of: " + ", ".join(DIMENSIONS))
    sql, order = DIMENSIONS[dimension]
    args = {}
    if dimension == "renewal":
        year = dt.date.fromisoformat(meta(con)["as_of"]).year
        args = {"year_end": "%d-12-31" % year, "due": "Due by 31 Dec %d" % year, "paid": "Paid into %d" % (year + 1)}
        order = [args["due"], args["paid"]]
    n = total(con)
    found = [dict(r, share=share(r["members"], n)) for r in rows(con, sql, args) if r["category"] is not None]
    return {"dimension": dimension, "total": n, "rows": ordered(found, order)}


# Who has already renewed, split one way. One complete statement per dimension, as above.
RENEWAL_BY = {
    "tenure": ("""SELECT m.tenure_band AS category, COUNT(*) AS members, COALESCE(SUM(m.expiry_date > :year_end), 0) AS renewed
                  FROM sel m WHERE m.tenure_band IS NOT NULL GROUP BY category""", classify.TENURE_BANDS),
    "seniority": ("""SELECT m.seniority AS category, COUNT(*) AS members, COALESCE(SUM(m.expiry_date > :year_end), 0) AS renewed
                     FROM sel m GROUP BY category""", classify.SENIORITY),
    "member_level": ("""SELECT m.member_level AS category, COUNT(*) AS members, COALESCE(SUM(m.expiry_date > :year_end), 0) AS renewed
                        FROM sel m WHERE m.member_level IS NOT NULL GROUP BY category""", classify.MEMBER_LEVELS),
}


@data.get("/renewal/{dimension}", responses=NOT_FOUND)
def renewal_by(dimension: str, con=Depends(selected)):
    """Members whose membership already runs past 31 December of the report year, by tenure, seniority or
    member level. `renewed_share` is a percentage of that row's members."""
    if dimension not in RENEWAL_BY:
        raise HTTPException(404, "Unknown dimension. Choose one of: " + ", ".join(RENEWAL_BY))
    sql, order = RENEWAL_BY[dimension]
    as_of = dt.date.fromisoformat(meta(con)["as_of"])
    year_end = dt.date(as_of.year, 12, 31)
    found = [dict(r, due=r["members"] - r["renewed"], renewed_share=share(r["renewed"], r["members"]))
             for r in rows(con, sql, {"year_end": str(year_end)})]
    n = total(con)
    renewed = con.execute("SELECT COALESCE(SUM(m.expiry_date > ?), 0) FROM sel m", [str(year_end)]).fetchone()[0]
    return {"dimension": dimension, "year": as_of.year, "year_end": str(year_end), "days_left": (year_end - as_of).days,
            "total": n, "renewed": renewed, "due": n - renewed, "renewed_share": share(renewed, n),
            "rows": ordered(found, order)}


@data.get("/certifications")
def certifications(con=Depends(selected)):
    """Members holding each ISACA credential. A member with several counts under each."""
    n = total(con)
    found = rows(con, """SELECT c.cert AS cert, COUNT(*) AS holders FROM member_certs c JOIN sel m ON m.id = c.member_id
                         GROUP BY c.cert ORDER BY holders DESC, cert""")
    return {"total": n, "rows": [dict(r, share=share(r["holders"], n)) for r in found]}


@data.get("/counties")
def counties(con=Depends(selected)):
    """Members by Florida county of their home ZIP code."""
    n = total(con)
    found = rows(con, """SELECT m.county AS county, COUNT(*) AS members, SUM(m.joined_12mo) AS new_12mo,
                                SUM(m.n_certs > 0) AS certified
                         FROM sel m WHERE m.county IS NOT NULL GROUP BY m.county ORDER BY members DESC, county""")
    return {"total": n, "rows": [dict(r, share=share(r["members"], n)) for r in found]}


@data.get("/zips")
def zips(con=Depends(selected)):
    """Members by Florida home ZIP code, with each ZIP's centre point."""
    return {"rows": rows(con, """SELECT z.zip AS zip, z.place AS place, z.county AS county, z.lat AS lat, z.lon AS lon,
                                        COUNT(*) AS members
                                 FROM sel m JOIN zips z ON z.zip = m.zip
                                 GROUP BY z.zip ORDER BY members DESC, z.zip""")}


@data.get("/cities")
def cities(con=Depends(selected)):
    """Florida home cities with five or more of the selected members."""
    n = total(con)
    found = rows(con, """SELECT m.city AS city, COUNT(*) AS members FROM sel m WHERE m.city IS NOT NULL
                         GROUP BY m.city HAVING COUNT(*) >= ? ORDER BY members DESC, city""", [MIN_GROUP])
    return {"total": n, "rows": [dict(r, share=share(r["members"], n)) for r in found]}


@data.get("/region-function")
def region_function(con=Depends(selected)):
    """Members by home region (the six largest counties, the rest of Florida, outside Florida) and job function."""
    regions = meta(con)["top_counties"].split("|") + ["Other Florida", "Outside Florida"]
    functions = [r[0] for r in con.execute("SELECT job_function FROM members GROUP BY job_function ORDER BY COUNT(*) DESC, job_function")]
    counts = {(r["region"], r["job_function"]): r["members"] for r in rows(
        con, "SELECT m.region AS region, m.job_function AS job_function, COUNT(*) AS members FROM sel m GROUP BY 1, 2")}
    out = []
    for region in regions:
        region_total = sum(v for (r, _), v in counts.items() if r == region)
        if region_total:
            out += [{"region": region, "function": fn, "members": counts.get((region, fn), 0), "region_total": region_total}
                    for fn in functions]
    return {"regions": [r for r in regions if any(o["region"] == r for o in out)], "functions": functions, "rows": out}


@data.get("/joins/{by}", responses=NOT_FOUND)
def joins(by: str, con=Depends(selected)):
    """Current members by the year (from 2000) or month (last 24) they joined. Members who have
    since left are not counted, so this is not a growth trend."""
    as_of = dt.date.fromisoformat(meta(con)["as_of"])
    if by == "year":
        found = dict(con.execute("""SELECT CAST(substr(m.join_date, 1, 4) AS INTEGER), COUNT(*) FROM sel m
                                    WHERE m.join_date IS NOT NULL GROUP BY 1""").fetchall())
        return {"rows": [{"year": y, "members": found.get(y, 0)} for y in range(2000, as_of.year + 1)]}
    if by == "month":
        first = as_of.year * 12 + as_of.month - 1 - 24
        months = ["%04d-%02d" % (k // 12, k % 12 + 1) for k in range(first, first + 25)]
        found = dict(con.execute("SELECT substr(m.join_date, 1, 7), COUNT(*) FROM sel m WHERE m.join_date >= ? GROUP BY 1",
                                 [months[0] + "-01"]).fetchall())
        return {"rows": [{"month": mth + "-01", "members": found.get(mth, 0)} for mth in months]}
    raise HTTPException(404, "Choose /api/joins/year or /api/joins/month")


@data.get("/employers")
def employers(con=Depends(selected)):
    """Employers with five or more of the selected members, common name variants merged."""
    n = total(con)
    found = rows(con, """SELECT m.employer AS employer, COUNT(*) AS members FROM sel m WHERE m.employer IS NOT NULL
                         GROUP BY m.employer HAVING COUNT(*) >= ? ORDER BY members DESC, employer""", [MIN_GROUP])
    return {"total": n, "rows": [dict(r, share=share(r["members"], n)) for r in found]}


@data.get("/loads")
def loads(con=Depends(db)):
    """Each monthly report loaded, with what changed since the one before: who joined, left and rejoined,
    and how many members' details changed. The first report has nothing to compare with."""
    return {"rows": rows(con, """SELECT report_date, members, joined, left_chapter AS left, rejoined, changed
                                 FROM loads ORDER BY report_date""")}


@data.get("/changes")
def changes(con=Depends(db)):
    """Counts of changes between monthly reports, by kind and by the detail that changed. Counts only."""
    return {"rows": rows(con, """SELECT report_date, kind, COALESCE(field, '') AS field, COUNT(*) AS members
                                 FROM changes GROUP BY report_date, kind, field ORDER BY report_date, kind, field""")}


@data.get("/movement", responses=NOT_FOUND)
def movement(month: Optional[str] = Query(None, description="A month as YYYY-MM; leave out for all 90 days"),
             con=Depends(db)):
    """Who joined and left the chapter over the 90 days the New Member and transfer reports cover.
    'Left' is transfers to another chapter only. The member filters do not apply here."""
    m = meta(con)
    if "movement_from" not in m:
        raise HTTPException(404, "No New Member and transfer reports were loaded")
    start, end = dt.date.fromisoformat(m["movement_from"]), dt.date.fromisoformat(m["movement_to"])
    all_days = [start + dt.timedelta(days=k) for k in range((end - start).days + 1)]
    months = sorted({d.strftime("%Y-%m") for d in all_days})
    if month is not None and month not in months:
        raise HTTPException(404, "Month must be one of: " + ", ".join(months))
    days = [d for d in all_days if month is None or d.strftime("%Y-%m") == month]
    lo, hi = str(days[0]), str(days[-1])

    counts = {(r["date"], r["kind"]): r["n"] for r in rows(
        con, "SELECT date, kind, COUNT(*) AS n FROM movements WHERE date BETWEEN ? AND ? GROUP BY date, kind", [lo, hi])}
    daily = [{"date": str(d), "new_members": counts.get((str(d), "new"), 0),
              "transferred_in": counts.get((str(d), "transfer_in"), 0),
              "transferred_out": counts.get((str(d), "transfer_out"), 0)} for d in days]
    tot = {k: sum(r[k] for r in daily) for k in ("new_members", "transferred_in", "transferred_out")}
    joined = tot["new_members"] + tot["transferred_in"]

    by_type = """SELECT member_type AS name, COUNT(*) AS members FROM movements
                 WHERE kind = ? AND date BETWEEN ? AND ? AND member_type IS NOT NULL
                 GROUP BY 1 ORDER BY members DESC, name"""
    by_chapter = """SELECT chapter AS name, COUNT(*) AS members FROM movements
                    WHERE kind = ? AND date BETWEEN ? AND ? AND chapter IS NOT NULL
                    GROUP BY 1 ORDER BY members DESC, name"""

    return {
        "months": months, "month": month, "from": lo, "to": hi,
        "totals": dict(tot, joined=joined, net=joined - tot["transferred_out"]),
        "daily": daily,
        "new_member_types": rows(con, by_type, ["new", lo, hi]),
        "transferred_in_from": rows(con, by_chapter, ["transfer_in", lo, hi]),
        "transferred_out_to": rows(con, by_chapter, ["transfer_out", lo, hi]),
    }


# The built React site, when present. Declared last so it never shadows /api.
app.include_router(data)

if SITE.exists():
    app.mount("/", StaticFiles(directory=SITE, html=True), name="site")
