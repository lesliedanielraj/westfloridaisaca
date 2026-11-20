# West Florida ISACA Member Insights

A dashboard of membership figures for the ISACA West Florida Chapter board: where
members live, who they are by seniority and job function, the credentials they hold,
who joined and left, and which employers they work for. It is built to inform
decisions on events, conferences and engagement.

The dashboard is one self-contained HTML file. It works offline, supports light and
dark mode, and shows counts only: no names, emails or addresses.

## Member data is not in this repository

The ISACA reports are confidential and for chapter leaders only. This repository
holds the code that turns them into a dashboard, not the reports, the count tables
made from them, or the built dashboard. `.gitignore` keeps all three out:

| Folder | Holds | Committed |
|---|---|---|
| `raw/` | ISACA reports downloaded from the Chapter Leader Portal | No |
| `data/` | Count tables made from the reports | No |
| `dist/` | The built dashboard, with the count tables inlined | No |

The count tables go down to small numbers (members per ZIP code and per employer,
by seniority group), so treat `data/` and `dist/` as chapter-internal too.

## Build it

You need a recent Python 3.

```sh
pip install -r requirements.txt
```

1. Download four reports from the Chapter Leader Portal
   (<https://leaders.isaca.org/view-reports>) into `raw/`:
   Member Roster - Full, New Member, Transfer IN and Transfer OUT.

2. Make the count tables:

   ```sh
   python scripts/build_roster_aggregates.py raw/MemberRoster_041.xlsx data
   python scripts/build_movement.py raw/NewChapterMembers_041.xlsx \
       raw/InboundChapterTransfer.xlsx raw/OutboundChapterTransfer.xlsx data
   ```

3. Build the dashboard:

   ```sh
   python build.py
   ```

   This writes `dist/member-insights.html`. Open it in a browser.

To refresh the dashboard, download new reports and repeat steps 2 and 3.

## How the numbers are made

- **Location** uses each member's home ZIP code. Members with a home address outside
  Florida are counted in totals but not mapped.
- **Job function and seniority** are groupings of ISACA's Professional Area field,
  defined in `scripts/build_roster_aggregates.py`.
- **Employers** are listed at three or more members, with common name variants merged.
- **Joined and left** covers the 90 days the New Member and transfer reports reach
  back. "Left" counts transfers to another chapter only: lapsed memberships are not
  in those reports.
- **Shares** are a percentage of all members or, when a seniority group is picked,
  of that group.

## Layout

```
build.py                    assembles dist/member-insights.html
scripts/
  build_roster_aggregates.py  roster export -> ten count tables
  build_movement.py           new member and transfer reports -> two count tables
src/
  page.html                 the page's markup
  style.css, theme.css      layout, and light and dark colour tokens
  app.js                    charts, map, tables, tabs and filters
  runtime.js                hands the count tables to app.js; theme switch
  geo.js                    Florida county outlines
assets/                     chapter logo and the Inter font
vendor/                     d3
```

`app.js` draws through a small `dash` object (`dash.data`, `dash.calc`, `dash.draw`,
`dash.params`). `runtime.js` provides it here. The same page code also runs as a
Claude dashboard, where Claude provides `dash`; a change made in one place has to be
copied to the other by hand.

## Third-party material

- [d3](https://d3js.org) 7.9.0, ISC licence (`vendor/d3.LICENSE`).
- [Inter](https://rsms.me/inter/), SIL Open Font Licence 1.1 (`assets/fonts/OFL.txt`).
- County outlines derived from [us-atlas](https://github.com/topojson/us-atlas),
  which is built from US Census Bureau cartographic boundary files.
- The ISACA West Florida Chapter logo is a trademark of ISACA and is not covered by
  any licence in this repository.
