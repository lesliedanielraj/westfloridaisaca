#!/bin/bash
# Empties the database: every member row, the history, and the record of loads. The tables stay, empty.
# It asks first. To empty the database and load a month's reports in one step, use ./load-month.command --truncate
cd "$(dirname "$0")" || exit 1
if [ ! -x .venv/bin/python ]; then echo "Nothing is set up here yet, so there is nothing to clear."; exit 0; fi
read -r -p "Empty data/members.db? This cannot be undone. Type yes to go ahead: " answer
if [ "$answer" != "yes" ]; then echo "Left as it was."; exit 0; fi
.venv/bin/python -m backend.ingest --clear
