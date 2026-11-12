"""아침 카드 하나를 그날 실제 시가로 채점한다(개장 뒤 실행). 카드는 고치지 않고, 결과는 새 파일로 남긴다.
먼저 카드 해시가 카드와 같이 저장한 .sha256과 같은지 확인한다(카드를 만든 뒤 바뀌지 않았는지).
시가는 한국투자증권 일봉(FHKST03010100, 시장 J)의 그날 시가. 읽기 전용 시세 조회, 키 값은 출력하지 않는다.
사용: PYTHONPATH=.:src .venv/bin/python workbench/runs/claude_live_r1/check_open.py --date 20261104 --env ~/4Digit-solo/.env
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

from workbench.live_refresh import kis_get

HERE = Path(__file__).parent


def opens(kis, codes, day):
    out = {}
    for code in codes:
        res = kis_get(kis, "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice", "FHKST03010100",
                      {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": code, "FID_INPUT_DATE_1": day, "FID_INPUT_DATE_2": day,
                       "FID_PERIOD_DIV_CODE": "D", "FID_ORG_ADJ_PRC": "0"})
        for r in res.get("output2") or []:
            if r.get("stck_bsop_date") == day and float(r.get("stck_oprc") or 0) > 0:
                out[code] = float(r["stck_oprc"])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    ap.add_argument("--env", required=True)
    ap.add_argument("--card", help="기본: 같은 폴더의 card_<date>.json")
    ap.add_argument("--out", help="기본: 같은 폴더의 check_<date>.json (11/11 추가: 두 카드를 함께 돌릴 때 겹치지 않게)")
    a = ap.parse_args()
    card_path = Path(a.card) if a.card else HERE / f"card_{a.date}.json"
    text = card_path.read_text()
    saved = Path(str(card_path) + ".sha256").read_text().split()[0]
    now_sha = hashlib.sha256(text.encode()).hexdigest()
    if saved != now_sha:
        raise SystemExit("카드가 저장 뒤 바뀌었습니다. 채점하지 않습니다.")
    card = json.loads(text)
    from collect import KIS
    kis = KIS(a.env)
    fetched_at = pd.Timestamp.now(tz="Asia/Seoul").isoformat(timespec="seconds")
    op = opens(kis, [s["code"] for s in card["stocks"]], a.date)
    rows = []
    for s in card["stocks"]:
        o = op.get(s["code"])
        if o is None:
            continue
        y = o / s["base_close"]["value"] - 1
        g = s["grade_0811"]
        rows.append(dict(code=s["code"], name=s["name"], pc=s["base_close"]["value"], open=o, y=y, H=s["H"],
                         L80=s["band80"][0], U80=s["band80"][1], L90=s["band90"][0], U90=s["band90"][1],
                         in80=s["band80"][0] <= y <= s["band80"][1], in90=s["band90"][0] <= y <= s["band90"][1],
                         earn=any(c["kind"] == "e_earn" for c in s["cautions"]),
                         level=None if g is None else g["level"], p=None if g is None else g["p"], g=None if g is None else g["nxt_g"]))
    d = pd.DataFrame(rows)
    x = card["market"]["x"]
    d["err_H"] = (d.y - d.H).abs() * 100
    d["err_x"] = (d.y - x).abs() * 100
    d["err_0"] = d.y.abs() * 100
    d["above"] = d.y > d.U80
    d["below"] = d.y < d.L80
    gd = d[d.level.notna() & (d.g != 0) & (d.y != 0)].copy()
    gd["dir_ok"] = np.sign(gd.g) == np.sign(gd.y)
    by_grade = {lv: dict(n=int((gd.level == lv).sum()), dir_ok=round(float(gd.loc[gd.level == lv, "dir_ok"].mean() * 100), 1) if (gd.level == lv).any() else None)
                for lv in ("높음", "보통", "낮음")}
    hd = d[(d.H.abs() >= .002) & (d.y.abs() >= .002)]
    res = dict(
        date=a.date, card=card_path.name, card_sha256=now_sha, card_issued_at=card.get("issued_at"), card_mode=card.get("mode"),
        opens_source="한국투자증권 FHKST03010100(J) 그날 시가", opens_fetched_at=fetched_at,
        note="카드는 개장 뒤에 만들었지만 입력은 코드가 장 전 자료로 막았다(끝난 장만, NXT 08:10 봉까지). 장 전에 고정한 사전 예측 기록은 아니다." if str(card.get("issued_at", "")) > a.date[:4] + "-" + a.date[4:6] + "-" + a.date[6:] + "T09:00" else "카드 발행 시각이 개장 전이다.",
        x=x, stocks_scored=len(d), stocks_in_card=len(card["stocks"]),
        in_band80=round(float(d.in80.mean() * 100), 1), in_band90=round(float(d.in90.mean() * 100), 1),
        above80=round(float(d.above.mean() * 100), 1), below80=round(float(d.below.mean() * 100), 1),
        mae_H=round(float(d.err_H.mean()), 3), mae_x=round(float(d.err_x.mean()), 3), mae_zero=round(float(d.err_0.mean()), 3),
        dir_H=round(float((np.sign(hd.H) == np.sign(hd.y)).mean() * 100), 1), dir_H_n=len(hd),
        graded=len(gd), dir_nxt_all=round(float(gd.dir_ok.mean() * 100), 1) if len(gd) else None, by_grade=by_grade,
        earn=dict(n=int(d.earn.sum()), in_band80=round(float(d.loc[d.earn, "in80"].mean() * 100), 1) if d.earn.any() else None),
        accounts=[],
        rows=d.round(6).to_dict(orient="records"))
    by = d.set_index("code")
    for acc in card.get("accounts", []):
        held = [h for h in acc["holdings"] if h["code"] in by.index]
        actual = sum(h["value"] * by.loc[h["code"], "y"] for h in held)
        res["accounts"].append(dict(name=acc["name"], H_sum=acc["H_sum_amount"], actual_sum=round(actual), holdings=len(acc["holdings"]),
                                    in_band80=[f'{by.loc[h["code"], "name"]} {"안" if by.loc[h["code"], "in80"] else "밖"}' for h in held]))
    out = Path(a.out) if a.out else HERE / f"check_{a.date}.json"
    if out.exists():
        raise SystemExit(f"{out.name}가 이미 있습니다. 덮어쓰지 않습니다.")
    out.write_text(json.dumps(res, ensure_ascii=False, indent=1, default=float))
    print(json.dumps({k: v for k, v in res.items() if k not in ("rows",)}, ensure_ascii=False, indent=1, default=float))


if __name__ == "__main__":
    main()
