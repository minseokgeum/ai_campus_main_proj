"""고객 화면 점검: 모든 날짜 × 계좌(예시 A~C + 내 잔고)에서 화면 다섯 개와 시각 세 개를 열어 자바스크립트 오류·빈 화면·깨진 값을 찾는다.
날짜마다 첫 계좌에서 종목 창·기사 창·수량 +·띠 누르기·되돌리기를 한 번씩 해 보고, 내 잔고는 종목 검색 → 넣기 → 브리핑 보기까지 해 본다.

실행(서버가 떠 있어야 함):
  cd overnight_briefing/service && uvicorn api.index:app --port 8520 &
  python tests/smoke_front.py [http://127.0.0.1:8520]
"""
import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8520"
meta = json.load(urllib.request.urlopen(BASE + "/api/meta"))
accts = [a["id"] for a in json.load(urllib.request.urlopen(BASE + "/api/accounts"))] + ["U"]
VIEWS = [("0730", "home", ""), ("0811", "home", ""), ("0900", "home", ""), ("0730", "brief", ""), ("0811", "brief", ""), ("0900", "brief", ""), ("0811", "news", "brief"), ("0811", "news", "linked"),
         ("0900", "news", "graph"), ("0811", "news", "macro"), ("0811", "night", ""), ("0811", "mine", ""), ("0811", "record", "")]
DRAFT = [{"code": "000660", "name": "SK하이닉스", "q": 12, "avg": None, "in_model": True},
         {"code": "105840", "name": "우진", "q": 50, "avg": 9000, "in_model": False}]
bad, n = [], 0

# 08:11 해석 규칙(E107): 서비스 복사본(core/trust08.py)이 정본(model/workbench/trust_0811.py)과 같은 숫자·같은 결과인지
import importlib.util
from pathlib import Path as _P
_root = _P(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("trust_0811", _root / "model/workbench/trust_0811.py"); _canon = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_canon)
sys.path.insert(0, str(_P(__file__).resolve().parents[1]))
from core import trust08 as _copy
n += 1
if (tuple(_copy.CUTS), _copy.W, _copy.K) != (tuple(_canon.CUTS), _canon.W, _canon.K):
    bad.append("trust08 상수가 정본과 다름")
for _H, _L, _U, _g in ((0, -.02, .02, .005), (0, -.02, .02, .015), (.01, -.01, .03, -.02), (-.03, -.05, -.01, -.031)):
    n += 1
    _c, _k = _copy.t08(_H, _L, _U, _g), _canon.adjust(_H, _L, _U, _g)
    if _c["trust"] != _canon.trust(_H, _L, _U, _g) or abs(_c["Hb"] - _k[0]) > 1e-6 or abs(_c["adj"][0] - _k[1]) > 1e-6:
        bad.append(f"trust08 결과가 정본과 다름: {(_H, _L, _U, _g)}")


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
    pg.goto(BASE, wait_until="networkidle")
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
                if tab == "brief" and slot == "0811" and i == 0:          # 11/19 밤사이 v4: 줄 → 시트(수량 −/+·띠 끌기는 시트 안)
                    pg.locator("#screen [data-act=s4]").first.click()
                    if not pg.locator("#sheet [data-s4]").count(): errs.append("종목 시트가 안 열림")
                    pg.locator("#sheet .s4-btns [data-act=stock]").last.click()
                    if not pg.locator("#sheet .tbl").count(): errs.append("종목 상세 창이 안 열림")
                    pg.keyboard.press("Escape")
                    pg.locator("#screen [data-act=s4]").first.click()
                    before = pg.inner_text("#acct4 .amt b")
                    pg.locator("#sheet [data-step='1']").first.click()
                    if pg.inner_text("#acct4 .amt b") == before: errs.append("수량 +가 계좌 카드를 안 바꿈")
                    bb = pg.locator("#sheet [data-band]").first.bounding_box()
                    pg.mouse.click(bb["x"] + bb["width"] * 0.5, bb["y"] + 36)
                    if "가정" not in pg.inner_text("#sheet [data-f=pct]"): errs.append("띠를 눌러도 가정이 안 남음")
                    pg.locator("#sheet [data-act=unpin]").first.click()
                    if "가정" in pg.inner_text("#sheet [data-f=pct]"): errs.append("가정 지우기가 안 됨")
                    pg.locator("#sheet [data-step='-1']").first.click()
                    if pg.inner_text("#acct4 .amt b") != before: errs.append("수량 −로 되돌려도 합계가 다름")
                    pg.keyboard.press("Escape")
                if a == "U" and tab == "brief" and slot == "0811" and not txt.count("SK하이닉스"):
                    errs.append("내 잔고 종목이 브리핑에 안 나옴")
                if a == "U" and tab == "brief" and slot == "0811" and "서비스 대상 아님 1" not in txt:
                    errs.append("노란띠 없는 종목(서비스 대상 아님) 칩이 없음")
                broken = [w for w in ("undefined", "NaN", "null", "Infinity", "[object Object]") if w in txt]
                if errs or len(txt) < 60 or broken:
                    bad.append((d["T"], a, slot, tab, f, errs[:2] or broken or "빈 화면"))
    # 내 잔고: 검색 → 넣기 → 브리핑 보기
    errs.clear()
    T = meta["default"]
    pg.evaluate(f"location.hash = 'T={T}&slot=0811&acct=U&tab=mine'")
    wait(pg, T, "0811", "U", "mine")
    if pg.locator("[data-act=madd]").count(): pg.locator("[data-act=madd]").click()   # 수연 버전: 내 종목 → + 종목 추가
    pg.fill("#stock-q", "한미반도체")
    pg.wait_for_selector("#stock-res button", timeout=5000)
    pg.locator("#stock-res button").first.click()
    if "한미반도체" not in pg.inner_text("#draft"): errs.append("검색한 종목이 안 들어감")
    pg.locator("[data-act=applydraft]").click()
    pg.wait_for_function("document.querySelector('#tabbar .on').dataset.tab === 'mine' && !document.querySelector('#screen .skel')", timeout=10000)
    if "한미반도체" not in pg.inner_text("#screen"): errs.append("넣은 종목이 내 종목에 안 나옴")
    n += 1
    if errs: bad.append((T, "U", "0811", "mine→list", "", errs[:3]))
    b.close()
print(f"{n - len(bad)} ok / {len(bad)} 오류")
for x in bad[:25]:
    print("  ", x)
sys.exit(1 if bad else 0)
