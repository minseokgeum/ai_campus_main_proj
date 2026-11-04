"""Continuously collect RSS, persist new articles, and process a small body queue.

Network access is disabled unless --collect is supplied. The collector uses only
public HTTP responses. It does not authenticate, solve challenges, or bypass
paywalls or subscription restrictions.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import re
import sys
import time
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urljoin

import feedparser
import requests

from collect_article_bodies import extract
from collect_rss import canonical, clean, date
from rss_store import (
    begin_run,
    connect,
    finish_run,
    queued_articles,
    record_body_attempt,
    record_feed_check,
    store_rss_article,
    summary as database_summary,
    sync_feeds,
)

UTC = timezone.utc
ROOT = Path(__file__).resolve().parents[1]
MAX_RESPONSE_BYTES = 10_000_000
RETRYABLE_HTTP = {408, 425, 429, 500, 502, 503, 504}
BLOCK_HTTP = {403, 407, 451}
SUBSCRIPTION_HTTP = {401, 402}
SUBSCRIPTION_MARKERS = (
    "subscribe to continue",
    "subscription required",
    "sign in to continue",
    "already a subscriber",
    "you have reached your limit",
    "premium content",
    "subscriber-only",
)
BLOCK_MARKERS = (
    "access denied",
    "verify you are human",
    "captcha",
    "pardon our interruption",
    "made us think you were a bot",
    "make sure that cookies and javascript are enabled",
)
REGISTRY_COLUMNS = {
    "feed_id",
    "source_name",
    "feed_name",
    "feed_url",
    "collection_tier",
    "enabled",
    "official_support_status",
    "official_guide_url",
    "rss_content_quality",
    "body_quality_status",
    "body_collection_enabled",
    "request_interval_seconds",
    "timeout_seconds",
    "max_retries",
}


def save_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def save_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8-sig")
        return
    columns = list(dict.fromkeys(key for row in rows for key in row))
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    key: json.dumps(row.get(key), ensure_ascii=False)
                    if isinstance(row.get(key), (list, dict))
                    else row.get(key, "")
                    for key in columns
                }
            )


def parse_bool(value: str) -> bool:
    normalized = str(value).strip().lower()
    if normalized in {"true", "1", "yes"}:
        return True
    if normalized in {"false", "0", "no"}:
        return False
    raise ValueError(f"Invalid boolean: {value!r}")


def load_registry(path: Path) -> tuple[list[dict], bytes]:
    raw = path.read_bytes()
    with path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not rows or not REGISTRY_COLUMNS.issubset(rows[0]):
        missing = sorted(REGISTRY_COLUMNS - set(rows[0] if rows else []))
        raise ValueError(f"Invalid feed registry; missing columns: {missing}")
    seen = set()
    for row in rows:
        if not row["feed_id"] or row["feed_id"] in seen:
            raise ValueError(f"Missing or duplicate feed_id: {row['feed_id']!r}")
        seen.add(row["feed_id"])
        row["enabled"] = parse_bool(row["enabled"])
        row["body_collection_enabled"] = parse_bool(row["body_collection_enabled"])
        row["request_interval_seconds"] = float(row["request_interval_seconds"])
        row["timeout_seconds"] = float(row["timeout_seconds"])
        row["max_retries"] = int(row["max_retries"])
        if row["collection_tier"] not in {"default", "test", "hold"}:
            raise ValueError(f"Invalid collection_tier for {row['feed_id']}")
        if row["enabled"] and not row["feed_url"]:
            raise ValueError(f"Enabled feed has no URL: {row['feed_id']}")
        if row["request_interval_seconds"] < 0 or row["timeout_seconds"] <= 0:
            raise ValueError(f"Invalid request timing for {row['feed_id']}")
        if not 0 <= row["max_retries"] <= 3:
            raise ValueError(f"max_retries must be between 0 and 3: {row['feed_id']}")
    return rows, raw


class RateLimiter:
    def __init__(self) -> None:
        self.last_request: dict[str, float] = {}

    def wait(self, source_name: str, interval_seconds: float) -> None:
        previous = self.last_request.get(source_name)
        if previous is not None:
            remaining = interval_seconds - (time.monotonic() - previous)
            if remaining > 0:
                time.sleep(remaining)
        self.last_request[source_name] = time.monotonic()


def retry_delay(response: requests.Response | None, retry_number: int) -> float:
    if response is not None:
        value = response.headers.get("Retry-After", "").strip()
        if value.isdigit():
            return min(float(value), 30.0)
    return min(2.0**retry_number, 8.0)


def fetch_public(
    session: requests.Session,
    url: str,
    spec: dict,
    limiter: RateLimiter,
    accept: str,
) -> dict:
    attempts = 0
    last_error = ""
    for retry_number in range(spec["max_retries"] + 1):
        attempts += 1
        limiter.wait(spec["source_name"], spec["request_interval_seconds"])
        response = None
        try:
            response = session.get(
                url,
                headers={"Accept": accept},
                timeout=(8, spec["timeout_seconds"]),
                allow_redirects=True,
                stream=True,
            )
            if response.status_code in RETRYABLE_HTTP and retry_number < spec["max_retries"]:
                delay = retry_delay(response, retry_number)
                response.close()
                time.sleep(delay)
                continue
            chunks = []
            total = 0
            for chunk in response.iter_content(65536):
                total += len(chunk)
                if total > MAX_RESPONSE_BYTES:
                    response.close()
                    return {
                        "response": response,
                        "content": b"".join(chunks),
                        "attempts": attempts,
                        "error": "response exceeds 10 MB; prefix retained in memory only",
                        "too_large": True,
                    }
                chunks.append(chunk)
            content = b"".join(chunks)
            response.close()
            return {
                "response": response,
                "content": content,
                "attempts": attempts,
                "error": "",
                "too_large": False,
            }
        except requests.RequestException as exc:
            last_error = f"{type(exc).__name__}: {str(exc)[:500]}"
            if response is not None:
                response.close()
            if retry_number < spec["max_retries"]:
                time.sleep(retry_delay(None, retry_number))
                continue
    return {
        "response": None,
        "content": b"",
        "attempts": attempts,
        "error": last_error or "request failed",
        "too_large": False,
    }


def parse_feed(content: bytes, resolved_url: str, start: datetime, end: datetime) -> tuple[list[dict], dict]:
    parsed = feedparser.parse(content)
    counts = {
        "entries": len(parsed.entries),
        "in_window": 0,
        "unknown_date": 0,
        "outside_window": 0,
        "invalid_url": 0,
        "feed_version": parsed.version,
        "parser_warning": str(parsed.get("bozo_exception", "")),
    }
    rows = []
    for entry in parsed.entries:
        published_raw = entry.get("published", "")
        published = date(published_raw)
        if published and not start <= published < end:
            counts["outside_window"] += 1
            continue
        if published:
            counts["in_window"] += 1
        else:
            counts["unknown_date"] += 1
        original_url = urljoin(resolved_url, entry.get("link", "")) if entry.get("link") else ""
        normalized_url = canonical(original_url)
        if not normalized_url:
            counts["invalid_url"] += 1
        rss_content = clean(" ".join(part.get("value", "") for part in entry.get("content", [])))
        rows.append(
            {
                "title": clean(entry.get("title", "")),
                "url": normalized_url,
                "original_url": original_url,
                "published_raw": published_raw,
                "published_utc": published.isoformat() if published else "",
                "date_status": "known" if published else "unknown",
                "window_status": "in_window" if published else "unknown_date",
                "summary": clean(entry.get("summary", "")),
                "feed_content": rss_content,
                "has_rss_body": bool(rss_content),
            }
        )
    return rows, counts


def collect_feed(
    session: requests.Session,
    spec: dict,
    limiter: RateLimiter,
    raw_dir: Path,
    raw_index: int,
    start: datetime,
    end: datetime,
) -> tuple[list[dict], dict]:
    checked = datetime.now(UTC).isoformat()
    report = {
        "feed_id": spec["feed_id"],
        "source_name": spec["source_name"],
        "feed_name": spec["feed_name"],
        "collection_tier": spec["collection_tier"],
        "official_support_status": spec["official_support_status"],
        "checked_at_utc": checked,
        "status": "request_error",
        "access_status": "not_attempted",
        "parse_status": "not_attempted",
        "entries": 0,
        "in_window": 0,
        "unknown_date": 0,
        "outside_window": 0,
        "attempts": 0,
        "error": "",
    }
    fetched = fetch_public(
        session,
        spec["feed_url"],
        spec,
        limiter,
        "application/rss+xml, application/atom+xml, application/xml, text/xml",
    )
    report["attempts"] = fetched["attempts"]
    response = fetched["response"]
    content = fetched["content"]
    if response is None:
        report["error"] = fetched["error"]
        return [], report
    report.update(
        http_status=response.status_code,
        resolved_url=response.url,
        content_type=response.headers.get("Content-Type", ""),
    )
    if content:
        raw_path = raw_dir / f"{raw_index:02d}_{spec['feed_id']}.bin"
        raw_path.write_bytes(content)
        report["raw_file"] = str(raw_path.parent.name + "/" + raw_path.name)
        report["response_bytes"] = len(content)
    if fetched["too_large"]:
        report.update(status="response_too_large", access_status="ok", error=fetched["error"])
        return [], report
    if not 200 <= response.status_code < 300:
        report.update(status="http_error", access_status="http_error", error=f"HTTP {response.status_code}")
        return [], report
    report["access_status"] = "ok"
    rows, counts = parse_feed(content, response.url, start, end)
    report.update(counts)
    if not counts["feed_version"]:
        report.update(status="parse_error", parse_status="not_rss_atom")
        return [], report
    report["parse_status"] = "warning" if counts["parser_warning"] else "ok"
    if report["in_window"]:
        report["status"] = "feed_warning" if counts["parser_warning"] else "ok"
    else:
        report["status"] = (
            "no_articles_in_window_warning" if counts["parser_warning"] else "no_articles_in_window"
        )
    return rows, report


def body_result(row, session: requests.Session, spec: dict, limiter: RateLimiter) -> dict:
    attempted = datetime.now(UTC).isoformat()
    base = {
        "article_id": row["article_id"],
        "source_name": row["source_name"],
        "url": row["normalized_url"],
        "title": row["title"],
        "attempted_at_utc": attempted,
        "status": "failed",
        "reason": "not attempted",
        "retryable": False,
        "http_status": None,
        "resolved_url": "",
        "extraction_method": "",
        "article_body": "",
        "quality_status": "request_failed",
        "response_sha256": "",
        "full_text_verified": False,
        "rss_summary_length": len(row["latest_rss_summary"]),
        "rss_content_length": len(row["latest_rss_content"]),
    }
    fetched = fetch_public(
        session,
        row["normalized_url"],
        spec,
        limiter,
        "text/html,application/xhtml+xml",
    )
    response = fetched["response"]
    content = fetched["content"]
    base["request_attempts"] = fetched["attempts"]
    if response is None:
        base.update(reason=fetched["error"], retryable=True)
        return base
    base.update(
        http_status=response.status_code,
        resolved_url=response.url,
        response_sha256=hashlib.sha256(content).hexdigest() if content else "",
    )
    if fetched["too_large"]:
        base.update(reason=fetched["error"], quality_status="response_too_large")
        return base
    if response.status_code in SUBSCRIPTION_HTTP:
        base.update(status="subscription", reason=f"HTTP {response.status_code}", quality_status="subscription_restricted")
        return base
    if response.status_code in BLOCK_HTTP:
        base.update(status="blocked", reason=f"HTTP {response.status_code}", quality_status="access_blocked")
        return base
    if response.status_code in RETRYABLE_HTTP:
        base.update(reason=f"HTTP {response.status_code} after limited retries", retryable=True)
        return base
    if not 200 <= response.status_code < 300:
        base.update(reason=f"HTTP {response.status_code}")
        return base
    content_type = response.headers.get("Content-Type", "")
    if "html" not in content_type.lower():
        base.update(reason=f"response is not HTML: {content_type}", quality_status="non_html_response")
        return base
    encoding = response.encoding or "utf-8"
    html = content.decode(encoding, errors="replace")
    lowered = re.sub(r"\s+", " ", html).lower()
    body, method, paragraph_count = extract(html, row["source_name"])
    base.update(
        article_body=body,
        extraction_method=method,
        paragraph_count=paragraph_count,
        article_body_length=len(body),
    )
    if len(body) >= 500 and (paragraph_count >= 3 or method == "JSON-LD articleBody"):
        base.update(
            status="success",
            reason="substantial public article candidate extracted; full text not verified",
            quality_status="candidate_unverified",
        )
    elif body:
        base.update(
            status="partial",
            reason="short or structurally limited public article candidate",
            quality_status="partial_candidate",
        )
    elif any(marker in lowered for marker in SUBSCRIPTION_MARKERS):
        base.update(
            status="subscription",
            reason="subscription or login restriction marker and no body candidate",
            quality_status="subscription_restricted",
        )
    elif any(marker in lowered for marker in BLOCK_MARKERS):
        base.update(
            status="blocked",
            reason="access restriction marker and no body candidate",
            quality_status="access_blocked",
        )
    else:
        base.update(reason="article body container not found", quality_status="extraction_failed")
    return base


def merged_run_articles(rows: list[dict]) -> list[dict]:
    merged = {}
    for row in rows:
        key = row["article_id"]
        if key not in merged:
            merged[key] = dict(row)
            continue
        old = merged[key]
        old["source_names"] = sorted(set(old["source_names"] + row["source_names"]))
        old["feed_refs"] = sorted(set(old["feed_refs"] + row["feed_refs"]))
    return list(merged.values())


@contextmanager
def collector_lock(database_path: Path):
    lock_path = database_path.with_suffix(database_path.suffix + ".lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    handle = lock_path.open("a+b")
    handle.seek(0, os.SEEK_END)
    if handle.tell() == 0:
        handle.write(b"0")
        handle.flush()
    handle.seek(0)
    try:
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as exc:
        handle.close()
        raise RuntimeError("Another continuous collector is already running") from exc
    try:
        yield
    finally:
        handle.seek(0)
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        handle.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collect", action="store_true", help="Explicitly enable public network requests")
    parser.add_argument(
        "--sync-registry-only",
        action="store_true",
        help="Validate the registry and sync it to SQLite without network requests",
    )
    parser.add_argument("--registry", type=Path, default=ROOT / "config/feed_registry.csv")
    parser.add_argument("--database", type=Path, default=ROOT / "data/rss_news.sqlite3")
    parser.add_argument("--output", type=Path, default=ROOT / "outputs/continuous")
    parser.add_argument("--tiers", default="default,test", help="Comma-separated: default,test; hold is never enabled")
    parser.add_argument("--sources", default="", help="Optional comma-separated exact source names")
    parser.add_argument("--hours", type=float, default=168)
    parser.add_argument("--end", help="ISO timestamp with timezone; default is current UTC")
    parser.add_argument("--feed-limit", type=int, default=0, help="0 means all selected feeds")
    parser.add_argument("--body-limit", type=int, default=10, help="Maximum queued bodies attempted in this run")
    parser.add_argument("--max-body-attempts", type=int, default=3)
    parser.add_argument("--retry-delay-hours", type=float, default=6)
    parser.add_argument("--body-only", action="store_true", help="Skip RSS and process the existing due queue")
    args = parser.parse_args()
    if not args.collect and not args.sync_registry_only:
        parser.error("Network disabled. Use --collect to start collection.")
    if not 0 < args.hours < math.inf:
        parser.error("--hours must be positive and finite")
    if args.feed_limit < 0 or args.body_limit < 0 or not 1 <= args.max_body_attempts <= 10:
        parser.error("Invalid feed/body limit or max body attempts")
    if args.retry_delay_hours <= 0 or not math.isfinite(args.retry_delay_hours):
        parser.error("--retry-delay-hours must be positive and finite")
    tiers = [value.strip() for value in args.tiers.split(",") if value.strip()]
    if not tiers or not set(tiers) <= {"default", "test"}:
        parser.error("--tiers may contain only default,test; hold feeds cannot be collected")
    requested_sources = {value.strip() for value in args.sources.split(",") if value.strip()}
    end = date(args.end) if args.end else datetime.now(UTC)
    if end is None:
        parser.error("--end must include a timezone")
    start = end - timedelta(hours=args.hours)
    registry, registry_bytes = load_registry(args.registry)
    if args.sync_registry_only:
        connection = connect(args.database)
        try:
            sync_feeds(connection, registry, datetime.now(UTC).isoformat())
        finally:
            connection.close()
        print(f"Synced {len(registry)} registry rows to {args.database.resolve()}")
        return 0
    selected = [
        spec
        for spec in registry
        if spec["enabled"]
        and spec["collection_tier"] in tiers
        and (not requested_sources or spec["source_name"] in requested_sources)
    ]
    if args.feed_limit:
        selected = selected[: args.feed_limit]
    if not selected and not args.body_only:
        parser.error("No enabled feeds match the requested tiers and sources")

    started = datetime.now(UTC)
    run_id = started.strftime("%Y%m%dT%H%M%S_%fZ")
    run_dir = args.output / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    raw_dir = run_dir / "raw_feeds"
    raw_dir.mkdir()
    (run_dir / "feed_registry_snapshot.csv").write_bytes(registry_bytes)
    conditions = {
        "state": "running",
        "run_id": run_id,
        "started_at_utc": started.isoformat(),
        "start_utc": start.isoformat(),
        "end_utc": end.isoformat(),
        "window": "start <= published < end; unknown publication dates retained",
        "registry": str(args.registry.resolve()),
        "registry_sha256": hashlib.sha256(registry_bytes).hexdigest(),
        "database": str(args.database.resolve()),
        "tiers": tiers,
        "sources": sorted(requested_sources),
        "selected_feed_count": len(selected),
        "body_limit": args.body_limit,
        "policy": "public HTTP only; no login, challenge solving, or paywall bypass",
        "text_policy": "RSS summary/content and extracted article body are preserved separately",
        "python": sys.executable,
        "python_version": sys.version,
        "requests_version": requests.__version__,
        "feedparser_version": feedparser.__version__,
    }
    save_json(run_dir / "run_conditions.json", conditions)

    with collector_lock(args.database):
        connection = connect(args.database)
        begin_run(
            connection,
            run_id,
            started.isoformat(),
            conditions["registry_sha256"],
            tiers,
            str(run_dir.resolve()),
        )
        sync_feeds(connection, registry, started.isoformat())
        session = requests.Session()
        session.headers.update(
            {
                "User-Agent": "RSSNewsCollector/1.0 (public feeds and public article pages; no authentication)",
                "Accept-Language": "en-US,en;q=0.8",
            }
        )
        limiter = RateLimiter()
        feed_reports: list[dict] = []
        seen_rows: list[dict] = []
        new_rows_by_id: dict[str, dict] = {}
        body_results: list[dict] = []
        fatal_error = ""
        try:
            if not args.body_only:
                for index, spec in enumerate(selected, 1):
                    rows, report = collect_feed(
                        session, spec, limiter, raw_dir, index, start, end
                    )
                    feed_reports.append(report)
                    record_feed_check(connection, run_id, report)
                    for row in rows:
                        observed = datetime.now(UTC).isoformat()
                        identifier, is_new = store_rss_article(
                            connection, run_id, spec, row, observed
                        )
                        output_row = {
                            "article_id": identifier,
                            "source_names": [spec["source_name"]],
                            "feed_refs": [f"{spec['source_name']}/{spec['feed_name']}"],
                            **row,
                            "rss_quality_status": spec["rss_content_quality"],
                            "body_quality_status": spec["body_quality_status"],
                        }
                        seen_rows.append(output_row)
                        if is_new:
                            new_rows_by_id[identifier] = output_row
                        elif identifier in new_rows_by_id:
                            current = new_rows_by_id[identifier]
                            current["source_names"] = sorted(
                                set(current["source_names"] + output_row["source_names"])
                            )
                            current["feed_refs"] = sorted(
                                set(current["feed_refs"] + output_row["feed_refs"])
                            )
                    print(spec["source_name"], spec["feed_name"], report["status"], len(rows))
                save_json(run_dir / "feed_status.json", feed_reports)
                save_csv(run_dir / "feed_status.csv", feed_reports)
                merged_seen = merged_run_articles(seen_rows)
                save_json(run_dir / "articles_seen.json", merged_seen)
                save_csv(run_dir / "articles_seen.csv", merged_seen)
                new_rows = list(new_rows_by_id.values())
                save_json(run_dir / "new_articles.json", new_rows)
                save_csv(run_dir / "new_articles.csv", new_rows)

            if args.body_limit:
                allowed_feed_ids = [spec["feed_id"] for spec in selected] if selected else None
                due = queued_articles(
                    connection,
                    datetime.now(UTC).isoformat(),
                    args.body_limit,
                    args.max_body_attempts,
                    allowed_feed_ids=allowed_feed_ids,
                )
                for queued in due:
                    spec = json.loads(queued["config_json"])
                    try:
                        result = body_result(queued, session, spec, limiter)
                    except Exception as exc:
                        result = {
                            "article_id": queued["article_id"],
                            "source_name": queued["source_name"],
                            "url": queued["normalized_url"],
                            "title": queued["title"],
                            "attempted_at_utc": datetime.now(UTC).isoformat(),
                            "status": "failed",
                            "reason": f"unexpected extraction error: {type(exc).__name__}: {str(exc)[:500]}",
                            "retryable": False,
                            "http_status": None,
                            "resolved_url": "",
                            "extraction_method": "",
                            "article_body": "",
                            "quality_status": "extraction_failed",
                            "response_sha256": "",
                            "full_text_verified": False,
                            "rss_summary_length": len(queued["latest_rss_summary"]),
                            "rss_content_length": len(queued["latest_rss_content"]),
                        }
                    record_body_attempt(
                        connection,
                        run_id,
                        result,
                        args.max_body_attempts,
                        args.retry_delay_hours,
                    )
                    body_results.append(result)
                    print("body", queued["source_name"], result["status"], queued["normalized_url"])
                save_json(run_dir / "body_results.json", body_results)
                save_csv(run_dir / "body_results.csv", body_results)

            db_state = database_summary(connection)
            save_json(run_dir / "database_summary.json", db_state)
            unique_seen = len({row["article_id"] for row in seen_rows})
            body_errors = sum(
                result["status"] in {"failed", "blocked", "subscription"}
                for result in body_results
            )
            finish_run(
                connection,
                run_id,
                state="completed",
                rss_articles_seen=unique_seen,
                new_articles=len(new_rows_by_id),
                body_attempts=len(body_results),
                body_errors=body_errors,
            )
            conditions.update(
                state="completed",
                finished_at_utc=datetime.now(UTC).isoformat(),
                feed_status_counts=dict(Counter(row["status"] for row in feed_reports)),
                rss_unique_articles_seen=unique_seen,
                new_articles=len(new_rows_by_id),
                body_status_counts=dict(Counter(row["status"] for row in body_results)),
                database_summary=db_state,
            )
        except Exception as exc:
            fatal_error = f"{type(exc).__name__}: {exc}"
            finish_run(
                connection,
                run_id,
                state="failed",
                rss_articles_seen=len({row["article_id"] for row in seen_rows}),
                new_articles=len(new_rows_by_id),
                body_attempts=len(body_results),
                body_errors=sum(result["status"] != "success" for result in body_results),
                error=fatal_error,
            )
            conditions.update(
                state="failed",
                finished_at_utc=datetime.now(UTC).isoformat(),
                error=fatal_error,
            )
        finally:
            save_json(run_dir / "run_conditions.json", conditions)
            connection.close()
    if fatal_error:
        print(fatal_error, file=sys.stderr)
        return 1
    print("Saved:", run_dir.resolve())
    print("Database:", args.database.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
