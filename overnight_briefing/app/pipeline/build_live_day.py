"""아침에 봉인한 카드(runs/claude_live_r1/card_T_0730·0811.json)를 앱 날짜 파일로 바로 만든다. 개장 전에도 앱에서 그날 카드를 볼 수 있게.

- 실제 시가·계좌 범위 후보(as1)는 아직 없다. 장 마감 뒤 after_close.sh → build_forward_days가 같은 코드로 다시 계산해 덮는다
  (그때 봉인 카드와 숫자가 같은지 대조해 source.sealed에 남긴다).
- 이미 장 마감 뒤 파일(kind=forward)이 있으면 덮지 않는다.
- --with-open(11/11 추가): 개장 직후 check_open.py가 남긴 check_T_slot.json(한국투자증권 그날 시가)으로 09:00 탭을 바로 채운다.
  봉인 카드 파일은 건드리지 않고 앱 날짜 파일의 카드 사본에만 after_open을 붙인다. 계좌 범위·E100은 여전히 장 마감 뒤.
실행: python3 app/pipeline/build_live_day.py --date 20261111 [--with-open]
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import paths  # 경로: paths.py(환경변수 OVERNIGHT_RESEARCH·DATA_ROOT, 기본은 저장소 안)

LIVE = paths.CARDS
OUT = paths.DATA / "model" / "days"


def sealed_info(T: str) -> dict:
    """봉인 카드의 발행 시각·해시·장 전 여부. 카드가 없으면 빈 dict."""
    info = {}
    for slot in ("0730", "0811"):
        p = LIVE / f"card_{T}_{slot}.json"
        if not p.exists():
            continue
        c = json.loads(p.read_text())
        issued = c.get("issued_at", "")
        info[slot] = dict(issued_at=issued, sha256=hashlib.sha256(p.read_bytes()).hexdigest(),
                          # 그날 개장 시각(수능일·새해 첫 거래일은 10:00, 특별한 날 달력) 전에 발행했으면 장 전
                          before_open=bool(issued) and issued[:10].replace("-", "") == T and issued[11:16] < paths.open_time(T),
                          timing_status=c.get("timing_status", ""))
    return info


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--with-open", action="store_true", help="check_T_slot.json이 있으면 그날 시가로 09:00 탭을 채운다")
    a = ap.parse_args()
    T, out = a.date, Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    dst = out / f"{T}.json"
    if dst.exists() and json.loads(dst.read_text()).get("source", {}).get("kind") == "forward":
        print(T, "장 마감 뒤 파일이 이미 있어 덮지 않음")
        return
    p811, p730 = LIVE / f"card_{T}_0811.json", LIVE / f"card_{T}_0730.json"
    if not p730.exists() and not p811.exists():
        raise SystemExit(f"{T}: 봉인 카드 없음")
    # 11/19: 07:30 카드가 없는 날(06:15·08:17 네트워크 끊김 → '07:30 없음'으로 봉인). 파일 형식을 지키려고 08:11 카드를 넣고 missing_0730으로 표시
    c811 = json.loads(p811.read_text()) if p811.exists() else None
    c730 = json.loads(p730.read_text()) if p730.exists() else c811
    c811 = c811 or c730
    seal = sealed_info(T)
    opened = {}
    if a.with_open:
        for slot, c in (("0730", c730), ("0811", c811)):
            chk = LIVE / f"check_{T}_{slot}.json"
            if not chk.exists():
                continue
            r = json.loads(chk.read_text())
            rows = [dict(code=x["code"], y=round(float(x["y"]), 6), in_band80=bool(x["in80"]),
                         nxt_dir_match=None if slot != "0811" or x.get("g") is None or x["g"] == 0 or x["y"] == 0
                         else bool((x["g"] > 0) == (x["y"] > 0))) for x in r["rows"]]
            c["after_open"] = dict(label="개장 직후 시가(장 마감 뒤 다시 계산)", rows=rows, in_band80_share=r["in_band80"],
                                   opens_fetched_at=r["opens_fetched_at"], card_sha256=r["card_sha256"])
            opened[slot] = r["opens_fetched_at"][11:16]
        if "0811" not in opened and "0730" in opened and c811 is c730:
            opened["0811"] = opened["0730"]
    v = dict(card_0811=c811, card_0730=c730, as1={},
             source=dict(kind="live", after_freeze=True, rule_fixed="2026-11-02 15:17", sealed=seal, missing_0811=not p811.exists(), missing_0730=not p730.exists(),
                         open_filled=opened,
                         note=("장 전에 봉인한 카드 그대로" if all(s["before_open"] for s in seal.values()) else "개장 뒤 발행한 카드(장 전 기록 아님)")
                         + (". 실제 시가는 개장 직후 채움, 계좌 범위는 장 마감 뒤(16:05)" if opened else ". 실제 시가는 개장 직후, 늦어도 장 마감 뒤(16:05) 채움")))
    dst.write_text(json.dumps(v, ensure_ascii=False, allow_nan=False, default=float))
    print(T, "앱 날짜 파일(봉인 카드)", {k: (s["issued_at"][11:16], "장 전" if s["before_open"] else "개장 뒤") for k, s in seal.items()},
          "시가 채움" if opened else "", opened or "")


if __name__ == "__main__":
    main()
