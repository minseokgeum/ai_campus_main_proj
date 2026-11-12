"""앱 시연용 추가 예시 계좌(반도체와 무관한 계좌). 연구 코드의 ACCOUNTS(A~E)는 건드리지 않는다.

규칙(결과를 보지 않고 정함, 2026-11-10)
- 수량: 2026-10-26 종가 기준 종목당 약 500만 원(=round(5,000,000 / 종가), 최소 1주). 현금 300만 원.
- F 무작위 10종목: A~E에 없는 종목 가운데 시드 20261110으로 무작위 10개.
- G 무작위 6종목(코스닥 포함): A~E·F에 없는 종목 가운데 코스닥 3개 + 코스피 3개를 시드 20261111로.
- H 금융·방어: 금융 3(은행·보험·증권에서 하나씩), 통신 서비스 1, 가스·전력 1, 소비재 1. 각 칸에서 시가총액 1위.
- I 원자재·경기: 정유 1, 화학 1, 철강 1, 해운 1, 건설 1, 항공 여객 1. 각 칸 시가총액 1위.
- 업종 칸은 KSIC 업종명으로 고른다(통신 = '전기 통신업', 항공 = '항공 여객 운송업'). 앞 계좌에 이미 고른 종목은 다시 고르지 않는다.
- J 바이오·내수: 바이오·제약 3, 소비재·유통 2, 인터넷·게임 1. 각 칸 시가총액 순.
실행: ~/4Digit/.venv/bin/python ~/4Digit/src/app/pipeline/build_extra_accounts.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

RESEARCH = Path.home() / "4Digit/research/overnight_backtest"
OUT = Path(__file__).resolve().parents[1] / "data/model/extra_accounts.json"
BASE_T = "20261026"
EXISTING = {"005930", "000660", "042700", "005380", "105560", "091160", "403870", "058470", "240810", "357780", "095340",
            "267260", "298040", "010120", "007660"}


def main() -> None:
    u = pd.read_csv(RESEARCH / "workbench/live/20261109/data/universe.csv", dtype=str)
    u["Marcap"] = pd.to_numeric(u.Marcap, errors="coerce")
    px = pd.read_csv(RESEARCH / "workbench/live/20261109/data/universe_daily.csv", dtype={"date": str, "code": str})
    px = px[px.date == BASE_T].set_index("code").Close
    u = u[u.Code.isin(px.index)].copy()
    pool = u[~u.Code.isin(EXISTING)]

    used: set[str] = set()

    def pick_top(mask, n=1):
        got = list(pool[mask & ~pool.Code.isin(used)].sort_values("Marcap", ascending=False).Code.head(n))
        used.update(got)
        return got

    ind = pool.Industry.fillna("")
    acc = {}
    acc["F 무작위 10종목"] = list(pool.sample(10, random_state=20261110).Code)
    used.update(acc["F 무작위 10종목"])
    rest = pool[~pool.Code.isin(acc["F 무작위 10종목"])]
    acc["G 무작위 6종목(코스닥 포함)"] = (list(rest[rest.Market == "KOSDAQ"].sample(3, random_state=20261111).Code)
                                     + list(rest[rest.Market == "KOSPI"].sample(3, random_state=20261111).Code))
    used.update(acc["G 무작위 6종목(코스닥 포함)"])
    acc["H 금융·방어"] = (pick_top(ind.str.contains("은행|지주")) + pick_top(ind.str.contains("보험")) + pick_top(ind.str.contains("증권|금융 지원"))
                       + pick_top(ind.str.contains("전기 통신업")) + pick_top(ind.str.contains("가스|전기업|전력")) + pick_top(pool.group == "소비재·유통"))
    acc["I 원자재·경기"] = (pick_top(ind.str.contains("석유 정제")) + pick_top(ind.str.contains("화학")) + pick_top(ind.str.contains("철강|1차 철")) +
                        pick_top(ind.str.contains("해상 운송")) + pick_top(ind.str.contains("건설")) + pick_top(ind.str.contains("항공 여객")))
    acc["J 바이오·내수"] = (pick_top(pool.group == "바이오·제약", 3) + pick_top(pool.group == "소비재·유통", 2) + pick_top(pool.group == "인터넷·게임·통신", 1))
    out = {}
    for name, codes in acc.items():
        codes = list(dict.fromkeys(codes))
        hold = {c: max(1, int(round(5_000_000 / float(px[c])))) for c in codes}
        out[name] = dict(cash=3_000_000, hold=hold, names={c: u.set_index("Code").Name[c] for c in codes},
                         groups={c: u.set_index("Code").group[c] for c in codes})
    meta = dict(made="2026-11-10", base_close_date=BASE_T, rule=__doc__.split("규칙")[1].split("실행:")[0].strip(), source="app-only demo accounts")
    OUT.write_text(json.dumps(dict(meta=meta, accounts=out), ensure_ascii=False, indent=1))
    for n, v in out.items():
        print(n, " · ".join(f"{v['names'][c]}({v['groups'][c]})" for c in v["hold"]))


if __name__ == "__main__":
    main()
