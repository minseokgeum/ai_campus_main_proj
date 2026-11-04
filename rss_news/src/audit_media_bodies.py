"""Read one current RSS article per publisher and audit the production extractor."""
import csv
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import feedparser
import requests
from bs4 import BeautifulSoup

from collect_article_bodies import extract
from continuous_collect import BLOCK_MARKERS, SUBSCRIPTION_MARKERS

ROOT = Path(__file__).resolve().parents[1]


def main():
    groups = {}
    for filename in ('feed_registry.csv', 'new_feed_candidates_20261029.csv'):
        with (ROOT / 'config' / filename).open(encoding='utf-8-sig') as f:
            for row in csv.DictReader(f):
                if row.get('collection_tier') == 'hold' or row.get('enabled') == 'false':
                    continue
                if row.get('feed_url'):
                    groups.setdefault(row['source_name'], row)
    out = ROOT / 'outputs' / 'media_body_audit' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S_%fZ')
    out.mkdir(parents=True)
    session = requests.Session()
    session.headers['User-Agent'] = 'RSSNewsCollector/1.0 (public research; no authentication)'
    results = []
    for index, (source, spec) in enumerate(groups.items(), 1):
        row = dict(source=source, feed_url=spec['feed_url'], checked_at_utc=datetime.now(timezone.utc).isoformat(), title='', url='', status='failed', reason='', body_chars=0, rss_chars=0, method='', restriction_markers=[], full_text_verified=False)
        folder = out / f'{index:02d}'
        folder.mkdir()
        try:
            response = session.get(spec['feed_url'], timeout=(8, 20))
            response.raise_for_status()
            feed = feedparser.parse(response.content)
            entries = [e for e in feed.entries if e.get('link','').startswith('http') and '/video/' not in e.link.lower()]
            if not entries:
                raise ValueError('No article entries')
            entry = entries[0]
            row.update(title=entry.get('title',''), url=entry.link)
            rss = '\n\n'.join(BeautifulSoup(v.get('value',''), 'html.parser').get_text(' ', strip=True) for v in entry.get('content', []))
            row['rss_chars'] = len(rss)
            (folder / 'rss_content.txt').write_text(rss, encoding='utf-8')
            time.sleep(1)
            page = session.get(entry.link, timeout=(8, 20))
            row['http_status'] = page.status_code
            row['resolved_url'] = page.url
            if page.status_code in (401,402,403,407,429,451):
                row.update(status='restricted', reason=f'HTTP {page.status_code}')
            else:
                page.raise_for_status()
                html = page.content.decode(page.encoding or 'utf-8', errors='replace')
                body, method, paragraphs = extract(html, source)
                markers = [m for m in set(BLOCK_MARKERS + SUBSCRIPTION_MARKERS) if m in html.lower()]
                row.update(body_chars=len(body), method=method, paragraphs=paragraphs, restriction_markers=markers)
                row['status'] = 'candidate_review' if len(body) >= 500 else ('partial' if body else 'no_body')
                row['reason'] = 'Public extraction candidate; compare original, middle and ending; markers may be scripts' if body else 'No body extracted by production rules'
                (folder / 'article_body.txt').write_text(body, encoding='utf-8')
                soup = BeautifulSoup(html, 'html.parser')
                row['page_title'] = soup.title.get_text(' ',strip=True) if soup.title else ''
                row['body_start'] = body[:250]
                row['body_end'] = body[-250:]
        except Exception as exc:
            row['reason'] = f'{type(exc).__name__}: {exc}'
        (folder / 'info.json').write_text(json.dumps(row, ensure_ascii=False, indent=2), encoding='utf-8')
        row['body_file'] = str(folder / 'article_body.txt')
        results.append(row)
        (out / 'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
        print(source, row['status'], row['body_chars'], flush=True)
    lines = ['# 매체별 자동 본문 수집 점검', '', '매체당 RSS 첫 기사형 항목 1건. 운영 추출기 사용. 전문 여부는 미확정. 기존 DB·설정 변경 없음.', '', '|매체|상태|RSS 본문 길이|원문 추출 길이|확인 파일|', '|---|---|---:|---:|---|']
    for i,r in enumerate(results,1):
        lines.append(f"|{r['source']}|{r['status']}|{r['rss_chars']}|{r['body_chars']}|[{i:02d}]({i:02d}/info.json)|")
    (out / 'report.md').write_text('\n'.join(lines),encoding='utf-8')
    print('OUTPUT', out, flush=True)


if __name__ == '__main__':
    main()
