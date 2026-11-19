"""화면 캡처 한 번에: 주요 화면을 휴대폰 크기로 찍어 폴더에 모은다(눈으로 확인용).

    ~/4Digit/.venv/bin/python tests/shots.py [http://127.0.0.1:8520] [출력 폴더] [날짜 YYYYMMDD]
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8520"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/ob_shots")
T = sys.argv[3] if len(sys.argv) > 3 else "20261116"
OUT.mkdir(parents=True, exist_ok=True)
DRAFT = [dict(code="000660", name="SK하이닉스", q=5, avg=1300000, in_model=True), dict(code="042700", name="한미반도체", q=0, avg=None, in_model=True),
         dict(code="005930", name="삼성전자", q=30, avg=None, in_model=True)]
VIEWS = [("home_A", f"#T={T}&slot=0811&acct=A&tab=home", 0), ("home_A_map", f"#T={T}&slot=0811&acct=A&tab=home", 600), ("home_0900", f"#T={T}&slot=0900&acct=A&tab=home", 0), ("home_dark", f"#T={T}&slot=0811&acct=A&tab=home&dark=1", 0),
         ("brief_A", f"#T={T}&slot=0811&acct=A&tab=brief", 0), ("brief_A_rows", f"#T={T}&slot=0811&acct=A&tab=brief", 900),
         ("news_A", f"#T={T}&slot=0811&acct=A&tab=news&f=brief", 0), ("graph_A", f"#T={T}&slot=0811&acct=A&tab=news&f=graph", 0),
         ("graph_B", f"#T={T}&slot=0811&acct=B&tab=news&f=graph", 0), ("night", f"#T={T}&slot=0811&acct=A&tab=night", 0),
         ("mine_A", f"#T={T}&slot=0811&acct=A&tab=mine", 0), ("record_A", f"#T={T}&slot=0900&acct=A&tab=record", 0),
         ("brief_0900", f"#T={T}&slot=0900&acct=A&tab=brief", 0), ("live", "#T=live&acct=A&tab=brief", 0), ("brief_U", f"#T={T}&slot=0811&acct=U&tab=brief", 700),
         ("night_preview", "#T=live&preview=night&acct=A&tab=brief", 0), ("night_map", f"#T={T}&slot=0811&acct=A&tab=night", 560),
         ("brief_U_hold", f"#T={T}&slot=0811&acct=U&tab=brief", 430)]
ONLY = set(sys.argv[4].split(",")) if len(sys.argv) > 4 else None
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    c = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    c.add_init_script(f"try {{ localStorage.setItem('ob.draft', {json.dumps(json.dumps(DRAFT))}); localStorage.setItem('ob.intro', '1'); }} catch (e) {{}}")
    errs = []
    for name, h, scroll in VIEWS:
        if ONLY and name not in ONLY:
            continue
        pg = c.new_page()
        pg.on("pageerror", lambda e, n=name: errs.append(f"{n}: {e}"))
        pg.goto(f"{BASE}/{h}", wait_until="networkidle")
        pg.wait_for_timeout(1200)
        if scroll:
            pg.evaluate(f"document.querySelector('#screen').scrollTop = {scroll}")
            pg.wait_for_timeout(300)
        pg.screenshot(path=str(OUT / f"{name}.png"))
        pg.close()
    if not ONLY or "settings" in ONLY:                      # 브리핑 설정 창 + 글자 크게
        pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(f"settings: {e}"))
        pg.goto(f"{BASE}/#T={T}&slot=0811&acct=A&tab=brief", wait_until="networkidle"); pg.wait_for_timeout(1000)
        pg.click('#screen [data-act="notif"]'); pg.wait_for_timeout(400); pg.screenshot(path=str(OUT / "settings.png"))
        pg.click('#sheet [data-act="setbig"][data-v="1"]'); pg.wait_for_timeout(300); pg.click('#sheet .x'); pg.wait_for_timeout(300)
        pg.screenshot(path=str(OUT / "brief_big.png"))
        pg.evaluate("localStorage.removeItem('ob.big')"); pg.close()
    d = b.new_page(viewport={"width": 1440, "height": 900})
    d.add_init_script("try { localStorage.setItem('ob.intro', '1'); } catch (e) {}")
    if not ONLY or "desktop" in ONLY:
        d.goto(f"{BASE}/#T={T}&slot=0811&acct=A&tab=brief", wait_until="networkidle")
        d.wait_for_timeout(1200)
        d.screenshot(path=str(OUT / "desktop.png"))
    b.close()
print(f"{OUT}: {len(list(OUT.glob('*.png')))}장, 오류 {errs[:5]}")
