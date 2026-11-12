"""E100: 동결 규칙 전방 기록(protocol_e100_forward.json). 규칙·코드는 그대로, 날짜마다 그날 이전 자료로만 계산하고 시가로 채점한다.

실행: cd research/overnight_backtest && PYTHONPATH=.:src .venv/bin/python workbench/e100_forward.py --root workbench/live/20261109
새 날짜가 생기면 live_refresh로 자료를 이어 붙인 뒤 다시 돌린다(기존 결과는 날짜별 파일로 남고, 요약은 새로 만든다).
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

from common import ACCOUNTS
from workbench import e62_band as e
from workbench import live_panel as lp
from workbench import morning_card as mc

OUT = Path(__file__).parent / "runs/claude_forward_r1"
FREEZE = "20261103"            # 규칙 확정(11/2 15:17) 뒤 첫 거래일
FIRST = "20261027"             # 규칙 설계 자료(연구 패널) 끝 다음 거래일


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def account_rows(card: dict, z: pd.DataFrame, T: str) -> list[dict]:
    y = z[z["T"] == T].set_index("code").y
    E = z.pivot_table(index="T", columns="code", values="e", dropna=False)
    x = z.groupby("T").x.first()
    by = {s["code"]: s for s in card["stocks"]}
    out = []
    for acc in card["accounts"]:
        held = [h for h in acc["holdings"] if h["code"] in by]
        if not held:
            continue
        exp = sum(h["value"] * by[h["code"]]["H"] for h in held)
        act = sum(h["value"] * float(y.get(h["code"], np.nan)) for h in held)
        row = dict(T=T, account=acc["name"], stock_value=sum(h["value"] for h in held), expected=round(exp), actual=round(act) if np.isfinite(act) else None)
        codes = [h["code"] for h in held if h["code"] in E.columns]
        if codes and np.isfinite(act):
            w = np.array([h["value"] for h in held if h["code"] in E.columns], float)
            w = w / w.sum()
            af = e.account_frame(E, x, [(acc["name"], len(codes), codes, w)])
            res = e.run_candidates(af, [acc["name"]], [acc["name"]], [T], specs={"AS1": (["ax"], [])}, asym=())
            if "AS1" in res and not res["AS1"].empty:
                H_P = sum(wi * by[c]["H"] for c, wi in zip(codes, w))
                r = res["AS1"].iloc[0]
                yp = act / row["stock_value"]
                row.update(as1_lo=H_P + float(r.L80), as1_hi=H_P + float(r.U80), y_P=yp,
                           as1_in=bool(H_P + r.L80 <= yp <= H_P + r.U80))
        out.append(row)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    a = ap.parse_args()
    root = Path(a.root)
    OUT.mkdir(parents=True, exist_ok=True)
    last = json.loads((root / "refresh_manifest.json").read_text())["universe_daily_last"]
    (z, n, dev, codes), manifest = lp.frames(root, root / "dart_filings.csv", T=last)
    days = [t for t in sorted(z["T"].unique()) if t >= FIRST]
    stock_rows, day_rows, acct = [], [], []
    for T in days:
        has_y = bool(np.isfinite(z.loc[z["T"] == T, "y"]).any())
        card = mc.build_card(z, n, dev, codes, T, ACCOUNTS, with_outcome=has_y, slot="0811")
        (OUT / f"card_{T}.json").write_text(json.dumps(card, ensure_ascii=False, indent=1, default=float))
        if not has_y:
            day_rows.append(dict(T=T, status="시가 없음")); continue
        after = {r["code"]: r for r in card["after_open"]["rows"]}
        x = card["market"]["x"]
        for s in card["stocks"]:
            r = after.get(s["code"])
            if not r:
                continue
            g = s.get("grade_0811") or {}
            stock_rows.append(dict(T=T, code=s["code"], name=s["name"], x=x, H=s["H"], L80=s["band80"][0], U80=s["band80"][1],
                                   y=r["y"], in80=r["in_band80"], up=r["y"] > s["band80"][1], down=r["y"] < s["band80"][0],
                                   grade=g.get("level"), p=g.get("p"), nxt_g=g.get("nxt_g"), dir_match=r.get("nxt_dir_match"),
                                   cautions="|".join(c["kind"] for c in s.get("cautions", []))))
        acct += account_rows(card, z, T)
        day_rows.append(dict(T=T, status="채점", group="확정 후" if T >= FREEZE else "확정 전", x=x, monday=bool(card["market"]["cautions"])))
    S = pd.DataFrame(stock_rows)
    D = pd.DataFrame(day_rows)
    A = pd.DataFrame(acct)

    def summary(s: pd.DataFrame, accts: pd.DataFrame) -> dict:
        if s.empty:
            return {}
        g = s[s.grade.notna() & s.dir_match.notna()]
        out = dict(days=int(s["T"].nunique()), stock_days=len(s),
                   in80=round(float(s.groupby("T").in80.mean().mean() * 100), 1),
                   above=round(float(s.groupby("T").up.mean().mean() * 100), 1),
                   below=round(float(s.groupby("T").down.mean().mean() * 100), 1),
                   mae_H=round(float((s.y - s.H).abs().groupby(s["T"]).mean().mean() * 100), 3),
                   mae_x=round(float((s.y - s.x).abs().groupby(s["T"]).mean().mean() * 100), 3))
        for lv in ("높음", "보통", "낮음"):
            q = g[g.grade == lv]
            out[f"dir_{lv}"] = None if q.empty else dict(rate=round(float(q.dir_match.astype(bool).mean() * 100), 1), n=len(q))
        if not accts.empty and "as1_in" in accts:
            q = accts.dropna(subset=["as1_in"])
            out["account_as1_in"] = f"{int(q.as1_in.sum())}/{len(q)}"
        return out

    per_day = []
    for T, s in S.groupby("T"):
        per_day.append(dict(T=T, group="확정 후" if T >= FREEZE else "확정 전", x=round(float(s.x.iloc[0]) * 100, 2),
                            in80=round(float(s.in80.mean() * 100), 1), above=round(float(s.up.mean() * 100), 1),
                            below=round(float(s.down.mean() * 100), 1),
                            mae_H=round(float((s.y - s.H).abs().mean() * 100), 3), mae_x=round(float((s.y - s.x).abs().mean() * 100), 3),
                            hi_dir=None if s[s.grade == "높음"].dir_match.dropna().empty else round(float(s[s.grade == "높음"].dir_match.dropna().astype(bool).mean() * 100), 1),
                            mean_H=round(float(s.H.mean() * 100), 2), mean_y=round(float(s.y.mean() * 100), 2)))
    res = dict(experiment="E100", protocol="workbench/protocol_e100_forward.json", root=str(root), data_last=last,
               code_sha256={"e62_band.py": sha(Path(e.__file__)), "morning_card.py": sha(Path(mc.__file__)), "live_panel.py": sha(Path(lp.__file__))},
               inputs_sha256=manifest["panel_06"]["inputs_sha256"], per_day=per_day,
               before_freeze=summary(S[S["T"] < FREEZE], A[A["T"] < FREEZE] if not A.empty else A),
               after_freeze=summary(S[S["T"] >= FREEZE], A[A["T"] >= FREEZE] if not A.empty else A),
               from_1102=summary(S[S["T"] >= "20261102"], A[A["T"] >= "20261102"] if not A.empty else A),
               all=summary(S, A))
    (OUT / "e100.json").write_text(json.dumps(res, ensure_ascii=False, indent=1, default=float))
    S.to_csv(OUT / "e100_stocks.csv", index=False)
    A.to_csv(OUT / "e100_accounts.csv", index=False)
    pd.set_option("display.width", 220)
    print(pd.DataFrame(per_day).to_string(index=False))
    for k in ("before_freeze", "after_freeze", "from_1102", "all"):
        print(k, json.dumps(res[k], ensure_ascii=False))


if __name__ == "__main__":
    main()
