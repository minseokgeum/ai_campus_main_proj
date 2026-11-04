"""노트북 확인 규칙과 추가 시험 규칙을 연결한 본문 처리 모듈."""
import csv
import json
import re
import sqlite3
import time
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlsplit
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "outputs/continuous_notebook_test/articles.sqlite3"

# 확인된 노트북 함수는 유지하고 추가 매체는 후보 규칙으로 구분합니다.
SOURCES = [
    'CNBC', 'Fortune', 'The Motley Fool', 'Zacks', 'Fox Business',
    'Business Insider', 'BBC News', 'The Guardian', 'Ars Technica',
    'TechCrunch', 'WIRED', 'NPR', 'ProPublica', 'IEEE Spectrum',
    'MIT Technology Review', 'ABC News', 'CBS News', 'NBC News',
    'Al Jazeera English', 'Engadget',
]
HOLD = {
    'Zacks': '기존 원문 차단 이력: RSS만 유지',
    'MIT Technology Review': '구독 제한 표본의 전문 대조 미완료',
}
SELECTORS = {
    'Fortune': ['[data-testid="article-body"]', '.article-content', '.post-content', '[itemprop="articleBody"]'],
    'The Motley Fool': ['[itemprop="articleBody"]', '.article-body', '.article-content'],
    'Fox Business': ['.article-body', '[itemprop="articleBody"]'],
    'Business Insider': ['[data-component-type="article-content"]', '.content-lock-content', '.article-content', '[itemprop="articleBody"]'],
    'Ars Technica': ['.article-content', '[itemprop="articleBody"]'],
    'WIRED': ['.body__inner-container', '[data-testid="BodyWrapper"]', '[itemprop="articleBody"]'],
    'NPR': ['.transcript', '#transcript', '.storytext', '#storytext'],
    'ProPublica': ['.article-body', '.story-body', '[itemprop="articleBody"]'],
    'IEEE Spectrum': ['.body-description', '.body-description-container', '[itemprop="articleBody"]'],
    'CBS News': ['.content__body', '.article__body', '[itemprop="articleBody"]'],
    'NBC News': ['.article-body__content'],
    'Al Jazeera English': ['.wysiwyg--all-content', '.article-p-wrapper', '.wysiwyg'],
}


def source_rules():
    verified = {'Engadget', 'CNBC', 'BBC News', 'The Guardian', 'TechCrunch', 'ABC News'}
    return [
        {'매체': source,
         '상태': '보류' if source in HOLD else ('노트북 표본 확인' if source in verified else '통합 후보 규칙: 실행 결과 검토 필요'),
         '비고': HOLD.get(source, '')}
        for source in SOURCES
    ]


def classify(source, url):
    try:
        parsed = urlsplit(url)
        if parsed.scheme not in {'http', 'https'} or not parsed.hostname or '://' in url.split('://', 1)[-1]:
            return 'invalid_url_review'
    except ValueError:
        return 'invalid_url_review'
    path = parsed.path.lower()
    if source == 'ABC News':
        valid, reason = check_abc_article_url(url)
        if not valid:
            return 'non_article_review' if '/widgets/' in path else 'type_review'
    if '/video/' in path or '/videos/' in path or '/av/' in path:
        return 'video_review'
    if '/live/' in path or 'live-updates' in path:
        return 'live_review'
    if source == 'BBC News' and '/news/articles/' not in path:
        return 'type_review'
    if source == 'CNBC' and ('/pro/' in path or '/investingclub/' in path):
        return 'subscription_review'
    if source == 'The Guardian' and any(p in path for p in ['/audio/', '/gallery/', '/ng-interactive/']):
        return 'type_review'
    if source == 'TechCrunch' and '/podcast/' in path:
        return 'audio_review'
    return None


def extract_candidate(source, url):
    response = requests.get(url, headers={'User-Agent': 'RSSNewsCollector/1.0'}, timeout=(8, 25))
    result = dict(http_status=response.status_code, final_url=response.url,
                  original_title='', body_raw='', body_clean='',
                  body_status='no_body', extraction_method='',
                  full_text_verified=False, rule_validation='integration_unverified',
                  body_checked_at_utc=datetime.now(timezone.utc).isoformat(),
                  removed_sections=[])
    if response.status_code != 200:
        result['body_status'] = 'restricted' if response.status_code in {401, 402, 403, 451} else 'http_error'
        return result
    soup = BeautifulSoup(response.content, 'html.parser')
    title = soup.find('h1')
    result['original_title'] = title.get_text(' ', strip=True) if title else ''
    blocks = []
    selector_used = ''
    for selector in SELECTORS[source]:
        found = soup.select(selector)
        if any(node.select('p') for node in found):
            ids = {id(node) for node in found}
            blocks = [node for node in found if not any(id(parent) in ids for parent in node.parents)]
            selector_used = selector
            break
    if not blocks:
        result['body_status'] = 'no_body_container'
        return result
    result['body_raw'] = '\n\n'.join(node.get_text('\n', strip=True) for node in blocks)
    parts = []
    for block in blocks:
        clone = BeautifulSoup(str(block), 'html.parser')
        selectors = 'script,style,nav,aside,footer,form,button,figure,figcaption,iframe,video'
        if source == 'NBC News':
            selectors += ',[class*="subscriberRecirc"]'
        if source == 'IEEE Spectrum':
            selectors += ',.related-stories,.related-articles,.recommended-stories'
        for tag in list(clone.select(selectors)):
            if tag.parent is not None:
                tag.decompose()
        if source == 'Al Jazeera English':
            for section in list(clone.select('section.more-on')):
                heading = section.select_one('.more-on__heading')
                if heading and heading.get_text(' ', strip=True).casefold() == 'recommended stories':
                    result['removed_sections'].append(section.get_text(' ', strip=True))
                    section.decompose()
        for tag in clone.select('p,h2,h3,ul,ol,blockquote'):
            if tag.find_parent(['p', 'ul', 'ol', 'blockquote']):
                continue
            text = tag.get_text(' ', strip=True)
            if text:
                parts.append(text)
    result['body_clean'] = '\n\n'.join(parts)
    result['extraction_method'] = f'{source}: {selector_used} 통합 후보 v1'
    if result['body_clean']:
        result['body_status'] = 'integration_review'
    # 대본의 충분성·태그·홍보 문구 정제 등 미완료 사항은 숨기지 않습니다.
    notes = {
        'NPR': '대본 영역 우선 탐색. 별도 대본 링크 탐색은 미구현. 소개문만 추출될 수 있음.',
        'ProPublica': '라디오 유형·제보 및 팟캐스트 안내 정제 추가 점검 필요.',
        'IEEE Spectrum': '시·문예 태그 분류 미구현. 추천 영역 제거 범위 추가 점검 필요.',
        'WIRED': '구독 제한·쿠폰 유형 구분 및 전문 대조 필요.',
        'Business Insider': 'RSS와 원문 간 문단 누락 여부 점검 필요.',
    }
    result['review_reason'] = notes.get(source, '기존 표본과 별도로 이번 통합 규칙 결과 검토 필요.')
    return result


def extract_for_source(source, url):
    functions = {
        'Engadget': extract_engadget_body, 'CNBC': extract_cnbc_body,
        'BBC News': extract_bbc_body, 'The Guardian': extract_guardian_body,
        'TechCrunch': extract_techcrunch_body, 'ABC News': extract_abc_body,
    }
    if source in functions:
        result = functions[source](url)
        result['rule_validation'] = 'notebook_sample_checked'
        return result
    return extract_candidate(source, url)


def run_batch(db_path=DEFAULT_DB, limit_per_source=1, delay=2):
    """저장된 대기 기사만 처리합니다. RSS 갱신·반복 실행은 하지 않습니다."""
    if limit_per_source < 1 or delay < 0:
        raise ValueError('처리 건수는 1 이상, 대기 시간은 0 이상이어야 합니다.')
    db_path = Path(db_path).resolve()
    if not db_path.is_file():
        raise FileNotFoundError(f'기존 시험 DB가 없습니다: {db_path}')
    run = ROOT / 'outputs/integrated_body_runs' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S_%fZ')
    run.mkdir(parents=True)
    summaries = []
    request_count = 0
    for source in SOURCES:
        summary = {'매체': source, '요청': 0, '본문 확보': 0, '미확보': 0, '별도 분류': 0, '비고': HOLD.get(source, '')}
        if source in HOLD:
            summaries.append(summary)
            continue
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT * FROM articles WHERE source_name=? AND body_status='pending' AND LENGTH(COALESCE(body_clean,''))=0 ORDER BY first_seen_utc,rowid", (source,)).fetchall()
            targets = []
            for row in rows:
                status = classify(source, row['url'])
                if status:
                    conn.execute("UPDATE articles SET body_status=? WHERE url=? AND body_status='pending'", (status, row['url']))
                    summary['별도 분류'] += 1
                elif len(targets) < limit_per_source:
                    targets.append(dict(row))
        for row in targets:
            if request_count:
                time.sleep(delay)
            request_count += 1
            print(f"[{source}] {row['title']}", flush=True)
            try:
                result = extract_for_source(source, row['url'])
            except Exception as error:
                result = dict(body_status='extraction_error', body_raw='', body_clean='', error=f'{type(error).__name__}: {error}', body_checked_at_utc=datetime.now(timezone.utc).isoformat())
            result.update(source_name=source, url=row['url'], title=row['title'])
            # 상세 결과·정제 이력은 DB 갱신 전에 파일에 보존합니다.
            (run / f'{request_count:03d}.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
            with sqlite3.connect(db_path) as conn:
                conn.execute("""UPDATE articles SET original_title=?,body_raw=?,body_clean=?,body_status=?,extraction_method=?,body_checked_at_utc=? WHERE url=? AND LENGTH(COALESCE(body_clean,''))=0""", (result.get('original_title',''), result.get('body_raw',''), result.get('body_clean',''), result['body_status'], result.get('extraction_method',''), result['body_checked_at_utc'], row['url']))
            summary['요청'] += 1
            summary['본문 확보' if result.get('body_clean','').strip() else '미확보'] += 1
            print('  상태:', result['body_status'], '/ 본문:', len(result.get('body_clean','')), '자', flush=True)
        summaries.append(summary)
        (run / 'summary.json').write_text(json.dumps(summaries, ensure_ascii=False, indent=2), encoding='utf-8')
    (run / 'summary.json').write_text(json.dumps(summaries, ensure_ascii=False, indent=2), encoding='utf-8')
    print('통합 본문 처리 완료:', run)
    return summaries, run


def show_report(rows):
    """추가 패키지 설치 없이 노트북에 요약표를 표시합니다."""
    import html
    from IPython.display import HTML, display
    if not rows:
        return
    columns = list(rows[0])
    head = ''.join(f'<th>{html.escape(str(col))}</th>' for col in columns)
    body = ''.join('<tr>' + ''.join(f'<td>{html.escape(str(row.get(col,"")))}</td>' for col in columns) + '</tr>' for row in rows)
    display(HTML(f'<table border="1" cellpadding="7" style="border-collapse:collapse"><tr>{head}</tr>{body}</table>'))


def extract_engadget_body(url):
    response = requests.get(url, headers={'User-Agent': 'RSSNewsCollector/1.0'}, timeout=(8, 25))
    result = {'http_status': response.status_code, 'final_url': response.url, 'original_title': '', 'body_raw': '', 'body_clean': '', 'extraction_method': '', 'body_status': '', 'full_text_verified': False, 'body_checked_at_utc': datetime.now(timezone.utc).isoformat()}
    if response.status_code != 200:
        result['body_status'] = 'restricted' if response.status_code in (401, 402, 403, 451) else 'http_error'
        return result
    soup = BeautifulSoup(response.content, 'html.parser')
    heading = soup.find('h1')
    if heading:
        result['original_title'] = heading.get_text(' ', strip=True)
    containers = soup.select('article.news-post .news-article .columns-holder')
    if not containers:
        result['body_status'] = 'no_body_container'
        return result
    raw_parts = []
    clean_parts = []
    for container in containers:
        raw_parts.extend((tag.get_text(' ', strip=True) for tag in container.select('p, h2, h3, ul, ol, blockquote') if not tag.find_parent(['p', 'ul', 'ol', 'blockquote'])))
        cleaned = BeautifulSoup(str(container), 'html.parser')
        for tag in cleaned.select('script, style, nav, aside, footer, form, button, figure, figcaption'):
            tag.decompose()
        clean_parts.extend((tag.get_text(' ', strip=True) for tag in cleaned.select('p, h2, h3, ul, ol, blockquote') if not tag.find_parent(['p', 'ul', 'ol', 'blockquote'])))
    result['body_raw'] = '\n\n'.join((part for part in raw_parts if part))
    result['body_clean'] = '\n\n'.join((part for part in clean_parts if part))
    result['extraction_method'] = 'Engadget: all columns-holder body blocks v1'
    result['body_status'] = 'candidate_review' if result['body_clean'] else 'no_body'
    return result

def extract_cnbc_body(url):
    response = requests.get(url, headers={'User-Agent': 'RSSNewsCollector/1.0'}, timeout=(8, 25))
    result = {'http_status': response.status_code, 'final_url': response.url, 'original_title': '', 'body_raw': '', 'body_clean': '', 'body_status': '', 'extraction_method': '', 'full_text_verified': False, 'body_checked_at_utc': datetime.now(timezone.utc).isoformat()}
    if response.status_code != 200:
        result['body_status'] = 'restricted' if response.status_code in (401, 402, 403, 451) else 'http_error'
        return result
    soup = BeautifulSoup(response.content, 'html.parser')
    heading = soup.find('h1')
    if heading:
        result['original_title'] = heading.get_text(' ', strip=True)
    blocks = soup.select('.ArticleBody-articleBody')
    raw_parts = []
    clean_parts = []
    for block in blocks:
        raw_parts.append(block.get_text('\n', strip=True))
        cleaned = BeautifulSoup(str(block), 'html.parser')
        for tag in cleaned.select('script, style, nav, aside, footer, form, button, figure, figcaption'):
            tag.decompose()
        for tag in cleaned.select('p, h2, h3, ul, ol, blockquote'):
            if tag.find_parent(['p', 'ul', 'ol', 'blockquote']):
                continue
            text = tag.get_text(' ', strip=True)
            if text:
                clean_parts.append(text)
    result['body_raw'] = '\n\n'.join(raw_parts)
    result['body_clean'] = '\n\n'.join(clean_parts)
    result['extraction_method'] = 'CNBC: ArticleBody containers v2'
    visible = BeautifulSoup(response.content, 'html.parser')
    for tag in visible.select('script, style, nav, header, footer'):
        tag.decompose()
    visible_text = ' '.join(visible.get_text(' ', strip=True).lower().split())
    confirmed_pro_notice = 'read this article and get essential investing tools' in visible_text and 'when you become a pro member you unlock' in visible_text
    if confirmed_pro_notice:
        result['body_status'] = 'subscription_review'
        result['review_reason'] = 'CNBC Pro 구독 장벽 문구 확인'
    elif result['body_clean']:
        result['body_status'] = 'candidate_review'
    elif blocks:
        result['body_status'] = 'no_body'
    else:
        result['body_status'] = 'no_body_container'
    return result

def _bbc_extractor_before_cleanup(url):
    response = requests.get(url, headers={'User-Agent': 'RSSNewsCollector/1.0'}, timeout=(8, 25))
    result = {'http_status': response.status_code, 'final_url': response.url, 'original_title': '', 'body_raw': '', 'body_clean': '', 'body_status': '', 'extraction_method': '', 'full_text_verified': False, 'body_checked_at_utc': datetime.now(timezone.utc).isoformat()}
    if response.status_code != 200:
        result['body_status'] = 'restricted' if response.status_code in (401, 402, 403, 451) else 'http_error'
        return result
    soup = BeautifulSoup(response.content, 'html.parser')
    heading = soup.find('h1')
    if heading:
        result['original_title'] = heading.get_text(' ', strip=True)
    article = soup.find('article')
    if article is None:
        result['body_status'] = 'no_body_container'
        return result
    result['body_raw'] = article.get_text('\n', strip=True)
    cleaned = BeautifulSoup(str(article), 'html.parser')
    for tag in cleaned.select('script, style, nav, aside, footer, form, button, figure, figcaption'):
        tag.decompose()
    text_blocks = cleaned.select('[data-component="text-block"]')
    if text_blocks:
        parts = [block.get_text(' ', strip=True) for block in text_blocks]
        method = 'BBC: text-block v1'
    else:
        parts = [tag.get_text(' ', strip=True) for tag in cleaned.select('p, h2, h3')]
        method = 'BBC: article paragraphs fallback v1'
    result['body_clean'] = '\n\n'.join((part for part in parts if part))
    result['extraction_method'] = method
    result['body_status'] = 'candidate_review' if result['body_clean'] else 'no_body'
    return result

def clean_bbc_text(text):
    exact_notices = {'live: follow latest updates', 'results: the latest from around the country', 'reaction: ecstatic scenes and historic moments', 'guide: what are the us midterms?', "newsletter: sign up for anthony zurcher's analysis in your inbox", 'related topics'}

    def normalize(value):
        value = value.replace('’', "'").replace('\xa0', ' ')
        return ' '.join(value.split()).strip().casefold()
    kept = []
    removed = []
    for paragraph in re.split('\\n\\s*\\n', text):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        normalized = normalize(paragraph)
        is_exact_notice = normalized in exact_notices
        is_newsletter_promotion = normalized.startswith("follow the twists and turns of trump's second term") and 'us politics unspun newsletter' in normalized
        is_signup_notice = normalized in {'readers in the uk can sign up here.', 'those outside the uk can sign up here.', 'readers in the uk can sign up here. those outside the uk can sign up here.'}
        if is_exact_notice or is_newsletter_promotion or is_signup_notice:
            removed.append(paragraph)
        else:
            kept.append(paragraph)
    return ('\n\n'.join(kept), removed)

def extract_bbc_body(url):
    result = _bbc_extractor_before_cleanup(url)
    before = result.get('body_clean', '')
    after, removed = clean_bbc_text(before)
    result['body_before_cleanup'] = before
    result['body_clean'] = after
    result['removed_paragraphs'] = removed
    result['cleanup_rule_version'] = 'bbc_notices_v1'
    if before:
        result['body_status'] = 'candidate_review' if after else 'no_body'
    return result

def extract_guardian_body(url):
    response = requests.get(url, headers={'User-Agent': 'RSSNewsCollector/1.0'}, timeout=(8, 25))
    result = {'http_status': response.status_code, 'final_url': response.url, 'original_title': '', 'body_raw': '', 'body_clean': '', 'body_status': '', 'extraction_method': '', 'full_text_verified': False, 'body_checked_at_utc': datetime.now(timezone.utc).isoformat()}
    if response.status_code != 200:
        result['body_status'] = 'restricted' if response.status_code in (401, 402, 403, 451) else 'http_error'
        return result
    soup = BeautifulSoup(response.content, 'html.parser')
    heading = soup.find('h1')
    if heading:
        result['original_title'] = heading.get_text(' ', strip=True)
    body = None
    selected = ''
    for selector in ('.article-body-commercial-selector', '.article-body-viewer-selector', '.content__article-body', '[itemprop="articleBody"]'):
        candidate = soup.select_one(selector)
        if candidate is not None and candidate.select('p'):
            body = candidate
            selected = selector
            break
    if body is None:
        result['body_status'] = 'no_body_container'
        return result
    result['body_raw'] = body.get_text('\n', strip=True)
    cleaned = BeautifulSoup(str(body), 'html.parser')
    for tag in cleaned.select('script, style, nav, aside, footer, form, button, figure, figcaption'):
        tag.decompose()
    for tag in cleaned.select('[aria-hidden="true"]'):
        tag.decompose()
    parts = []
    for tag in cleaned.select('p, h2, h3, ul, ol, blockquote'):
        if tag.find_parent(['p', 'ul', 'ol', 'blockquote']):
            continue
        text = tag.get_text(' ', strip=True)
        if text:
            parts.append(text)
    result['body_clean'] = '\n\n'.join(parts)
    result['extraction_method'] = f'Guardian: {selected} v1'
    result['body_status'] = 'candidate_review' if result['body_clean'] else 'no_body'
    return result

def extract_techcrunch_body(url):
    response = requests.get(url, headers={'User-Agent': 'RSSNewsCollector/1.0'}, timeout=(8, 25))
    result = {'http_status': response.status_code, 'final_url': response.url, 'original_title': '', 'body_raw': '', 'body_clean': '', 'body_status': '', 'extraction_method': '', 'full_text_verified': False, 'body_checked_at_utc': datetime.now(timezone.utc).isoformat()}
    if response.status_code != 200:
        result['body_status'] = 'restricted' if response.status_code in (401, 402, 403, 451) else 'http_error'
        return result
    soup = BeautifulSoup(response.content, 'html.parser')
    heading = soup.find('h1')
    if heading:
        result['original_title'] = heading.get_text(' ', strip=True)
    body = None
    selected = ''
    for selector in ('.entry-content', '.wp-block-post-content', '[itemprop="articleBody"]', '.article-content'):
        candidate = soup.select_one(selector)
        if candidate is not None and candidate.select('p'):
            body = candidate
            selected = selector
            break
    if body is None:
        result['body_status'] = 'no_body_container'
        return result
    result['body_raw'] = body.get_text('\n', strip=True)
    cleaned = BeautifulSoup(str(body), 'html.parser')
    for tag in cleaned.select('script, style, nav, aside, footer, form, button, figure, figcaption, iframe, video'):
        tag.decompose()
    parts = []
    for tag in cleaned.select('p, h2, h3, ul, ol, blockquote'):
        if tag.find_parent(['p', 'ul', 'ol', 'blockquote']):
            continue
        text = tag.get_text(' ', strip=True)
        if text:
            parts.append(text)
    result['body_clean'] = '\n\n'.join(parts)
    result['extraction_method'] = f'TechCrunch: {selected} v1'
    result['body_status'] = 'candidate_review' if result['body_clean'] else 'no_body'
    return result

def extract_mit_body(url):
    response = requests.get(url, headers={'User-Agent': 'RSSNewsCollector/1.0'}, timeout=(8, 25))
    result = {'http_status': response.status_code, 'final_url': response.url, 'original_title': '', 'body_raw': '', 'body_clean': '', 'body_status': '', 'extraction_method': '', 'full_text_verified': False, 'body_checked_at_utc': datetime.now(timezone.utc).isoformat()}
    if response.status_code != 200:
        result['body_status'] = 'restricted' if response.status_code in (401, 402, 403, 451) else 'http_error'
        return result
    soup = BeautifulSoup(response.content, 'html.parser')
    heading = soup.find('h1')
    if heading:
        result['original_title'] = heading.get_text(' ', strip=True)
    candidates = soup.select('[class*="contentBody__content--"]')
    candidate_ids = {id(tag) for tag in candidates}
    blocks = [tag for tag in candidates if not any((id(parent) in candidate_ids for parent in tag.parents))]
    if not blocks:
        result['body_status'] = 'no_body_container'
        return result
    raw_parts = []
    clean_parts = []
    for block in blocks:
        raw_parts.append(block.get_text('\n', strip=True))
        cleaned = BeautifulSoup(str(block), 'html.parser')
        for tag in cleaned.select('script, style, nav, aside, footer, form, button, figure, figcaption, iframe, video'):
            tag.decompose()
        for tag in cleaned.select('p, h2, h3, ul, ol, blockquote'):
            if tag.find_parent(['p', 'ul', 'ol', 'blockquote']):
                continue
            text = tag.get_text(' ', strip=True)
            if text:
                clean_parts.append(text)
    result['body_raw'] = '\n\n'.join(raw_parts)
    result['body_clean'] = '\n\n'.join(clean_parts)
    result['extraction_method'] = 'MIT: contentBody blocks v1'
    result['body_status'] = 'candidate_review' if result['body_clean'] else 'no_body'
    return result

def extract_abc_body(url):
    response = requests.get(url, headers={'User-Agent': 'RSSNewsCollector/1.0'}, timeout=(8, 25))
    result = {'http_status': response.status_code, 'final_url': response.url, 'original_title': '', 'body_raw': '', 'body_clean': '', 'body_status': '', 'extraction_method': '', 'removed_sections': [], 'full_text_verified': False, 'body_checked_at_utc': datetime.now(timezone.utc).isoformat()}
    if response.status_code != 200:
        result['body_status'] = 'restricted' if response.status_code in (401, 402, 403, 451) else 'http_error'
        return result
    soup = BeautifulSoup(response.content, 'html.parser')
    heading = soup.find('h1')
    if heading:
        result['original_title'] = heading.get_text(' ', strip=True)
    body = None
    selected = ''
    for selector in ('[data-testid="prism-article-body"]', '.Article__Content', '.article-copy', '[itemprop="articleBody"]'):
        candidate = soup.select_one(selector)
        if candidate is not None and candidate.select('p'):
            body = candidate
            selected = selector
            break
    if body is None:
        result['body_status'] = 'no_body_container'
        return result
    result['body_raw'] = body.get_text('\n', strip=True)
    cleaned = BeautifulSoup(str(body), 'html.parser')
    for section in list(cleaned.select('section[data-testid="prism-collection"]')):
        section_heading = section.find(['h2', 'h3'])
        if section_heading and section_heading.get_text(' ', strip=True).casefold() == 'popular reads':
            result['removed_sections'].append(section.get_text(' ', strip=True))
            section.decompose()
    for tag in cleaned.select('script, style, nav, aside, footer, form, button, figure, figcaption, iframe, video'):
        tag.decompose()
    parts = []
    for tag in cleaned.select('p, h2, h3, ul, ol, blockquote'):
        if tag.find_parent(['p', 'ul', 'ol', 'blockquote']):
            continue
        text = tag.get_text(' ', strip=True)
        if text:
            parts.append(text)
    result['body_clean'] = '\n\n'.join(parts)
    result['extraction_method'] = f'ABC: {selected} v1'
    result['body_status'] = 'candidate_review' if result['body_clean'] else 'no_body'
    return result

def check_abc_article_url(url):
    try:
        parsed = urlsplit(url)
    except ValueError:
        return (False, '주소 해석 실패')
    if parsed.scheme not in ('https', 'http'):
        return (False, '지원하지 않는 주소 형식')
    if '://' in url.split('://', 1)[-1]:
        return (False, '주소가 중복 결합됨')
    if parsed.hostname not in {'abcnews.com', 'www.abcnews.com', 'abcnews.go.com', 'www.abcnews.go.com'}:
        return (False, 'ABC 기사 도메인 아님')
    path = parsed.path.lower()
    if '/widgets/' in path:
        return (False, '기사 아닌 위젯')
    if any((part in path for part in ('/video/', '/live/', '/photos/'))):
        return (False, '별도 유형 검토 필요')
    if '/story' not in path and '/wirestory/' not in path:
        return (False, '일반 기사 경로 확인 필요')
    return (True, '')
