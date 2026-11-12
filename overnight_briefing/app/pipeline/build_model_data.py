"""아침 브리핑 앱이 읽을 모델 산출물을 만든다(과거 재생 전용).

실행 환경: research/overnight_backtest/.venv (pandas 3, 연구 코드와 같은 환경)

    cd ~/4Digit/research/overnight_backtest
    .venv/bin/python ~/4Digit/src/app/pipeline/build_model_data.py

하는 일
1. 연구 패널을 한 번 읽고(약 3~4분), 패널 기간의 모든 거래일에 대해 아침 카드
   (workbench/morning_card.build_card, 봉인 통과 규칙만)를 과거 재생으로 만든다.
2. 예시 계좌 5개의 계좌 범위 후보 AS1(E63, 봉인 미달 후보)을 같은 날짜마다 계산한다.
   그날 이전 자료만 쓰고, 그날 시가(y)는 쓰지 않는다.
3. 개장 뒤 실제 결과를 따로 붙여 '예측 vs 실제' 기록을 만든다.

시장 API·실시간 수집·예약은 실행하지 않는다. 연구 data/ 와 기존 결과 파일은 바꾸지 않는다.
"""
from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

RESEARCH = Path.home() / "4Digit/research/overnight_backtest"
sys.path.insert(0, str(RESEARCH))
sys.path.insert(0, str(RESEARCH / "src"))

from workbench import e62_band as e  # noqa: E402
from workbench import morning_card as mc  # noqa: E402
from common import ACCOUNTS  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "data" / "model"
FEATURED = ["20260625"]  # 6/24 밤 마이크론 실적: 뉴스·관계 자료가 함께 있는 날


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def as1_for_day(E: pd.DataFrame, x: pd.Series, day: str, card: dict) -> dict:
    """예시 계좌마다 AS1(07:30 계좌 범위 후보)을 계산한다. 그날 이전 오차만 쓴다."""
    out = {}
    by = {s["code"]: s for s in card["stocks"]}
    for acc in card["accounts"]:
        held = [(h["code"], h["value"]) for h in acc["holdings"] if h["code"] in by and h["code"] in E.columns]
        total = sum(v for _, v in held)
        if not held or total <= 0:
            continue
        codes = [c for c, _ in held]
        w = np.array([v / total for _, v in held])
        H_P = float(sum(wi * by[c]["H"] for (c, _), wi in zip(held, w)))
        af = e.account_frame(E, x, [(acc["name"], len(codes), codes, w)])
        res = e.run_candidates(af, [acc["name"]], [acc["name"]], [day], specs={"AS1": (["ax"], [])}, asym=())
        if "AS1" not in res or res["AS1"].empty:
            continue
        r = res["AS1"].iloc[0]
        y = af.loc[af["T"] == day, "y"]
        err = float(y.iloc[0]) if len(y) and np.isfinite(y.iloc[0]) else None
        out[acc["name"]] = dict(
            weights={c: round(float(wi), 6) for c, wi in zip(codes, w)}, stock_value=total, H_P=round(H_P, 6),
            L80=round(H_P + float(r.L80), 6), U80=round(H_P + float(r.U80), 6),
            L90=round(H_P + float(r.L90), 6), U90=round(H_P + float(r.U90), 6),
            y_P=None if err is None else round(H_P + err, 6))
    return out


def main() -> None:
    t0 = time.time()
    z, n, dev, codes = e.load_frames()
    print(f"panel loaded {time.time()-t0:.0f}s  T {z['T'].min()}~{z['T'].max()}  NXT {n['T'].min()}~{n['T'].max()}", flush=True)
    E = z.pivot_table(index="T", columns="code", values="e", dropna=False)
    x = z.groupby("T").x.first()
    days = sorted(d for d in z["T"].unique() if d >= n["T"].min())

    stock_rows, acct_rows, day_rows = [], [], []
    keep = {}
    for i, day in enumerate(days):
        try:
            card = mc.build_card(z, n, dev, codes, day, ACCOUNTS, with_outcome=True, slot="0811")
        except SystemExit as stop:  # 학습 기간(학습 60 + 보정 20거래일)이 모자란 날: 카드 함수가 계산을 거절한다
            day_rows.append(dict(T=day, status="no_band", reason=str(stop)))
            continue
        if card.get("status") != "ok":
            day_rows.append(dict(T=day, status=card.get("status"), reason=card.get("reason")))
            continue
        after = {r["code"]: r for r in card.get("after_open", {}).get("rows", [])}
        mon = any(c["kind"] == "mon" for c in card["market"]["cautions"])
        day_rows.append(dict(T=day, D=card["D"], status="ok", x=card["market"]["x"], monday=mon,
                             n_stocks=len(card["stocks"]), in80_share=card.get("after_open", {}).get("in_band80_share")))
        for s in card["stocks"]:
            g, a = s.get("grade_0811") or {}, after.get(s["code"], {})
            stock_rows.append(dict(T=day, code=s["code"], name=s["name"], H=s["H"],
                                   L80=s["band80"][0], U80=s["band80"][1], L90=s["band90"][0], U90=s["band90"][1],
                                   cautions="|".join(c["kind"] for c in s.get("cautions", [])),
                                   grade=g.get("level"), p=g.get("p"), nxt_g=g.get("nxt_g"),
                                   y=a.get("y"), in80=a.get("in_band80"), nxt_dir_match=a.get("nxt_dir_match")))
        as1 = as1_for_day(E, x, day, card)
        for name, v in as1.items():
            acct_rows.append(dict(T=day, account=name, **{k: v[k] for k in ("stock_value", "H_P", "L80", "U80", "L90", "U90", "y_P")}))
        if day in FEATURED:
            keep[day] = dict(card_0811=card, as1=as1)
        if i % 25 == 0:
            print(f"  {day} ({i+1}/{len(days)}) {time.time()-t0:.0f}s", flush=True)

    st = pd.DataFrame(stock_rows)
    ac = pd.DataFrame(acct_rows)
    dd = pd.DataFrame(day_rows)
    ok = dd[dd.status == "ok"]

    # 화면 예시 날짜: 지정일 + 자동 선택(가장 크게 내린 밤, 실적 공시 주의가 있는 월요일, 패널 마지막 날)
    auto = {}
    auto["big_down"] = str(ok.loc[ok.x.idxmin(), "T"])
    earn_days = set(st.loc[st.cautions.str.contains("e_earn", na=False), "T"])
    held = {c for a in ACCOUNTS.values() for c in a["hold"]}
    earn_held = set(st.loc[st.cautions.str.contains("e_earn", na=False) & st.code.isin(held), "T"])
    mons = ok[ok.monday]
    mon_days = list(mons["T"])
    pick = [t for t in mon_days if t in earn_held] or [t for t in mon_days if t in earn_days] or mon_days
    auto["monday_earnings"] = pick[-1]
    auto["latest"] = str(ok["T"].max())
    for day in auto.values():
        if day not in keep:
            card = mc.build_card(z, n, dev, codes, day, ACCOUNTS, with_outcome=True, slot="0811")
            keep[day] = dict(card_0811=card, as1=as1_for_day(E, x, day, card))
    for day, v in keep.items():
        v["card_0730"] = mc.build_card(z, n, dev, codes, day, ACCOUNTS, with_outcome=True, slot="0730")

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "days").mkdir(exist_ok=True)
    for day, v in keep.items():
        (OUT / "days" / f"{day}.json").write_text(json.dumps(v, ensure_ascii=False, allow_nan=False))
    st.to_csv(OUT / "track_stocks.csv.gz", index=False)
    ac.to_csv(OUT / "track_accounts.csv", index=False)
    dd.to_csv(OUT / "track_days.csv", index=False)
    manifest = dict(
        generated_at=pd.Timestamp.now(tz="Asia/Seoul").isoformat(timespec="seconds"),
        mode="historical_replay",
        panel=dict(T_first=str(z["T"].min()), T_last=str(z["T"].max()), nxt_first=str(n["T"].min())),
        days_built=len(ok), featured=FEATURED, auto_featured=auto,
        split_T=e.SPLIT_T, development_codes=len(dev),
        code_sha256={"morning_card.py": sha(Path(mc.__file__)), "e62_band.py": sha(Path(e.__file__)), "build_model_data.py": sha(Path(__file__))},
        notes=["모든 값은 과거 자료 재생이며 그날 장 전에 실제로 발행한 기록이 아니다.",
               "종목 띠(S1)·08:11 등급(D08)은 봉인 통과 규칙, 계좌 범위(AS1)는 봉인 미달 후보다.",
               f"{e.SPLIT_T} 이후 날짜는 규칙 값을 정할 때 쓰지 않은 검증 기간이다."])
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    print("done", time.time() - t0, manifest["auto_featured"], flush=True)


if __name__ == "__main__":
    main()
