"""SQLite persistence for cumulative RSS and public article-body collection."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

UTC = timezone.utc
SCHEMA_VERSION = 1


def json_text(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def article_id(normalized_url: str, fallback_key: str = "") -> str:
    key = normalized_url or f"missing-url:{fallback_key}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute("PRAGMA busy_timeout = 30000")
    initialize(connection)
    return connection


def initialize(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS schema_info (
            version INTEGER NOT NULL,
            applied_at_utc TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS runs (
            run_id TEXT PRIMARY KEY,
            started_at_utc TEXT NOT NULL,
            finished_at_utc TEXT,
            state TEXT NOT NULL,
            registry_sha256 TEXT NOT NULL,
            tiers TEXT NOT NULL,
            output_dir TEXT NOT NULL,
            rss_articles_seen INTEGER NOT NULL DEFAULT 0,
            new_articles INTEGER NOT NULL DEFAULT 0,
            body_attempts INTEGER NOT NULL DEFAULT 0,
            body_errors INTEGER NOT NULL DEFAULT 0,
            error TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS feeds (
            feed_id TEXT PRIMARY KEY,
            source_name TEXT NOT NULL,
            feed_name TEXT NOT NULL,
            feed_url TEXT NOT NULL DEFAULT '',
            collection_tier TEXT NOT NULL,
            enabled INTEGER NOT NULL,
            official_support_status TEXT NOT NULL,
            official_guide_url TEXT NOT NULL DEFAULT '',
            rss_content_quality TEXT NOT NULL,
            body_quality_status TEXT NOT NULL,
            body_collection_enabled INTEGER NOT NULL,
            config_json TEXT NOT NULL,
            updated_at_utc TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS feed_checks (
            run_id TEXT NOT NULL REFERENCES runs(run_id),
            feed_id TEXT NOT NULL REFERENCES feeds(feed_id),
            checked_at_utc TEXT NOT NULL,
            status TEXT NOT NULL,
            access_status TEXT NOT NULL,
            parse_status TEXT NOT NULL,
            http_status INTEGER,
            resolved_url TEXT NOT NULL DEFAULT '',
            entries INTEGER NOT NULL DEFAULT 0,
            in_window INTEGER NOT NULL DEFAULT 0,
            unknown_date INTEGER NOT NULL DEFAULT 0,
            outside_window INTEGER NOT NULL DEFAULT 0,
            attempts INTEGER NOT NULL DEFAULT 0,
            error TEXT NOT NULL DEFAULT '',
            raw_file TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (run_id, feed_id)
        );

        CREATE TABLE IF NOT EXISTS articles (
            article_id TEXT PRIMARY KEY,
            normalized_url TEXT NOT NULL DEFAULT '',
            original_url TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL DEFAULT '',
            published_utc TEXT NOT NULL DEFAULT '',
            published_raw TEXT NOT NULL DEFAULT '',
            date_status TEXT NOT NULL,
            first_seen_utc TEXT NOT NULL,
            last_seen_utc TEXT NOT NULL,
            media_names_json TEXT NOT NULL,
            feed_refs_json TEXT NOT NULL,
            latest_rss_summary TEXT NOT NULL DEFAULT '',
            latest_rss_content TEXT NOT NULL DEFAULT '',
            has_rss_body INTEGER NOT NULL DEFAULT 0,
            rss_quality_status TEXT NOT NULL,
            article_body TEXT NOT NULL DEFAULT '',
            body_status TEXT NOT NULL DEFAULT 'not_queued',
            body_quality_status TEXT NOT NULL DEFAULT 'not_collected',
            body_extraction_method TEXT NOT NULL DEFAULT '',
            body_reason TEXT NOT NULL DEFAULT '',
            body_first_collected_utc TEXT,
            body_last_attempt_utc TEXT,
            body_last_success_utc TEXT,
            body_attempt_count INTEGER NOT NULL DEFAULT 0,
            body_http_status INTEGER,
            full_text_verified INTEGER NOT NULL DEFAULT 0,
            text_selection_policy TEXT NOT NULL DEFAULT 'preserve_rss_and_article_body_separately'
        );

        CREATE UNIQUE INDEX IF NOT EXISTS articles_normalized_url_unique
        ON articles(normalized_url) WHERE normalized_url <> '';

        CREATE TABLE IF NOT EXISTS article_sources (
            article_id TEXT NOT NULL REFERENCES articles(article_id),
            feed_id TEXT NOT NULL REFERENCES feeds(feed_id),
            source_name TEXT NOT NULL,
            feed_name TEXT NOT NULL,
            first_seen_utc TEXT NOT NULL,
            last_seen_utc TEXT NOT NULL,
            PRIMARY KEY (article_id, feed_id)
        );

        CREATE TABLE IF NOT EXISTS rss_observations (
            observation_id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id TEXT NOT NULL REFERENCES runs(run_id),
            article_id TEXT NOT NULL REFERENCES articles(article_id),
            feed_id TEXT NOT NULL REFERENCES feeds(feed_id),
            observed_at_utc TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            original_url TEXT NOT NULL DEFAULT '',
            published_raw TEXT NOT NULL DEFAULT '',
            published_utc TEXT NOT NULL DEFAULT '',
            date_status TEXT NOT NULL,
            rss_summary TEXT NOT NULL DEFAULT '',
            rss_content TEXT NOT NULL DEFAULT '',
            rss_quality_status TEXT NOT NULL,
            UNIQUE (run_id, article_id, feed_id)
        );

        CREATE TABLE IF NOT EXISTS body_queue (
            article_id TEXT PRIMARY KEY REFERENCES articles(article_id),
            status TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            next_attempt_at_utc TEXT,
            last_reason TEXT NOT NULL DEFAULT '',
            created_at_utc TEXT NOT NULL,
            updated_at_utc TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS body_attempts (
            attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id TEXT NOT NULL REFERENCES runs(run_id),
            article_id TEXT NOT NULL REFERENCES articles(article_id),
            attempted_at_utc TEXT NOT NULL,
            status TEXT NOT NULL,
            reason TEXT NOT NULL,
            retryable INTEGER NOT NULL,
            http_status INTEGER,
            resolved_url TEXT NOT NULL DEFAULT '',
            extraction_method TEXT NOT NULL DEFAULT '',
            article_body TEXT NOT NULL DEFAULT '',
            body_length INTEGER NOT NULL DEFAULT 0,
            quality_status TEXT NOT NULL,
            response_sha256 TEXT NOT NULL DEFAULT '',
            full_text_verified INTEGER NOT NULL DEFAULT 0
        );
        """
    )
    current = connection.execute("SELECT MAX(version) FROM schema_info").fetchone()[0]
    if current is None:
        connection.execute(
            "INSERT INTO schema_info(version, applied_at_utc) VALUES (?, ?)",
            (SCHEMA_VERSION, datetime.now(UTC).isoformat()),
        )
    elif current != SCHEMA_VERSION:
        raise RuntimeError(f"Unsupported database schema version: {current}")
    connection.commit()


def begin_run(
    connection: sqlite3.Connection,
    run_id: str,
    started_at_utc: str,
    registry_sha256: str,
    tiers: Iterable[str],
    output_dir: str,
) -> None:
    connection.execute(
        """INSERT INTO runs(
               run_id, started_at_utc, state, registry_sha256, tiers, output_dir
           ) VALUES (?, ?, 'running', ?, ?, ?)""",
        (run_id, started_at_utc, registry_sha256, ",".join(tiers), output_dir),
    )
    connection.commit()


def finish_run(
    connection: sqlite3.Connection,
    run_id: str,
    *,
    state: str,
    rss_articles_seen: int,
    new_articles: int,
    body_attempts: int,
    body_errors: int,
    error: str = "",
) -> None:
    connection.execute(
        """UPDATE runs SET finished_at_utc=?, state=?, rss_articles_seen=?,
               new_articles=?, body_attempts=?, body_errors=?, error=?
           WHERE run_id=?""",
        (
            datetime.now(UTC).isoformat(),
            state,
            rss_articles_seen,
            new_articles,
            body_attempts,
            body_errors,
            error,
            run_id,
        ),
    )
    connection.commit()


def sync_feeds(connection: sqlite3.Connection, specs: Iterable[dict], now_utc: str) -> None:
    for spec in specs:
        connection.execute(
            """INSERT INTO feeds(
                   feed_id, source_name, feed_name, feed_url, collection_tier,
                   enabled, official_support_status, official_guide_url,
                   rss_content_quality, body_quality_status,
                   body_collection_enabled, config_json, updated_at_utc
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(feed_id) DO UPDATE SET
                   source_name=excluded.source_name,
                   feed_name=excluded.feed_name,
                   feed_url=excluded.feed_url,
                   collection_tier=excluded.collection_tier,
                   enabled=excluded.enabled,
                   official_support_status=excluded.official_support_status,
                   official_guide_url=excluded.official_guide_url,
                   rss_content_quality=excluded.rss_content_quality,
                   body_quality_status=excluded.body_quality_status,
                   body_collection_enabled=excluded.body_collection_enabled,
                   config_json=excluded.config_json,
                   updated_at_utc=excluded.updated_at_utc""",
            (
                spec["feed_id"],
                spec["source_name"],
                spec["feed_name"],
                spec["feed_url"],
                spec["collection_tier"],
                int(spec["enabled"]),
                spec["official_support_status"],
                spec["official_guide_url"],
                spec["rss_content_quality"],
                spec["body_quality_status"],
                int(spec["body_collection_enabled"]),
                json_text(spec),
                now_utc,
            ),
        )
    connection.commit()


def record_feed_check(connection: sqlite3.Connection, run_id: str, report: dict) -> None:
    connection.execute(
        """INSERT OR REPLACE INTO feed_checks(
               run_id, feed_id, checked_at_utc, status, access_status, parse_status,
               http_status, resolved_url, entries, in_window, unknown_date,
               outside_window, attempts, error, raw_file
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            run_id,
            report["feed_id"],
            report["checked_at_utc"],
            report["status"],
            report["access_status"],
            report["parse_status"],
            report.get("http_status"),
            report.get("resolved_url", ""),
            report.get("entries", 0),
            report.get("in_window", 0),
            report.get("unknown_date", 0),
            report.get("outside_window", 0),
            report.get("attempts", 0),
            report.get("error", ""),
            report.get("raw_file", ""),
        ),
    )
    connection.commit()


def _merge_json_list(existing: str, values: Iterable[str]) -> str:
    current = json.loads(existing) if existing else []
    return json_text(sorted(set(current).union(v for v in values if v)))


def store_rss_article(
    connection: sqlite3.Connection,
    run_id: str,
    spec: dict,
    row: dict,
    observed_at_utc: str,
) -> tuple[str, bool]:
    normalized_url = row.get("url", "")
    fallback = "|".join(
        [spec["feed_id"], row.get("title", ""), row.get("published_raw", "")]
    )
    identifier = article_id(normalized_url, fallback)
    existing = connection.execute(
        "SELECT media_names_json, feed_refs_json FROM articles WHERE article_id=?",
        (identifier,),
    ).fetchone()
    is_new = existing is None
    media_json = _merge_json_list(
        existing["media_names_json"] if existing else "[]", [spec["source_name"]]
    )
    feed_ref = f"{spec['source_name']}/{spec['feed_name']}"
    refs_json = _merge_json_list(
        existing["feed_refs_json"] if existing else "[]", [feed_ref]
    )
    connection.execute(
        """INSERT INTO articles(
               article_id, normalized_url, original_url, title, published_utc,
               published_raw, date_status, first_seen_utc, last_seen_utc,
               media_names_json, feed_refs_json, latest_rss_summary,
               latest_rss_content, has_rss_body, rss_quality_status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(article_id) DO UPDATE SET
               original_url=CASE WHEN excluded.original_url<>'' THEN excluded.original_url ELSE articles.original_url END,
               title=CASE WHEN excluded.title<>'' THEN excluded.title ELSE articles.title END,
               published_utc=CASE WHEN excluded.published_utc<>'' THEN excluded.published_utc ELSE articles.published_utc END,
               published_raw=CASE WHEN excluded.published_raw<>'' THEN excluded.published_raw ELSE articles.published_raw END,
               date_status=excluded.date_status,
               last_seen_utc=excluded.last_seen_utc,
               media_names_json=excluded.media_names_json,
               feed_refs_json=excluded.feed_refs_json,
               latest_rss_summary=excluded.latest_rss_summary,
               latest_rss_content=excluded.latest_rss_content,
               has_rss_body=excluded.has_rss_body,
               rss_quality_status=excluded.rss_quality_status""",
        (
            identifier,
            normalized_url,
            row.get("original_url", ""),
            row.get("title", ""),
            row.get("published_utc", ""),
            row.get("published_raw", ""),
            row.get("date_status", "unknown"),
            observed_at_utc,
            observed_at_utc,
            media_json,
            refs_json,
            row.get("summary", ""),
            row.get("feed_content", ""),
            int(bool(row.get("feed_content"))),
            spec["rss_content_quality"],
        ),
    )
    connection.execute(
        """INSERT INTO article_sources(
               article_id, feed_id, source_name, feed_name,
               first_seen_utc, last_seen_utc
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(article_id, feed_id) DO UPDATE SET
               last_seen_utc=excluded.last_seen_utc""",
        (
            identifier,
            spec["feed_id"],
            spec["source_name"],
            spec["feed_name"],
            observed_at_utc,
            observed_at_utc,
        ),
    )
    connection.execute(
        """INSERT OR IGNORE INTO rss_observations(
               run_id, article_id, feed_id, observed_at_utc, title, original_url,
               published_raw, published_utc, date_status, rss_summary,
               rss_content, rss_quality_status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            run_id,
            identifier,
            spec["feed_id"],
            observed_at_utc,
            row.get("title", ""),
            row.get("original_url", ""),
            row.get("published_raw", ""),
            row.get("published_utc", ""),
            row.get("date_status", "unknown"),
            row.get("summary", ""),
            row.get("feed_content", ""),
            spec["rss_content_quality"],
        ),
    )
    if spec["body_collection_enabled"] and normalized_url:
        connection.execute(
            """INSERT OR IGNORE INTO body_queue(
                   article_id, status, attempts, created_at_utc, updated_at_utc
               ) VALUES (?, 'queued', 0, ?, ?)""",
            (identifier, observed_at_utc, observed_at_utc),
        )
        connection.execute(
            """UPDATE articles SET body_status=CASE
                   WHEN body_status='not_queued' THEN 'queued' ELSE body_status END
               WHERE article_id=?""",
            (identifier,),
        )
    connection.commit()
    return identifier, is_new


def queued_articles(
    connection: sqlite3.Connection,
    now_utc: str,
    limit: int,
    max_total_attempts: int,
    allowed_feed_ids: list[str] | None = None,
) -> list[sqlite3.Row]:
    feed_filter = ""
    parameters: list[object] = [max_total_attempts, now_utc]
    if allowed_feed_ids:
        placeholders = ",".join("?" for _ in allowed_feed_ids)
        feed_filter = f" AND f.feed_id IN ({placeholders})"
        parameters.extend(allowed_feed_ids)
    parameters.append(limit)
    return connection.execute(
        f"""SELECT q.article_id, q.status AS queue_status, q.attempts AS queue_attempts,
                  a.normalized_url, a.title, a.latest_rss_summary,
                  a.latest_rss_content, a.rss_quality_status,
                  s.source_name, s.feed_name, f.feed_id, f.config_json
           FROM body_queue q
           JOIN articles a ON a.article_id=q.article_id
           JOIN article_sources s ON s.article_id=q.article_id
           JOIN feeds f ON f.feed_id=s.feed_id
           WHERE q.status IN ('queued', 'retry_wait')
             AND q.attempts < ?
             AND (q.next_attempt_at_utc IS NULL OR q.next_attempt_at_utc <= ?)
             AND f.body_collection_enabled=1
             {feed_filter}
           GROUP BY q.article_id
           ORDER BY a.first_seen_utc, q.article_id
           LIMIT ?""",
        parameters,
    ).fetchall()


def record_body_attempt(
    connection: sqlite3.Connection,
    run_id: str,
    result: dict,
    max_total_attempts: int,
    retry_delay_hours: float,
) -> None:
    attempted = result["attempted_at_utc"]
    connection.execute(
        """INSERT INTO body_attempts(
               run_id, article_id, attempted_at_utc, status, reason, retryable,
               http_status, resolved_url, extraction_method, article_body,
               body_length, quality_status, response_sha256, full_text_verified
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)""",
        (
            run_id,
            result["article_id"],
            attempted,
            result["status"],
            result["reason"],
            int(result["retryable"]),
            result.get("http_status"),
            result.get("resolved_url", ""),
            result.get("extraction_method", ""),
            result.get("article_body", ""),
            len(result.get("article_body", "")),
            result["quality_status"],
            result.get("response_sha256", ""),
        ),
    )
    queue = connection.execute(
        "SELECT attempts FROM body_queue WHERE article_id=?",
        (result["article_id"],),
    ).fetchone()
    attempts = (queue["attempts"] if queue else 0) + 1
    retry = bool(result["retryable"] and attempts < max_total_attempts)
    queue_status = "retry_wait" if retry else result["status"]
    next_attempt = None
    if retry:
        next_attempt = (
            datetime.fromisoformat(attempted) + timedelta(hours=retry_delay_hours)
        ).isoformat()
    connection.execute(
        """UPDATE body_queue SET status=?, attempts=?, next_attempt_at_utc=?,
               last_reason=?, updated_at_utc=? WHERE article_id=?""",
        (
            queue_status,
            attempts,
            next_attempt,
            result["reason"],
            attempted,
            result["article_id"],
        ),
    )
    body = result.get("article_body", "")
    if body:
        connection.execute(
            """UPDATE articles SET article_body=?, body_status=?,
                   body_quality_status=?, body_extraction_method=?, body_reason=?,
                   body_first_collected_utc=COALESCE(body_first_collected_utc, ?),
                   body_last_attempt_utc=?,
                   body_last_success_utc=CASE WHEN ?='success' THEN ? ELSE body_last_success_utc END,
                   body_attempt_count=?, body_http_status=?, full_text_verified=0
               WHERE article_id=?""",
            (
                body,
                result["status"],
                result["quality_status"],
                result.get("extraction_method", ""),
                result["reason"],
                attempted,
                attempted,
                result["status"],
                attempted,
                attempts,
                result.get("http_status"),
                result["article_id"],
            ),
        )
    else:
        connection.execute(
            """UPDATE articles SET body_status=?, body_quality_status=?,
                   body_extraction_method=?, body_reason=?, body_last_attempt_utc=?,
                   body_attempt_count=?, body_http_status=?, full_text_verified=0
               WHERE article_id=?""",
            (
                queue_status,
                result["quality_status"],
                result.get("extraction_method", ""),
                result["reason"],
                attempted,
                attempts,
                result.get("http_status"),
                result["article_id"],
            ),
        )
    connection.commit()


def summary(connection: sqlite3.Connection) -> dict:
    def scalar(sql: str):
        return connection.execute(sql).fetchone()[0]

    return {
        "articles": scalar("SELECT COUNT(*) FROM articles"),
        "rss_observations": scalar("SELECT COUNT(*) FROM rss_observations"),
        "articles_with_rss_content": scalar(
            "SELECT COUNT(*) FROM articles WHERE latest_rss_content<>''"
        ),
        "articles_with_article_body": scalar(
            "SELECT COUNT(*) FROM articles WHERE article_body<>''"
        ),
        "queued_bodies": scalar(
            "SELECT COUNT(*) FROM body_queue WHERE status IN ('queued','retry_wait')"
        ),
        "blocked_bodies": scalar(
            "SELECT COUNT(*) FROM body_queue WHERE status='blocked'"
        ),
        "subscription_bodies": scalar(
            "SELECT COUNT(*) FROM body_queue WHERE status='subscription'"
        ),
        "failed_bodies": scalar(
            "SELECT COUNT(*) FROM body_queue WHERE status='failed'"
        ),
    }
