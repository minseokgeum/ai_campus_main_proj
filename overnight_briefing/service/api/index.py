"""고객 화면 API(FastAPI). Vercel 함수 진입점이자 로컬 서버.

로컬:  cd overnight_briefing/service && uvicorn api.index:app --port 8520   →  http://127.0.0.1:8520
배포:  Vercel이 이 파일의 app을 함수로 띄우고, web/은 정적 파일로 내준다(vercel.json).

GET  /api/meta                       날짜 목록(기록 종류·뉴스 여부)과 자료 출처(live|snapshot)
GET  /api/day/{T}?slot=0730|0811|0900  그날 공통 묶음(시장·야간선물·기사·일정·기록·브리핑 머리말)
GET  /api/accounts                   예시 계좌(종목·수량·평균단가 가정)
GET  /api/stocks?q=                  검색용 종목 목록(그래프 대상 1,067 ∪ 모델 200, in_model 표시)
POST /api/portfolio                  {T, account_id} 또는 {T, holdings:[{code,q,avg}]} → 그 계좌의 띠·금액 재료·뉴스·관계·기록
모델 값은 새로 계산하지 않는다. LLM을 부르지 않는다(브리핑 문장은 밤사이 프롬프트가 미리 만든 파일을 읽기만 한다).
"""
from __future__ import annotations

import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlencode

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator, model_validator

SERVICE = Path(__file__).resolve().parents[1]
if str(SERVICE) not in sys.path:
    sys.path.insert(0, str(SERVICE))

from core import portfolio as P  # noqa: E402
from core import source as S  # noqa: E402

app = FastAPI(title="당신이 잠든 사이에 · 고객 화면 API", docs_url="/api/docs", openapi_url="/api/openapi.json")


class _RestoreVercelPath:
    """Vercel은 /api/(.*)를 /api/index?__p=$1 로 넘긴다(vercel.json). 원래 경로를 되살려 라우트가 그대로 맞게 한다.
    로컬(uvicorn)에서는 __p가 없으므로 아무것도 하지 않는다."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope.get("path", "").rstrip("/") in ("/api/index", "/api/index.py"):
            qs = parse_qsl(scope.get("query_string", b"").decode(), keep_blank_values=True)
            sub = next((v for k, v in qs if k == "__p"), None)
            if sub is not None:
                path = "/api/" + sub.lstrip("/")
                rest = urlencode([(k, v) for k, v in qs if k != "__p"]).encode()
                scope = dict(scope, path=path, raw_path=path.encode(), query_string=rest)
        await self.app(scope, receive, send)


app.add_middleware(_RestoreVercelPath)
NO_STORE = {"Cache-Control": "no-store"}
DAY_KEYS_DROP = ("stocks", "segnews")


def _day_or_404(T: str) -> dict:
    if not (T.isdigit() and len(T) == 8):
        raise HTTPException(400, "날짜는 YYYYMMDD")
    try:
        return S.day(T)
    except FileNotFoundError:
        raise HTTPException(404, "그 날 자료가 없어요")


def _catalog() -> dict[str, dict]:
    return {r["code"]: r for r in S.stocks()}


@app.get("/api/meta")
def meta():
    return JSONResponse(S.meta(), headers=NO_STORE)


@app.get("/api/day/{T}")
def day(T: str, slot: str = Query("0811", pattern="^(0730|0811|0900)$")):
    d = _day_or_404(T)
    out = {k: v for k, v in d.items() if k not in DAY_KEYS_DROP}
    if out.get("brief"):
        out["brief"] = {k: v for k, v in out["brief"].items() if k != "stocks"}     # 종목별 뉴스는 계좌 묶음(/api/portfolio)에서
    out["slot"] = slot
    out["universe_n"] = len(d["stocks"])
    return JSONResponse(out, headers=NO_STORE)


@app.get("/api/accounts")
def accounts():
    return JSONResponse(S.accounts(), headers=NO_STORE)


@app.get("/api/live")
def live():
    """지금 모으는 밤의 최신 기사(검색어로 걸린 그대로, 거르기 전)와 마지막 수집 시각."""
    return JSONResponse(S.live(), headers=NO_STORE)


@app.get("/api/stocks")
def stocks(q: str = Query("", max_length=30), limit: int = Query(30, ge=1, le=2000)):
    rows = S.stocks()
    q = q.strip()
    if q:
        ql = q.lower()
        rows = [r for r in rows if ql in r["name"].lower() or r["code"].startswith(q)]
        rows.sort(key=lambda r: (not r["name"].lower().startswith(ql), not r["in_model"], len(r["name"])))
    return JSONResponse(rows[:limit], headers={"Cache-Control": "public, max-age=600"})


class Holding(BaseModel):
    code: str = Field(pattern=r"^[0-9A-Z]{6}$")
    q: int = Field(ge=0, le=10_000_000)
    avg: float | None = Field(default=None, ge=0, le=100_000_000)


class PortfolioIn(BaseModel):
    T: str = Field(pattern=r"^\d{8}$")
    account_id: str | None = Field(default=None, max_length=8)
    name: str | None = Field(default=None, max_length=30)
    holdings: list[Holding] = Field(default_factory=list, max_length=P.MAX_HOLDINGS)

    @field_validator("holdings")
    @classmethod
    def _uniq(cls, v):
        seen, out = set(), []
        for h in v:
            if h.code not in seen:
                seen.add(h.code)
                out.append(h)
        return out

    @model_validator(mode="after")
    def _one(self):
        if not self.account_id and not self.holdings:
            raise ValueError("account_id나 holdings 중 하나는 있어야 해요")
        return self


def _nxt_hist(T: str, codes: list[str]) -> dict[str, list[int]]:
    """11/22: 그 종목이 이 날 전 최근 거래일(최대 10일)에 08:10 개장 전 거래 가격이 있었는지 [있던 날, 센 날].
    '새 숫자가 언제 오나'를 종목별로 말하려고 쓴다(이 날 자료는 보지 않는다). 개장 전 거래가 없던 날(수능 등)은 세지 않는다."""
    prev = sorted((x["T"] for x in S.meta().get("days", []) if x.get("T", "") < T), reverse=True)[:10]
    out = {c: [0, 0] for c in codes}
    for t in prev:
        try:
            d = S.day(t)
        except FileNotFoundError:
            continue
        if (d.get("special") or {}).get("premarket") is False:
            continue
        st = d.get("stocks") or {}
        for c in codes:
            s = st.get(c)
            if not s:
                continue
            out[c][1] += 1
            if s.get("nxt_g") is not None:
                out[c][0] += 1
    return out


@app.post("/api/portfolio")
def portfolio(body: PortfolioIn):
    d = _day_or_404(body.T)
    if body.account_id:
        acct = next((a for a in S.accounts() if a["id"] == body.account_id), None)
        if acct is None:
            raise HTTPException(404, "예시 계좌가 없어요")
        acct = dict(acct, holdings=[dict(code=h["code"], q=h["q"], avg=h.get("avg")) for h in acct["holdings"]])
    else:
        acct = dict(id="U", name=body.name or "내 잔고", holdings=[h.model_dump() for h in body.holdings], sample=False)
    res = P.build(d, S.track(), S.graph(), _catalog(), acct)
    nh = _nxt_hist(body.T, list(res["stocks"]))
    res["stocks"] = {c: dict(v, nxt_hist=nh.get(c)) for c, v in res["stocks"].items()}
    return JSONResponse(res, headers=NO_STORE)


# 로컬에서는 같은 서버가 web/도 내준다(Vercel에서는 정적 파일로 따로 나간다).
WEB = SERVICE / "web"
if WEB.is_dir():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=WEB, html=True), name="web")
