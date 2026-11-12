"""고객 화면 점검: 모든 날짜 × 계좌에서 브리핑(07:30·08:11·09:00)과 나머지 네 화면을 열어 자바스크립트 오류·빈 화면·깨진 값을 찾는다.
날짜마다 종목 창·소식 창·수량 +·띠 누르기도 한 번씩 해 본다.
실행: ~/4Digit/.venv/bin/python ~/4Digit/src/front/tests/smoke_front.py   (서버 8520이 떠 있어야 함)
"""
import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8520"
meta = json.load(urllib.request.urlopen(BASE + "/api/meta"))
VIEWS = [("0730", "brief"), ("0811", "brief"), ("0900", "brief"), ("0811", "night"), ("0811", "news"), ("0900", "graph"), ("0811", "record")]
bad, n = [], 0
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless=True)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(BASE, wait_until="networkidle")
    for d in meta["days"]:
        day = json.load(urllib.request.urlopen(f"{BASE}/api/day/{d['T']}"))
        for i, a in enumerate(day["accounts"]):
            for slot, tab in VIEWS:
                errs.clear()
                pg.evaluate(f"location.hash = 'T={d['T']}&slot={slot}&acct={a['id']}&tab={tab}'")
                pg.wait_for_function(f"document.querySelector('#clock').textContent === '{slot[:2]}:{slot[2:]}' && !document.querySelector('#screen .skel') && document.querySelector('#tabbar .on').dataset.tab === '{tab}' && document.querySelector('#ctl-day').value === '{d['T']}' && document.querySelector('#ctl-acct').value === '{a['id']}'", timeout=8000)
                txt = pg.inner_text("#screen")
                n += 1
                if tab == "brief" and slot == "0811" and i == 0:
                    pg.locator("[data-act=stock]").first.click()
                    if not pg.locator("#sheet .tbl").count(): errs.append("종목 창이 안 열림")
                    pg.keyboard.press("Escape")
                    if pg.locator("#screen [data-act=news]").count():
                        pg.locator("#screen [data-act=news]").first.click()
                        if "어떻게 이어지나요" not in pg.inner_text("#sheet"): errs.append("소식 창이 안 열림")
                        pg.keyboard.press("Escape")
                    before = pg.inner_text("#hero .big")
                    pg.locator("[data-step='1']").first.click()
                    if pg.inner_text("#hero .big") == before: errs.append("수량 +가 합계를 안 바꿈")
                    bb = pg.locator("[data-band]").first.bounding_box()
                    pg.mouse.click(bb["x"] + bb["width"] * 0.5, bb["y"] + 36)
                    if not pg.locator("[data-act=unpin]").count(): errs.append("띠를 눌러도 가정이 안 남음")
                    pg.locator("[data-act=reset]").click()
                    if pg.inner_text("#hero .big") != before: errs.append("되돌리기 뒤 합계가 다름")
                broken = [w for w in ("undefined", "NaN", "null", "Infinity") if w in txt]
                if errs or len(txt) < 60 or broken:
                    bad.append((d["T"], a["id"], slot, tab, errs[:2] or broken or "빈 화면"))
    b.close()
print(f"{n - len(bad)} ok / {len(bad)} 오류")
for x in bad[:25]:
    print("  ", x)
sys.exit(1 if bad else 0)
