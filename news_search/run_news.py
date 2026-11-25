"""오라클 서버에서 뉴스 처리 노트북을 돌리는 실행기(2026-11-20). 처리 코드는 모두 노트북에 있고, 여기서는 설정만 덮어쓴다.

사용(news_search 폴더에서): python -u run_news.py <단계> [START_ROUND]
  extract  : news_extract 실시간 처리(WATCH_RUN). START_ROUND(UTC 회차)부터 아직 처리 안 한 기사를 60초마다 처리
  track    : news_track 실시간 처리(WATCH_RUN). 새 추출 결과로 사건 묶기·후속 판별·매체 수
  summaries: 지금 볼 브리핑 범위(전날 23:00 ~ 그날 06:15에 발행된 기사, 한국)로 시장 요약·제목·업종·종목 요약 → news_to_db.
             날짜(YYYY-MM-DD)를 붙이면 그날 브리핑을 다시 만든다(예: summaries 2026-11-23)
  ko       : news_ko_summary 실시간 처리(WATCH_RUN). 추출된 기사마다 뉴스 상세용 한국어 번역(comparison_summary를 줄글 한 단락으로)을 미리 만든다
  sync     : news_to_db만(기사 한국어 한 줄·요약을 DB로)
  collect  : news_collect 연속 수집(구글 뉴스 RSS 검색 → DB). 멈출 때까지 돈다(2026-11-21 맥에서 서버로 옮김)
  relation : news_company_relation(종목–해외 상대 관계 한 문장). 검색어 연결표(news.term_links)가 바뀐 짝만 새로 만든다 → news_to_db. 연결표를 다시 올렸을 때 손으로
  reason   : news_company_reason(종목마다 밤사이 기사 한 문장, 관계사 기사면 관계 문장) 지금 브리핑 범위로 → news_to_db. cron 06:25에 시작해 그날 아침 첫 카드(06:10 계산 · 06:30 공개, DB 칸 이름 0730)가 들어오면 바로 돈다(2026-11-23, 그전엔 07:00).
             summaries처럼 날짜를 붙이면 그날 것을 다시 만든다
  events   : company_events(다가오는 일정: DART 공시 일정·이어진 미국 기업 실적·미국 경제 지표 → DB news.company_events). cron 매일 06:00(2026-11-23)
extract·track·ko·collect는 서버 systemd가 계속 켜 두고(꺼지면 다시 켬), summaries·sync는 cron이 부른다.
"""
import datetime as dt
import json
import os
import sys
import time

KST = dt.timezone(dt.timedelta(hours=9))


def run(name, patch, stop_at=None):
    nb = json.load(open(f'{name}.ipynb', encoding='utf-8'))
    code = [''.join(c['source']) for c in nb['cells'] if c['cell_type'] == 'code']
    g = {'display': lambda *a, **k: None, '__name__': 'nb'}
    t0 = time.time()
    exec(code[0], g)
    g.update(patch)
    for c in code[1:]:
        if stop_at and stop_at in c:
            break
        exec(c, g)
    print(f'=== {name} {time.time() - t0:.0f}초', flush=True)


COLLECT_SKIP = ['# ── 시험:', '# ── 최근 24시간에 쌓인 것', '# ── 검색 문자열 예', '# ── 24시간 수집']   # 수집 노트북에서 손으로 돌리는 시험 칸


def collect():
    """news_collect 칸을 (시험 칸만 빼고) 실행한 뒤 회차 없는 연속 수집을 멈출 때까지 돌린다. 막힘 알림은 노트북이 텔레그램으로 보낸다."""
    nb = json.load(open('news_collect.ipynb', encoding='utf-8'))
    g = {'display': lambda *a, **k: None, '__name__': 'nb'}
    for c in nb['cells']:
        src = ''.join(c['source'])
        if c['cell_type'] == 'code' and not any(k in src for k in COLLECT_SKIP):
            exec(src, g)
    g['run_collect'](g['TERMS'], until=None)


BRIEF_START = dt.time(23, 0)    # 브리핑 범위 시작: 전날 23:00(한국, 발행 시각)
BRIEF_END = dt.time(6, 15)      # 끝: 그날 06:15 발행분까지. 06:20에 확정본을 돌리고 06:30에 화면에 공개(2026-11-23 결정)
TIME_COLUMN = 'published_utc'   # 발행 시각 기준(2026-11-23: '밤사이 나온 기사'라는 서비스 취지에 맞게. 그전엔 수집 시각).
                                # 노트북은 여기에 더해 END까지 수집된 기사만 쓴다(나중에 다시 돌려도 정규 실행과 같은 기사). 월요일도 평일과 같다


def brief_window(now=None, day=None):
    """06:30 브리핑의 범위. day(YYYY-MM-DD)를 주면 그날 브리핑(전날 23:00 ~ 그날 06:15).
    안 주면 12:00 뒤엔 다음 날 브리핑(오늘 23:00 ~ 내일 06:15), 그 전엔 오늘 브리핑(어제 23:00 ~ 오늘 06:15)."""
    now = now or dt.datetime.now(KST)
    end_day = dt.date.fromisoformat(day) if day else now.date() + dt.timedelta(days=1) if now.hour >= 12 else now.date()
    start = dt.datetime.combine(end_day - dt.timedelta(days=1), BRIEF_START, KST)
    end = dt.datetime.combine(end_day, BRIEF_END, KST)
    return start.strftime('%Y-%m-%d %H:%M'), end.strftime('%Y-%m-%d %H:%M')


def wait_card(t, minutes=20):
    """종목 이유는 그날 아침 첫 카드(model.card_stocks 칸 이름 0730, 06:10 계산 · 06:30 공개라 보통 06:21쯤 들어옴, 2026-11-25부터)의 예상 방향을 쓴다.
    cron이 06:25에 부르면 카드가 들어올 때까지 30초마다 확인하고, minutes분 안에 안 오면 그냥 돈다(예상 방향 없이). 2026-11-23: 07:00 → 카드 직후로 앞당김"""
    import sqlalchemy as sa
    from pathlib import Path
    envf = next((p / '.env' for p in [Path.cwd(), *Path.cwd().parents] if (p / '.env').exists()), None)
    url = None
    for line in (envf.read_text(encoding='utf-8-sig').splitlines() if envf else []):
        k, _, v = line.partition('=')
        if k.strip() == 'GNEWS_DB_URL':
            url = v.strip().strip('"\'')
    if not url:
        print('카드 확인 건너뜀: GNEWS_DB_URL이 없다', flush=True)
        return
    engine = sa.create_engine(url)
    try:
        for i in range(minutes * 2 + 1):
            with engine.connect() as con:
                n = con.execute(sa.text("select count(*) from model.card_stocks where t = :t and slot = '0730'"), {'t': t}).scalar()
            if n:
                print(f'{t} 아침 첫 카드 확인({n}종목, {i * 30}초 기다림)', flush=True)
                return
            time.sleep(30)
        print(f'{t} 아침 첫 카드가 {minutes}분 안에 안 들어와 예상 방향 없이 돈다', flush=True)
    finally:
        engine.dispose()


if __name__ == '__main__':
    step = sys.argv[1]
    print(f'##### {step} 시작 {dt.datetime.now(KST):%m-%d %H:%M:%S}', flush=True)
    if step == 'extract':
        run('news_extract', dict(RUN_LLM=True, WATCH_RUN=True, START_ROUND=sys.argv[2], MAX_ARTICLES=None))
    elif step == 'track':
        run('news_track', dict(RUN_LLM=True, WATCH_RUN=True), stop_at='def show_story')
    elif step == 'ko':
        run('news_ko_summary', dict(RUN_LLM=True, WATCH_RUN=True))
    elif step == 'summaries':
        s, e = brief_window(day=sys.argv[2] if len(sys.argv) > 2 else None)
        print('브리핑 범위', s, '~', e, flush=True)
        for nb in ['news_macro_hot_issue', 'news_headline', 'news_sector_hot_issue', 'news_company_hot_issue', 'news_company_summary']:
            try:
                run(nb, dict(RUN_LLM=True, START_KST=s, END_KST=e, TIME_COLUMN=TIME_COLUMN))
            except Exception as err:                 # 한 요약이 실패해도 나머지와 DB 올리기는 한다
                print(f'!!! {nb} 실패: {type(err).__name__}: {str(err)[:300]}', flush=True)
        run('news_to_db', {})
    elif step == 'sync':
        run('news_to_db', {})
    elif step == 'collect':
        collect()
    elif step == 'relation':
        run('news_company_relation', dict(RUN_LLM=True))
        run('news_to_db', {})
    elif step == 'events':
        run('company_events', dict(RUN=True))
    elif step == 'reason':
        s, e = brief_window(day=sys.argv[2] if len(sys.argv) > 2 else None)
        print('브리핑 범위', s, '~', e, flush=True)
        if len(sys.argv) <= 2:
            wait_card(e[:10].replace('-', ''))
        run('news_company_reason', dict(RUN_LLM=True, START_KST=s, END_KST=e, TIME_COLUMN=TIME_COLUMN))
        run('news_to_db', {})
    else:
        raise SystemExit(f'모르는 단계: {step}')
