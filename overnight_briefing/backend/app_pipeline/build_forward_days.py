"""규칙 확정 전후 실제 날짜(10/27~)의 아침 카드를 앱 날짜 파일로 만든다.

실행 환경: research/overnight_backtest/.venv (연구 코드와 같은 환경)

    cd ~/4Digit/research/overnight_backtest
    .venv/bin/python ~/4Digit/src/app/pipeline/build_forward_days.py --root workbench/live/20261109

- 자료는 live_refresh가 이어 붙인 실제 시세(끝난 장만)다. 규칙·코드는 확정본(e62_band.py b9599c96) 그대로다.
- 08:11 카드는 E100(workbench/e100_forward.py)이 같은 날 만든 카드와 같은지 대조한 뒤 쓴다.
- 장 전에 실제로 발행한 기록이 아니라, 확정 코드로 그날 이전 자료만 써서 사후에 다시 계산한 것이다.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

RESEARCH = Path.home() / "4Digit/research/overnight_backtest"
sys.path[:0] = [str(RESEARCH), str(RESEARCH / "src"), str(Path(__file__).resolve().parent)]

from common import ACCOUNTS  # noqa: E402
from workbench import live_panel as lp  # noqa: E402
from workbench import morning_card as mc  # noqa: E402
from build_model_data import as1_for_day  # noqa: E402
from build_live_day import LIVE, sealed_info  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "data" / "model" / "days"
FIRST, FREEZE = "20261027", "20261103"
E100 = RESEARCH / "workbench/runs/claude_forward_r1"


def same_card(a: dict, b: dict) -> bool:
    key = lambda c: [(s["code"], round(s["H"], 10), round(s["band80"][0], 10), round(s["band80"][1], 10),
                      (s.get("grade_0811") or {}).get("level")) for s in c["stocks"]]
    return key(a) == key(b)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    root = RESEARCH / ap.parse_args().root
    last = json.loads((root / "refresh_manifest.json").read_text())["universe_daily_last"]
    (z, n, dev, codes), _ = lp.frames(root, root / "dart_filings.csv", T=last)
    E = z.pivot_table(index="T", columns="code", values="e", dropna=False)
    x = z.groupby("T").x.first()
    days = [t for t in sorted(z["T"].unique()) if t >= FIRST and np.isfinite(z.loc[z["T"] == t, "y"]).any()]
    for T in days:
        c811 = mc.build_card(z, n, dev, codes, T, ACCOUNTS, with_outcome=True, slot="0811")
        ref = E100 / f"card_{T}.json"
        if ref.exists() and not same_card(c811, json.loads(ref.read_text())):
            raise SystemExit(f"{T}: E100 카드와 다름 — 중단")
        c730 = mc.build_card(z, n, dev, codes, T, ACCOUNTS, with_outcome=True, slot="0730")
        seal = sealed_info(T)   # 11/10 추가: 아침에 봉인한 카드가 있으면 발행 시각·해시와 숫자 일치 여부를 남긴다
        p811 = LIVE / f"card_{T}_0811.json"
        same = same_card(c811, json.loads(p811.read_text())) if p811.exists() else None
        if seal.get("0811", {}).get("before_open") and same:
            note = f"장 전 {seal['0811']['issued_at'][11:16]}에 봉인한 08:11 카드와 같은 숫자. 장 마감 뒤 같은 코드로 다시 계산해 실제 시가를 붙임"
        elif seal:
            note = ("봉인 카드와 숫자가 다름(장 마감 뒤 자료 차이) — 봉인 카드 채점은 check 파일" if same is False else "봉인 카드는 개장 뒤 발행(장 전 기록 아님)") \
                + ". 확정 코드로 그날 이전 자료만 써서 다시 계산"
        else:
            note = "확정 코드로 그날 이전 자료만 써서 사후에 다시 계산(장 전 실제 발행 아님)"
        v = dict(card_0811=c811, card_0730=c730, as1=as1_for_day(E, x, T, c811),
                 source=dict(kind="forward", after_freeze=T >= FREEZE, rule_fixed="2026-11-02 15:17", data_root=str(root.relative_to(RESEARCH)),
                             sealed=seal, same_as_sealed=same, note=note))
        (OUT / f"{T}.json").write_text(json.dumps(v, ensure_ascii=False, allow_nan=False, default=float))
        print(T, "ok", "확정 뒤" if T >= FREEZE else "확정 전", flush=True)


if __name__ == "__main__":
    main()
