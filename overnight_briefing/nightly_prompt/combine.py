"""종목별 종합 한 줄(노란띠 + 연결된 뉴스)과 시장 한 줄을 만든다.

원칙(설계서 §11.4): 뉴스·LLM은 띠의 중심·폭을 바꾸지 않는다. 띠 숫자는 07:30 카드 그대로 넣고, 한 줄에 나온 숫자가
입력 숫자와 다르거나 인과 단정·권유 말이 있으면 규칙 문장으로 바꾸고 checked=False로 남긴다. 관련 뉴스가 없는
종목은 LLM을 부르지 않는다(연결 없이 지어낼 위험을 없앰). 개장 뒤 결과는 입력에 넣지 않는다.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

from extract import CAUSAL, FORBIDDEN, HISTORY, LLM, P_COMBINE, P_MARKET

DAYS_DIR = Path(os.environ.get('NIGHTLY_DAYS_DIR', '~/4Digit/src/app/data/model/days')).expanduser()


def pct(v, nd=1):
    s = f'{v * 100:+.{nd}f}'
    return (f'{0:.{nd}f}' if float(s) == 0 else s) + '%'      # '-0.0%' 대신 '0.0%'


def load_card(T: str):
    """07:30 카드의 종목 띠(H·80% 구간)와 08:11 등급, 시장 야간선물. 개장 뒤 결과(after_open)는 읽지 않는다."""
    d = json.loads((DAYS_DIR / f'{T}.json').read_text(encoding='utf-8'))
    c730, c811 = d['card_0730'], d.get('card_0811') or {}
    g811 = {s['code']: s.get('grade_0811') for s in c811.get('stocks', [])}
    bands = {}
    for s in c730['stocks']:
        if s.get('H') is None or not s.get('band80'):
            continue
        bands[s['code']] = dict(H=s['H'], L80=s['band80'][0], U80=s['band80'][1], grade_0811=g811.get(s['code']),
                                base_close=(s.get('base_close') or {}).get('value'),
                                cautions=[c.get('text') if isinstance(c, dict) else str(c) for c in s.get('cautions') or []])
    market = dict(x=c730['market'].get('x'),
                  cautions=[c.get('text') for c in c730['market'].get('cautions') or [] if isinstance(c, dict)])
    return bands, market


def _numbers(s):
    return re.findall(r'[+−-]?\d+(?:\.\d+)?', s.replace('−', '-'))


def check_line(line: str, allowed: set[str]) -> list[str]:
    issues = [f'인과 단정 "{w}"' for w in CAUSAL if w in line] + [f'금지어 "{w}"' for w in FORBIDDEN if w in line]
    issues += [f'과거 통계 "{m.group(0)}"' for m in HISTORY.finditer(line)]
    for n in _numbers(line):
        if n.lstrip('+-') not in allowed:
            issues.append(f'입력에 없는 숫자 {n}')
    return issues


def band_phrase(b):
    return f"오늘 시가 범위는 {pct(b['L80'])} ~ {pct(b['U80'])}(중심 {pct(b['H'])})예요"


def stance_of(H, direction):
    if direction in ('엇갈림', '불명') or H is None:
        return 'unclear'
    up = direction == '위쪽'
    if abs(H) < 0.001:
        return 'unclear'
    return 'aligned' if (H > 0) == up else 'opposed'


def combine_stock(llm: LLM, name: str, band: dict | None, news: list[dict]) -> dict:
    if not news:                                     # v3: 띠 숫자는 화면에 따로 있으므로 한 줄에 다시 쓰지 않는다
        return dict(line_ko='밤사이 이 종목과 이어진 미국 기사는 없었어요.', stance='no_news', news_direction=None, used_news=[], checked=True, issues=[], source='rule')
    payload = dict(종목=name,
                   뉴스=[dict(id=n['id'], 요약=n['short_summary_ko'], 연결=n['relation']['path'], 연결_이유=n['reason'],
                             매체수=n['media_count'], 이야기=(n.get('story') or {}).get('status') or '', 종목쪽_방향=n['impact'],
                             주요_사실=n.get('facts', [])[:3])
                         for n in news[:3]])
    text = json.dumps(payload, ensure_ascii=False, indent=1)
    res, cached, cost = llm.call('combine', P_COMBINE, text)
    allowed = {'1', '2', '3'}                        # '뉴스 2건' 같은 개수 표현
    allowed |= {n.lstrip('+-') for n in _numbers(text)}   # 입력(띠·뉴스 요약·사실)에 있는 숫자만 허용
    issues = check_line(res['line_ko'], allowed)
    line, src = res['line_ko'], 'llm'
    if issues:                                       # 검사 실패 → 규칙 문장(띠 + 가장 중요한 뉴스 요약)
        line = f"밤사이 이어진 소식이 있어요: {news[0]['short_summary_ko']}"
        src = 'rule_fallback'
    return dict(line_ko=line, stance=stance_of(band['H'] if band else None, res['news_direction']),
                news_direction=res['news_direction'], used_news=res['used_news'], checked=not issues, issues=issues,
                source=src, llm_line=res['line_ko'] if issues else None)


def market_line(llm: LLM, market: dict, items: list[dict]) -> dict:
    x = market.get('x')
    if not items:
        line = f"코스피200 야간선물은 {pct(x, 2)} 움직였어요. 시장 전체 미국 소식은 따로 잡히지 않았어요." if x is not None else ''
        return dict(line_ko=line, checked=True, issues=[], source='rule')
    payload = dict(야간선물_변화율=pct(x, 2) if x is not None else '없음',
                   시장_뉴스=[dict(id=i['id'], 요약=i['short_summary_ko'], 주제=i['topics'], 매체수=i['media_count']) for i in items[:5]])
    text = json.dumps(payload, ensure_ascii=False, indent=1)
    res, cached, cost = llm.call('market', P_MARKET, text)
    allowed = {f'{abs(x * 100):.2f}', f'{abs(x * 100):.1f}'} if x is not None else set()
    allowed |= {'200', '1', '2', '3', '5'} | {n.lstrip('+-') for n in _numbers(text)}
    issues = check_line(res['line_ko'], allowed)
    line, src = res['line_ko'], 'llm'
    if issues:
        line = f"코스피200 야간선물은 {pct(x, 2)} 움직였어요. 시장 소식: {items[0]['short_summary_ko']}"
        src = 'rule_fallback'
    return dict(line_ko=line, checked=not issues, issues=issues, source=src, used_items=res['used_items'],
                llm_line=res['line_ko'] if issues else None)
