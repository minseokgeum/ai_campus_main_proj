"""오라클 서버에서 뉴스 처리 노트북을 돌리는 실행기(2026-11-20). 처리 코드는 모두 노트북에 있고, 여기서는 설정만 덮어쓴다.

사용(news_search 폴더에서): python -u run_news.py <단계> [START_ROUND]
  extract  : news_extract 실시간 처리(WATCH_RUN). START_ROUND(UTC 회차)부터 아직 처리 안 한 기사를 60초마다 처리
  track    : news_track 실시간 처리(WATCH_RUN). 새 추출 결과로 사건 묶기·후속 판별·매체 수
  summaries: 지금 볼 브리핑 범위(전날 23:00 ~ 그날 05:45에 수집된 기사, 한국)로 시장 요약·제목·업종·종목 요약 → news_to_db
  ko       : news_ko_summary 실시간 처리(WATCH_RUN). 추출된 기사마다 뉴스 상세용 한국어 번역(comparison_summary를 줄글 한 단락으로)을 미리 만든다
  sync     : news_to_db만(기사 한국어 한 줄·요약을 DB로)
  collect  : news_collect 연속 수집(구글 뉴스 RSS 검색 → DB). 멈출 때까지 돈다(2026-11-21 맥에서 서버로 옮김)
  relation : news_company_relation(종목–해외 상대 관계 한 문장). 검색어 연결표(news.term_links)가 바뀐 짝만 새로 만든다 → news_to_db. 연결표를 다시 올렸을 때 손으로
  reason   : news_company_reason(종목마다 밤사이 기사 한 문장, 관계사 기사면 관계 문장) 지금 브리핑 범위로 → news_to_db. cron 07:00(06:20 아침 카드 뒤)
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


BRIEF_START = dt.time(23, 0)    # 브리핑 범위 시작: 전날 23:00(한국, 수집 시각 기준)
BRIEF_END = dt.time(5, 45)      # 끝: 그날 05:45 수집분까지. 05:50에 확정본을 돌려 06:00 전에 끝낸다(2026-11-20 결정)
TIME_COLUMN = 'first_seen_utc'  # 수집 시각 기준(발행 시각으로 자르면 늦게 수집되는 기사가 빠진다). 월요일도 평일과 같다


def brief_window(now=None):
    """06:00 브리핑의 범위. 12:00 뒤면 다음 날 브리핑(오늘 23:00 ~ 내일 05:45), 그 전이면 오늘 브리핑(어제 23:00 ~ 오늘 05:45)."""
    now = now or dt.datetime.now(KST)
    end_day = now.date() + dt.timedelta(days=1) if now.hour >= 12 else now.date()
    start = dt.datetime.combine(end_day - dt.timedelta(days=1), BRIEF_START, KST)
    end = dt.datetime.combine(end_day, BRIEF_END, KST)
    return start.strftime('%Y-%m-%d %H:%M'), end.strftime('%Y-%m-%d %H:%M')


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
        s, e = brief_window()
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
    elif step == 'reason':
        s, e = brief_window()
        print('브리핑 범위', s, '~', e, flush=True)
        run('news_company_reason', dict(RUN_LLM=True, START_KST=s, END_KST=e, TIME_COLUMN=TIME_COLUMN))
        run('news_to_db', {})
    else:
        raise SystemExit(f'모르는 단계: {step}')
