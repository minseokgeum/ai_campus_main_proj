#!/bin/zsh
cd "$(dirname "$0")"
OB=$(cd .. && pwd)
if [ -f "$OB/local.conf" ]; then set -a; . "$OB/local.conf"; set +a; fi
PY=${PY_APP:-$(dirname "$OB")/.venv/bin/python}; [ -x "$PY" ] || PY=python3
open "http://127.0.0.1:8510" &
exec "$PY" -m streamlit run app.py
