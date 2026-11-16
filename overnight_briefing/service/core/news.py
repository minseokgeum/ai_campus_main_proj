"""밤사이 뉴스 브리핑(brief.json) 읽기. 계약은 scratchpad/followup/contract.md(아래 요약)와 같다.

brief.json = {T, generated_at, model, prompt_version,
  stocks: {code: {name, news: [{id, short_summary_ko, article_types, title, url, source, published_at, story, media_count,
                                relation: {path, evidence, source_ref}, tone}],
                  combined: {line_ko, stance(aligned|opposite|mixed|none), checked(bool)}}},
  market: {line_ko, items}}

1순위: overnight_briefing/nightly_prompt/out/<T>/brief.json(밤사이 프롬프트가 만든 것)
2순위(스텁): news_search/source/nightly/<T>/morning_*/prompt_inputs.jsonl(민석 처리 결과, 프롬프트 전)을 같은 모양으로 옮긴 것.
  AI가 쓴 칸(short_summary_ko, tone, combined.line_ko, market.line_ko)은 비워 두고 화면은 '준비 중'으로 보여 준다.
표준 라이브러리만 쓴다(배포판에서도 그대로 돈다).
"""
from __future__ import annotations

import csv
import json
import os
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

OB = Path(__file__).resolve().parents[2]                 # overnight_briefing/
REPO = OB.parent
BRIEF_DIR = Path(os.environ.get("BRIEF_DIR", str(OB / "nightly_prompt/out"))).expanduser()
NIGHTLY = REPO / "news_search/source/nightly"
PER_STOCK = 10


@lru_cache(maxsize=1)
def name_to_code() -> dict[str, str]:
    p = REPO / "graph_db/source/targets.csv"
    if not p.exists():
        return {}
    with open(p, encoding="utf-8-sig") as f:
        return {r["name"]: r["stock_code"] for r in csv.DictReader(f)}


def _brief_path(T: str) -> Path:
    return BRIEF_DIR / T / "brief.json"


def has_brief(T: str) -> str | None:
    if _brief_path(T).exists():
        return "prompt"
    if any((NIGHTLY / T).glob("morning_*/prompt_inputs.jsonl")):
        return "stub"
    return None


def _split_evidence(ev: str) -> dict:
    """'SK하이닉스 → 공급 → Nvidia (memory chips) — Nvidia AI 가속기용 첨단 메모리 [미국 뉴스]' → 경로·근거·출처."""
    path, _, rest = ev.partition(" — ")
    ref = ""
    if rest.endswith("]") and "[" in rest:
        rest, _, ref = rest.rpartition("[")
        ref = ref.rstrip("]")
    return dict(path=path.strip(), evidence=rest.strip(), source_ref=ref.strip())


def _stub(T: str, names: dict[str, str]) -> dict | None:
    files = sorted((NIGHTLY / T).glob("morning_*/prompt_inputs.jsonl"))
    if not files:
        return None
    n2c = name_to_code()
    stocks: dict[str, dict] = {}
    seen: dict[str, set] = {}
    for fp in files:
        label = fp.parent.name.replace("morning_", "")
        for line in fp.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            d = json.loads(line)
            a = d.get("article") or {}
            if not a.get("url"):                         # 원문 주소를 못 찾은 것(섹션 페이지 등)은 뺀다
                continue
            imp, story = d.get("importance") or {}, d.get("story") or {}
            for c in d.get("companies", []):
                code = n2c.get(c.get("company", ""))
                if not code:
                    continue
                title = c.get("rep_title") or a.get("title") or ""
                if title in seen.setdefault(code, set()):
                    continue
                seen[code].add(title)
                ev = (c.get("evidence") or [""])[0]
                rel = _split_evidence(ev) if ev else dict(path="", evidence="", source_ref="")
                rel["terms"] = c.get("terms", "")
                st = stocks.setdefault(code, dict(name=names.get(code) or c["company"], news=[],
                                                  combined=dict(line_ko=None, stance="none", checked=False)))
                if len(st["news"]) >= PER_STOCK:
                    continue
                st["news"].append(dict(
                    id=f'{label}-{d.get("cluster")}-{code}', short_summary_ko=None, article_types=[c.get("kinds", "")] if c.get("kinds") else [],
                    title=title, url=a.get("url") if c.get("rep_is_body") else None, source=c.get("rep_outlet") or a.get("outlet"),
                    published_at=a.get("published_utc"), story=story.get("status"), media_count=imp.get("n_outlets"),
                    relation=rel, tone=None, round=label, other_titles=(c.get("other_titles") or [])[:2]))
    mtime = max(f.stat().st_mtime for f in files)
    return dict(T=T, generated_at=datetime.fromtimestamp(mtime, timezone.utc).isoformat(timespec="seconds"), model=None,
                prompt_version="stub", source="news_search 처리 결과(밤사이 프롬프트 전)", stocks=stocks, market=dict(line_ko=None, items=[]))


def _normalize(b: dict, names: dict[str, str]) -> dict:
    """프롬프트 결과를 화면이 기대하는 모양으로 맞춘다(종목 키가 이름이면 코드로, 빠진 칸은 비움)."""
    n2c = name_to_code()
    out = {}
    for k, v in (b.get("stocks") or {}).items():
        code = k if k.isdigit() else n2c.get(k, k)
        v = dict(v)
        v.setdefault("name", names.get(code, k))
        v["news"] = [_item(n) for n in (v.get("news") or [])]
        cb = v.get("combined") or {}
        v["combined"] = dict(line_ko=cb.get("line_ko"), stance=cb.get("stance") or "none", checked=bool(cb.get("checked")),
                             news_direction=cb.get("news_direction"))
        out[code] = v
    mk = dict(b.get("market") or {})
    mk["items"] = [_item(n) for n in (mk.get("items") or [])]
    mk.setdefault("line_ko", None)
    keep = {k: v for k, v in b.items() if k not in ("inputs", "prompt_hashes", "usage")}   # 화면에 안 쓰는 큰 칸은 뺀다
    return dict(keep, stocks=out, market=mk)


def _item(n: dict) -> dict:
    """뉴스 한 건을 화면 모양으로: story는 상태 글자로, 기사 유형은 한국어 우선, 검색어 칸 이름 맞추기."""
    n = dict(n)
    st = n.get("story")
    if isinstance(st, dict):
        n["story"] = st.get("status") or st.get("novelty")
    if n.get("article_types_ko"):
        n["article_types"] = n["article_types_ko"]
    rel = dict(n.get("relation") or {})
    if rel.get("search_terms") and not rel.get("terms"):
        rel["terms"] = rel["search_terms"]
    n["relation"] = rel
    n["id"] = str(n.get("id", ""))
    return n


def load_brief(T: str, names: dict[str, str]) -> dict | None:
    p = _brief_path(T)
    if p.exists():
        try:
            return dict(_normalize(json.loads(p.read_text(encoding="utf-8")), names), stub=False)
        except (json.JSONDecodeError, OSError):
            pass
    s = _stub(T, names)
    return dict(s, stub=True) if s else None
