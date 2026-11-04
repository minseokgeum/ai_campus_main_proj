"""Preview one public article-body candidate per researched publisher.

Only a short excerpt is persisted. Full HTML and extracted article bodies are
not saved. The script does not authenticate, solve challenges, or bypass
subscription/access controls.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

from collect_article_bodies import BLOCK_HTTP, BLOCK_MARKERS, container_text, extract


UTC = timezone.utc
ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 10_000_000
PREVIEW_CHARS = 80
PREFERRED_FEED = {"ABC News": "business"}
SELECTORS = {
    "ABC News": ("[data-testid='prism-article-body']", ".Article__Content", ".article-copy", "article"),
    "CBS News": ("article", "[itemprop='articleBody']", ".content__body"),
    "NBC News": ("[data-testid='article-body']", ".article-body__content", ".article-body", "article"),
    "Al Jazeera English": (".wysiwyg--all-content", ".article-p-wrapper", "[class*='wysiwyg']", "article"),
    "Bloomberg": ("[data-component='body']", ".body-content", "article"),
    "MarketWatch": ("#js-article__body", ".article__body", "[data-module='ArticleBody']", ".paywall", "article"),
    "The Wall Street Journal": ("[data-type='articleBody']", "article"),
    "Financial Times": (".article__content-body", "[data-trackable='article-body']", "article"),
    "Fast Company": ("[itemprop='articleBody']", ".article-content", "article"),
    "The Verge": ("[class*='duet--article--article-body-component']", "article"),
    "Engadget": (".caas-body", "[itemprop='articleBody']", "article"),
    "The Atlantic": ("[data-event-module='Article Body']", ".article-body", "article"),
    "Manufacturing Dive": (".article-body", ".large-8", "article"),
    "Supply Chain Dive": (".article-body", ".large-8", "article"),
    "Construction Dive": (".article-body", ".large-8", "article"),
}


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def choose_sample(entries: list[dict], source: str) -> dict | None:
    candidates = [
        row for row in entries
        if row["source_name"] == source
        and row.get("url")
        and "/video/" not in row["url"].lower()
    ]
    preferred = PREFERRED_FEED.get(source)
    if preferred:
        preferred_rows = [row for row in candidates if row["feed_name"] == preferred]
        candidates = preferred_rows or candidates
    candidates.sort(key=lambda row: row.get("date_used_utc", ""), reverse=True)
    return candidates[0] if candidates else None


def extract_candidate(html: str, source: str) -> tuple[str, str, int]:
    body, method, paragraphs = extract(html, source)
    candidates = [(body, method, paragraphs)] if body else []
    soup = BeautifulSoup(html, "html.parser")
    for selector in SELECTORS.get(source, ("[itemprop='articleBody']", "article")):
        for node in soup.select(selector)[:3]:
            text, count = container_text(node)
            if text:
                candidates.append((text, f"preview selector {selector}", count))
    return max(candidates, key=lambda item: len(item[0]), default=("", "no article container", 0))


def report_markdown(rows: list[dict], started: datetime) -> str:
    counts: dict[str, int] = {}
    for row in rows:
        counts[row["body_status"]] = counts.get(row["body_status"], 0) + 1
    lines = [
        "# 신규 후보 매체별 본문 미리보기",
        "",
        f"확인 시각: {started.isoformat()} (UTC)",
        "",
        "매체당 기사형 URL 1건만 공개 HTTP로 확인했다. 로그인·유료벽·차단은 우회하지 않았다. "
        "본문 전문과 HTML은 저장하지 않았으며, 미리보기는 최대 80자다.",
        "",
        "## 상태 요약",
        "",
    ]
    for status in sorted(counts):
        lines.append(f"- `{status}`: {counts[status]}개 매체")
    lines.extend([
        "",
        "## 매체별 결과",
        "",
        "| 매체 | 상태 | HTTP | 추출 방식 | 길이/문단 | 본문 미리보기 | 이유 |",
        "|---|---|---:|---|---:|---|---|",
    ])
    for row in rows:
        preview = row["body_preview"].replace("|", "\\|")
        reason = row["reason"].replace("|", "\\|")
        method = row["extraction_method"].replace("|", "\\|")
        lines.append(
            f"| {row['source_name']} | {row['body_status']} | {row['http_status']} | "
            f"{method} | {row['body_length']}/{row['paragraph_count']} | {preview} | {reason} |"
        )
    lines.extend([
        "",
        "## 판정 주의",
        "",
        "- `public_body_candidate`는 공개 응답에서 본문처럼 보이는 구조를 찾았다는 뜻이다.",
        "- 길이가 길어도 전문 확보로 판정하지 않는다. 모든 행의 `full_text_verified`는 `false`다.",
        "- `blocked`, `subscription_or_access_limited`, `failed`는 우회하거나 반복 요청하지 않았다.",
    ])
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--research-run", type=Path, required=True)
    parser.add_argument("--candidates", type=Path,
                        default=ROOT / "config/new_feed_candidates_20261029.csv")
    parser.add_argument("--output", type=Path,
                        default=ROOT / "outputs/body_preview_20261030")
    parser.add_argument("--timeout", type=float, default=25.0)
    parser.add_argument("--delay", type=float, default=1.0)
    args = parser.parse_args()

    started = datetime.now(UTC)
    run = args.output / started.strftime("%Y%m%dT%H%M%S_%fZ")
    run.mkdir(parents=True, exist_ok=False)
    entries_path = args.research_run / "entry_field_sample.csv"
    entries = read_csv(entries_path)
    candidates = read_csv(args.candidates)
    sources = list(dict.fromkeys(row["source_name"] for row in candidates))
    support = {}
    for row in candidates:
        support.setdefault(row["source_name"], row["official_support_status"])

    session = requests.Session()
    session.headers.update({
        "User-Agent": "rss-news-body-preview/1.0 (+small public article validation)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.8",
    })
    results = []
    for index, source in enumerate(sources, 1):
        sample = choose_sample(entries, source)
        row = {
            "source_name": source,
            "official_support_status": support[source],
            "sample_title": sample["title"] if sample else "",
            "sample_url": sample["url"] if sample else "",
            "checked_at_utc": datetime.now(UTC).isoformat(),
            "body_status": "not_tested", "reason": "no article-like sample",
            "http_status": "", "resolved_url": "", "content_type": "",
            "response_bytes": 0, "response_sha256": "",
            "extraction_method": "", "body_length": 0, "paragraph_count": 0,
            "body_preview": "", "preview_chars": 0, "access_markers": "",
            "article_body_stored": False, "full_text_verified": False,
        }
        if sample:
            try:
                response = session.get(sample["url"], timeout=(8, args.timeout), allow_redirects=True)
                content = response.content
                row.update(
                    http_status=response.status_code, resolved_url=response.url,
                    content_type=response.headers.get("Content-Type", ""),
                    response_bytes=len(content),
                    response_sha256=hashlib.sha256(content[:MAX_BYTES]).hexdigest(),
                )
                if len(content) > MAX_BYTES:
                    row.update(body_status="failed", reason="response exceeds 10 MB")
                elif response.status_code in BLOCK_HTTP:
                    row.update(body_status="blocked", reason=f"HTTP {response.status_code}")
                elif not 200 <= response.status_code < 300:
                    row.update(body_status="failed", reason=f"HTTP {response.status_code}")
                elif "html" not in row["content_type"].lower():
                    row.update(body_status="failed", reason="response is not HTML")
                else:
                    visible = clean(BeautifulSoup(response.text, "html.parser").get_text(" ", strip=True)).lower()
                    markers = sorted({marker for marker in BLOCK_MARKERS if marker in visible})
                    body, method, paragraphs = extract_candidate(response.text, source)
                    preview = clean(body)[:PREVIEW_CHARS]
                    row.update(
                        extraction_method=method, body_length=len(body),
                        paragraph_count=paragraphs, body_preview=preview,
                        preview_chars=len(preview), access_markers=" | ".join(markers),
                    )
                    if len(body) >= 500 and paragraphs >= 3:
                        status = "candidate_with_page_marker" if markers else "public_body_candidate"
                        row.update(body_status=status, reason="body-like public text found; completeness not verified")
                    elif body:
                        row.update(body_status="partial_candidate", reason="short or structurally limited text candidate")
                    elif markers:
                        row.update(body_status="subscription_or_access_limited", reason="page marker present and no body candidate")
                    else:
                        row.update(body_status="failed", reason="article body container not found")
            except requests.RequestException as exc:
                row.update(body_status="failed", reason=f"{type(exc).__name__}: {str(exc)[:300]}")
        results.append(row)
        print(f"{index:02d}/{len(sources)} {source}: {row['body_status']} {row['body_length']}")
        time.sleep(args.delay)

    write_csv(run / "body_previews.csv", results)
    (run / "body_previews.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (run / "body_previews.md").write_text(report_markdown(results, started), encoding="utf-8")
    conditions = {
        "state": "complete", "started_at_utc": started.isoformat(),
        "completed_at_utc": datetime.now(UTC).isoformat(),
        "research_run": str(args.research_run.resolve()),
        "source_media": len(sources), "requests_attempted": sum(bool(row["sample_url"]) for row in results),
        "preview_char_limit": PREVIEW_CHARS,
        "policy": "one public article request per publisher; no authentication or access-control bypass",
        "article_body_stored": False, "full_text_verified": False,
    }
    (run / "run_conditions.json").write_text(
        json.dumps(conditions, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (args.output / "LATEST.txt").write_text(str(run.resolve()), encoding="utf-8")
    print(f"output: {run}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
