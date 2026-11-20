"""아침용 알파카 이어 받기: DB에 있는 마지막 알파카 기사 시각에서 1시간 겹쳐 지금까지만 받는다(중복은 DB가 거른다).
DB가 창 시작(직전 거래일 15:30 KST)보다 앞에서 끊겨 있으면 창 시작부터 받는다(창 밖 빈 구간은 그날 연결과 무관). 6일치를 통째로 다시 받으면 10분이 넘어(11/10 시험) 아침 봉인에 못 쓴다.
실행: ~/4Digit-solo/.venv/bin/python workbench/alpaca_latest.py 2026-11-10T06:30:00+00:00   (인자 = 늦어도 여기서부터, UTC)
"""
import sys
import time
from datetime import datetime, timedelta, timezone

sys.path.insert(0, "/Users/betterkim/4Digit-solo")
from nightbrief.collect import collect_alpaca  # noqa: E402
from nightbrief.common import db, load_env  # noqa: E402

load_env()
con = db()
latest = con.execute("select max(created_at_utc) from news_items where source='alpaca'").fetchone()[0]
need = datetime.fromisoformat(sys.argv[1])
start = max(datetime.fromisoformat(latest.replace("Z", "+00:00")) - timedelta(hours=1), need) if latest else need
end = datetime.now(timezone.utc)
print("DB 마지막", latest, "→ 받기", start.isoformat(timespec="minutes"), "~", end.isoformat(timespec="minutes"), flush=True)
for attempt in range(5):
    try:
        print("새 기사", collect_alpaca(con, start, end), flush=True)
        break
    except Exception as ex:  # noqa: BLE001
        print("다시", attempt + 1, type(ex).__name__, str(ex)[:120], flush=True)
        time.sleep(10)
