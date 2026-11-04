"""RSS availability audit. Network access requires explicit --collect."""
import argparse
import csv
import hashlib
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

UTC = timezone.utc
ROOT = Path(__file__).resolve().parents[1]


class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ('script', 'style') and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def clean(value):
    parser = Text()
    parser.feed(str(value or ''))
    return re.sub(r'\s+', ' ', ' '.join(parser.parts)).strip()


def date(value):
    if not value:
        return None
    try:
        result = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        try:
            result = parsedate_to_datetime(str(value))
        except (TypeError, ValueError, OverflowError):
            return None
    return result.astimezone(UTC) if result.tzinfo else None


def canonical(url):
    try:
        p = urlsplit(url)
        if p.scheme not in ('http', 'https') or not p.hostname:
            return ''
        query = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
                 if not k.lower().startswith('utm_')
                 and k.lower() not in {'fbclid', 'gclid', 'mc_cid', 'mc_eid'}]
        return urlunsplit((p.scheme, p.netloc.lower(), p.path, urlencode(query), ''))
    except ValueError:
        return ''


def save_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def save_csv(path, rows, columns):
    with path.open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: json.dumps(row[k], ensure_ascii=False)
                             if isinstance(row.get(k), (list, dict)) else row.get(k, '')
                             for k in columns})


def collect(spec, index, run, start, end, timeout, requests, feedparser):
    report = dict(spec)
    report.update(checked_at_utc=datetime.now(UTC).isoformat(), status='not_configured',
                  access_status='not_requested', parse_status='not_attempted',
                  entries=0, in_window=0, unknown_date=0, outside_window=0,
                  invalid_url=0, parser_warning='', error='')
    rows = []
    if not spec['피드 URL']:
        return rows, report
    report['status'] = 'request_error'
    try:
        with requests.get(spec['피드 URL'], timeout=(8, timeout), stream=True,
                          headers={'User-Agent': 'RSSAvailabilityAudit/1.0',
                                   'Accept': 'application/rss+xml, application/atom+xml, application/xml'}) as response:
            report.update(http_status=response.status_code, resolved_feed_url=response.url,
                          content_type=response.headers.get('Content-Type', ''),
                          access_status='http_error')
            raw = run / 'raw_feeds' / f'{index:02d}.bin'
            report['raw_file'] = str(raw.relative_to(run))
            size = 0
            with raw.open('wb') as handle:
                for chunk in response.iter_content(65536):
                    size += len(chunk)
                    if size > 10_000_000:
                        report['status'] = 'response_too_large'
                        report['raw_truncated'] = True
                        raise ValueError('Response exceeds 10 MB; saved prefix only')
                    handle.write(chunk)
            report['response_bytes'] = size
            if not 200 <= response.status_code < 300:
                report['status'] = 'http_error'
                return rows, report
            report['access_status'] = 'ok'
            report['status'] = 'parse_error'
            parsed = feedparser.parse(raw.read_bytes())
            report.update(feed_version=parsed.version, entries=len(parsed.entries),
                          parser_warning=str(parsed.get('bozo_exception', '')))
            if not parsed.version:
                report['parse_status'] = 'not_rss_atom'
                return rows, report
            report['parse_status'] = 'warning' if parsed.bozo else 'ok'
            for entry in parsed.entries:
                published_raw = entry.get('published', '')
                dt = date(published_raw)
                if dt and not start <= dt < end:
                    report['outside_window'] += 1
                    continue
                key = 'in_window' if dt else 'unknown_date'
                report[key] += 1
                original = urljoin(response.url, entry.get('link', '')) if entry.get('link') else ''
                url = canonical(original)
                if not url:
                    report['invalid_url'] += 1
                content = clean(' '.join(p.get('value', '') for p in entry.get('content', [])))
                rows.append(dict(source_names=[spec['매체명']], feed_refs=[f"{spec['매체명']}/{spec['피드명']}"],
                                 title=clean(entry.get('title', '')), url=url, original_url=original,
                                 url_status='valid' if url else 'missing_or_invalid',
                                 published_raw=published_raw, published_utc=dt.isoformat() if dt else '',
                                 date_status='known' if dt else 'unknown',
                                 window_status='in_window' if dt else 'unknown_date',
                                 summary=clean(entry.get('summary', '')), feed_content=content,
                                 has_rss_body=bool(content)))
            report['status'] = ('feed_warning' if parsed.bozo else 'ok') if report['in_window'] else (
                'no_articles_in_window_warning' if parsed.bozo else 'no_articles_in_window')
    except (requests.RequestException, ValueError) as exc:
        report['error'] = f'{type(exc).__name__}: {exc}'
    return rows, report


def deduplicate(rows):
    unique = {}
    for i, row in enumerate(rows):
        key = row['url'] or f'missing-url:{i}'
        row['published_variants_utc'] = [row['published_utc']] if row['published_utc'] else []
        row['published_raw_variants'] = [row['published_raw']] if row['published_raw'] else []
        if key not in unique:
            unique[key] = row
            continue
        old = unique[key]
        for field in ('source_names', 'feed_refs', 'published_variants_utc', 'published_raw_variants'):
            old[field] = sorted(set(old[field] + row[field]))
        for field in ('title', 'summary', 'feed_content'):
            old[field] = max((old[field], row[field]), key=len)
        if row['published_utc'] and not old['published_utc']:
            for field in ('published_raw', 'published_utc', 'date_status', 'window_status'):
                old[field] = row[field]
        old['has_rss_body'] = bool(old['feed_content'])
    for row in unique.values():
        row['published_date_conflict'] = len(row['published_variants_utc']) > 1
    return list(unique.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--collect', action='store_true', help='Explicitly enable internet requests')
    parser.add_argument('--config', type=Path, default=ROOT / 'config/feeds.csv')
    parser.add_argument('--output', type=Path, default=ROOT / 'outputs')
    parser.add_argument('--hours', type=float, default=168)
    parser.add_argument('--end', help='ISO timestamp with timezone; default: execution time')
    parser.add_argument('--timeout', type=float, default=25)
    args = parser.parse_args()
    if not args.collect:
        parser.error('Network disabled. Use --collect to start an audit.')
    end = date(args.end) if args.end else datetime.now(UTC)
    if end is None or not 0 < args.hours < float('inf') or not 0 < args.timeout < float('inf'):
        parser.error('Require timezone-aware --end and positive finite --hours/--timeout')
    start = end - timedelta(hours=args.hours)
    import requests
    import feedparser
    config_bytes = args.config.read_bytes()
    with args.config.open(encoding='utf-8-sig', newline='') as handle:
        specs = list(csv.DictReader(handle))
    required = {'매체명', '피드명', '피드 URL', '주소 출처', '과거 확인 상태', '비고'}
    if not specs or not required.issubset(specs[0]):
        parser.error('Invalid or empty feed configuration')
    now = datetime.now(UTC)
    run = args.output / now.strftime('%Y%m%dT%H%M%S_%fZ')
    run.mkdir(parents=True, exist_ok=False)
    (run / 'raw_feeds').mkdir()
    (run / 'feeds_snapshot.csv').write_bytes(config_bytes)
    metadata = dict(state='running', started_at_utc=now.isoformat(), start_utc=start.isoformat(),
                    end_utc=end.isoformat(), window='start <= published < end',
                    unknown_date_policy='retain separately marked; updated is not publication date',
                    config=str(args.config.resolve()), config_sha256=hashlib.sha256(config_bytes).hexdigest(),
                    arguments=vars(args) | {'config': str(args.config), 'output': str(args.output)},
                    python=sys.executable, python_version=sys.version,
                    requests_version=requests.__version__, feedparser_version=feedparser.__version__,
                    coverage_guaranteed=False)
    save_json(run / 'run_conditions.json', metadata)
    all_rows, reports = [], []
    for index, spec in enumerate(specs, 1):
        rows, report = collect(spec, index, run, start, end, args.timeout, requests, feedparser)
        all_rows.extend(rows)
        reports.append(report)
        save_json(run / 'feed_status.json', reports)
        print(spec['매체명'], spec['피드명'], report['status'])
    articles = deduplicate(all_rows)
    summaries = []
    for source in dict.fromkeys(s['매체명'] for s in specs):
        subset = [r for r in reports if r['매체명'] == source]
        usable = sum(r['parse_status'] == 'ok' for r in subset)
        warnings = sum(r['parse_status'] == 'warning' for r in subset)
        configured = sum(bool(r['피드 URL']) for r in subset)
        state = ('not_configured' if not configured else 'available' if usable == configured
                 else 'partial' if usable else 'needs_review' if warnings else 'unavailable')
        own = [a for a in articles if source in a['source_names']]
        summaries.append(dict(source_name=source, status=state, configured_feeds=configured,
                              usable_feeds=usable, warning_feeds=warnings,
                              failed_feeds=configured-usable-warnings,
                              unique_articles=len(own),
                              in_window_articles=sum(a['date_status'] == 'known' for a in own),
                              unknown_date_articles=sum(a['date_status'] == 'unknown' for a in own)))
    save_json(run / 'articles.json', articles)
    article_columns = ['source_names', 'feed_refs', 'title', 'url', 'original_url', 'url_status',
                       'published_raw', 'published_utc', 'date_status', 'window_status', 'summary',
                       'has_rss_body', 'feed_content', 'published_variants_utc',
                       'published_raw_variants', 'published_date_conflict']
    save_csv(run / 'articles.csv', articles, article_columns)
    save_csv(run / 'feed_status.csv', reports, list(dict.fromkeys(k for r in reports for k in r)))
    save_csv(run / 'media_summary.csv', summaries, list(summaries[0]))
    metadata.update(state='completed', finished_at_utc=datetime.now(UTC).isoformat(),
                    unique_articles=len(articles), entries_before_dedup=len(all_rows))
    save_json(run / 'run_conditions.json', metadata)
    print('Saved:', run.resolve())


if __name__ == '__main__':
    main()
