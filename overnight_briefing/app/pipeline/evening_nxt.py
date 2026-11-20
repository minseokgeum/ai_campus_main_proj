"""어제 저녁 넥스트레이드(NXT) 애프터마켓 마지막 거래 가격을 받아 화면 참고용 파일로 남긴다(11/17 추가).

- 무엇: 아침 날짜 T의 전 거래일 D 저녁(18:00~20:00) NXT 1분봉에서 마지막으로 거래가 있던 분의 가격. 어제 종가(카드의 기준 종가) 대비 등락률.
- 왜: 화면에 '어제 저녁 거래'를 참고로만 보여 준다. 예상 범위(노란띠) 계산에는 넣지 않는다(E97: 중심 오차 0.936 → 0.924%p로 차이가 작고
  조용한 밤에 범위가 넓어져 채택하지 않음). 카드·봉인·채점과 무관한 별도 파일이라 실패해도 아침 흐름에 영향이 없다.
- 자료: 한국투자증권 주식일별분봉조회(FHKST03010230, 시장 NX), 읽기 전용. 키 값은 출력하지 않는다.
- 결과: <화면 자료 폴더(DATA_ROOT)>/model/evening/<T>.json  {T, D, fetched_at, rows: {종목코드: {px, at, r, vol}}}
사용: python app/pipeline/evening_nxt.py --date 20261117 [--env <키 파일>] [--force]   (엔진 폴더는 OVERNIGHT_RESEARCH)
"""
from __future__ import annotations

import argparse
import os
import datetime as dt
import json
import sys
from pathlib import Path

import paths  # 경로: paths.py

sys.path[:0] = [str(paths.ENGINE), str(paths.ENGINE / "src")]
from workbench.live_refresh import kis_get  # noqa: E402

DATA = paths.DATA / "model"


def evening(kis, code: str, day: str) -> dict | None:
    res = kis_get(kis, "/uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice", "FHKST03010230",
                  {"FID_COND_MRKT_DIV_CODE": "NX", "FID_INPUT_ISCD": code, "FID_INPUT_HOUR_1": "200000", "FID_INPUT_DATE_1": day,
                   "FID_PW_DATA_INCU_YN": "N", "FID_FAKE_TICK_INCU_YN": ""})
    bars = [r for r in (res.get("output2") or [])
            if r.get("stck_bsop_date") == day and "154000" <= r.get("stck_cntg_hour", "") <= "200000" and float(r.get("cntg_vol") or 0) > 0]
    if not bars:
        return None                                   # NXT에서 거래되지 않는 종목이거나 저녁 거래가 없던 날
    last = max(bars, key=lambda r: r["stck_cntg_hour"])
    return dict(px=float(last["stck_prpr"]), at=last["stck_cntg_hour"][:2] + ":" + last["stck_cntg_hour"][2:4],
                vol=int(sum(float(r["cntg_vol"]) for r in bars)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True, help="아침 날짜 T(YYYYMMDD). 전 거래일 저녁을 받는다")
    ap.add_argument("--env", default=os.environ.get("ENV_FILE") or str(paths.OB.parent / ".env"), help="키 파일(기본: ENV_FILE, 없으면 저장소 루트 .env)")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    out = DATA / "evening" / f"{a.date}.json"
    if out.exists() and not a.force:
        print(f"{a.date} 어제 저녁 NXT: 이미 있음({out.name})")
        return
    day = json.loads((DATA / "days" / f"{a.date}.json").read_text(encoding="utf-8"))
    card = day.get("card_0730") or day.get("card_0811")
    D = card["D"]
    from collect import KIS
    kis = KIS(a.env)
    rows = {}
    for s in card["stocks"]:
        pc = s["base_close"]["value"]
        e = evening(kis, s["code"], D)
        if e and pc:
            rows[s["code"]] = dict(e, r=round(e["px"] / pc - 1, 6))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(dict(T=a.date, D=D, fetched_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"),
                                   source="한국투자증권 FHKST03010230(NX) 전 거래일 18:00~20:00 1분봉의 마지막 거래",
                                   note="화면 참고용. 예상 범위 계산에 쓰지 않는다(E97).", rows=rows), ensure_ascii=False), encoding="utf-8")
    print(f"{a.date} 어제 저녁 NXT({D}): {len(rows)}/{len(card['stocks'])}종목 → {out}")


if __name__ == "__main__":
    main()
