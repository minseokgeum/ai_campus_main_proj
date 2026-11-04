"""Inspect video-path RSS entries and one previously denied article, without bypass."""
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from collect_article_bodies import extract

ROOT = Path(__file__).resolve().parents[1]


def metadata_nodes(soup):
    nodes = []
    def walk(value):
        if isinstance(value, dict):
            if '@type' in value:
                nodes.append(value)
            for v in value.values():
                walk(v)
        elif isinstance(value, list):
            for v in value:
                walk(v)
    for s in soup.select('script[type="application/ld+json"]'):
        try:
            walk(json.loads(s.string or s.get_text()))
        except (ValueError, TypeError):
            pass
    return nodes


def main():
    samples = {}
    for p in (ROOT / 'outputs').rglob('articles.json'):
        try:
            rows = json.loads(p.read_text(encoding='utf-8'))
        except (ValueError, OSError):
            continue
        if not isinstance(rows, list):
            continue
        for r in rows:
            url = r.get('url', '')
            if '/video/' in url.lower() or '/videos/' in url.lower():
                sources = r.get('source_names') or [r.get('source_name', '')]
                samples[url] = {'source': sources[0], 'title': r.get('title', ''), 'url': url, 'kind': 'video_path', 'discovered_in': str(p)}
    dive = 'https://www.supplychaindive.com/news/usda-fund-8-fertilizer-manufacturing-projects-totaling-1-billion/873311/'
    samples[dive] = dict(source='Supply Chain Dive', title='USDA fertilizer projects', url=dive, kind='article_recheck')
    out = ROOT / 'outputs' / 'video_page_recheck' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S_%fZ')
    out.mkdir(parents=True)
    session = requests.Session()
    session.headers['User-Agent'] = 'RSSNewsCollector/1.0 (public research; no authentication)'
    results = []
    last_host = {}
    for i, sample in enumerate(samples.values(), 1):
        from urllib.parse import urlsplit
        host = urlsplit(sample['url']).netloc
        time.sleep(max(0, 1 - (time.monotonic() - last_host.get(host, 0))))
        row = dict(sample, checked_at_utc=datetime.now(timezone.utc).isoformat(), status='request_failed', article_body='', description='', transcript='', classification='unresolved', full_text_verified=False)
        try:
            response = session.get(sample['url'], timeout=(8, 20))
            row.update(http_status=response.status_code, resolved_url=response.url)
            if response.status_code in (401,402,403,407,429,451):
                row.update(status='access_restricted', reason='Public request denied; no bypass or repeated retries')
            else:
                response.raise_for_status()
                soup = BeautifulSoup(response.content, 'html.parser')
                nodes = metadata_nodes(soup)
                types = sorted({t for n in nodes for t in (n['@type'] if isinstance(n['@type'], list) else [n['@type']]) if isinstance(t, str)})
                descriptions, transcripts = [], []
                for n in nodes:
                    if isinstance(n.get('description'), str):
                        descriptions.append(n['description'])
                    if isinstance(n.get('transcript'), str):
                        transcripts.append(n['transcript'])
                if not descriptions:
                    meta = soup.select_one('meta[name="description"]')
                    if meta and meta.get('content'):
                        descriptions.append(meta['content'])
                body, method, paragraphs = extract(str(soup), sample['source'])
                # Narrow, publisher-specific fallback for previously missed ordinary articles.
                if sample['source'] == 'Supply Chain Dive':
                    from collect_article_bodies import container_text
                    node = soup.select_one('.article-body')
                    if node:
                        body, paragraphs = container_text(node)
                        method = 'publisher .article-body'
                row.update(status='page_received', schema_types=types, article_body=body, extraction_method=method, paragraphs=paragraphs, description='\n\n'.join(dict.fromkeys(descriptions)), transcript='\n\n'.join(dict.fromkeys(transcripts)))
                row['classification'] = 'transcript_field_present' if row['transcript'] else ('video_path_with_text_candidate' if body and sample['kind']=='video_path' else ('article_text_candidate' if body else 'description_only' if row['description'] else 'no_text_extracted'))
                row['reason'] = 'Video URL is not proof of video-only content; body candidate is not a verified transcript or complete article'
        except requests.RequestException as e:
            row['reason'] = str(e)
        last_host[host] = time.monotonic()
        folder = out / f'{i:02d}'
        folder.mkdir()
        for field in ('article_body','description','transcript'):
            (folder / (field + '.txt')).write_text(row[field], encoding='utf-8')
        row.update(body_chars=len(row['article_body']), description_chars=len(row['description']), transcript_chars=len(row['transcript']))
        results.append(row)
        (out / 'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
        print(row['source'],row['status'],row['classification'],row['body_chars'], flush=True)
    print('OUTPUT',out,flush=True)


if __name__ == '__main__':
    main()
