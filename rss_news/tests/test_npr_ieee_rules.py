"""NPR·IEEE 통합 연결 검사. 모든 HTTP 요청을 가상 응답으로 대체합니다."""
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
import integrated_notebook_bodies as rules


class IntegratedRuleTests(unittest.TestCase):
    def response(self, url, page):
        return SimpleNamespace(status_code=200, url=url, content=page.encode('utf-8'))

    def transcript(self):
        return '<div id="storytext"><p>SACHA PFEIFFER, HOST: Tell us about the port.</p><p>REPORTER: Shipping activity has changed.</p></div>'

    def test_npr_inline_transcript(self):
        url = 'https://www.npr.org/test-story'
        with patch('requests.sessions.Session.request', return_value=self.response(url, self.transcript())) as request:
            result = rules.extract_for_source('NPR', url)
        self.assertEqual(result.get('body_kind'), 'public_transcript', result)
        self.assertIn('REPORTER:', result['body_clean'])
        self.assertEqual(request.call_count, 1)

    def test_npr_follows_public_transcript_link(self):
        article = 'https://www.npr.org/test-story'
        transcript = 'https://www.npr.org/transcripts/test'
        pages = {article: '<div id="storytext"><p>Introduction only.</p></div><a href="/transcripts/test">Transcript</a>', transcript: self.transcript()}
        def fake_request(method, url, **kwargs):
            if url not in pages:
                raise AssertionError('가상 목록에 없는 주소입니다. 실제 접속은 하지 않습니다.')
            return self.response(url, pages[url])
        with patch('requests.sessions.Session.request', side_effect=fake_request) as request:
            result = rules.extract_for_source('NPR', article)
        self.assertEqual(result.get('body_kind'), 'public_transcript', result)
        self.assertEqual(result['final_url'], transcript)
        self.assertEqual(request.call_count, 2)

    def test_npr_normal_article_reuses_response(self):
        url = 'https://www.npr.org/test-normal'
        page = '<div id="storytext"><p>This is a normal article paragraph.</p></div>'
        with patch('requests.sessions.Session.request', return_value=self.response(url, page)) as request:
            result = rules.extract_for_source('NPR', url)
        self.assertNotEqual(result.get('body_kind'), 'public_transcript')
        self.assertIn('normal article paragraph', result['body_clean'])
        self.assertEqual(request.call_count, 1)

    def test_ieee_poetry_excluded(self):
        url = 'https://spectrum.ieee.org/test-poem'
        page = '<meta property="article:tag" content="poetry"><h1>Poetry for Engineers</h1><div class="body-description"><p>A poem.</p></div>'
        with patch('requests.sessions.Session.request', return_value=self.response(url, page)):
            result = rules.extract_for_source('IEEE Spectrum', url)
        self.assertEqual(result['body_status'], 'poetry_excluded')
        self.assertEqual(result['body_clean'], '')
        self.assertIn('A poem.', result['body_raw'])

    def test_ieee_normal_article_retained(self):
        url = 'https://spectrum.ieee.org/test-science'
        page = '<meta property="article:tag" content="science"><h1>Science report</h1><div class="body-description"><p>Normal science article.</p></div>'
        with patch('requests.sessions.Session.request', return_value=self.response(url, page)):
            result = rules.extract_for_source('IEEE Spectrum', url)
        self.assertNotEqual(result['body_status'], 'poetry_excluded')
        self.assertIn('Normal science article.', result['body_clean'])


if __name__ == '__main__':
    unittest.main()
