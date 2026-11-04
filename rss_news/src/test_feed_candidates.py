"""Small, isolated RSS candidate test.

The tool never updates config/feed_registry.csv or the cumulative SQLite store.
It fetches each candidate feed once and, at most, one public article page per
publisher. Article HTML and extracted body text are not persisted: only hashes,
lengths, and extraction diagnostics are saved. It does not authenticate, solve
challenges, or bypass subscription controls.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import feedparser
import requests
from bs4 import BeautifulSoup

from collect_article_bodies import BLOCK_HTTP, BLOCK_MARKERS, extract


UTC = timezone.utc
ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 10_000_000
FIELDS = (
    "candidate_id", "source_name", "feed_name", "feed_url", "category",
    "publisher_type", "selection_mode", "official_support_status",
    "official_source_url", "address_source_url", "address_evidence",
    "body_quality_status", "body_sample_enabled", "notes",
)


def clean_html(value) -> str:
    if not value:
        return ""
    soup = BeautifulSoup(str(value), "html.parser")
    return re.sub(r"\s+", " ", soup.get_text(" ", strip=True)).strip()


def canonical_url(value: str) -> str:
    if not value:
        return ""
    part = urlsplit(value.strip())
    query = [
        (key, item) for key, item in parse_qsl(part.query, keep_blank_values=True)
        if not key.lower().startswith("utm_")
        and key.lower() not in {"fbclid", "gclid", "mc_cid", "mc_eid"}
    ]
    path = part.path or "/"
    return urlunsplit((part.scheme.lower(), part.netloc.lower(), path, urlencode(query), ""))


def parse_bool(value: str) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "y"}


def iso_from_struct(value) -> str:
    if not value:
        return ""
    try:
        return datetime(*value[:6], tzinfo=UTC).isoformat()
    except (TypeError, ValueError, OverflowError):
        return ""


def json_dump(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def csv_dump(path: Path, rows: list[dict], columns: list[str] | None = None) -> None:
    if columns is None:
        columns = list(rows[0]) if rows else []
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def load_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def freshness(latest_iso: str, checked: datetime) -> tuple[str, str]:
    if not latest_iso:
        return "unknown", ""
    latest = datetime.fromisoformat(latest_iso.replace("Z", "+00:00"))
    hours = max(0.0, (checked - latest).total_seconds() / 3600)
    if hours <= 72:
        status = "current_72h"
    elif hours <= 24 * 14:
        status = "recent_14d"
    else:
        status = "stale_over_14d"
    return status, f"{hours:.2f}"


class Limiter:
    def __init__(self, delay: float):
        self.delay = delay
        self.last: dict[str, float] = {}

    def wait(self, key: str) -> None:
        elapsed = time.monotonic() - self.last.get(key, 0.0)
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        self.last[key] = time.monotonic()


def fetch(session: requests.Session, url: str, timeout: float, accept: str) -> requests.Response:
    return session.get(
        url,
        headers={"Accept": accept},
        timeout=(8, timeout),
        allow_redirects=True,
        stream=False,
    )


def feed_entry_content(entry) -> str:
    values = []
    for item in entry.get("content", []) or []:
        if isinstance(item, dict):
            text = clean_html(item.get("value"))
            if text:
                values.append(text)
    return max(values, key=len, default="")


def feed_test(session, spec: dict, raw_dir: Path, index: int, timeout: float,
              limiter: Limiter) -> tuple[dict, list[dict]]:
    checked = datetime.now(UTC)
    base = {key: spec.get(key, "") for key in FIELDS}
    result = {
        **base,
        "checked_at_utc": checked.isoformat(),
        "test_status": "failed", "access_status": "not_attempted",
        "parse_status": "not_attempted", "failure_reason": "",
        "http_status": "", "resolved_feed_url": "", "content_type": "",
        "response_bytes": 0, "raw_file": "", "feed_version": "",
        "parser_warning": "", "entries": 0,
        "title_count": 0, "url_count": 0, "published_count": 0,
        "updated_only_count": 0, "date_count": 0,
        "summary_count": 0, "rss_content_count": 0,
        "latest_article_date_utc": "", "latest_date_kind": "",
        "freshness_status": "unknown", "latest_age_hours": "",
        "sample_article_url": "", "sample_article_title": "",
    }
    entries_out: list[dict] = []
    try:
        limiter.wait(spec["source_name"])
        response = fetch(
            session, spec["feed_url"], timeout,
            "application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.2",
        )
        result.update(
            http_status=response.status_code,
            resolved_feed_url=response.url,
            content_type=response.headers.get("Content-Type", ""),
            response_bytes=len(response.content),
        )
        if len(response.content) > MAX_BYTES:
            result.update(access_status="failed", failure_reason="response exceeds 10 MB")
            return result, entries_out
        if not 200 <= response.status_code < 300:
            result.update(access_status="failed", failure_reason=f"HTTP {response.status_code}")
            return result, entries_out
        result["access_status"] = "ok"
        raw_path = raw_dir / f"{index:02d}_{spec['candidate_id']}.bin"
        raw_path.write_bytes(response.content)
        result["raw_file"] = str(raw_path.relative_to(raw_dir.parent))
        parsed = feedparser.parse(response.content)
        result["feed_version"] = parsed.get("version", "")
        if parsed.get("bozo"):
            result["parser_warning"] = str(parsed.get("bozo_exception", ""))[:400]
        items = list(parsed.get("entries", []))
        result["entries"] = len(items)
        if not items or not result["feed_version"]:
            result.update(
                parse_status="failed",
                failure_reason="no parseable RSS/Atom entries" if not items else "feed format unidentified",
            )
            return result, entries_out
        result["parse_status"] = "warning" if result["parser_warning"] else "ok"
        latest: tuple[datetime, str] | None = None
        for entry in items:
            title = clean_html(entry.get("title", ""))
            url = canonical_url(entry.get("link", ""))
            published = iso_from_struct(entry.get("published_parsed"))
            updated = iso_from_struct(entry.get("updated_parsed"))
            date_value = published or updated
            date_kind = "published" if published else ("updated_fallback" if updated else "unknown")
            summary = clean_html(entry.get("summary") or entry.get("description") or "")
            content = feed_entry_content(entry)
            row = {
                "candidate_id": spec["candidate_id"], "source_name": spec["source_name"],
                "feed_name": spec["feed_name"], "title": title, "url": url,
                "published_at_utc": published, "updated_at_utc": updated,
                "date_used_utc": date_value, "date_kind": date_kind,
                "summary_length": len(summary), "rss_content_length": len(content),
            }
            entries_out.append(row)
            result["title_count"] += bool(title)
            result["url_count"] += bool(url)
            result["published_count"] += bool(published)
            result["updated_only_count"] += bool(updated and not published)
            result["date_count"] += bool(date_value)
            result["summary_count"] += bool(summary)
            result["rss_content_count"] += bool(content)
            if date_value:
                dt = datetime.fromisoformat(date_value)
                if latest is None or dt > latest[0]:
                    latest = (dt, date_kind)
        if latest:
            result["latest_article_date_utc"] = latest[0].isoformat()
            result["latest_date_kind"] = latest[1]
        result["freshness_status"], result["latest_age_hours"] = freshness(
            result["latest_article_date_utc"], checked
        )
        valid_samples = [
            row for row in entries_out
            if row["url"] and "/video/" not in urlsplit(row["url"]).path.lower()
        ]
        if not valid_samples:
            valid_samples = [row for row in entries_out if row["url"]]
        valid_samples.sort(key=lambda row: row["date_used_utc"], reverse=True)
        if valid_samples:
            result["sample_article_url"] = valid_samples[0]["url"]
            result["sample_article_title"] = valid_samples[0]["title"]
        missing_core = any(result[key] == 0 for key in ("title_count", "url_count", "date_count"))
        if result["freshness_status"] in {"current_72h", "recent_14d"} and not missing_core:
            result["test_status"] = "usable_with_parser_warning" if result["parser_warning"] else "usable"
        elif result["freshness_status"] == "stale_over_14d":
            result.update(test_status="stale", failure_reason="latest dated entry is older than 14 days")
        else:
            result.update(test_status="usable_with_warnings", failure_reason="core fields or freshness could not be fully verified")
        return result, entries_out
    except requests.RequestException as exc:
        result.update(access_status="failed", failure_reason=f"{type(exc).__name__}: {str(exc)[:300]}")
        return result, entries_out
    except Exception as exc:  # keep one malformed candidate from stopping the batch
        result.update(parse_status="failed", failure_reason=f"{type(exc).__name__}: {str(exc)[:300]}")
        return result, entries_out


def body_sample(session, feed_result: dict, timeout: float, limiter: Limiter) -> dict:
    checked = datetime.now(UTC)
    row = {
        "source_name": feed_result["source_name"],
        "candidate_id": feed_result["candidate_id"],
        "sample_title": feed_result["sample_article_title"],
        "sample_url": feed_result["sample_article_url"],
        "checked_at_utc": checked.isoformat(), "body_test_status": "not_tested",
        "reason": "no eligible sample", "http_status": "", "resolved_url": "",
        "content_type": "", "response_bytes": 0, "html_sha256": "",
        "extraction_method": "", "body_length": 0, "paragraph_count": 0,
        "access_markers": "", "full_text_verified": False,
        "review_scope": "one public HTTP response and extracted DOM/JSON-LD candidate only",
    }
    if not row["sample_url"]:
        return row
    try:
        limiter.wait(feed_result["source_name"])
        response = fetch(session, row["sample_url"], timeout, "text/html,application/xhtml+xml")
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
            page = response.text
            lower = re.sub(r"\s+", " ", BeautifulSoup(page, "html.parser").get_text(" ", strip=True)).lower()
            markers = sorted({marker for marker in BLOCK_MARKERS if marker in lower})
            body, method, paragraphs = extract(page, feed_result["source_name"])
            row.update(
                extraction_method=method, body_length=len(body), paragraph_count=paragraphs,
                access_markers=" | ".join(markers),
            )
            if markers:
                row.update(body_test_status="subscription_or_access_limited", reason="access marker present; extracted text may be partial")
            elif len(body) >= 500 and paragraphs >= 3:
                row.update(body_test_status="public_body_candidate", reason="substantial public body candidate extracted; completeness not verified")
            elif body:
                row.update(body_test_status="partial_candidate", reason="short or structurally limited text candidate")
            else:
                row.update(body_test_status="failed", reason="article body container not found")
    except requests.RequestException as exc:
        row.update(body_test_status="failed", reason=f"{type(exc).__name__}: {str(exc)[:300]}")
    except Exception as exc:
        row.update(body_test_status="failed", reason=f"{type(exc).__name__}: {str(exc)[:300]}")
    return row


def media_summary(feed_rows: list[dict], body_rows: list[dict]) -> list[dict]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in feed_rows:
        grouped[row["source_name"]].append(row)
    body_by_source = {row["source_name"]: row for row in body_rows}
    result = []
    for source, rows in grouped.items():
        current = [row for row in rows if row["test_status"].startswith("usable")]
        failed = [row for row in rows if row["test_status"] == "failed"]
        stale = [row for row in rows if row["test_status"] == "stale"]
        if current and not failed and not stale:
            status = "usable"
        elif current:
            status = "partially_usable"
        elif stale:
            status = "stale_only"
        else:
            status = "failed"
        support = sorted({row["official_support_status"] for row in rows})
        body = body_by_source.get(source, {})
        result.append({
            "source_name": source, "operational_status": status,
            "official_support_status": " | ".join(support),
            "tested_feeds": len(rows), "usable_feeds": len(current),
            "stale_feeds": len(stale), "failed_feeds": len(failed),
            "latest_article_date_utc": max((row["latest_article_date_utc"] for row in rows), default=""),
            "rss_summary_available": any(row["summary_count"] for row in rows),
            "rss_content_available": any(row["rss_content_count"] for row in rows),
            "body_test_status": body.get("body_test_status", "not_tested"),
            "body_test_reason": body.get("reason", ""),
            "body_quality_status": "unverified",
        })
    return sorted(result, key=lambda row: row["source_name"].lower())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidates", type=Path, default=ROOT / "config/new_feed_candidates_20261029.csv")
    parser.add_argument("--registry", type=Path, default=ROOT / "config/feed_registry.csv")
    parser.add_argument("--output", type=Path, default=ROOT / "outputs/feed_candidate_research_20261029")
    parser.add_argument("--timeout", type=float, default=25.0)
    parser.add_argument("--delay", type=float, default=1.0)
    args = parser.parse_args()

    started = datetime.now(UTC)
    run = args.output / started.strftime("%Y%m%dT%H%M%S_%fZ")
    raw_dir = run / "raw_feeds"
    raw_dir.mkdir(parents=True, exist_ok=False)
    specs = load_csv(args.candidates)
    registry = load_csv(args.registry)
    required_missing = sorted(set(FIELDS) - set(specs[0])) if specs else list(FIELDS)
    if required_missing:
        parser.error(f"candidate columns missing: {required_missing}")
    registry_sources = {row["source_name"].strip().casefold() for row in registry}
    registry_urls = {canonical_url(row.get("feed_url", "")) for row in registry if row.get("feed_url")}
    checks = []
    for spec in specs:
        checks.append({
            "candidate_id": spec["candidate_id"], "source_name": spec["source_name"],
            "feed_url": spec["feed_url"],
            "duplicate_source_name": spec["source_name"].strip().casefold() in registry_sources,
            "duplicate_feed_url": canonical_url(spec["feed_url"]) in registry_urls,
        })
    duplicates = [row for row in checks if row["duplicate_source_name"] or row["duplicate_feed_url"]]
    if duplicates:
        parser.error(f"candidate duplicates current registry: {duplicates}")

    (run / "candidates_snapshot.csv").write_bytes(args.candidates.read_bytes())
    csv_dump(run / "registry_duplicate_check.csv", checks)
    conditions = {
        "state": "running", "started_at_utc": started.isoformat(),
        "candidate_file": str(args.candidates.resolve()),
        "candidate_sha256": hashlib.sha256(args.candidates.read_bytes()).hexdigest(),
        "registry_file": str(args.registry.resolve()),
        "registry_sha256": hashlib.sha256(args.registry.read_bytes()).hexdigest(),
        "candidate_feeds": len(specs),
        "candidate_media": len({row["source_name"] for row in specs}),
        "policy": "isolated small test; one feed request per row and at most one public article response per publisher; no auth/challenge/paywall bypass",
        "article_storage": "no article HTML or extracted body saved; diagnostics and hashes only",
        "freshness_thresholds": {"current_hours": 72, "recent_days": 14, "stale_over_days": 14},
        "timeout_seconds": args.timeout, "per_publisher_delay_seconds": args.delay,
    }
    json_dump(run / "run_conditions.json", conditions)

    session = requests.Session()
    session.headers.update({
        "User-Agent": "rss-news-research/1.0 (+small public feed validation)",
        "Accept-Language": "en-US,en;q=0.8",
    })
    limiter = Limiter(args.delay)
    feed_rows: list[dict] = []
    entry_rows: list[dict] = []
    for index, spec in enumerate(specs, 1):
        row, entries = feed_test(session, spec, raw_dir, index, args.timeout, limiter)
        feed_rows.append(row)
        entry_rows.extend(entries)
        print(f"feed {index:02d}/{len(specs)} {spec['source_name']}: {row['test_status']} ({row['entries']})")
        csv_dump(run / "feed_test_results.csv", feed_rows)
        json_dump(run / "feed_test_results.json", feed_rows)

    body_rows = []
    by_source: dict[str, list[dict]] = defaultdict(list)
    for row in feed_rows:
        by_source[row["source_name"]].append(row)
    for source, rows in by_source.items():
        enabled = [row for row in rows if parse_bool(row["body_sample_enabled"])]
        eligible = [row for row in rows if row["test_status"].startswith("usable") and row["sample_article_url"]]
        eligible.sort(key=lambda row: row["latest_article_date_utc"], reverse=True)
        sample = eligible[0] if eligible else (enabled[0] if enabled else rows[0])
        body = body_sample(session, sample, args.timeout, limiter) if enabled else {
            "source_name": source, "candidate_id": sample["candidate_id"],
            "sample_title": "", "sample_url": "", "checked_at_utc": datetime.now(UTC).isoformat(),
            "body_test_status": "not_tested", "reason": "body_sample_enabled is false",
            "http_status": "", "resolved_url": "", "content_type": "", "response_bytes": 0,
            "html_sha256": "", "extraction_method": "", "body_length": 0,
            "paragraph_count": 0, "access_markers": "", "full_text_verified": False,
            "review_scope": "not tested",
        }
        body_rows.append(body)
        print(f"body {source}: {body['body_test_status']} ({body['body_length']})")

    media_rows = media_summary(feed_rows, body_rows)
    csv_dump(run / "body_sample_results.csv", body_rows)
    json_dump(run / "body_sample_results.json", body_rows)
    csv_dump(run / "media_summary.csv", media_rows)
    json_dump(run / "media_summary.json", media_rows)
    csv_dump(run / "entry_field_sample.csv", entry_rows)
    usable_media = sum(row["operational_status"] in {"usable", "partially_usable"} for row in media_rows)
    usable_feeds = sum(row["test_status"].startswith("usable") for row in feed_rows)
    conditions.update(
        state="complete", completed_at_utc=datetime.now(UTC).isoformat(),
        researched_media=len(media_rows), usable_media=usable_media,
        tested_feeds=len(feed_rows), usable_feeds=usable_feeds,
        stale_feeds=sum(row["test_status"] == "stale" for row in feed_rows),
        failed_feeds=sum(row["test_status"] == "failed" for row in feed_rows),
        body_sample_requests=sum(bool(row["sample_url"]) for row in body_rows),
    )
    json_dump(run / "run_conditions.json", conditions)
    (args.output / "LATEST.txt").write_text(str(run.resolve()), encoding="utf-8")
    print(f"output: {run}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
