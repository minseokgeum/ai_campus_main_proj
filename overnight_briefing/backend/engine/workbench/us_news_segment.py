"""업종 핵심어 연결(판정 전): 관계표에 없는 종목도 밤사이 미국 뉴스가 붙도록, 사업 기준 세부 업종마다 정해 둔 영문 핵심어가 제목에 있는 기사를 붙인다.

- 업종: runs/claude_segments_r1/segments_final.csv의 final(사업보고서 라벨, 11/10).
- 핵심어: 아래 TOPIC(업종 → 정규식, 단어 단위·대소문자 무시). 결과를 보기 전에 정했고, 바꾸면 이 파일에 남긴다.
- 기사: 알파카 밤사이(직전 거래일 15:30 ~ 그날 07:30 KST). 업종·밤마다 최대 3건(태그 티커 3개 이하인 기사 우선, 최근 순).
- 정형 기사 제외(BOILER): 과거 수익률 계산·목표주가 유지/조정·실적 통화 녹취·주가 움직임 설명 같은 Benzinga 정형 제목은 뺀다.
- 이 층은 관계·영향 판정이 아니라 '이 업종과 관련된 단어가 나온 기사'다. 화면에 '업종 핵심어(판정 전)'로 따로 표시한다.
실행: ~/4Digit/.venv/bin/python workbench/us_news_segment.py
"""
from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

import pandas as pd

W = Path(__file__).parent
OUT = W / "runs/claude_uslink_r1/us_news_segment.csv"
T = {   # 11/10 v2: 업종에 실제로 닿는 거시·업황 단어로 좁힘(v1은 '은행'·'구리' 같은 넓은 단어로 소송·소형 광산 기사가 걸림)
    "semis": r"semiconductors?|chipmakers?|memory chips?|DRAM|NAND|HBM|chip (stocks|demand|exports?)|foundr(y|ies)",
    "it": r"Apple|iPhone|smartphone (sales|demand|shipments)|OLED|PCB|consumer electronics",
    "telecom": r"telecom|5G|spectrum|wireless (carriers?|subscribers)",
    "internet": r"online advertising|digital ads|e-commerce|AI chatbots?|search (engine|market)",
    "game": r"video games?|game (sales|publishers?)|Nintendo|Take-Two|Electronic Arts|Roblox",
    "media": r"K-pop|music labels?|streaming (subscribers|prices)",
    "power": r"power grid|transformers?|electricity demand|data center power|switchgear|grid (investment|spending)",
    "nuclear": r"nuclear|SMRs?|uranium|gas turbines?",
    "ship": r"shipbuilding|shipyards?|LNG carriers?|naval (ships|shipbuilding)|Navy (ships|contracts?)",
    "defense": r"defense (spending|budget|stocks|contracts?)|Pentagon|NATO|missiles?",
    "machine": r"construction equipment|Caterpillar|Deere|humanoid robots?|robotics",
    "auto": r"auto tariffs?|tariffs? on (cars|autos|vehicles)|car sales|auto sales|EV (sales|demand|tax credits?)|Tesla|General Motors|Ford|Toyota|Hyundai|Kia",
    "battery": r"EV batter(y|ies)|lithium (prices?)?|energy storage|battery (makers?|demand|plants?)",
    "oil": r"oil prices?|crude|OPEC|Brent|WTI|refining margins?|gasoline prices?",
    "gas": r"natural gas prices?|LNG (prices|exports?)|electricity prices?",
    "chem": r"petrochemicals?|chemical (prices|demand)|oil prices?|crude",
    "steel": r"steel (prices?|tariffs?|imports?)|aluminum (prices?|tariffs?)|copper prices?|metals? prices?|Section 232",
    "build": r"infrastructure (bill|spending)|construction spending|housing starts|homebuilders?|data center construction",
    "shipping": r"shipping rates|container (rates|ships|freight)|freight rates|Red Sea|Suez|Hormuz|dry bulk|Baltic Dry",
    "air": r"jet fuel|oil prices?|crude|air travel demand|airline (stocks|earnings|outlook)",
    "logistics": r"tariffs?|trade deal|trade war|customs|freight rates",
    "bank": r"Fed|FOMC|Powell|rate cuts?|rate hikes?|interest rates?|Treasury yields?|bond yields?|inflation|CPI|jobs report|payrolls",
    "insure": r"Fed|FOMC|interest rates?|Treasury yields?|bond yields?|inflation",
    "broker": r"Fed|FOMC|interest rates?|stock market rally|retail investors?|trading volumes?",
    "bio": r"FDA (approval|approves|rejects|clears)|drug pricing|Medicare|most favored nation|biosimilars?|obesity drugs?|GLP-1",
    "pharma": r"FDA (approval|approves|rejects)|drug pricing|Medicare|most favored nation|drugmakers?",
    "medtech": r"medical devices?|aesthetics|FDA (clears|clearance)",
    "cosmetic": r"China consumers?|beauty (demand|sales)|cosmetics (sales|demand)|duty-free|K-beauty",
    "food": r"food prices?|tobacco|K-food|ramen|consumer staples",
    "retail": r"retail sales|consumer (spending|confidence|sentiment)|holiday sales|Black Friday",
    "apparel": r"apparel (demand|sales)|retail sales|consumer spending",
    "leisure": r"casinos?|Macau|tourism|travel demand",
}
SEG = {
    "메모리·반도체 제조": ["semis"], "반도체 장비": ["semis"], "반도체 소재·부품": ["semis"], "반도체 후공정·테스트": ["semis"],
    "디스플레이": ["it"], "전자부품·기판": ["it", "semis"], "가전·IT기기": ["it"],
    "통신서비스": ["telecom"], "인터넷·플랫폼": ["internet"], "게임": ["game"], "엔터·미디어·광고": ["media"], "IT서비스": ["internet"],
    "전력기기·전선": ["power"], "원전·발전설비": ["nuclear", "power"],
    "조선": ["ship"], "방산·항공우주": ["defense"], "기계·로봇": ["machine"],
    "자동차": ["auto"], "자동차부품·타이어": ["auto"], "2차전지 셀": ["battery"], "2차전지 소재": ["battery"],
    "정유": ["oil"], "가스·전력 유틸": ["gas"], "화학": ["chem", "oil"], "철강·비철": ["steel"],
    "건설·엔지니어링": ["build"], "해운": ["shipping"], "항공운송": ["air", "oil"], "물류·상사": ["logistics"],
    "은행·금융지주": ["bank"], "보험": ["insure"], "증권·카드·핀테크": ["broker"],
    "바이오 CDMO·시밀러": ["bio"], "신약 바이오": ["bio"], "제약": ["pharma"], "의료기기·미용": ["medtech"],
    "화장품": ["cosmetic"], "식품·음료·담배": ["food"], "유통·소매": ["retail"], "의류·생활소비재": ["apparel"], "레저·서비스": ["leisure"],
}


BOILER = re.compile(r"Invested In|Price Target|Maintains|Reiterates|Earnings Call Transcript|What's Going On|Shares Are Trading|"
                    r"Stock Is (Moving|Trading|Falling|Rising)|Here's Why|Options Activity|Unusual|Short Interest|Insider|Dividend|"
                    r"Analyst Ratings?|Upgrades|Downgrades|Initiates Coverage|Stocks Moving|Top Gainers|Losers|Seatback", re.I)


def main() -> None:
    F = pd.read_csv(W / "runs/claude_segments_r1/segments_final.csv", dtype={"code": str})
    con = sqlite3.connect(f"file:{Path.home() / '4Digit-solo/data/night.db'}?mode=ro", uri=True)
    A = pd.read_sql("select item_id, headline, symbols, created_at_utc from news_items where source='alpaca'", con)
    A["t"] = pd.to_datetime(A.created_at_utc, utc=True).dt.tz_convert("Asia/Seoul")
    A = A[~A.headline.str.contains(BOILER)]
    A["nsym"] = A.symbols.fillna("[]").map(lambda s: len(json.loads(s)) if s.startswith("[") else 0)
    from news_days import news_days, prev_trading_day
    days = news_days()
    prev = prev_trading_day(days)
    pats = {k: re.compile(rf"\b(?:{v})\b", re.I) for k, v in T.items()}
    import warnings
    warnings.filterwarnings("ignore")
    rows = []
    for d in days:
        w = A[(A.t >= pd.Timestamp(f"{prev[d]} 15:30", tz="Asia/Seoul")) & (A.t < pd.Timestamp(f"{d} 07:30", tz="Asia/Seoul"))]
        for seg, topics in SEG.items():
            members = F[F.final == seg]
            if members.empty:
                continue
            hit = pd.concat([w[w.headline.str.contains(pats[k])].assign(term=k) for k in topics]).drop_duplicates("item_id")
            if hit.empty:
                continue
            top = hit.assign(spec=hit.nsym <= 3).sort_values(["spec", "t"], ascending=[False, False]).head(3)
            for r in top.itertuples():
                m = pats[r.term].search(r.headline)
                for mb in members.itertuples():
                    rows.append(dict(T=d, kr_code=mb.code, kr_name=mb.name, us=f"업종 핵심어 '{m.group(0)}'", relation=seg, tier="업종 핵심어(판정 전)",
                                     time=f"{r.t:%m/%d %H:%M}", headline=r.headline, path=f"'{m.group(0)}' → {seg} 업종 → {mb.name}", effect="",
                                     strength="", why=m.group(0)))
    S = pd.DataFrame(rows)
    S.to_csv(OUT, index=False)
    print(len(S), "줄 ·", S.groupby("T").kr_code.nunique().to_dict())


if __name__ == "__main__":
    main()
