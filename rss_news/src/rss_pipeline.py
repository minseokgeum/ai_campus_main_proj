"""20개 매체 RSS와 본문 추출·정제를 연결하는 독립 실행 진입점.

기존 시험 DB·노트북 없이 새 DB로 시작합니다. 네트워크는 --collect가
있는 경우에만 사용합니다. 전문 검증과 분석 승인은 자동으로 하지 않습니다.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sqlite3
import time
from collections import Counter
from contextlib import closing, contextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import feedparser
import requests

import integrated_notebook_bodies as rules

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / 'data/combined_rss.sqlite3'
DEFAULT_OUTPUT = ROOT / 'outputs/combined_rss'


def now():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def normalized_url(url):
    """잘못된 주소를 고쳐 쓰지 않고 거절합니다. 알려진 추적 인자만 제외합니다."""
    parsed = urlsplit(url)
    if (parsed.scheme not in {'http', 'https'} or not parsed.hostname
            or parsed.username or parsed.password
            or '://' in url.split('://', 1)[-1]
            or any(c.isspace() for c in url)):
        raise ValueError('잘못된 기사 URL')
    tracking = {'at_medium', 'at_campaign', 'fbclid', 'gclid', '.tsrc', 'mc_cid', 'mc_eid'}
    query = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True)
             if not k.lower().startswith('utm_') and k.lower() not in tracking]
    return urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path, urlencode(query), ''))


def load_feeds(config_dir=ROOT / 'config'):
    found = {}
    for filename in ('feed_registry.csv', 'new_feed_candidates_20261029.csv'):
        with (Path(config_dir) / filename).open(encoding='utf-8-sig', newline='') as handle:
            for row in csv.DictReader(handle):
                source = row.get('source_name', '').strip()
                if source not in rules.SOURCES or row.get('enabled', '').lower() == 'false':
                    continue
                url = row.get('feed_url', '').strip()
                if not url:
                    continue
                normalized_url(url)
                found.setdefault((source, url), dict(source_name=source,
                    feed_name=row.get('feed_name', ''), feed_url=url))
    missing = set(rules.SOURCES) - {row['source_name'] for row in found.values()}
    if missing:
        raise ValueError('설정에 없는 매체: ' + ', '.join(sorted(missing)))
    return list(found.values())


def initialize(conn):
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS articles (
            url TEXT PRIMARY KEY, article_id TEXT UNIQUE NOT NULL,
            original_url TEXT NOT NULL, source_name TEXT NOT NULL,
            title TEXT, published TEXT, rss_summary TEXT, rss_content TEXT,
            first_seen_utc TEXT, last_seen_utc TEXT,
            original_title TEXT, body_raw TEXT, body_clean TEXT,
            body_status TEXT, extraction_method TEXT, body_checked_at_utc TEXT,
            full_text_verified INTEGER NOT NULL DEFAULT 0,
            analysis_approved INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS article_feeds (
            url TEXT, source_name TEXT, feed_name TEXT, feed_url TEXT,
            first_seen_utc TEXT, last_seen_utc TEXT,
            PRIMARY KEY (url, source_name, feed_url)
        );
        CREATE TABLE IF NOT EXISTS body_attempts (
            id INTEGER PRIMARY KEY, run_id TEXT, url TEXT, source_name TEXT,
            status TEXT, checked_at_utc TEXT, result_json TEXT
        );
    ''')
    conn.commit()


@contextmanager
def collection_lock(db_path):
    lock_path = Path(str(db_path) + '.lock')
    try:
        fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as error:
        raise RuntimeError(f'실행 중이거나 잠금 파일이 남아 있습니다: {lock_path}') from error
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            handle.write(str(os.getpid()))
        yield
    finally:
        lock_path.unlink(missing_ok=True)


def initial_status(source, url):
    return rules.classify(source, url) or ('body_hold' if source in rules.HOLD else 'pending')


def save_entry(conn, entry, feed, checked_at):
    original_url = entry.get('link', '').strip()
    url = normalized_url(original_url)
    status = initial_status(feed['source_name'], url)
    is_new = conn.execute('SELECT 1 FROM articles WHERE url=?', (url,)).fetchone() is None
    content = [item.get('value', '') for item in entry.get('content', [])]
    conn.execute('''INSERT INTO articles
        (url,article_id,original_url,source_name,title,published,rss_summary,rss_content,
         first_seen_utc,last_seen_utc,body_status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(url) DO UPDATE SET
          last_seen_utc=excluded.last_seen_utc, title=excluded.title,
          published=excluded.published, rss_summary=excluded.rss_summary,
          rss_content=excluded.rss_content
        ''', (url, hashlib.sha256(url.encode()).hexdigest(), original_url,
              feed['source_name'], entry.get('title',''),
              entry.get('published', entry.get('updated','')), entry.get('summary',''),
              json.dumps(content, ensure_ascii=False), checked_at, checked_at, status))
    conn.execute('''INSERT INTO article_feeds VALUES (?,?,?,?,?,?)
        ON CONFLICT(url,source_name,feed_url) DO UPDATE SET last_seen_utc=excluded.last_seen_utc
        ''', (url, feed['source_name'], feed['feed_name'], feed['feed_url'], checked_at, checked_at))
    return url, is_new


def collect_once(*, collect=False, db_path=DEFAULT_DB, output_dir=DEFAULT_OUTPUT,
                 body_per_source=3, delay=2, feeds=None):
    """RSS 갱신 후 매체별 대기 본문을 처리합니다. 주피터에서도 직접 호출 가능합니다."""
    if not collect:
        raise ValueError('실제 수집은 collect=True로 명시해야 합니다.')
    if body_per_source < 0 or delay < 0:
        raise ValueError('처리 건수·대기 시간은 0 이상이어야 합니다.')
    feeds = load_feeds() if feeds is None else feeds
    db_path = Path(db_path).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S_%fZ')
    run = Path(output_dir).resolve() / stamp
    run.mkdir(parents=True)
    feed_results = []
    body_results = []
    new_count = 0
    seen = set()
    with collection_lock(db_path), closing(sqlite3.connect(db_path)) as conn:
        initialize(conn)
        write_json(run / 'conditions.json', dict(started_at_utc=now(), db=str(db_path),
                   body_per_source=body_per_source, delay=delay, feeds=feeds,
                   rule_states=rules.source_rules(), summary_only_analysis=False))
        with requests.Session() as session:
            session.headers.update({'User-Agent': 'RSSNewsCollector/1.0'})
            for index, feed in enumerate(feeds, 1):
                if index > 1:
                    time.sleep(delay)
                print(f"RSS {index}/{len(feeds)}: {feed['source_name']} / {feed['feed_name']}", flush=True)
                record = dict(**feed, checked_at_utc=now(), status='failed', entries=0, invalid_entries=[])
                try:
                    response = session.get(feed['feed_url'], timeout=(8,25))
                    record.update(http_status=response.status_code, final_url=response.url)
                    (run / f'feed_{index:02d}.bin').write_bytes(response.content)
                    response.raise_for_status()
                    parsed = feedparser.parse(response.content)
                    if not parsed.version:
                        raise ValueError('RSS·Atom으로 인식하지 못한 응답')
                    record.update(status='parsed_with_warning' if parsed.bozo else 'parsed',
                                  warning=str(parsed.bozo_exception) if parsed.bozo else '')
                    for entry in parsed.entries:
                        try:
                            url, is_new = save_entry(conn, entry, feed, record['checked_at_utc'])
                        except ValueError as error:
                            record['invalid_entries'].append(dict(url=entry.get('link',''), reason=str(error)))
                            continue
                        seen.add(url)
                        new_count += int(is_new)
                        record['entries'] += 1
                    conn.commit()
                except (requests.RequestException, ValueError) as error:
                    record['error'] = f'{type(error).__name__}: {error}'
                feed_results.append(record)
                write_json(run / 'feed_results.json', feed_results)
        conn.row_factory = sqlite3.Row
        requests_made = 0
        for source in rules.SOURCES:
            if source in rules.HOLD or body_per_source == 0:
                continue
            targets = conn.execute("""SELECT * FROM articles
                WHERE source_name=? AND body_status='pending'
                  AND LENGTH(COALESCE(body_clean,''))=0
                ORDER BY first_seen_utc,rowid LIMIT ?""", (source,body_per_source)).fetchall()
            for article in targets:
                # 피드 요청 종료 직후에도 요청 간격을 유지합니다.
                time.sleep(delay)
                requests_made += 1
                print(f"본문 [{source}]: {article['title']}", flush=True)
                try:
                    result = rules.extract_for_source(source, article['url'])
                except Exception as error:
                    result = dict(body_status='extraction_error', body_raw='', body_clean='',
                                  body_checked_at_utc=now(), error=f'{type(error).__name__}: {error}')
                result.update(source_name=source, url=article['url'], title=article['title'],
                              full_text_verified=False, analysis_approved=False)
                write_json(run / f'body_{requests_made:03d}.json', result)
                conn.execute('''INSERT INTO body_attempts
                    (run_id,url,source_name,status,checked_at_utc,result_json) VALUES (?,?,?,?,?,?)''',
                    (stamp, article['url'], source, result['body_status'], result['body_checked_at_utc'],
                     json.dumps(result, ensure_ascii=False)))
                conn.execute('''UPDATE articles SET original_title=?,body_raw=?,body_clean=?,
                    body_status=?,extraction_method=?,body_checked_at_utc=?
                    WHERE url=? AND LENGTH(COALESCE(body_clean,''))=0''',
                    (result.get('original_title',''),result.get('body_raw',''),result.get('body_clean',''),
                     result['body_status'],result.get('extraction_method',''),result['body_checked_at_utc'],article['url']))
                conn.commit()
                body_results.append(result)
        table = []
        for source in rules.SOURCES:
            row = conn.execute('''SELECT COUNT(*),
                COALESCE(SUM(LENGTH(TRIM(COALESCE(body_clean,'')))>0),0),
                COALESCE(SUM(body_status='pending'),0) FROM articles WHERE source_name=?''', (source,)).fetchone()
            table.append({'매체':source,'누적 항목':row[0],'본문 후보':row[1],'대기':row[2],
                          '비고':rules.HOLD.get(source,'')})
        summary = dict(run_id=stamp, finished_at_utc=now(), new_articles=new_count,
                       unique_seen=len(seen), feed_failures=sum(r['status']=='failed' for r in feed_results),
                       body_attempts=len(body_results), body_states=dict(Counter(r['body_status'] for r in body_results)),
                       database=str(db_path), output=str(run), media=table)
        write_json(run / 'summary.json', summary)
    print(f"완료: 신규 {new_count}건 / 이번 확인 URL {len(seen)}건 / 본문 요청 {len(body_results)}건", flush=True)
    print('결과 위치:', run)
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--collect', action='store_true', help='실제 인터넷 수집 실행')
    parser.add_argument('--show-config', action='store_true', help='설정만 확인하고 종료')
    parser.add_argument('--db', type=Path, default=DEFAULT_DB)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--body-per-source', type=int, default=3)
    parser.add_argument('--delay', type=float, default=2)
    parser.add_argument('--cycles', type=int, default=1, help='유한한 반복 횟수')
    parser.add_argument('--interval-seconds', type=float, default=600,
                        help='각 실행 완료 후 다음 실행까지 대기 초')
    args = parser.parse_args()
    feeds = load_feeds()
    if args.show_config:
        print(f"매체 {len({r['source_name'] for r in feeds})}개 / 피드 {len(feeds)}개")
        for row in rules.source_rules():
            print(row['매체'], ':', row['상태'], row['비고'])
        return
    if not args.collect:
        parser.error('수집하려면 --collect, 설정만 확인하려면 --show-config를 사용하세요.')
    if args.cycles < 1 or args.interval_seconds < 0:
        parser.error('반복 횟수는 1 이상, 대기 시간은 0 이상이어야 합니다.')
    try:
        for cycle in range(args.cycles):
            print(f'실행 {cycle+1}/{args.cycles}', flush=True)
            collect_once(collect=True, db_path=args.db, output_dir=args.output,
                         body_per_source=args.body_per_source, delay=args.delay, feeds=feeds)
            if cycle+1 < args.cycles:
                print(f'{args.interval_seconds}초 후 다시 실행합니다.', flush=True)
                time.sleep(args.interval_seconds)
    except KeyboardInterrupt:
        print('사용자가 중단했습니다. 이미 저장한 결과는 유지됩니다.')


if __name__ == '__main__':
    main()
