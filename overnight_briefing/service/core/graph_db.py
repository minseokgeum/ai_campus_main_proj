"""민석 그래프 DB(graph_db/source/graph/neo4j)에서 종목마다 해외 기업과의 연결을 뽑아 관계 그림 형식으로 만든다.

관계 그림 형식(web/js/charts.js relGraph): nodes [{id, name}], edges [{src(해외), dst(종목코드), relation, sign, strength, evidence, source, trigger}].
- 직접 관계: 그 종목과 해외 기업 사이에 적힌 공급·협력·경쟁·지분·라이선스·수주·분쟁 등(지배·계열 OWNS·IN_GROUP은 뺀다: 자회사 목록이라 '밤사이 미국 쪽 연결'과 다르다).
- 제품 다리: 그 종목이 만드는 구체 제품을 해외 기업이 사거나(수요처) 같이 만드는(같은 제품) 경우. 관계가 직접 적힌 것은 아니므로 strength='추정'(점선).
종목마다 최대 MAX_PER_STOCK개, 직접 관계 먼저, 그다음 해외 기업의 미국 기사 언급 수 순. 근거 문장은 관계에 붙은 첫 문장(공시 표·기사 원문)을 줄여 쓴다.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pandas as pd

MAX_PER_STOCK = 6
MAX_PRODUCT_EDGES = 4
GENERIC_PRODUCERS = 40          # 해외 생산자가 이보다 많은 제품은 너무 넓어서 다리로 쓰지 않는다
KOREA = {'대한민국', 'South Korea', 'Korea', 'Republic of Korea', '한국'}

# 관계 종류 → (종목이 start일 때 해외 쪽 이름, 종목이 end일 때 해외 쪽 이름, sign). start → end 방향으로 적힌 관계다.
DIRECT = {
    'SUPPLIES': ('고객사', '공급사', '+'),          # start가 end에 공급
    'WINS_ORDER': ('발주처', '수주 상대', '+'),
    'PARTNERS': ('협력', '협력', '+'),
    'COMPETES': ('경쟁사', '경쟁사', '+'),
    'INVESTS': ('투자 대상', '투자자', '+'),
    'FUNDS': ('자금 지원 대상', '자금 지원', '+'),
    'LICENSES': ('라이선스', '라이선스', '+'),
    'DIVESTS': ('매각 관계', '매각 관계', '+'),
    'DISPUTES': ('분쟁', '분쟁', '−'),
    'OTHER': ('기타 관계', '기타 관계', '+'),
}


def _list(s) -> list:
    if not isinstance(s, str) or not s.startswith('['):
        return []
    try:
        return json.loads(s)
    except ValueError:
        return []


def _short(s: str, n: int = 160) -> str:
    s = re.sub(r'\s+', ' ', str(s)).strip()
    return s if len(s) <= n else s[: n - 1] + '…'


def _source(row) -> str:
    filings, arts = _list(row.get('filings')), _list(row.get('articles'))
    out = []
    if filings:
        out.append(f'공시 {len(filings)}건')
    if arts:
        out.append(f'미국 기사 {len(arts)}건')
    return ' · '.join(out) or '그래프 DB'


def build(neo_dir: Path, codes: set[str]) -> dict:
    """codes: 대상 종목코드(6자리). 반환 형식은 관계 그림 형식."""
    co = pd.read_csv(neo_dir / 'nodes_Company.csv', usecols=['id', 'name', 'name_en', 'country', 'n_news', 'other_names'], dtype=str)
    co['n_news'] = pd.to_numeric(co['n_news'], errors='coerce').fillna(0)
    # 해외 기업: 'EN:' 중 나라가 한국이 아닌 것. 나라가 비어 있으면 미국 기사에 한 번 이상 나온 것만(공시에서 온 국내 법인·한국 자회사가 섞여 있다).
    en = co['id'].str.startswith('EN:') & (co['id'] != 'EN:') & ~co['id'].str.contains('korea', case=False)
    has_c = co['country'].notna()
    foreign = co[en & ((has_c & ~co['country'].isin(KOREA)) | (~has_c & (co['n_news'] >= 1)))]
    # 이름은 영어 이름 먼저(뉴스 탭의 연결 경로가 영어 이름이라 서로 맞물린다). 공시에서 온 노드는 name이 한국어 표기다.
    fname = dict(zip(foreign['id'], foreign['name_en'].fillna(foreign['name'])))
    fnews = dict(zip(foreign['id'], foreign['n_news']))
    falias = {i: {_norm(x) for x in _list(o) + [str(n)]} for i, o, n in zip(foreign['id'], foreign['other_names'], foreign['name'])}
    kr = {f'KR:{c}' for c in codes}

    cand: dict[str, list] = {}
    for rel, (as_start, as_end, sign) in DIRECT.items():
        p = neo_dir / f'rels_{rel}.csv'
        if not p.exists():
            continue
        r = pd.read_csv(p, dtype=str)
        r = r[(r['start'].isin(kr) & r['end'].isin(fname)) | (r['end'].isin(kr) & r['start'].isin(fname))]
        for row in r.to_dict('records'):
            kr_start = row['start'] in kr
            code, other = (row['start'], row['end']) if kr_start else (row['end'], row['start'])
            label = as_start if kr_start else as_end
            if rel == 'SUPPLIES' and str(row.get('direction_unknown', '')).lower() == 'true':
                label = '공급망'
            ev = _list(row.get('evidence'))
            notes = _list(row.get('notes'))
            cand.setdefault(code[3:], []).append(dict(
                src=other, dst=code[3:], relation=label, sign=sign,
                strength='확인' if (_list(row.get('filings')) or int(float(row.get('n_news') or 0)) >= 2) else '보도 1건',
                evidence=_short(ev[0]) if ev else '', source=_source(row), trigger=_short(notes[0], 80) if notes else '',
                _rank=(0, -fnews.get(other, 0))))

    # 제품 다리
    prod = pd.read_csv(neo_dir / 'nodes_Product.csv', usecols=['id', 'name', 'name_en', 'generic'], dtype=str)
    pname = dict(zip(prod['id'], prod['name'].fillna(prod['name_en'])))
    generic = set(prod.loc[prod['generic'].str.lower() == 'true', 'id'])
    pr = pd.read_csv(neo_dir / 'rels_PRODUCES.csv', usecols=['start', 'end'], dtype=str)
    by = pd.read_csv(neo_dir / 'rels_BUYS.csv', usecols=['start', 'end', 'evidence'], dtype=str)
    kr_prod = pr[pr['start'].isin(kr) & ~pr['end'].isin(generic)]
    f_prod = pr[pr['start'].isin(fname)]
    n_prod = f_prod.groupby('end')['start'].nunique()
    narrow = set(n_prod[n_prod <= GENERIC_PRODUCERS].index) | (set(kr_prod['end']) - set(n_prod.index))
    f_buy = by[by['start'].isin(fname) & by['end'].isin(narrow)]
    f_prod = f_prod[f_prod['end'].isin(narrow)]
    for code, g in kr_prod[kr_prod['end'].isin(narrow)].groupby('start'):
        ps = set(g['end'])
        seen = {e['src'] for e in cand.get(code[3:], [])}
        rows = []
        for df, kind in ((f_buy, '제품 수요처'), (f_prod, '같은 제품')):
            for row in df[df['end'].isin(ps)].to_dict('records'):
                if row['start'] in seen:
                    continue
                ev = _list(row.get('evidence'))
                rows.append(dict(src=row['start'], dst=code[3:], relation=f'{kind}({pname.get(row["end"], row["end"][2:])})',
                                 sign='+', strength='추정', evidence=_short(ev[0]) if ev else '',
                                 source='그래프 DB 제품 연결', trigger='', _rank=(1, -fnews.get(row['start'], 0))))
        rows.sort(key=lambda e: e['_rank'])
        picked, srcs = [], set()
        for e in rows:                                   # 한 해외 기업은 한 번만
            if e['src'] in srcs:
                continue
            srcs.add(e['src'])
            picked.append(e)
            if len(picked) >= MAX_PRODUCT_EDGES:
                break
        cand.setdefault(code[3:], []).extend(picked)

    edges = []
    for code, es in cand.items():
        es.sort(key=lambda e: e['_rank'])
        one: dict[str, dict] = {}
        for e in es:                                     # 같은 해외 기업이면 관계 이름을 '·'로 합친다(그림에 선 하나)
            if e['src'] in one:
                o = one[e['src']]
                if e['relation'] not in o['relation'].split('·'):
                    o['relation'] += '·' + e['relation']
                o['evidence'] = o['evidence'] or e['evidence']
                continue
            if len(one) >= MAX_PER_STOCK:
                continue
            one[e['src']] = {x: v for x, v in e.items() if x != '_rank'}
        edges += one.values()
    ids = list(dict.fromkeys(e['src'] for e in edges))
    return dict(nodes=[dict(id=i, name=fname.get(i, i), aliases=sorted(falias.get(i, set()))) for i in ids], edges=edges)


def _norm(name: str) -> str:
    s = re.sub(r'\(.*?\)', '', str(name)).lower()
    s = re.sub(r'\b(inc|corp|corporation|co|ltd|plc|holdings?|group|company|the)\b\.?', '', s)
    return re.sub(r'[^a-z0-9가-힣]', '', s)


# 11/11 관계표의 해외 기업(티커 id) ↔ 영어 이름(정규화). 관계표 이름이 한국어라 그래프 DB 별칭과 맞추는 데 쓴다.
TABLE_ALIASES = {'US:NVDA': ['nvidia'], 'US:AMD': ['amd', 'advancedmicrodevices'], 'US:MU': ['micron', 'microntechnology'],
                 'US:TSM': ['tsmc', 'taiwansemiconductormanufacturing'], 'US:LRCX': ['lamresearch'],
                 'US:AMZN': ['amazon', 'amazoncom', 'amazonwebservices', 'aws'], 'US:GOOGL': ['alphabet', 'google'],
                 'US:INTC': ['intel'], 'US:AAPL': ['apple'], 'US:QCOM': ['qualcomm']}


def merge(primary: dict, extra: dict) -> dict:
    """primary(손으로 정리한 관계표, 촉발 사건 설명이 더 자세함)를 앞에 두고, extra(그래프 DB)에서 같은 종목·같은 해외 기업이 아닌 것만 더한다."""
    alias_to_pid = {}
    for n in primary['nodes']:
        for a in TABLE_ALIASES.get(n['id'], []) + [_norm(n['name'])]:
            alias_to_pid[a] = n['id']
    have = {(e['dst'], e['src']) for e in primary['edges']}
    xnode = {n['id']: n for n in extra['nodes']}
    xname = {n['id']: n['name'] for n in extra['nodes']}
    nodes = list(primary['nodes'])
    node_ids = {n['id'] for n in nodes}
    edges = list(primary['edges'])
    for e in extra['edges']:
        al = set(xnode.get(e['src'], {}).get('aliases', [])) | {_norm(xname.get(e['src'], ''))}
        pid = next((alias_to_pid[a] for a in al if a in alias_to_pid), None)
        if pid and (e['dst'], pid) in have:            # 관계표에 이미 있는 종목·회사 쌍
            continue
        sid = pid or e['src']                           # 같은 회사면 기존 노드에 붙인다
        edges.append(dict(e, src=sid))
        if sid not in node_ids:
            nodes.append(dict(id=sid, name=xname.get(e['src'], e['src'])))  # 별칭 목록은 내보내지 않는다
            node_ids.add(sid)
    return dict(nodes=nodes, edges=edges)
