
"""시험한 NPR 대본 탐색·IEEE 유형 분류 함수."""
import re
import requests
from urllib.parse import urljoin, urlsplit
from bs4 import BeautifulSoup


def find_transcript_text(soup):
    candidates = []
    for selector in ('.transcript', '#transcript', '[data-testid="transcript"]', '#storytext', '.storytext'):
        for node in soup.select(selector):
            copied = BeautifulSoup(str(node), 'html.parser')
            for tag in copied.select('script, style, nav, aside, form, button'):
                tag.decompose()
            paragraphs = [tag.get_text(' ', strip=True) for tag in copied.select('p')]
            text = '\n\n'.join((paragraph for paragraph in paragraphs if paragraph))
            if not text:
                text = copied.get_text('\n', strip=True)
            speaker_labels = re.findall("(?m)^\\s*[A-Z][A-Z .,'’\\-]{1,80}:\\s*\\S", text)
            if len(speaker_labels) >= 2:
                candidates.append({'text': text, 'selector': selector, 'speaker_count': len(speaker_labels)})
    if not candidates:
        return None
    return max(candidates, key=lambda item: (item['speaker_count'], len(item['text'])))

def find_transcript_link(soup, page_url):
    for link in soup.select('a[href]'):
        href = link.get('href', '')
        label = ' '.join([link.get_text(' ', strip=True), link.get('aria-label', '')]).casefold()
        target = urljoin(page_url, href)
        parsed = urlsplit(target)
        if parsed.scheme in ('http', 'https') and parsed.hostname in ('npr.org', 'www.npr.org') and ('transcript' in label or '/transcripts/' in parsed.path.casefold()) and (parsed.path != urlsplit(page_url).path):
            return target
    return None

def fetch_npr_transcript(article_url):
    result = {'article_url': article_url, 'transcript_url': '', 'status': '', 'body': '', 'speaker_count': 0, 'full_text_verified': False}
    with requests.Session() as session:
        session.headers.update({'User-Agent': 'RSSNewsCollector/1.0'})
        page = session.get(article_url, timeout=(8, 25))
        result['_article_html'] = page.content
        result['_article_http'] = page.status_code
        result['_article_url'] = page.url
        print('기사 HTTP:', page.status_code)
        if page.status_code != 200:
            result['status'] = '기사 접근 실패'
            return result
        soup = BeautifulSoup(page.content, 'html.parser')
        candidate = find_transcript_text(soup)
        if candidate:
            result.update({'transcript_url': page.url, 'status': '기사 페이지에서 공개 대본 후보 확보', 'body': candidate['text'], 'speaker_count': candidate['speaker_count'], 'selector': candidate['selector']})
            return result
        transcript_url = find_transcript_link(soup, page.url)
        if not transcript_url:
            result['status'] = '공개 대본 영역·링크를 찾지 못함'
            return result
        print('찾은 대본 링크:', transcript_url)
        transcript_page = session.get(transcript_url, timeout=(8, 25))
        print('대본 HTTP:', transcript_page.status_code)
        if transcript_page.status_code != 200:
            result['status'] = '대본 페이지 접근 실패'
            return result
        transcript_soup = BeautifulSoup(transcript_page.content, 'html.parser')
        candidate = find_transcript_text(transcript_soup)
        if candidate:
            result.update({'transcript_url': transcript_page.url, 'status': '별도 링크에서 공개 대본 후보 확보', 'body': candidate['text'], 'speaker_count': candidate['speaker_count'], 'selector': candidate['selector']})
        else:
            result['status'] = '대본 링크는 찾았으나 대본 구조 미확인'
            result['transcript_url'] = transcript_page.url
    return result

def classify_ieee_page(page_content, url):
    soup = BeautifulSoup(page_content, 'html.parser')
    heading = soup.find('h1')
    title = heading.get_text(' ', strip=True) if heading else ''
    if not title:
        meta_title = soup.select_one('meta[property="og:title"]')
        title = meta_title.get('content', '') if meta_title else ''
    tags = set()
    for selector in ('meta[property="article:tag"]', 'meta[property="article:section"]', 'meta[name="keywords"]', 'meta[name="news_keywords"]'):
        for tag in soup.select(selector):
            value = tag.get('content', '')
            for item in re.split('[,;]', value):
                item = ' '.join(item.split()).strip().casefold()
                if item:
                    tags.add(item)
    poetry_tags = {'poetry', 'poem', 'poems', 'verse becomes electric'}
    matched_tags = sorted(tags & poetry_tags)
    if matched_tags:
        status = 'poetry_excluded'
        status_label = '시·문예 — 분석 대상에서 제외'
        reason = '시·문예 태그가 확인됐습니다: ' + ', '.join(matched_tags)
    elif re.search('\\bpoetry\\b|\\bpoem\\b', title, re.IGNORECASE) or '/poetry-for-engineers' in url:
        status = 'poetry_review'
        status_label = '시·문예 의심 — 확인 필요'
        reason = '제목·주소에 시 관련 단서가 있지만 명확한 태그는 확인되지 않았습니다.'
    else:
        status = 'no_poetry_signal'
        status_label = '시·문예 단서 없음'
        reason = '확인한 태그·제목·주소에서 시·문예를 가리키는 단서를 찾지 못했습니다.'
    return {'url': url, 'title': title, 'tags': sorted(tags), 'matched_tags': matched_tags, 'status': status, 'status_label': status_label, 'reason': reason}