"""더 파 보기 9: 06:00에 '오늘 아침이 어떤 아침인지' 나누기(규칙은 돌리기 전 2026-10-27에 정함).

    python src/explore9.py   (explore.py, explore4.py를 먼저 돌려 둘 것)

아침 네 가지(위에서부터 먼저 맞는 것)
  특수일   연휴 다음 날 · 월요일 · FOMC 결과 아침 · 옵션 만기일(매달 둘째 목요일)  → 08시에 다시 보기
  확실     80% 범위(F2 중심, EWMA σ)가 0을 걸치지 않음                          → 방향을 말해 줌
  보합권   범위가 0을 걸치고 |F2| < 0.5%                                         → 신경 쓸 일 적음
  애매     그 밖(범위가 0을 걸치고 |F2| ≥ 0.5%)                                   → 08시에 다시 보기
잰 것: 아침 비율, 방향 일치(06:00 F2), 오차, 실제 움직임 크기, 그리고 NXT 08:10 가격으로 다시 봤을 때의 방향 일치(NXT 종목만).
"""
import numpy as np
import pandas as pd

from backtest import build_dataset
from common import MIN_TRAIN, RESULTS
from explore import add_features, run_target
from explore8 import FOMC_T, option_expiries

Z80 = 1.2816
DISC_END = "20260430"


def classify(df, base):
    exp = option_expiries(base.index)
    hol = set(base.index[base.holiday_gap])
    mon = set(t for t in base.index if pd.Timestamp(t).weekday() == 0)
    special = df["T"].isin(hol | mon | set(FOMC_T) | exp)
    half = Z80 * df.sd_ewma
    straddle = (df.F2 - half < 0) & (df.F2 + half > 0)
    return np.select([special, ~straddle, straddle & (df.F2.abs() < 0.005)], ["특수일", "확실", "보합권"], "애매")


def table(df, label, nxt=None):
    out = [f"### {label}\n", "| 아침 | 비율 | 방향 일치(06:00) | 발견 / 확인 | 오차 | 실제 움직임 평균 | 08:10 NXT로 다시 보면 |", "|---|---|---|---|---|---|---|"]
    for k in ["확실", "보합권", "애매", "특수일"]:
        g = df[df.cls == k]
        if len(g) == 0:
            continue
        g2 = g[g.y != 0]
        hit = lambda z: (np.sign(z.F2) == np.sign(z.y)).mean() if len(z) else np.nan
        re = ""
        if nxt is not None:
            n = g.merge(nxt, on=["T", "code"], how="inner").dropna(subset=["g_081000"])
            n = n[n.y != 0]
            if len(n):
                re = f"{(np.sign(n.g_081000) == np.sign(n.y)).mean():.0%} ({len(n)})"
        out.append(f"| {k} | {len(g) / len(df):.0%} | {hit(g2):.0%} | {hit(g2[g2['T'] <= DISC_END]):.0%} / {hit(g2[g2['T'] > DISC_END]):.0%} | "
                   f"{(g.y - g.F2).abs().mean() * 100:.2f}%p | {g.y.abs().mean() * 100:.2f}% | {re} |")
    return out


if __name__ == "__main__":
    base = add_features(build_dataset())
    test = [t for t in base.index if (base.index < t).sum() >= MIN_TRAIN]
    K = run_target(base, "KS200", test).assign(code="KS200")
    K["cls"] = classify(K, base)
    S = pd.read_csv(RESULTS / "explore_predictions.csv", dtype={"T": str, "target": str}).rename(columns={"target": "code"})
    S["cls"] = classify(S, base)
    N = pd.read_csv(RESULTS / "explore4_predictions.csv", dtype={"T": str, "code": str})[["T", "code", "g_081000"]]
    md = ["# 더 파 보기 9: 06:00에 오늘 아침을 네 가지로 나누면\n", f"표본 밖 {len(test)}일. 규칙은 파일 머리말.\n"]
    md += table(K, "코스피200 지수")
    md.append("")
    md += table(S, "종목 15개", nxt=N)
    # 확실한 아침의 하루 평균 몇 종목?
    md.append("\n### 확실한 아침은 얼마나 자주 오나(종목 15개)\n")
    per_day = S[S.cls == "확실"].groupby("T").size().reindex(sorted(S["T"].unique()), fill_value=0)
    md.append(f"하루에 '확실' 판정을 받은 종목 수: 평균 {per_day.mean():.1f}개, 0개인 날 {(per_day == 0).mean():.0%}, 10개 이상인 날 {(per_day >= 10).mean():.0%}.\n")
    K.to_csv(RESULTS / "explore9_index.csv", index=False)
    (RESULTS / "explore9.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))
