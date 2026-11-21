<p align="center"><img src="frontend/src/assets/wf_isaca_logo.png" alt="ISACA West Florida Chapter" width="320"></p>

# West Florida ISACA Chapter board website

A website for the board of the ISACA West Florida Chapter. It has five sections, in a
navigation pane on the left:

| Section | Status |
|---|---|
| Home | Under construction |
| Reporting | Built. Membership figures: where members live, their seniority and job function, the credentials they hold, who joined and left, and which employers they work for. |
| Event Management | Under construction |
| Speaker Management | Under construction |
| Contact Us | Under construction |

The site shows counts only. Names, emails, phone numbers and addresses are removed before
anything is stored, and everything needs a sign-in. No member data is in this repository:
you load it yourself from ISACA's reports, on your own computer.

It has three parts: a SQLite database (`data/`, never committed), a Python API built
with FastAPI (`backend/`), and a React website (`frontend/`).

## Set it up

You need Python 3.10 or later and Node.js 22 or later.

1. Get the code and install what it needs. The Python packages include a 400 MB language
   model, used to check that no personal details are stored.

   ```sh
   git clone https://github.com/lesliedanielraj/westfloridaisaca.git
   cd westfloridaisaca
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r backend/requirements.txt
   cd frontend && npm install && npm run build && cd ..
   ```

2. Download the reports from the Chapter Leader Portal
   (<https://leaders.isaca.org/view-reports>) into a folder named `raw/`: Member
   Roster - Full, and optionally New Member, Transfer IN and Transfer OUT.

3. Load them. The first load makes a secret key and saves it in the computer's keychain.
   Back that key up: next month's report cannot be matched to this one without it.

   ```sh
   python -m backend.ingest --roster raw/MemberRoster_041.xlsx \
       --new raw/NewChapterMembers_041.xlsx \
       --inbound raw/InboundChapterTransfer.xlsx \
       --outbound raw/OutboundChapterTransfer.xlsx
   ```

   Use the file names you downloaded. The last three are optional. The report files are
   deleted once they are loaded.

4. Make the first account. It asks for a password of 12 characters or more.

   ```sh
   python -m backend.accounts add --email you@example.org --role admin
   ```

## Run it

```sh
uvicorn backend.main:app
```

Open <http://127.0.0.1:8000> and sign in. Ctrl+C stops it. The server listens on this
computer only.

### On a Mac

Three files do the same from Finder, with a double-click, or from Terminal. They set up
Python for you; build the site once first, as in step 1.

| File | What it does |
|---|---|
| `load-month.command` | Loads the reports in `raw/` |
| `run-local.command` | Starts the site and opens it in the browser. The first time, it asks you to make the first account. |
| `add-user.command` | Gives someone else an account |

### Each month

Download the new reports into `raw/`, load them as in step 3, and restart the site.

### Without ISACA's reports

To try the site with made-up members:

```sh
python tools/demo_setup.py /tmp/demo
python -m backend.accounts set-password --email demo@example.org --db /tmp/demo/accounts.db
MEMBERS_DB=/tmp/demo/members.db ACCOUNTS_DB=/tmp/demo/accounts.db uvicorn backend.main:app
```

Sign in as `demo@example.org` with the password you just set.

## More

- [Reference](docs/reference.md): how members are protected, the API, the checks on every pull request, and the layout of the code.
- [Threat model](docs/threat-model.md)

Powered by [Adhvitech LLC](https://adhvitech.com/).
