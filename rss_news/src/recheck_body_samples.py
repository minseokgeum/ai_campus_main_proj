"""Recheck a few article-like samples without storing article HTML or body text."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

from collect_article_bodies import BLOCK_HTTP, BLOCK_MARKERS, container_text, extract


UTC = timezone.utc
ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 10_000_000
SOURCES = ("ABC News", "NBC News", "Al Jazeera English", "MarketWatch")
PREFERRED_FEED = {"ABC News": "business"}
SELECTORS = {
    "ABC News": ("[data-testid='prism-article-body']", ".Article__Content", ".article-copy", "article"),
    "NBC News": ("[data-testid='article-body']", ".article-body__content", ".article-body", "article"),
    "Al Jazeera English": (".wysiwyg--all-content", ".article-p-wrapper", "[class*='wysiwyg']", "article", "main"),
    "MarketWatch": ("#js-article__body", ".article__body", "[data-module='ArticleBody']", ".paywall", "article"),
}


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def article_sample(rows: list[dict], source: str) -> dict | None:
    choices = [row for row in rows if row["source_name"] == source and row["url"] and "/video/" not in row["url"].lower()]
    if PREFERRED_FEED.get(source):
        preferred = [row for row in choices if row["feed_name"] == PREFERRED_FEED[source]]
        choices = preferred or choices
    choices.sort(key=lambda row: row["date_used_utc"], reverse=True)
    return choices[0] if choices else None


def extract_candidate(html: str, source: str) -> tuple[str, str, int]:
    body, method, paragraphs = extract(html, source)
    candidates = [(body, method, paragraphs)] if body else []
    soup = BeautifulSoup(html, "html.parser")
    for selector in SELECTORS[source]:
        for node in soup.select(selector)[:3]:
            text, count = container_text(node)
            if text:
                candidates.append((text, f"research selector {selector}", count))
    return max(candidates, key=lambda item: len(item[0]), default=("", "no article container", 0))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--timeout", type=float, default=25.0)
    args = parser.parse_args()
    source_file = args.run / "entry_field_sample.csv"
    entries = read_csv(source_file)
    session = requests.Session()
    session.headers.update({
        "User-Agent": "rss-news-research/1.0 (+small public article validation)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.8",
    })
    rows = []
    for source in SOURCES:
        sample = article_sample(entries, source)
        row = {
            "source_name": source, "sample_title": sample["title"] if sample else "",
            "sample_url": sample["url"] if sample else "", "checked_at_utc": datetime.now(UTC).isoformat(),
            "body_test_status": "not_tested", "reason": "no article-like sample",
            "http_status": "", "resolved_url": "", "content_type": "", "response_bytes": 0,
            "html_sha256": "", "extraction_method": "", "body_length": 0,
            "paragraph_count": 0, "access_markers": "", "full_text_verified": False,
            "review_scope": "one public HTTP response and extracted DOM/JSON-LD candidate only; no body text saved",
        }
        if not sample:
            rows.append(row)
            continue
        try:
            response = session.get(sample["url"], timeout=(8, args.timeout), allow_redirects=True)
            content = response.content
            row.update(
                http_status=response.status_code, resolved_url=response.url,
                content_type=response.headers.get("Content-Type", ""), response_bytes=len(content),
                html_sha256=hashlib.sha256(content[:MAX_BYTES]).hexdigest(),
            )
            if len(content) > MAX_BYTES:
                row.update(body_test_status="failed", reason="response exceeds 10 MB")
            elif response.status_code in BLOCK_HTTP:
                row.update(body_test_status="blocked", reason=f"HTTP {response.status_code}")
            elif not 200 <= response.status_code < 300:
                row.update(body_test_status="failed", reason=f"HTTP {response.status_code}")
            elif "html" not in row["content_type"].lower():
                row.update(body_test_status="failed", reason="response is not HTML")
            else:
                text = BeautifulSoup(response.text, "html.parser").get_text(" ", strip=True).lower()
                markers = sorted({marker for marker in BLOCK_MARKERS if marker in re.sub(r"\s+", " ", text)})
                body, method, paragraphs = extract_candidate(response.text, source)
                row.update(
                    extraction_method=method, body_length=len(body), paragraph_count=paragraphs,
                    access_markers=" | ".join(markers),
                )
                if len(body) >= 500 and paragraphs >= 3:
                    status = "public_body_candidate_with_page_marker" if markers else "public_body_candidate"
                    reason = "substantial body candidate extracted; completeness not verified"
                    row.update(body_test_status=status, reason=reason)
                elif body:
                    row.update(body_test_status="partial_candidate", reason="short or structurally limited text candidate")
                elif markers:
                    row.update(body_test_status="access_limited", reason="access marker present and no body candidate")
                else:
                    row.update(body_test_status="failed", reason="article body container not found")
        except requests.RequestException as exc:
            row.update(body_test_status="failed", reason=f"{type(exc).__name__}: {str(exc)[:300]}")
        rows.append(row)
        print(source, row["body_test_status"], row["http_status"], row["body_length"])
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S_%fZ")
    csv_path = args.run / f"body_sample_recheck_{stamp}.csv"
    json_path = args.run / f"body_sample_recheck_{stamp}.json"
    write_csv(csv_path, rows)
    json_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(csv_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
