"""원래 버전(/orig/) 화면 점검. 11/20: 수연 버전은 tests/smoke_front.py, 원래 버전은 이 파일."""
"""고객 화면 점검: 모든 날짜 × 계좌(예시 A~C + 내 잔고)에서 화면 다섯 개와 시각 세 개를 열어 자바스크립트 오류·빈 화면·깨진 값을 찾는다.
날짜마다 첫 계좌에서 종목 창·기사 창·수량 +·띠 누르기·되돌리기를 한 번씩 해 보고, 내 잔고는 종목 검색 → 넣기 → 브리핑 보기까지 해 본다.

실행(서버가 떠 있어야 함):
  cd overnight_briefing/service && ~/4Digit/.venv/bin/uvicorn api.index:app --port 8520 &
  ~/4Digit/.venv/bin/python tests/smoke_front.py [http://127.0.0.1:8520]
"""
import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8520"
meta = json.load(urllib.request.urlopen(BASE + "/api/meta"))
accts = [a["id"] for a in json.load(urllib.request.urlopen(BASE + "/api/accounts"))] + ["U"]
VIEWS = [("0730", "brief", ""), ("0811", "brief", ""), ("0900", "brief", ""), ("0811", "news", "brief"), ("0811", "news", "linked"),
         ("0900", "news", "graph"), ("0811", "news", "macro"), ("0811", "night", ""), ("0811", "mine", ""), ("0811", "record", "")]
DRAFT = [{"code": "000660", "name": "SK하이닉스", "q": 12, "avg": None, "in_model": True},
         {"code": "105840", "name": "우진", "q": 50, "avg": 9000, "in_model": False}]
bad, n = [], 0


def wait(pg, T, slot, acct, tab):
    pg.wait_for_function(
        f"document.querySelector('#clock').textContent === '{slot[:2]}:{slot[2:]}' && !document.querySelector('#screen .skel')"
        f" && document.querySelector('#tabbar .on') && document.querySelector('#tabbar .on').dataset.tab === '{tab}'"
        f" && document.querySelector('#ctl-day').value === '{T}' && document.querySelector('#ctl-acct').value === '{acct}'", timeout=10000)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script(f"try {{ localStorage.setItem('ob.draft', {json.dumps(json.dumps(DRAFT))}); localStorage.setItem('ob.intro', '1'); }} catch (e) {{}}")
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(BASE + "/orig/", wait_until="networkidle")   # 원래 버전(web/orig/) 점검
    for d in meta["days"]:
        for i, a in enumerate(accts):
            for slot, tab, f in VIEWS:
                errs.clear()
                pg.evaluate(f"location.hash = 'T={d['T']}&slot={slot}&acct={a}&tab={tab}{'&f=' + f if f else ''}'")
                try:
                    wait(pg, d["T"], slot, a, tab)
                except Exception as e:  # noqa: BLE001
                    bad.append((d["T"], a, slot, tab, f, f"열리지 않음: {str(e)[:80]}"))
                    continue
                txt = pg.inner_text("#screen")
                n += 1
                if tab == "brief" and slot == "0811" and i == 0:
                    pg.locator("#screen [data-act=stock]").first.click()
                    if not pg.locator("#sheet .tbl").count(): errs.append("종목 창이 안 열림")
                    pg.keyboard.press("Escape")
                    if pg.locator("#screen [data-act=bnews]").count():
                        pg.locator("#screen [data-act=bnews]").first.click()
                        if "어떻게 이어지나요" not in pg.inner_text("#sheet"): errs.append("기사 창이 안 열림")
                        pg.keyboard.press("Escape")
                    before = pg.inner_text("#hero .big")
                    pg.locator("[data-step='1']").first.click()
                    if pg.inner_text("#hero .big") == before: errs.append("수량 +가 합계를 안 바꿈")
                    bb = pg.locator("[data-band]").first.bounding_box()
                    pg.mouse.click(bb["x"] + bb["width"] * 0.5, bb["y"] + 36)
                    if not pg.locator("[data-act=unpin]").count(): errs.append("띠를 눌러도 가정이 안 남음")
                    pg.locator("[data-act=reset]").click()
                    if pg.inner_text("#hero .big") != before: errs.append("되돌리기 뒤 합계가 다름")
                if a == "U" and tab == "brief" and slot == "0811" and not txt.count("SK하이닉스"):
                    errs.append("내 잔고 종목이 브리핑에 안 나옴")
                if a == "U" and tab == "brief" and slot == "0811" and "노란띠 없음" not in txt:
                    errs.append("노란띠 없는 종목 표시가 없음")
                broken = [w for w in ("undefined", "NaN", "null", "Infinity", "[object Object]") if w in txt]
                if errs or len(txt) < 60 or broken:
                    bad.append((d["T"], a, slot, tab, f, errs[:2] or broken or "빈 화면"))
    # 내 잔고: 검색 → 넣기 → 브리핑 보기
    errs.clear()
    T = meta["default"]
    pg.evaluate(f"location.hash = 'T={T}&slot=0811&acct=U&tab=mine'")
    wait(pg, T, "0811", "U", "mine")
    pg.fill("#stock-q", "한미반도체")
    pg.wait_for_selector("#stock-res button", timeout=5000)
    pg.locator("#stock-res button").first.click()
    if "한미반도체" not in pg.inner_text("#draft"): errs.append("검색한 종목이 안 들어감")
    pg.locator("[data-act=applydraft]").click()
    pg.wait_for_function("document.querySelector('#tabbar .on').dataset.tab === 'brief' && !document.querySelector('#screen .skel')", timeout=10000)
    if "한미반도체" not in pg.inner_text("#screen"): errs.append("넣은 종목이 브리핑에 안 나옴")
    n += 1
    if errs: bad.append((T, "U", "0811", "mine→brief", "", errs[:3]))
    # 11/20 고도화 점검: 먼저 볼 종목 줄 · 금액 가리기 · 여러 종목 붙여넣기
    errs.clear()
    pg.evaluate(f"location.hash = 'T={T}&slot=0811&acct=A&tab=brief'")
    wait(pg, T, "0811", "A", "brief")
    if not pg.locator("#hero .need-line").count(): errs.append("먼저 볼 종목 줄이 없음")
    pg.locator("#hero .eye").click()
    if "••••" not in pg.inner_text("#hero .big"): errs.append("금액 가리기가 안 됨")
    pg.locator("#hero .eye").click()
    if "••••" in pg.inner_text("#hero .big"): errs.append("금액 보기로 안 돌아옴")
    pg.evaluate(f"location.hash = 'T={T}&slot=0811&acct=U&tab=mine'")
    wait(pg, T, "0811", "U", "mine")
    pg.locator("details.bulk > summary").click(); pg.fill("#bulk-in", "삼성전자 1 70,000")
    pg.locator("[data-act=bulk]").click(); pg.wait_for_timeout(1500)
    if "삼성전자" not in pg.inner_text("#draft"): errs.append("붙여넣은 종목이 안 들어감")
    n += 1
    if errs: bad.append((T, "A/U", "0811", "11/20 고도화", "", errs[:3]))
    b.close()
print(f"{n - len(bad)} ok / {len(bad)} 오류")
for x in bad[:25]:
    print("  ", x)
sys.exit(1 if bad else 0)
