"""밤사이 처리 결과(prompt_inputs.jsonl) → 추출 → 종목 종합·시장 한 줄 → out/<T>/brief.json.

    ~/4Digit-solo/.venv/bin/python run.py 20261116                 # 1차·2차 모두
    ~/4Digit-solo/.venv/bin/python run.py 20261116 --max-cost 8    # 비용 상한(달러, 넘으면 새 호출 멈춤)
    ~/4Digit-solo/.venv/bin/python run.py 20261116 --dry           # 호출 없이 입력 수·예상 비용만

같은 입력은 out/raw/의 원본 응답을 다시 쓴다(다시 돌려도 비용 0). 본문이 없는 묶음은 부르지 않는다.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from combine import combine_stock, load_card, market_line  # noqa: E402
from extract import (EFFORT, LLM, MODEL, P_COMBINE, P_EXTRACT, P_MARKET, P_VERIFY, TYPE_KO, VERIFY_KEEP, VERIFY_MODEL,  # noqa: E402
                     cluster_text, extract_cluster, prompt, verify_link)

REPO = HERE.parents[1]
NIGHTLY = REPO / 'news_search' / 'source' / 'nightly'
TARGETS = REPO / 'graph_db' / 'source' / 'targets.csv'
TEST_STOCKS = REPO / 'news_search' / 'source' / 'terms' / 'test_queries.csv'
OUT = HERE / 'out'
KST = dt.timezone(dt.timedelta(hours=9))


def load_inputs(T):
    """11/17 민석 갱신 뒤: 표시 시각 한 번(summary_<표시 시각>/). 그 전 날짜: 1차·2차(morning_<차수>/)."""
    d = NIGHTLY / T
    paths = sorted(d.glob('summary_*/prompt_inputs.jsonl')) or [d / f'morning_{x}' / 'prompt_inputs.jsonl' for x in ('1차', '2차')]
    rows = []
    for p in paths:
        if p.exists():
            rows += [json.loads(line) for line in p.open(encoding='utf-8') if line.strip()]
    return rows


def name_to_code():
    with TARGETS.open(encoding='utf-8-sig') as f:
        return {r['name']: r['stock_code'] for r in csv.DictReader(f)}


def test_stock_names():
    if not TEST_STOCKS.exists():
        return []
    with TEST_STOCKS.open(encoding='utf-8-sig') as f:
        rows = list(csv.DictReader(f))
    col = next((c for c in ('company', 'name', '종목') if rows and c in rows[0]), None)
    return sorted({r[col] for r in rows}) if col else []


def parse_evidence(s: str):
    """'SK하이닉스 → 공급 → Nvidia — HBM [DART 공시]' → (경로, 근거, 출처)."""
    src = ''
    if s.rstrip().endswith(']') and '[' in s:
        s, src = s.rstrip()[:-1].rsplit('[', 1)
    path, _, ev = s.partition(' — ')
    return path.strip(), ev.strip(), src.strip()


def news_items(c, ext):
    """묶음 하나의 추출 결과 → 종목별 뉴스 항목(관련 있음만)."""
    r = ext['result']
    out = {}
    if r['scope'] == '무관':
        return out
    a = c['article']
    prof = r['article_profile']
    by_name = {s['company']: s for s in r['stocks']}
    facts = [s['text'] for s in r['statements'] if s['type'] == 'fact'][:3]
    for co in c['companies']:
        s = by_name.get(co['company'])
        if not s or not s['relevant'] or s['link_kind'] == '없음':
            continue
        evs = co.get('evidence') or []
        k = (s['evidence_index'] or 1) - 1
        path, ev, src = parse_evidence(evs[k] if 0 <= k < len(evs) else (evs[0] if evs else ''))
        out[co['company']] = dict(
            id=f"{c['report']}_{c['label']}_{c['cluster']}", short_summary_ko=prof['short_summary'],
            article_types=prof['article_type'], article_types_ko=[TYPE_KO.get(t, t) for t in prof['article_type']],
            title=a['title'], url=a.get('url'), source=a['outlet'], published_at=a['published_utc'],
            story=dict(id=(c.get('story') or {}).get('story_id'), status=(c.get('story') or {}).get('status'),
                       novelty=r['novelty'], novelty_note=r['novelty_note']),
            media_count=c['importance']['n_outlets'], article_count=c['importance']['n_articles'],
            relation=dict(path=path, evidence=ev, source_ref=src, search_terms=co.get('terms'), term_kinds=co.get('kinds')),
            tone=prof['article_tone'], scope=r['scope'], link_kind=s['link_kind'], reason=s['reason'],
            impact=s['impact_for_stock'], impact_basis=s['impact_basis'], different_story=s['different_story'],
            facts=facts, batch=c['label'], checked=not ext['issues'], issues=ext['issues'])
    return out


def rank_key(n):
    return (0 if n['link_kind'] == '종목 고유' else 1, -n['media_count'], -n['article_count'])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('T')
    ap.add_argument('--max-cost', type=float, default=8.0)
    ap.add_argument('--workers', type=int, default=8)
    ap.add_argument('--dry', action='store_true')
    args = ap.parse_args()
    T = args.T

    rows = load_inputs(T)
    use = [c for c in rows if c['article'].get('body_ok')]
    skipped = [c for c in rows if not c['article'].get('body_ok')]
    chars = sum(len(cluster_text(c)) for c in use)
    instr_chars = len(prompt(P_EXTRACT)[0])
    est_in = (chars + instr_chars * len(use)) / 3.5
    est_out = 3500 * len(use)
    print(f'{T}: 묶음 {len(rows)}개(본문 있음 {len(use)}, 건너뜀 {len(skipped)}) / 예상 입력 {est_in/1e3:.0f}k·출력 {est_out/1e3:.0f}k 토큰,'
          f' 약 ${est_in/1e6*1.0 + est_out/1e6*5.0:.2f} ({MODEL}, effort={EFFORT})')
    if args.dry:
        return

    llm = LLM(OUT / 'raw', max_cost=args.max_cost)
    with ThreadPoolExecutor(args.workers) as ex:
        exts = list(ex.map(lambda c: extract_cluster(llm, c), use))

    out_dir = OUT / T
    out_dir.mkdir(parents=True, exist_ok=True)
    with (out_dir / 'extract.jsonl').open('w', encoding='utf-8') as f:
        for c, e in zip(use, exts):
            f.write(json.dumps(dict(id=f"{c['report']}_{c['label']}_{c['cluster']}", label=c['label'], cluster=c['cluster'],
                                    story_id=(c.get('story') or {}).get('story_id'), importance=c['importance'],
                                    companies=[co['company'] for co in c['companies']], issues=e['issues'], result=e['result']),
                               ensure_ascii=False) + '\n')

    # 종목별 뉴스: 같은 이야기(story_id)는 하나만(매체 수가 많은 쪽, 같으면 2차)
    codes = name_to_code()
    per_stock: dict[str, dict] = {}
    market_items = []
    for c, e in zip(use, exts):
        r = e['result']
        if r['scope'] == '시장 전체':
            market_items.append(dict(id=f"{c['report']}_{c['label']}_{c['cluster']}", short_summary_ko=r['article_profile']['short_summary'],
                                     topics=r['market_topics'], title=c['article']['title'], url=c['article'].get('url'),
                                     source=c['article']['outlet'], media_count=c['importance']['n_outlets'],
                                     article_count=c['importance']['n_articles'], tone=r['article_profile']['article_tone'],
                                     checked=not e['issues']))
        for name, n in news_items(c, e).items():
            bucket = per_stock.setdefault(name, {})
            key = n['story']['id'] if n['story']['id'] is not None else n['id']
            old = bucket.get(key)
            if old is None or (n['media_count'], n['batch']) > (old['media_count'], old['batch']):
                bucket[key] = n
    market_items.sort(key=lambda i: (-i['media_count'], -i['article_count']))

    # 교차 확인: 다른 모델이 (종목, 기사) 쌍을 다시 보고 '스침'·'무관'이면 뺀다. 뺀 것은 dropped_links에 남긴다.
    by_id = {f"{c['report']}_{c['label']}_{c['cluster']}": c for c in use}
    pairs = [(name, key, n) for name, bucket in per_stock.items() for key, n in bucket.items()]
    dropped = []
    if pairs:
        with ThreadPoolExecutor(args.workers) as ex:
            vs = list(ex.map(lambda p: verify_link(llm, by_id[p[2]['id']], p[0], p[2]), pairs))
        for (name, key, n), v in zip(pairs, vs):
            n['verify'] = v
            if v['verdict'] not in VERIFY_KEEP:
                dropped.append(dict(stock=name, id=n['id'], title=n['title'], verdict=v['verdict'], why=v['why']))
                del per_stock[name][key]
    print(f'  교차 확인({VERIFY_MODEL}): {len(pairs)}쌍 중 {len(dropped)}쌍 뺌')

    bands, market = load_card(T)
    names = sorted(set(test_stock_names()) | {co['company'] for c in rows for co in c['companies']})
    stocks = {}

    def one(name):
        code = codes.get(name)
        news = sorted(per_stock.get(name, {}).values(), key=rank_key)
        band = bands.get(code) if code else None
        comb = combine_stock(llm, name, band, news)
        ok = comb['checked'] and all(n['checked'] for n in news[:3])
        return code or name, dict(
            name=name, code=code, band=(dict(H=band['H'], L80=band['L80'], U80=band['U80'], grade_0811=band['grade_0811'])
                                        if band else None),
            news=news, combined=dict(line_ko=comb['line_ko'], stance=comb['stance'], news_direction=comb['news_direction'],
                                     used_news=comb['used_news'], checked=ok, source=comb['source'], issues=comb['issues']))

    with ThreadPoolExecutor(args.workers) as ex:
        for key, val in ex.map(one, names):
            stocks[key] = val
    mk = market_line(llm, market, market_items)

    versions = {n: prompt(n)[2] for n in (P_EXTRACT, P_COMBINE, P_MARKET, P_VERIFY)}
    brief = dict(
        T=T, generated_at=dt.datetime.now(KST).isoformat(timespec='seconds'), model=MODEL, effort=EFFORT,
        prompt_version='+'.join((P_EXTRACT, P_COMBINE, P_MARKET, P_VERIFY)), prompt_hashes=versions,
        verify=dict(model=VERIFY_MODEL, pairs=len(pairs), dropped=len(dropped)), dropped_links=dropped,
        note=('뉴스·LLM은 노란띠의 중심·폭을 바꾸지 않는다(띠는 07:30 카드 그대로). 장 전 자료만 입력. '
              '사건과 가격의 인과는 기사 표현만 옮기고 단정하지 않는다.'),
        inputs=dict(clusters=len(rows), used=len(use), skipped_no_body=len(skipped)),
        stocks=stocks,
        market=dict(line_ko=mk['line_ko'], x=market.get('x'), checked=mk['checked'], source=mk['source'],
                    items=market_items[:8]),
        usage=dict(new_calls=llm.calls, cache_hits=llm.cache_hits, cost_usd=round(llm.spent, 4), tokens=llm.tokens))
    (out_dir / 'brief.json').write_text(json.dumps(brief, ensure_ascii=False, indent=1), encoding='utf-8')

    n_news = sum(len(s['news']) for s in stocks.values())
    bad = sum(1 for e in exts if e['issues'])
    print(f'→ {out_dir / "brief.json"}')
    print(f'  종목 {len(stocks)}개(뉴스 있는 종목 {sum(1 for s in stocks.values() if s["news"])}), 종목 뉴스 {n_news}건, 시장 뉴스 {len(market_items)}건')
    print(f'  추출 검사 실패 묶음 {bad}/{len(exts)}, 새 호출 {llm.calls}, 캐시 {llm.cache_hits}, 비용 ${llm.spent:.4f}, 토큰 {llm.tokens}')


if __name__ == '__main__':
    main()
