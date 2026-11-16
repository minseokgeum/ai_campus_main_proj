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

import re

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


# 한국어 문장 안의 회사·인물 이름을 한국에서 흔히 쓰는 표기로(11/17). 영어 원제목은 건드리지 않는다. 긴 이름 먼저.
KO_NAMES = [("Eli Lilly and Company", "일라이 릴리"), ("Eli Lilly", "일라이 릴리"), ("Novo Nordisk", "노보 노디스크"), ("Jensen Huang", "젠슨 황"),
            ("Wall Street", "월가"), ("Morgan Stanley", "모건스탠리"), ("Goldman Sachs", "골드만삭스"), ("Berkshire Hathaway", "버크셔 해서웨이"),
            ("Lockheed Martin", "록히드 마틴"), ("Mercedes-Benz", "메르세데스-벤츠"), ("Exxon Mobil", "엑슨모빌"), ("Meta Platforms", "메타"),
            ("Amazon Web Services", "아마존웹서비스"), ("NVIDIA", "엔비디아"), ("Nvidia", "엔비디아"), ("Microsoft", "마이크로소프트"), ("Micron", "마이크론"),
            ("Intel", "인텔"), ("Tesla", "테슬라"), ("Apple", "애플"), ("Amazon", "아마존"), ("Alphabet", "알파벳"), ("Google", "구글"), ("Boeing", "보잉"),
            ("Pfizer", "화이자"), ("Merck", "머크"), ("Novartis", "노바티스"), ("Roche", "로슈"), ("Amgen", "암젠"), ("Lilly", "릴리"), ("Qualcomm", "퀄컴"),
            ("Broadcom", "브로드컴"), ("Oracle", "오라클"), ("Netflix", "넷플릭스"), ("Walmart", "월마트"), ("JPMorgan", "JP모건"), ("Anthropic", "앤트로픽"),
            ("Stellantis", "스텔란티스"), ("Toyota", "토요타"), ("Samsung", "삼성"), ("Trump", "트럼프"), ("Bessent", "베센트"), ("Fed", "연준"),
            ("Chevron", "셰브론"), ("Meta", "메타"), ("Ford", "포드"), ("Cameco", "카메코"), ("Kioxia", "키옥시아")]
_FIN = {"가": "이", "는": "은", "를": "을", "와": "과"}
_NOFIN = {v: k for k, v in _FIN.items()}


def ko(s):
    """문장 속 영어 이름 → 한국어 표기. 바로 뒤 조사(이/가·은/는·을/를·와/과)는 받침에 맞춰 고친다."""
    if not s:
        return s
    for en, kr in KO_NAMES:
        fin = (ord(kr[-1]) - 0xAC00) % 28 != 0 if "가" <= kr[-1] <= "힣" else False
        fix = _FIN if fin else _NOFIN
        s = re.sub(rf"(?<![A-Za-z]){re.escape(en)}(?![A-Za-z])(?:(가|이|는|은|를|을|와|과)(?=[\s,.·)]|$))?",
                   lambda m: kr + (fix.get(m.group(1), m.group(1)) if m.group(1) else ""), s)
    return s


def _normalize(b: dict, names: dict[str, str]) -> dict:
    """프롬프트 결과를 화면이 기대하는 모양으로 맞춘다(종목 키가 이름이면 코드로, 빠진 칸은 비움)."""
    n2c = name_to_code()
    out = {}
    for k, v in (b.get("stocks") or {}).items():
        code = k if k.isdigit() else n2c.get(k, k)
        v = dict(v)
        v.setdefault("name", names.get(code, k))
        v["news"] = [_item(n) for n in (v.get("news") or [])]
        for n in v["news"]:
            n["short_summary_ko"] = ko(n.get("short_summary_ko"))
        cb = v.get("combined") or {}
        v["combined"] = dict(line_ko=ko(cb.get("line_ko")), stance=cb.get("stance") or "none", checked=bool(cb.get("checked")),
                             news_direction=cb.get("news_direction"), source=cb.get("source") or "llm")
        out[code] = v
    mk = dict(b.get("market") or {})
    mk["items"] = [_item(n) for n in (mk.get("items") or [])]
    for n in mk["items"]:
        n["short_summary_ko"] = ko(n.get("short_summary_ko"))
    mk["line_ko"] = ko(mk.get("line_ko"))
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
