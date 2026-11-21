# Threat model

What could go wrong with this site, what stops it today, and what is still open. Written
before Event Management, Speaker Management and Contact Us are built, because those will
be the first pages to accept and store what people type. Review it when a page is added.

Last reviewed: 20 November 2026.

## What is worth protecting

| Asset | Where it is | Why it matters |
|---|---|---|
| ISACA reports | `raw/`, briefly, then deleted | Names, emails, phones and addresses of every member. ISACA's agreement bars passing them on. |
| Pseudonym key | The computer's keychain, or `MEMBERS_KEY` | With a roster, it re-links every stored row to a person. |
| Member database | `data/members.db` | No names, but nearly every row is unique in combination. |
| Accounts database | `data/accounts.db` | Board members' emails, password hashes, session hashes, audit trail. |
| Sessions | A cookie in each signed-in browser | Whoever holds one is that user until it ends. |
| The code and pipeline | GitHub, public | A change here changes what every copy of the site does. |

## Who might attack, and how far they can reach

| Actor | Starts with |
|---|---|
| Stranger on the network | Nothing. Today the server only listens on its own computer. |
| Another program or user on the same computer | Can reach the server, and may be able to read files. |
| A website open in a board member's browser | Can make that browser send requests to the site. |
| A signed-in board member | Every count the site shows. |
| Someone who gets a copy of a database file | The file, offline, for as long as they like. |
| A contributor, or a compromised dependency or action | Code that runs in the pipeline or on the server. |

## Threats and what answers them

| # | Threat | In place | Still open |
|---|---|---|---|
| 1 | A stranger reads the API | Every `/api` route needs a session; a test fails if a new route does not. Docs pages are off. | Nothing stops the server being started on a public address. Sign-in is the only barrier then. |
| 2 | Guessing a password | Argon2id hashes; 12-character minimum; lockout after 5 tries for 15 minutes; 10 tries a minute per address; same answer for a wrong email and a wrong password. | No second factor. The per-address limit resets when the server restarts. |
| 3 | Stealing a session | Cookie cannot be read by scripts or sent by other sites; only its hash is stored; ends after 8 hours, or 2 idle; ended by password change or disabling. | Over plain `http` a session can be read on the network. The cookie is marked secure only over `https`. |
| 4 | Another site acting through a signed-in browser | SameSite=Strict cookie; changes with a foreign `Origin` are refused; the site cannot be framed. | — |
| 5 | Injected script | React escapes text; a content security policy allows scripts only from the site itself. | Inline styles are allowed, because the charts need them. |
| 6 | SQL injection | Every statement is fixed text with bound values; bandit and a test with hostile input check it. | — |
| 7 | Picking a person out of the counts | Five-member floor on employers, ZIP codes and cities; filters that select under five show nothing; dates kept to the month. | Small counts still appear inside charts. Repeated filtering can narrow a group; a signed-in member is trusted not to. |
| 8 | Personal details reaching the database | Column allowlist; Presidio and pattern scan; Pandera checks; a failed check stores nothing. | Name detection can miss a name inside a longer phrase. |
| 9 | Personal details or data files reaching GitHub | `.gitignore`; "No member data" and "No personal details" checks; ruleset requires them on `main`. | The checks run on pull requests, not on pushes to side branches. The repository is public. |
| 10 | A copied database file | No names or IDs; pseudonyms need the key; password and session values are hashes. | Rows remain unique in combination. Emails of account holders are stored in clear. Files are not encrypted at rest. |
| 11 | Loss of the pseudonym key | The loader refuses a mismatched key, and says to back it up. | No backup is made for you. Losing it breaks the month-to-month history. |
| 12 | A poisoned dependency or action | Actions pinned to commits; ASH dependency scans; CodeQL; Dependabot. | Python packages are not pinned to exact versions or hashes. |
| 13 | A crash or odd input | Schemathesis fuzzes every data route on each pull request; ZAP scans the running site. | The fuzzer runs with made-up data, so it cannot exercise every real value. |
| 14 | No trace of what happened | Sign-ins, failures, sign-outs and account changes are in an audit table. | Nothing reviews it or raises an alert. Reads of data are not logged. |

## Before the next pages are built

Event Management, Speaker Management and Contact Us change the picture, because they add
writing, and personal data about people who are not members.

- **Roles.** Decide who may create, edit and delete, and enforce it on the server for
  every route. Only signed-in status is checked today; the role is stored but not yet used.
- **Input.** Every field needs a length limit, a type and validation on the server. Text
  that is shown back to people must stay escaped.
- **Speaker and contact records are personal data.** Decide what is collected, why, who
  may see it and when it is deleted, before the first table is made. The member database's
  de-identification does not cover them.
- **Contact Us is the first page a stranger can post to.** It needs rate limiting, spam
  protection and a size limit, and must never email or display what was typed without
  cleaning it.
- **Uploads**, if speakers send slides or photos: type and size limits, storage outside
  the web root, and never served from the same origin as the site.
- **Second factor and Microsoft sign-in** before the site is reachable from the internet,
  along with `https`.

## How this is kept honest

The automated checks cover what can be tested: threats 1, 2, 3, 4, 6, 8, 9, 12 and 13 each
have a test or a scan that fails a pull request. The rest are decisions and habits, which
only a review like this one catches. A passing pipeline means no known-bad pattern was
found. It does not mean a missing control was noticed.
