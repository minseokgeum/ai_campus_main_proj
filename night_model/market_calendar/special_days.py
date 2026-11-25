"""특별한 날 달력: 한국 아침 T마다 장 시간·개장 전 거래·밤사이 미국장·야간선물 자료가 평소와 다른지 정해진 기준으로 뽑는다.

기준과 근거는 이 폴더의 README.md. 요약:
  krx_closed     KRX 휴장(평일)            한국투자증권 국내휴장일조회(CTCA0903R) opnd_yn = N
  first_day      새해 첫 거래일            그해 처음 opnd_yn = Y인 날. 정규장 10:00~15:30, NXT 개장 전 거래 없음
  exam_day       수능일                    exam_days.csv(교육부 시행 날짜). 정규장 10:00~16:30, NXT 개장 전 거래 없음
  us_closed      밤사이 미국장 없음        전 거래일 D ~ T-1(미국 날짜) 중 NYSE 정규장이 0번(us_sessions.csv)
  us_early_close 밤사이 미국장 조기 마감   그 정규장 중 미국 동부 13:00 마감이 있음
  us_multi       밤사이 미국장 여러 번     그 정규장이 2번 이상(한국만 쉰 연휴 다음 날)
  night_roll_gap 야간선물 값 비는 아침     전 거래일 D가 선물 근월물 표(src/common.py FRONTS)의 계약 마지막 날(만기일)

사용(이 폴더의 상위 = 노란띠 엔진 폴더 기준):
  python market_calendar/special_days.py build                 # special_days.csv 다시 만들기(KIS 키, 약 50번 조회)
  python market_calendar/special_days.py show 20261119         # 셸용 한 줄: KRX_OPEN=1 OPEN=1000 CLOSE=1630 PREMARKET=0 KINDS=exam_day
  python market_calendar/special_days.py us-sessions           # us_sessions.csv 다시 만들기(exchange_calendars 필요, 해마다 한 번)
경로: 엔진 폴더 = 환경변수 OVERNIGHT_RESEARCH(없으면 이 파일의 상위 폴더), 키 파일 = ENV_FILE(없으면 저장소 루트 .env).
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENGINE = Path(os.environ.get("OVERNIGHT_RESEARCH") or HERE.parent).expanduser()
REPO = HERE.parents[1]   # night_model은 저장소 바로 아래(원본 overnight_briefing/model은 parents[2])
OUT = HERE / "special_days.csv"
EXAM = HERE / "exam_days.csv"
US = HERE / "us_sessions.csv"
START = "20241202"                      # 엔진 자료(선물 근월물 표)가 시작하는 달
WD = "월화수목금토일"
NORMAL = dict(open="09:00", close="15:30", premarket=1)
COLS = ["date", "wd", "krx_open", "open", "close", "premarket", "prev_day", "us_sessions", "us_close_et", "kinds", "note", "basis"]


def env_file() -> Path:
    for k in ("ENV_FILE", "NIGHTLY_ENV_FILE"):
        if os.environ.get(k):
            return Path(os.environ[k]).expanduser()
    return REPO / ".env"


def d8(d: dt.date) -> str:
    return d.strftime("%Y%m%d")


def p8(s: str) -> dt.date:
    return dt.datetime.strptime(s, "%Y%m%d").date()


def md(s: str) -> str:
    return f"{int(s[4:6])}/{int(s[6:])}"


def read_csv(p: Path) -> list[dict]:
    with open(p, encoding="utf-8") as f:
        return list(csv.DictReader(f))


# ---------- 1. 자료 받기 ----------
def kis_open_days(start: str, until: str) -> dict[str, bool]:
    """KIS 국내휴장일조회. 한 번에 24일씩 오므로 마지막 날 다음 날부터 이어서 묻는다(1초 간격)."""
    sys.path[:0] = [str(ENGINE), str(ENGINE / "src")]
    from collect import KIS
    from workbench.live_refresh import kis_get
    kis, out, day = KIS(str(env_file())), {}, start
    while day <= until:
        res = kis_get(kis, "/uapi/domestic-stock/v1/quotations/chk-holiday", "CTCA0903R", {"BASS_DT": day, "CTX_AREA_NK": "", "CTX_AREA_FK": ""})
        rows = [r for r in (res or {}).get("output") or [] if r.get("opnd_yn") in ("Y", "N")]
        if not rows:
            raise SystemExit(f"휴장일 조회 실패({day}). 키 파일 {env_file()} 확인")
        out.update({r["bass_dt"]: r["opnd_yn"] == "Y" for r in rows})
        day = d8(p8(rows[-1]["bass_dt"]) + dt.timedelta(days=1))
        time.sleep(1)
    return {k: v for k, v in out.items() if start <= k <= until}


def contract_ends() -> set[str]:
    """선물 근월물 표의 계약 마지막 날(= 만기일). 그날 밤 야간장은 다음 계약을 거래한다."""
    sys.path[:0] = [str(ENGINE / "src")]
    from common import FRONTS
    return {b for _, _, b in FRONTS}


# ---------- 2. 날마다 판정 ----------
def build(until: str) -> list[dict]:
    opened = kis_open_days(START, until)
    exam = {r["date"]: r for r in read_csv(EXAM)}
    us = {r["us_date"]: r["close_et"] for r in read_csv(US)}
    us_last = max(us)
    ends = contract_ends()
    rows, prev, seen_year = [], None, set()
    for day in sorted(opened):
        d = p8(day)
        if d.weekday() >= 5:
            continue
        r = dict(date=day, wd=WD[d.weekday()], krx_open=int(opened[day]), open="", close="", premarket="", prev_day=prev or "",
                 us_sessions="", us_close_et="", kinds=[], note=[], basis=["KIS 국내휴장일조회"])
        if not opened[day]:
            r["kinds"].append("krx_closed")
            r["note"].append("한국 증시 휴장일이에요.")
        else:
            r.update(NORMAL)
            if d.year not in seen_year:                       # 새해 첫 거래일
                seen_year.add(d.year)
                if day > START:
                    r.update(open="10:00", close="15:30", premarket=0)
                    r["kinds"].append("first_day")
                    r["note"].append("새해 첫 거래일이라 10:00에 열어요(15:30 마감). 개장 전 거래가 없어 8시 11분 업데이트는 없어요.")
                    r["basis"].append("규칙: 새해 첫 거래일 10:00 개장")
            if day in exam:
                e = exam[day]
                r.update(open=e["regular_open"], close=e["regular_close"], premarket=int(e["premarket"]))
                r["kinds"].append("exam_day")
                r["note"].append(f"수능일이라 {e['regular_open']}에 열고 {e['regular_close']}에 닫아요. 개장 전 거래가 없어 8시 11분 업데이트는 없어요.")
                r["basis"].append("exam_days.csv")
            if prev:
                if prev in ends:
                    r["kinds"].append("night_roll_gap")
                    r["note"].append("선물 만기 다음 날이라 지금 받는 방식으로는 지난밤 야간선물 값이 비어 있어요.")
                    r["basis"].append("FRONTS 계약 마지막 날")
                win = [d8(p8(prev) + dt.timedelta(days=i)) for i in range((d - p8(prev)).days)]   # 미국 날짜 D ~ T-1
                if win[-1] <= us_last:
                    ss = [(u, us[u]) for u in win if u in us]
                    r["us_sessions"], r["us_close_et"] = len(ss), "/".join(c for _, c in ss)
                    r["basis"].append("NYSE 정규장(us_sessions.csv)")
                    if not ss:
                        hol = [u for u in win if p8(u).weekday() < 5]
                        r["kinds"].append("us_closed")
                        r["note"].append(f"밤사이 미국 증시가 쉬었어요(미국 휴장 {', '.join(md(u) for u in hol)}).")
                    elif any(c != "16:00" for _, c in ss):
                        r["kinds"].append("us_early_close")
                        r["note"].append(f"밤사이 미국 증시가 일찍 닫았어요(미국 동부 {[c for _, c in ss if c != '16:00'][0]}).")
                    if len(ss) >= 2:
                        r["kinds"].append("us_multi")
                        r["note"].append(f"한국이 쉬는 동안 미국 증시가 {len(ss)}번 열렸어요({', '.join(md(u) for u, _ in ss)}). 여러 날의 변화가 한 번에 반영돼요.")
            prev = day
        r["kinds"], r["note"], r["basis"] = " ".join(r["kinds"]), " ".join(r["note"]), " · ".join(r["basis"])
        rows.append(r)
    return rows


def write(rows: list[dict]) -> None:
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        w.writerows(rows)


# ---------- 3. 읽기(다른 코드·셸이 쓰는 곳) ----------
def load() -> dict[str, dict]:
    return {r["date"]: r for r in read_csv(OUT)} if OUT.exists() else {}


def day_info(T: str) -> dict:
    """T의 한 줄. 달력 밖이면 주말만 휴장으로 보고 평소 시간을 돌려준다(warn에 이유)."""
    cal = load()
    r = cal.get(T)
    if r:
        return dict(r, warn="")
    wk = p8(T).weekday() < 5
    if not wk and cal and min(cal) <= T <= max(cal):          # 달력 안의 주말
        return dict(date=T, krx_open=0, open="", close="", premarket=0, kinds="krx_closed", note="", warn="")
    return dict(date=T, krx_open=int(wk), open=NORMAL["open"] if wk else "", close=NORMAL["close"] if wk else "",
                premarket=NORMAL["premarket"] if wk else 0, kinds="" if wk else "krx_closed", note="",
                warn=f"{T}은 special_days.csv 범위 밖(주말만 확인). build로 다시 만들 것")


def upcoming(T: str, days: int = 7, kinds: tuple = ("first_day", "exam_day", "krx_closed", "us_closed", "us_early_close", "us_multi")) -> list[dict]:
    """T부터 days일 안의 특별한 날(화면 '다가오는 일정'용)."""
    end = d8(p8(T) + dt.timedelta(days=days))
    return [r for d, r in sorted(load().items()) if T <= d <= end and set(r["kinds"].split()) & set(kinds)]


def show(T: str) -> str:
    r = day_info(T)
    hm = lambda s: s.replace(":", "")
    line = f"KRX_OPEN={r['krx_open']} OPEN={hm(r['open']) or '-'} CLOSE={hm(r['close']) or '-'} PREMARKET={r['premarket'] or 0} KINDS='{r['kinds']}'"
    if r["warn"]:
        print("경고:", r["warn"], file=sys.stderr)
    return line


def us_sessions() -> None:
    import exchange_calendars as xc
    s = xc.get_calendar("XNYS", start="2024-12-01", end=f"{dt.date.today().year + 1}-12-31").schedule
    with open(US, "w", encoding="utf-8", newline="") as f:
        f.write("us_date,open_et,close_et\n")
        for d, r in s.iterrows():
            f.write(f"{d:%Y%m%d},{r.open.tz_convert('America/New_York'):%H:%M},{r.close.tz_convert('America/New_York'):%H:%M}\n")
    print(f"{US.name}: {len(s)}일")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["build", "show", "us-sessions"])
    ap.add_argument("date", nargs="?")
    ap.add_argument("--until", default=d8(dt.date.today() + dt.timedelta(days=400)))
    a = ap.parse_args()
    if a.cmd == "build":
        rows = build(a.until)
        write(rows)
        sp = [r for r in rows if r["kinds"]]
        print(f"{OUT.name}: {rows[0]['date']}~{rows[-1]['date']} 평일 {len(rows)}일, 특별한 날 {len(sp)}일")
        for r in sp:
            print(" ", r["date"], r["wd"], r["kinds"])
    elif a.cmd == "show":
        print(show(a.date or d8(dt.date.today())))
    else:
        us_sessions()
