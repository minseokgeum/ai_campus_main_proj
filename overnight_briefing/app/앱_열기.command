#!/bin/zsh
cd "$(dirname "$0")"
open "http://127.0.0.1:8510" &
exec ~/4Digit/.venv/bin/streamlit run app.py
