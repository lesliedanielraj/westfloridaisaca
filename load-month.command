#!/bin/bash
# Adds one month's ISACA reports to the database, with personal details removed.
#
# 1. Download the reports from the Chapter Leader Portal into the raw/ folder beside this file:
#    Member Roster - Full (needed), and New Member, Transfer IN and Transfer OUT (all three, or none).
# 2. Double-click this file in Finder, or run ./load-month.command in Terminal.
#
# The reports are deleted once they are loaded. Stop and restart the website afterwards.
#
# To empty the database and load these reports as the only ones in it:  ./load-month.command --truncate
# To empty the database and load nothing:                               ./clear-data.command
cd "$(dirname "$0")" || exit 1
one() { ls raw/$1 2>/dev/null | head -1; }
ROSTER=$(one "MemberRoster*.xlsx"); NEW=$(one "NewChapterMembers*.xlsx"); IN=$(one "InboundChapterTransfer*.xlsx"); OUT=$(one "OutboundChapterTransfer*.xlsx")
if [ -z "$ROSTER" ]; then echo "No Member Roster report found in raw/. Download it there and run this again."; exit 1; fi
if [ ! -x .venv/bin/python ]; then python3 -m venv .venv && .venv/bin/pip install --quiet --upgrade pip || exit 1; fi
if ! .venv/bin/python -c "import presidio_analyzer, pandera, keyring, en_core_web_lg" 2>/dev/null; then
  echo "First load: installing the checking tools (about 500 MB, a few minutes)..."
  .venv/bin/pip install --quiet -r backend/requirements.txt || exit 1
fi
if [ -n "$NEW" ] && [ -n "$IN" ] && [ -n "$OUT" ]; then
  .venv/bin/python -m backend.ingest --roster "$ROSTER" --new "$NEW" --inbound "$IN" --outbound "$OUT" "$@"
else
  echo "The New Member and transfer reports are not all there, so only the roster is loaded."
  .venv/bin/python -m backend.ingest --roster "$ROSTER" "$@"
fi
