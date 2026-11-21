# West Florida ISACA Member Insights

A website for the ISACA West Florida Chapter board. Its first section reports membership figures: where members
live, who they are by seniority and job function, the credentials they hold, who joined
and left, and which employers they work for. It is built to inform decisions on events,
conferences and engagement.

The site has five sections in a navigation pane on the left: Home, Reporting, Event
Management, Speaker Management and Contact Us. Reporting is built; the other four are
placeholders marked "under construction". To add a page, give its section a component in
`frontend/src/App.jsx` and set `ready: true`.

It has three parts:

| Part | What it is | Where |
|---|---|---|
| Database | SQLite: each member's history under a pseudonym, with personal details removed | `data/members.db` (not committed) |
| API | Python and FastAPI; answers with counts, never a member row | `backend/` |
| Website | React; reads everything from the API | `frontend/` |

## Member data is not in this repository

The ISACA reports are confidential and for chapter leaders only. This repository holds
code. `.gitignore` keeps out the reports (`raw/`), the database (`data/`) and the built
site (`dist/`).

**There is no sign-in yet.** The server listens on this computer only. Do not put it on
the internet until sign-in is added.

## How members are protected

Each month's reports are loaded by `backend/ingest.py`, and everything runs on this
computer: no report, and nothing from one, is sent anywhere.

| Layer | What it does |
|---|---|
| Allowlist | Only the columns the ingest names are read. Names, emails, phone numbers, street addresses, job titles and member IDs are never stored. |
| Pseudonym | The member ID becomes a keyed hash (HMAC-SHA256). The same member gets the same hash each month, which is how changes are tracked, and it cannot be reversed without the key. |
| The key | Kept in this computer's keychain (or the `MEMBERS_KEY` environment variable), never in the database or the repository. |
| Coarser values | Join and expiry dates are kept to the month. An employer, ZIP code or city shared by fewer than five members is blanked. |
| Checks that stop a load | [Presidio](https://microsoft.github.io/presidio/) and plain patterns scan every stored piece of text for emails, phone, ID and card numbers and people's names. [Pandera](https://pandera.readthedocs.io) checks that only allowed columns and values are stored. If either fails, nothing is stored. |
| Display floor | The site lists an employer or city only at five or more of the members shown, and shows nothing when the filters select fewer than five. |
| Reports deleted | The report files are deleted after a successful load. |

To look at what is stored, open the database read-only and query the view
`deidentified_members`: one row per current member, with credentials listed and no member key.

```sh
sqlite3 -readonly data/members.db
```

```sql
.mode box
SELECT * FROM deidentified_members LIMIT 10;
```

What this does not do:

- **The database is not anonymous.** Almost every row is still unique on what an outsider
  could know (county, employer, gender, seniority, join month), which the loader reports
  on each run. Treat `data/members.db` as confidential.
- **The key is the weak point.** Anyone with the key and a roster can link the two. Back
  the key up somewhere safe: without it, next month's report cannot be matched to this
  one, and the loader refuses a database made with a different key.
- **Finding a person's name in text is a judgement by a language model** and can miss.
  The five-member floor is the main protection for free text. Firms named after people
  (Raymond James) are listed in `backend/pii_allowlist.txt` after a person has checked them.
- **Small counts still appear inside charts**, such as a credential held by three members
  or a transfer from one chapter.
- **Deleting a report does not scrub it** from the disk, the Trash or backups.

## Monthly loads

1. Download the month's reports from the Chapter Leader Portal
   (<https://leaders.isaca.org/view-reports>) into `raw/`: Member Roster - Full, and
   New Member, Transfer IN and Transfer OUT.
2. Run `./load-month.command` (or the `python -m backend.ingest` line under "Run it").
3. Restart the website.

To start over instead of adding a month:

| Command | What it does |
|---|---|
| `python -m backend.ingest --truncate --roster ...` (or `./load-month.command --truncate`) | Truncate and load: empties the database and loads these reports as the only ones in it, in one step. If the load is refused, the old data stays. |
| `python -m backend.ingest --clear` (or `./clear-data.command`, which asks first) | Empties the database and loads nothing. The site then says the database is empty. |

Both remove the history, so month-to-month changes start again from the next report, and
both rewrite the file so deleted rows are gone from it, not just marked free. A cleared
database accepts any key, so this is also how to start again after losing the key.

Each load adds to the history. It records who joined, left and rejoined since the last
report, who renewed, who gained a credential, and whose county, employer, level or
seniority changed. A roster already loaded, or one dated no later than the last, is
refused. The loader prints the counts, and `/api/loads` and `/api/changes` return them.

## Run it

You need Python 3.10 or later and Node.js 22 or later. On a Mac, `./load-month.command`
and `./run-local.command` do steps 1, 3 and 4 for you.

1. Install:

   ```sh
   pip install -r backend/requirements.txt
   cd frontend && npm install && cd ..
   ```

2. Download four reports from the Chapter Leader Portal
   (<https://leaders.isaca.org/view-reports>) into `raw/`: Member Roster - Full, New
   Member, Transfer IN and Transfer OUT.

3. Load them into the database. The first load makes the pseudonym key and installs the
   checking tools, which include a 400 MB language model.

   ```sh
   python -m backend.ingest --roster raw/MemberRoster_041.xlsx \
       --new raw/NewChapterMembers_041.xlsx \
       --inbound raw/InboundChapterTransfer.xlsx \
       --outbound raw/OutboundChapterTransfer.xlsx
   ```

   The last three are optional. Without them the "Joined and left" section is hidden.
   The report files are deleted afterwards unless you add `--keep-reports`.

4. Build the site and start the server:

   ```sh
   cd frontend && npm run build && cd ..
   uvicorn backend.main:app
   ```

   Open <http://127.0.0.1:8000>.

Each month, download new reports and repeat step 3: see "Monthly loads".

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
| `GET /api/renewal/{dimension}` | Members who have already renewed into next year, by `tenure`, `seniority` or `member_level` |
| `GET /api/employers` | Employers with five or more of the selected members |
| `GET /api/loads` | Each monthly report loaded, with how many joined, left, rejoined and changed |
| `GET /api/changes` | Counts of changes between monthly reports, by kind |
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

Employers and cities are returned only at five or more members, and a set of filters
that selects fewer than five members returns nothing, so no answer describes a handful
of people.

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

Two more checks run on each pull request, because ASH looks for secrets and insecure code,
not for personal details:

| Check | Fails the pull request if |
|---|---|
| No member data | a report, database, archive or key file is tracked, whatever `.gitignore` says |
| No personal details | [Presidio](https://microsoft.github.io/presidio/) finds an email address, a phone, Social Security or card number, or what looks like a person's first and last name, in the contents of any tracked file |

Run the second one yourself with `pip install -r tools/requirements-pii.txt` and then
`git ls-files -z | python tools/pii_scan.py`. A harmless match, such as a firm named after a person, goes in
`.pii-allowlist.txt` after someone has looked at it. In code, a name is only reported when
it looks like one (two or three capitalised words), so a name written another way can pass.

To run the ASH scan on your computer:

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
  ingest.py        a month's reports -> data/members.db, personal details removed
  privacy.py       the pseudonym key, the five-member floor and the checks
  pii_allowlist.txt  firms named after people, checked by hand
  classify.py      seniority, job function and employer rules
  main.py          the API
  tests/           checks on the ingest and API, with a made-up roster
.github/workflows/ash.yml   security scan and the two data checks on pull requests into main
tools/pii_scan.py  reads every tracked file for personal details
.ashrc.yaml        scan settings
frontend/
  src/App.jsx      the site's sections, the address each lives at, and the appearance controls
  src/Shell.jsx    the collapsible navigation pane and the top bar
  src/pages/       Reporting.jsx (filters, tabs and notes), one file per reporting tab, and Placeholder.jsx
  src/charts/      donut, treemap, bars, map and the other charts
  src/geo/         county outlines and the basemap
  src/api.js       useApi(): fetch from the API when the filters change
  src/filters.jsx  the filters, kept in the page address
static-dashboard/  the earlier single-file version; see its README
```

## Appearance

The settings gear at the top right holds a light, dark or automatic switch and five
colour themes: blue, teal, violet, green and crimson. Both choices are remembered in the browser. Each theme's four
chart colours were checked for colour-blind separation, in light and in dark, with the
palette validator from the charting guidance the site follows. To add a theme, add its
colours to `frontend/src/styles.css` and its name to `ACCENTS` in `frontend/src/App.jsx`.

## Third-party material

- [React](https://react.dev), [d3](https://d3js.org), [Vite](https://vite.dev) and
  [FastAPI](https://fastapi.tiangolo.com), under their own open-source licences.
- [Inter](https://rsms.me/inter/), SIL Open Font Licence 1.1.
- Lakes, rivers, built-up areas and main roads on the map from [Natural Earth](https://www.naturalearthdata.com),
  which is in the public domain. The map is bundled with the site and loads nothing from outside.
- County outlines derived from [us-atlas](https://github.com/topojson/us-atlas), which is
  built from US Census Bureau cartographic boundary files.
- The ISACA West Florida Chapter logo is a trademark of ISACA and is not covered by any
  licence in this repository.
