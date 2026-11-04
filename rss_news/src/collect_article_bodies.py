"""Collect public article-body candidates for an explicit pilot sample.

This tool does not authenticate, solve challenges, or bypass paywalls. Extraction
success means that a public HTML response yielded an article-body candidate; it
does not mean the publisher's complete article was verified.
"""
import argparse
import csv
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup

UTC = timezone.utc
ROOT = Path(__file__).resolve().parents[1]
BLOCK_HTTP = {401, 403, 407, 429, 451}
BLOCK_MARKERS = (
    "access denied", "verify you are human", "captcha", "enable javascript",
    "sign in to continue", "subscribe to continue", "subscription required",
    "you have reached your limit", "premium content",
    "pardon our interruption", "made us think you were a bot",
    "make sure that cookies and javascript are enabled",
)

SELECTORS = {
    "The Motley Fool": [
        "[itemprop='articleBody']", ".article-body", ".article-content",
        "[data-testid='article-body']", "article",
    ],
    "CNBC": [
        ".ArticleBody-articleBody", "[data-module='ArticleBody']",
        "[data-test='articleBody']", "article",
    ],
    "Zacks": [
        "#comtext", ".commentary_body", ".article_body", ".article-content",
        "[itemprop='articleBody']", "article",
    ],
    "Fox Business": [
        ".article-body", ".article-content", "[data-testid='article-body']",
        "[itemprop='articleBody']", "article",
    ],
    "Fortune": [
        "[data-testid='article-body']", ".article-content", ".post-content",
        "[itemprop='articleBody']", "article",
    ],
    "Business Insider": [
        "[data-component-type='article-content']", ".content-lock-content",
        ".article-content", ".post-content", "[itemprop='articleBody']",
        "article",
    ],
}


def canonical(url):
    p = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
             if not k.lower().startswith("utm_")
             and k.lower() not in {"fbclid", "gclid", "mc_cid", "mc_eid"}]
    return urlunsplit((p.scheme, p.netloc.lower(), p.path, urlencode(query), ""))


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def blocks(value):
    text = clean(value).lower()
    return sorted({marker for marker in BLOCK_MARKERS if marker in text})


def jsonld_bodies(soup):
    found = []

    def walk(value):
        if isinstance(value, dict):
            body = value.get("articleBody")
            if isinstance(body, str) and clean(body):
                found.append(clean(body))
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    for script in soup.select("script[type='application/ld+json']"):
        try:
            walk(json.loads(script.string or script.get_text()))
        except (json.JSONDecodeError, TypeError):
            continue
    return found


def container_text(node):
    clone = BeautifulSoup(str(node), "html.parser")
    for unwanted in clone.select(
        "script,style,noscript,svg,form,nav,footer,header,aside,button,[aria-hidden='true']"
    ):
        unwanted.decompose()
    parts = []
    for item in clone.select("p,h2,h3,li,blockquote"):
        text = clean(item.get_text(" ", strip=True))
        if len(text) >= 20 and (not parts or text != parts[-1]):
            parts.append(text)
    return "\n\n".join(parts), len(parts)


def extract(html, source):
    soup = BeautifulSoup(html, "html.parser")
    candidates = []
    for text in jsonld_bodies(soup):
        candidates.append((text, "JSON-LD articleBody", 1))
    for selector in SELECTORS.get(source, ["[itemprop='articleBody']", "article"]):
        for node in soup.select(selector)[:3]:
            text, count = container_text(node)
            if text:
                candidates.append((text, f"BeautifulSoup selector {selector}", count))
    if not candidates:
        return "", "no article container", 0
    return max(candidates, key=lambda item: len(item[0]))


def similarity(left, right):
    left, right = clean(left).lower(), clean(right).lower()
    if not left or not right:
        return 0.0
    return round(SequenceMatcher(None, left, right, autojunk=False).ratio(), 4)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--articles", type=Path,
                        default=ROOT / "outputs/20261029T080241_074663Z/articles.json")
    parser.add_argument("--samples", type=Path,
                        default=ROOT / "config/article_body_pilot_20261029.csv")
    parser.add_argument("--output", type=Path,
                        default=ROOT / "outputs/article_body_pilot_20261029")
    parser.add_argument("--timeout", type=float, default=30)
    parser.add_argument("--delay", type=float, default=0.5)
    args = parser.parse_args()

    original = json.loads(args.articles.read_text(encoding="utf-8"))
    by_url = {row["url"]: row for row in original}
    with args.samples.open(encoding="utf-8-sig", newline="") as handle:
        samples = list(csv.DictReader(handle))
    missing = [row["url"] for row in samples if canonical(row["url"]) not in by_url]
    if missing:
        parser.error(f"Sample URLs absent from source articles: {missing}")

    started = datetime.now(UTC)
    run = args.output / started.strftime("%Y%m%dT%H%M%S_%fZ")
    run.mkdir(parents=True, exist_ok=False)
    (run / "samples_snapshot.csv").write_bytes(args.samples.read_bytes())
    metadata = {
        "state": "running", "started_at_utc": started.isoformat(),
        "source_articles": str(args.articles.resolve()),
        "source_articles_sha256": hashlib.sha256(args.articles.read_bytes()).hexdigest(),
        "samples": str(args.samples.resolve()), "sample_count": len(samples),
        "policy": "public HTTP only; no login, challenge solving, or paywall bypass",
        "status_meaning": {
            "success": "public HTML yielded a substantial body candidate",
            "partial": "some text extracted but response or length indicates partial content",
            "blocked": "HTTP or page indicated access restriction",
            "failed": "request or extraction failed",
        },
        "full_text_verified_by_length": False,
    }
    (run / "run_conditions.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                      "AppleWebKit/537.36 Chrome/141.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.8",
    })
    results = []
    for index, sample in enumerate(samples, 1):
        url = canonical(sample["url"])
        rss = dict(by_url[url])
        record = {
            "article_id": hashlib.sha256(url.encode()).hexdigest(),
            **rss,
            "pilot_priority": int(sample["priority"]),
            "audit_issue": sample["audit_issue"],
            "article_body": "", "article_body_length": 0,
            "body_collected_at_utc": datetime.now(UTC).isoformat(),
            "extraction_method": "", "body_status": "failed",
            "status_reason": "not attempted", "http_status": None,
            "resolved_url": "", "response_content_type": "",
            "response_bytes": 0, "html_sha256": "",
            "access_markers": [], "paragraph_count": 0,
            "summary_length": len(rss.get("summary", "")),
            "rss_body_length": len(rss.get("feed_content", "")),
            "article_body_vs_rss_similarity": 0.0,
            "rss_body_in_article_body": False,
            "summary_in_article_body": False,
            "review_scope": "HTTP response and extracted DOM/JSON-LD text only; no rendered or authenticated view",
            "full_text_verified": False,
        }
        try:
            response = session.get(url, timeout=(8, args.timeout), allow_redirects=True)
            content = response.content[:10_000_001]
            record.update(
                http_status=response.status_code, resolved_url=response.url,
                response_content_type=response.headers.get("Content-Type", ""),
                response_bytes=len(response.content),
                html_sha256=hashlib.sha256(content).hexdigest(),
            )
            if len(content) > 10_000_000:
                record.update(body_status="failed", status_reason="response exceeds 10 MB")
            elif response.status_code in BLOCK_HTTP:
                record.update(body_status="blocked", status_reason=f"HTTP {response.status_code}")
            elif response.status_code < 200 or response.status_code >= 300:
                record.update(body_status="failed", status_reason=f"HTTP {response.status_code}")
            elif "html" not in record["response_content_type"].lower():
                record.update(body_status="failed", status_reason="response is not HTML")
            else:
                text = response.text
                markers = blocks(text)
                body, method, paragraph_count = extract(text, sample["source_name"])
                record.update(
                    article_body=body, article_body_length=len(body),
                    extraction_method=method, access_markers=markers,
                    paragraph_count=paragraph_count,
                    article_body_vs_rss_similarity=similarity(rss.get("feed_content", ""), body),
                    rss_body_in_article_body=bool(clean(rss.get("feed_content", ""))
                                                  and clean(rss["feed_content"]).lower()
                                                  in clean(body).lower()),
                    summary_in_article_body=bool(clean(rss.get("summary", ""))
                                                 and clean(rss["summary"]).lower()
                                                 in clean(body).lower()),
                )
                if len(body) >= 500 and (paragraph_count >= 3 or method == "JSON-LD articleBody"):
                    record.update(body_status="success", status_reason="substantial public article candidate extracted")
                elif body:
                    reason = "short or structurally limited article candidate"
                    record.update(body_status="partial", status_reason=reason)
                elif markers:
                    record.update(body_status="blocked", status_reason="access restriction marker and no body candidate")
                else:
                    record.update(body_status="failed", status_reason="article body container not found")
        except requests.RequestException as exc:
            record.update(body_status="failed",
                          status_reason=f"{type(exc).__name__}: {str(exc)[:300]}")
        results.append(record)
        (run / "results.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
        print(index, sample["source_name"], record["body_status"],
              record["http_status"], record["article_body_length"])
        time.sleep(args.delay)

    columns = [
        "article_id", "source_names", "title", "url", "body_status", "status_reason",
        "http_status", "resolved_url", "body_collected_at_utc", "extraction_method",
        "paragraph_count", "summary_length", "rss_body_length", "article_body_length",
        "article_body_vs_rss_similarity", "rss_body_in_article_body",
        "summary_in_article_body", "access_markers", "full_text_verified",
        "audit_issue", "article_body",
    ]
    with (run / "results.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in results:
            writer.writerow({key: json.dumps(row.get(key), ensure_ascii=False)
                             if isinstance(row.get(key), (list, dict)) else row.get(key, "")
                             for key in columns})
    metadata.update(
        state="completed", finished_at_utc=datetime.now(UTC).isoformat(),
        status_counts={status: sum(r["body_status"] == status for r in results)
                       for status in ("success", "partial", "blocked", "failed")},
    )
    (run / "run_conditions.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Saved:", run.resolve())


if __name__ == "__main__":
    main()
