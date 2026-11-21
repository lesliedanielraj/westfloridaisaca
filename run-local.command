#!/bin/bash
# Starts the Member Insights website on this computer and opens it in the browser.
# Double-click this file in Finder, or run ./run-local.command in Terminal. Ctrl+C stops it.
cd "$(dirname "$0")" || exit 1
if [ ! -f data/members.db ]; then echo "data/members.db is missing. Load a month's reports first: ./load-month.command"; exit 1; fi
if [ ! -f frontend/dist/index.html ]; then echo "The site is not built. Run: cd frontend && npm install && npm run build"; exit 1; fi
if [ ! -x .venv/bin/python ]; then
  echo "First run: setting up Python packages..."
  python3 -m venv .venv && .venv/bin/pip install --quiet --upgrade pip && .venv/bin/pip install --quiet fastapi "uvicorn[standard]" || exit 1
fi
(sleep 2; open http://127.0.0.1:8000) &
exec .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
