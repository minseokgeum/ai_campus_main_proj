"""배포용 스냅샷: 라이브 묶음(core/bundle.py)의 결과를 service/data/*.json으로 굳힌다. 계산은 하지 않는다.

실행: cd overnight_briefing/service && ~/4Digit/.venv/bin/python build_snapshot.py [--days 6]
원천: DATA_ROOT(기본 ~/4Digit/src/app/data, 매일 봉인·마감 작업이 갱신), OVERNIGHT_RESEARCH, overnight_briefing/nightly_prompt/out/<T>/brief.json
      (없으면 news_search/source/nightly/<T>의 처리 결과로 만든 스텁)
분봉·기사 본문 같은 원자료는 넣지 않는다. 최근 거래일 몇 개의 하루 묶음, 유니버스 띠, 지난 40거래일 기록, 미국 관계 줄만 넣는다.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from core import bundle as B  # noqa: E402

OUT = HERE / "data"


def dump(rel: str, obj, root: Path) -> int:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    s = json.dumps(obj, ensure_ascii=False, allow_nan=False, separators=(",", ":"), default=str)
    p.write_text(s, encoding="utf-8")
    return len(s.encode())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=6, help="최근 몇 거래일을 넣을지")
    a = ap.parse_args()
    tmp = OUT.with_name("data.part")
    if tmp.exists():
        shutil.rmtree(tmp)
    m = B.meta()
    m["days"] = m["days"][: a.days]
    total = dump("meta.json", m, tmp)
    total += dump("stocks.json", B.catalog(), tmp)
    total += dump("accounts.json", B.sample_accounts(), tmp)
    total += dump("track.json", B.track(), tmp)
    total += dump("graph.json", B.graph_all(), tmp)
    for d in m["days"]:
        total += dump(f"day/{d['T']}.json", B.day(d["T"]), tmp)
    if OUT.exists():
        shutil.rmtree(OUT)
    tmp.rename(OUT)
    print(f"스냅샷 {OUT}: 거래일 {len(m['days'])}개({m['days'][-1]['T']}~{m['days'][0]['T']}), {total / 1024:.0f}KB")


if __name__ == "__main__":
    main()
