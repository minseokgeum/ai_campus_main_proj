"""화면 점검: 6개 화면 × 예시 날짜 × 07:30/08:11에서 오류 없이 그려지는지.

실행: cd ~/4Digit/src/app && ~/4Digit/.venv/bin/python tests/smoke_pages.py
"""
import sys
from pathlib import Path

from streamlit.testing.v1 import AppTest

APP = str(Path(__file__).resolve().parents[1] / "app.py")
DAYS = sorted(p.stem for p in (Path(APP).parent / "data/model/days").glob("*.json"))
PAGES = ["views/briefing.py", "views/night.py", "views/news.py", "views/relations.py", "views/track.py", "views/model.py", "views/status.py"]
fail = 0
for page in PAGES:
    for T in DAYS:
        for slot in ("0730", "0811", "0900"):
            at = AppTest.from_file(APP, default_timeout=120)
            at.session_state["T"], at.session_state["slot"] = T, slot
            at.switch_page(page)
            at.run()
            errs = [e.value for e in at.exception]
            fail += bool(errs)
            print(f"{'ERR' if errs else 'ok '} {page} {T} {slot} {errs[0][:200] if errs else ''}")
print(f"\n{len(PAGES) * len(DAYS) * 3 - fail} ok / {fail} 오류")
sys.exit(1 if fail else 0)
