# West Florida ISACA Member Insights

A website of membership figures for the ISACA West Florida Chapter board: where members
live, who they are by seniority and job function, the credentials they hold, who joined
and left, and which employers they work for. It is built to inform decisions on events,
conferences and engagement.

It has three parts:

| Part | What it is | Where |
|---|---|---|
| Database | SQLite, one row per member with personal details removed | `data/members.db` (not committed) |
| API | Python and FastAPI; answers with counts, never a member row | `backend/` |
| Website | React; reads everything from the API | `frontend/` |

## Member data is not in this repository

The ISACA reports are confidential and for chapter leaders only. This repository holds
code. `.gitignore` keeps out the reports (`raw/`), the database (`data/`) and the built
site (`dist/`).

The database is de-identified, not anonymous. The ingest never writes names, emails,
phone numbers, street addresses, job titles or ISACA member IDs, and it shuffles the
rows. Each row still holds a ZIP code, employer and seniority, which together can point
to one person, so treat `data/members.db` as chapter-internal.

**There is no sign-in yet.** The server listens on this computer only. Do not put it on
the internet until sign-in is added.

## Run it

You need a recent Python 3 and Node.js 22 or later.

1. Install:

   ```sh
   pip install -r backend/requirements.txt
   cd frontend && npm install && cd ..
   ```

2. Download four reports from the Chapter Leader Portal
   (<https://leaders.isaca.org/view-reports>) into `raw/`: Member Roster - Full, New
   Member, Transfer IN and Transfer OUT.

3. Load them into the database. Each run replaces it.

   ```sh
   python -m backend.ingest --roster raw/MemberRoster_041.xlsx \
       --new raw/NewChapterMembers_041.xlsx \
       --inbound raw/InboundChapterTransfer.xlsx \
       --outbound raw/OutboundChapterTransfer.xlsx
   ```

   The last three are optional. Without them the "Joined and left" section is hidden.

4. Build the site and start the server:

   ```sh
   cd frontend && npm run build && cd ..
   uvicorn backend.main:app
   ```

   Open <http://127.0.0.1:8000>.

To refresh the figures, download new reports and repeat step 3.

### While developing

Run the API and the site side by side. The site reloads as you edit, and passes `/api`
calls to the API.

```sh
uvicorn backend.main:app --reload     # API on :8000
cd frontend && npm run dev            # site on :5173
```

Tests use a small made-up roster, so they need no member data:

```sh
pip install -r backend/requirements-dev.txt
python -m pytest backend
```

## The API

Interactive documentation is at <http://127.0.0.1:8000/docs> while the server runs.

| Endpoint | Returns |
|---|---|
| `GET /api/meta` | Report date, and the values each filter can take |
| `GET /api/summary` | Headline counts: members, recent joiners, credential holders, renewals due |
| `GET /api/breakdown/{dimension}` | Members by category. Dimensions: `seniority`, `job_function`, `professional_area`, `member_level`, `member_type`, `gender`, `tenure`, `credentials_held`, `renewal` |
| `GET /api/certifications` | Members holding each ISACA credential |
| `GET /api/counties`, `/api/zips`, `/api/cities` | Members by home county, ZIP code and city |
| `GET /api/region-function` | Members by home region and job function |
| `GET /api/joins/year`, `/api/joins/month` | Current members by when they joined |
| `GET /api/employers` | Employers with three or more of the selected members |
| `GET /api/movement?month=YYYY-MM` | Who joined and left over the 90 days the reports cover |

Every endpoint except `meta` and `movement` takes the same optional filters, and they
combine:

```
/api/summary?seniority=C-suite%20and%20executives&county=Hillsborough&credential=CISM
```

| Filter | Example |
|---|---|
| `seniority` | `Directors, managers and consultants` |
| `county` | `Pinellas` |
| `job_function` | `Audit` |
| `credential` | `CISA` |
| `exclude` | `county`: ignore that one filter for this request, so a chart that sets a filter can still show the other choices |

Employers and cities are returned only at three or more members, so a row never names
one or two people.

## How the numbers are made

- **Location** uses each member's home ZIP code. Members with a home address outside
  Florida are counted in totals but not mapped.
- **Job function and seniority** are groupings of ISACA's Professional Area field,
  defined in `backend/classify.py`. Change a grouping there, re-run the ingest, and
  every chart follows.
- **Employers** have common name variants merged, also in `backend/classify.py`.
- **Joined and left** covers the 90 days the New Member and transfer reports reach back.
  "Left" counts transfers to another chapter only: lapsed memberships are not in those
  reports. The member filters do not apply to it.
- **Shares** are a percentage of the members the filters select.

## Security scan

Every pull request into `main` is scanned with [ASH](https://github.com/awslabs/automated-security-helper),
the AWS Automated Security Helper (`.github/workflows/ash.yml`). It checks the Python and
JavaScript code, the dependencies, the workflow files and the history for secrets. A finding
of medium severity or higher fails the pull request, and a summary is posted as a comment.

To run the same scan on your computer:

```sh
uv tool install git+https://github.com/awslabs/automated-security-helper.git@v3.8.0
ash dependencies install
ash --mode local
```

The reports are written to `.ash/ash_output/reports/`; open `ash.html`.

`.ashrc.yaml` holds the scan settings. No finding is suppressed.

Every SQL statement in `backend/` is fixed text, and whatever a caller sends is bound as a
value. Keep it that way: a statement assembled from strings fails the scan.

## Layout

```
backend/
  ingest.py        reports -> data/members.db, personal details removed
  classify.py      seniority, job function and employer rules
  main.py          the API
  tests/           checks on the ingest and API, with a made-up roster
.github/workflows/ash.yml   security scan on pull requests into main
.ashrc.yaml        scan settings
frontend/
  src/App.jsx      header, filter bar and tabs
  src/pages/       one file per tab
  src/charts/      donut, treemap, bars, map and the other charts
  src/api.js       useApi(): fetch from the API when the filters change
  src/filters.jsx  the filters, kept in the page address
static-dashboard/  the earlier single-file version; see its README
```

## Third-party material

- [React](https://react.dev), [d3](https://d3js.org), [Vite](https://vite.dev) and
  [FastAPI](https://fastapi.tiangolo.com), under their own open-source licences.
- [Inter](https://rsms.me/inter/), SIL Open Font Licence 1.1.
- County outlines derived from [us-atlas](https://github.com/topojson/us-atlas), which is
  built from US Census Bureau cartographic boundary files.
- The ISACA West Florida Chapter logo is a trademark of ISACA and is not covered by any
  licence in this repository.
