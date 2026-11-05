"""통합 실행부의 중복·분류·저장 및 정제 회귀 검증. 실제 인터넷은 사용하지 않습니다."""
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
import integrated_notebook_bodies as rules
import rss_pipeline as pipeline


class Response:
    status_code = 200
    url = 'https://example.org/feed'

    def __init__(self, entries):
        items = ''.join(f'<item><title>{title}</title><link>{url}</link><description>summary only</description></item>' for title,url in entries)
        self.content = f'<rss version="2.0"><channel><title>test</title><link>https://example.org/</link><description>test</description>{items}</channel></rss>'.encode()

    def raise_for_status(self):
        return None


class PipelineTests(unittest.TestCase):
    def test_real_config_excludes_wired(self):
        feeds = pipeline.load_feeds()
        self.assertEqual(len(feeds), 36)
        self.assertEqual(len({r['source_name'] for r in feeds}), 19)
        self.assertNotIn('WIRED', {r['source_name'] for r in feeds})

    def test_duplicate_observations_and_no_body_refetch(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / 'new.sqlite3'
            output = Path(tmp) / 'runs'
            feeds = [dict(source_name='Engadget', feed_name=name, feed_url=f'https://example.org/feed/{name}') for name in ['one','two']]
            response = Response([('title','https://example.org/article?utm_source=test')])
            body = dict(body_status='candidate_review', body_raw='raw article', body_clean='clean article', body_checked_at_utc=pipeline.now(), extraction_method='test')
            with patch.object(pipeline.requests.Session, 'get', return_value=response), patch.object(rules,'extract_for_source',return_value=body) as extract:
                first = pipeline.collect_once(collect=True,db_path=db,output_dir=output,feeds=feeds,body_per_source=1,delay=0)
                second = pipeline.collect_once(collect=True,db_path=db,output_dir=output,feeds=feeds,body_per_source=1,delay=0)
            self.assertEqual(first['new_articles'],1)
            self.assertEqual(second['new_articles'],0)
            self.assertEqual(extract.call_count,1)
            with closing(sqlite3.connect(db)) as conn:
                self.assertEqual(conn.execute('SELECT COUNT(*) FROM article_feeds').fetchone()[0],2)
                row = conn.execute('SELECT body_raw,body_clean,full_text_verified,analysis_approved FROM articles').fetchone()
                self.assertEqual(row,('raw article','clean article',0,0))
            self.assertTrue((Path(first['output'])/'feed_01.bin').is_file())

    def test_bad_urls_and_hold_never_request_body(self):
        with tempfile.TemporaryDirectory() as tmp:
            feeds = [dict(source_name=s,feed_name='all',feed_url=f'https://example.org/{i}') for i,s in enumerate(['ABC News','Zacks','MIT Technology Review'])]
            responses = [
                Response([('bad','https://abcnews.comhttps://abcnews.com/widgets/test'),('widget','https://abcnews.com/widgets/test')]),
                Response([('held','https://example.org/zacks')]),
                Response([('held','https://example.org/mit')]),
            ]
            with patch.object(pipeline.requests.Session,'get',side_effect=responses), patch.object(rules,'extract_for_source') as extract:
                result = pipeline.collect_once(collect=True,db_path=Path(tmp)/'new.sqlite3',output_dir=Path(tmp)/'runs',feeds=feeds,delay=0)
            self.assertEqual(result['new_articles'],3)
            extract.assert_not_called()
            with closing(sqlite3.connect(result['database'])) as conn:
                states = dict(conn.execute('SELECT body_status,COUNT(*) FROM articles GROUP BY body_status'))
                self.assertEqual(states,{'body_hold':2,'non_article_review':1})
            feed_log = json.loads((Path(result['output'])/'feed_results.json').read_text(encoding='utf-8'))
            self.assertEqual(len(feed_log[0]['invalid_entries']),1)

    def test_body_failure_is_preserved_and_next_source_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            feeds = [dict(source_name=s,feed_name='all',feed_url=f'https://example.org/{s}') for s in ['Engadget','Ars Technica']]
            responses = [Response([('one',f'https://example.org/{i}')]) for i in range(2)]
            with patch.object(pipeline.requests.Session,'get',side_effect=responses), patch.object(rules,'extract_for_source',side_effect=[RuntimeError('test failure'),dict(body_status='integration_review',body_clean='body',body_raw='raw',body_checked_at_utc=pipeline.now())]):
                result = pipeline.collect_once(collect=True,db_path=Path(tmp)/'new.sqlite3',output_dir=Path(tmp)/'runs',feeds=feeds,body_per_source=1,delay=0)
            self.assertEqual(result['body_attempts'],2)
            self.assertEqual(result['body_states'],{'extraction_error':1,'integration_review':1})
            with closing(sqlite3.connect(result['database'])) as conn:
                self.assertEqual(conn.execute('SELECT COUNT(*) FROM body_attempts').fetchone()[0],2)

    def test_confirmed_body_locations_and_fool_promotion(self):
        fixtures = {
            'Business Insider': '<section data-component-type="post-body-content"><p>normal start</p><p>normal ending</p></section>',
            'Ars Technica': '<article><div class="post-content post-content-double"><p>normal start</p><h2>heading</h2><p>normal ending</p></div></article>',
            'The Motley Fool': '''<div class="article-body"><p>normal start</p>
              <h2>The $23,760 Social Security bonus most retirees completely overlook (plus 7 other costly retirement mistakes)</h2>
              <p>If you’re like most Americans, you may feel a bit behind on retirement savings. But a few little-known strategies could protect your nest egg.</p>
              <p>One easy trick could pay you more. Read our free report: <a href="https://api.fool.com/infotron/infotrack/click">8 Costly Retirement Mistakes</a>.</p>
              <p>normal ending</p></div>''',
        }
        for source,markup in fixtures.items():
            result = rules.parse_candidate_html(source,'https://example.org/article',markup,http_status=200)
            self.assertTrue(result['body_clean'].startswith('normal start'))
            self.assertTrue(result['body_clean'].endswith('normal ending'))
            if source == 'The Motley Fool':
                self.assertEqual(len(result['removed_sections']),3)
                self.assertIn('Social Security bonus',result['body_raw'])
                self.assertNotIn('Social Security bonus',result['body_clean'])

    def test_no_network_without_explicit_collect(self):
        with patch.object(pipeline.requests.Session,'get') as get:
            with self.assertRaises(ValueError):
                pipeline.collect_once()
            get.assert_not_called()

    def test_reviewed_fox_ieee_notices_preserve_real_body(self):
        fixtures = {
            'Fox Business': '''<div class="article-body"><p>The benchmark Treasury yield fell.</p>
                <p>AFFORDABILITY TAKES CENTER STAGE AS AMERICANS CAST THEIR BALLOTS IN HIGH-STAKES MIDTERMS</p>
                <p>Kalshi billboards display election odds. (Photo/Getty Images)</p>
                <p>The U.S. dollar also weakened.</p>
                <p>CLICK HERE TO GET FOX BUSINESS ON THE GO</p>
                <p>Markets overseas also moved lower.</p></div>''',
            'IEEE Spectrum': '''<div class="body-description"><p>Technical programs give students access to expertise.</p>
                <h3>From Your Site Articles</h3><ul>
                <li>IEEE Professional Development Suite Teaches In-Demand Skills ›</li>
                <li>Webinar: Will AI End Distinct Programming Languages? ›</li></ul>
                <h3>Related Articles Around the Web</h3><ul>
                <li>Free Webinars and Virtual Events from IEEE | Innovate ›</li></ul></div>'''
        }
        for source,markup in fixtures.items():
            result = rules.parse_candidate_html(source,'https://example.org/article',markup,http_status=200)
            self.assertTrue(result['removed_sections'])
            self.assertNotIn('AFFORDABILITY',result['body_clean'])
            self.assertNotIn('GET FOX BUSINESS',result['body_clean'])
            self.assertNotIn('From Your Site Articles',result['body_clean'])
            if source == 'Fox Business':
                self.assertIn('The U.S. dollar also weakened.',result['body_clean'])
                self.assertIn('Markets overseas also moved lower.',result['body_clean'])
            else:
                self.assertIn('Technical programs',result['body_clean'])


if __name__ == '__main__':
    unittest.main()
