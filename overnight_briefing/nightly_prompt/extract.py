"""밤사이 뉴스 묶음 하나를 nightly_extract 지시문(판은 P_EXTRACT)으로 추출하고, 코드로 근거·금지어를 검사한다.

LLM 호출은 OpenAI Responses API(엄격 JSON 스키마, store=False)만 쓴다. 같은 입력·지시문·모델이면 저장해 둔
원본 응답을 다시 쓰고 API를 부르지 않는다. 키는 .env에서 읽고 어디에도 쓰지 않는다.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROMPTS = HERE / 'prompts'
MODEL = os.environ.get('NIGHTLY_MODEL', 'gpt-6.1-terra')      # 그래프 구축과 같은 모델(nightly_prompt_requirements.md 6장)
EFFORT = os.environ.get('NIGHTLY_EFFORT', 'medium')
PRICES = {'gpt-6.1-terra': (1.00, 0.05, 5.00), 'gpt-6.1-sol': (2.00, 0.10, 10.00), 'gpt-6-luna': (0.10, 0.01, 0.50)}  # $/1M (입력, 캐시 입력, 출력)
ENV_FILE = Path(os.environ.get('NIGHTLY_ENV_FILE', '~/4Digit-solo/.env')).expanduser()

FORBIDDEN = ['적중', '매수하', '매도하', '사세요', '파세요', '추천합니다', '확실히 오', '확실히 내']
CAUSAL = ['때문', '로 인해', '으로 인해', '덕분', '탓에', '탓으로']
# 11/17 v2: 과거 통계·역대 패턴 문장(앞날을 말하는 것처럼 읽힘)을 코드로도 거른다
HISTORY = re.compile(r'\d{4}년 이후|역대|매번|해마다|때마다|이후 모두|이후 한 번도')
# 지금 쓰는 지시문 판(바꾸면 brief.json의 prompt_version·해시가 따라 바뀐다)
P_EXTRACT, P_COMBINE, P_MARKET = 'nightly_extract_v2', 'combine_v2', 'market_v2'
TYPE_KO = {'earnings_financials': '실적·재무', 'merger_acquisition': '인수합병·지분', 'investment_capacity': '투자·설비',
           'product_technology': '제품·기술', 'supply_customer_contract': '계약·공급망', 'management_strategy': '경영·인사',
           'regulation_trade': '규제·통상', 'litigation_safety': '소송·사고', 'analyst_rating': '증권사 의견',
           'monetary_policy': '금리·통화정책', 'economic_data': '경제지표', 'fx': '환율', 'commodities': '원자재',
           'fiscal_policy': '정부·재정', 'geopolitics': '지정학', 'market_movement': '시황', 'other': '기타'}


def prompt(name):
    """지시문 글과 스키마, 그리고 둘을 합친 짧은 해시(버전 확인용)."""
    text = (PROMPTS / f'{name}.md').read_text(encoding='utf-8')
    schema = json.loads((PROMPTS / f'{name}.schema.json').read_text(encoding='utf-8'))
    h = hashlib.sha256((text + json.dumps(schema, sort_keys=True)).encode()).hexdigest()[:12]
    return text, schema, h


def _env():
    env = {}
    for line in ENV_FILE.read_text().splitlines():
        m = re.match(r'\s*([A-Z_]+)\s*=\s*(.*)', line)
        if m:
            env[m[1]] = m[2].strip().strip('"').strip("'")
    return env


class LLM:
    """OpenAI 호출 + 원본 응답 캐시 + 비용 누적. 비용 상한을 넘으면 새 호출을 막는다."""

    def __init__(self, raw_dir: Path, max_cost: float = 8.0):
        self.raw_dir = raw_dir
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.max_cost = max_cost
        self.spent = 0.0
        self.calls = 0
        self.cache_hits = 0
        self.tokens = dict(input=0, cached=0, output=0, reasoning=0)
        self._lock = threading.Lock()
        self._client = None

    def client(self):
        if self._client is None:
            import openai
            env = _env()
            self._client = openai.OpenAI(api_key=env['OPENAI_API_KEY'], organization=env.get('OPENAI_ORG_ID') or None,
                                         project=env.get('OPENAI_PROJECT_ID') or None)
        return self._client

    @staticmethod
    def cost(usage, model=MODEL):
        p_in, p_cache, p_out = PRICES[model]
        cached = usage.get('cached', 0)
        return ((usage['input'] - cached) * p_in + cached * p_cache + usage['output'] * p_out) / 1e6

    def call(self, kind: str, name: str, text: str):
        """name 지시문으로 text를 보낸다. (결과 dict, 캐시였는지, 이번 호출 비용)."""
        instructions, schema, phash = prompt(name)
        key = hashlib.sha256(f'{name}|{phash}|{MODEL}|{EFFORT}|{text}'.encode()).hexdigest()[:16]
        path = self.raw_dir / f'{kind}_{key}.json'
        if path.exists():
            rec = json.loads(path.read_text(encoding='utf-8'))
            with self._lock:
                self.cache_hits += 1
            return rec['result'], True, 0.0
        with self._lock:
            if self.spent >= self.max_cost:
                raise RuntimeError(f'비용 상한 ${self.max_cost:.2f}에 닿아 새 호출을 멈춤(지금 ${self.spent:.2f})')
        t0 = time.time()
        for attempt in range(3):
            try:
                resp = self.client().responses.create(
                    model=MODEL, instructions=instructions, input=text, reasoning={'effort': EFFORT}, store=False,
                    text={'format': {'type': 'json_schema', 'name': name.replace('.', '_'), 'schema': schema, 'strict': True}})
                break
            except Exception as e:                       # 일시 오류만 다시 시도(메시지에 키가 섞이지 않게 종류만 남긴다)
                if attempt == 2:
                    raise RuntimeError(f'{kind} 호출 실패: {type(e).__name__}') from None
                time.sleep(3 * (attempt + 1))
        u = resp.usage
        usage = dict(input=u.input_tokens, output=u.output_tokens,
                     cached=getattr(getattr(u, 'input_tokens_details', None), 'cached_tokens', 0) or 0,
                     reasoning=getattr(getattr(u, 'output_tokens_details', None), 'reasoning_tokens', 0) or 0)
        c = self.cost(usage)
        result = json.loads(resp.output_text)
        rec = dict(kind=kind, prompt=name, prompt_hash=phash, model=resp.model, effort=EFFORT, input_hash=key,
                   run_utc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), seconds=round(time.time() - t0, 1),
                   usage=usage, cost_usd=round(c, 5), input=text, result=result)
        path.write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding='utf-8')
        with self._lock:
            self.spent += c
            self.calls += 1
            for k in self.tokens:
                self.tokens[k] += usage.get(k, 0)
        return result, False, c


# ── 묶음 → 입력 글 ──────────────────────────────────────────────────────────

def cluster_text(c: dict) -> str:
    a = c['article']
    imp = c['importance']
    st = c.get('story') or {}
    lines = [f"보고 날짜: {c['report']} / 차수: {c['label']} / 묶음: {c['cluster']}",
             f"묶음 크기: 기사 {imp['n_articles']}건, 서로 다른 매체 {imp['n_outlets']}곳 ({imp.get('outlets', '')})",
             f"이야기: {st.get('status', '새 소식')}" + (f" / 이전 묶음 제목: {' | '.join(st.get('earlier') or [])}" if st.get('earlier') else ''),
             '', '[대표 기사]', f"Title: {a['title']}", f"Source: {a['outlet']}", f"Published (UTC): {a['published_utc']}", '',
             (a['body'] or '').strip()[:14000] if a.get('body_ok') else '본문 없음', '']
    if c.get('other_titles'):
        lines += ['[같은 묶음의 다른 제목]'] + [f'- {t}' for t in c['other_titles']] + ['']
    lines.append('[종목 목록]')
    for i, co in enumerate(c['companies'], 1):
        lines.append(f"{i}) {co['company']} — 대표 제목: {co['rep_title']} ({co['rep_outlet']}), "
                     f"대표가 본문과 같은 기사: {'예' if co.get('rep_is_body') else '아니오'}")
        lines.append(f"   검색어: {co.get('terms', '')} ({co.get('kinds', '')})")
        for j, ev in enumerate(co.get('evidence') or [], 1):
            lines.append(f'   연결 근거 {j}: {ev}')
    return '\n'.join(lines)


def _norm(s):
    return re.sub(r'\s+', ' ', (s or '').replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')).strip()


def check(result: dict, c: dict) -> list[str]:
    """코드 검사: 근거 인용이 원문에 그대로 있는지, 종목 목록이 맞는지, 금지어가 없는지."""
    issues = []
    a = c['article']
    src = _norm(a['title'] + ' ' + (a.get('body') or ''))
    for i, ev in enumerate(result.get('evidence') or []):
        if _norm(ev['quote']) not in src:
            issues.append(f'근거 {i} 인용이 원문에 없음')
    want = [co['company'] for co in c['companies']]
    got = [s['company'] for s in result.get('stocks') or []]
    if sorted(want) != sorted(got):
        issues.append(f'종목 목록 불일치: 입력 {want} / 출력 {got}')
    ko = [result['article_profile']['short_summary']] + [s['reason'] + ' ' + s['impact_basis'] for s in result.get('stocks') or []]
    for t in ko:
        for w in FORBIDDEN:
            if w in t:
                issues.append(f'금지어 "{w}"')
    return issues


def extract_cluster(llm: LLM, c: dict) -> dict:
    text = cluster_text(c)
    result, cached, cost = llm.call('extract', P_EXTRACT, text)
    return dict(result=result, issues=check(result, c), cached=cached, cost=cost)
