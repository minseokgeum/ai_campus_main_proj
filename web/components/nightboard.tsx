"use client";
// 밤사이 목록 + 종목 창(피그마 밤사이 v4 보유 탭 448:6559, 종목 창 400:4926~400:5933, 수량 바꾼 상태 402:5851).
// 종목 줄을 누르면 목록 위로 창이 반쯤 올라오고(바깥을 누르면 닫힘), ‹ ›로 목록 순서대로 넘긴다.
// 창에서 바꾼 수량은 목록·계좌 카드에 남고(이 기기의 이 날짜에만, 실제 주문 없음) '되돌리기'로 원래 수량으로 돌린다.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BandMini } from "@/components/model";
import { type DirectionGrade } from "@/lib/trust";
import { GradeHelp, NotServiceHelp } from "@/components/helps";
import { Layer, StickyAccount } from "@/components/sheet";
import { gradeLine, postLine } from "@/components/bandtext";
import { CalcDrop, type CalcRow } from "@/components/calcdrop";
import { expAmt, tick } from "@/lib/tick";
import { StockPanel, colorOf, pctText, swonText, wonText } from "@/components/stockpanel";
import { NightBars, type BarRow } from "@/components/nightbars";

export type BRow = {
  code: string; name: string; sector: string; tier: 1 | 2 | 3; kind: "ok" | "out" | "low" | "nocalc" | "notservice"; side: "up" | "down" | null;
  qty: number; pc: number | null; h: number | null; l80: number | null; u80: number | null; l90: number | null; u90: number | null;
  grade: DirectionGrade | null; p: number | null; nxtG: number | null; earn: boolean; y: number | null; open: number | null; in80: boolean | null; nNews: number; v?: { neg: number; pos: number; neu: number };   // v: 밤사이 소식의 이 종목 기준 판정 개수
  avg: number | null;   // 평단(보유 종목에 넣었을 때)
};

const TINTS: [string, string][] = [["rgba(241,163,60,0.18)", "#b86e12"], ["rgba(139,111,214,0.18)", "#6a4fb8"], ["rgba(0,140,130,0.14)", "#008c82"],
  ["rgba(76,111,195,0.14)", "#4c6fc3"], ["rgba(214,51,108,0.14)", "#d6336c"], ["rgba(154,164,168,0.18)", "#5e6e72"]];
const tint = (sector: string) => TINTS[[...sector].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TINTS.length];

export function NightBoard({ dayWord = "오늘", t, after0811, phase, view, rows, holdRows, sortLabel, accountTitle, accountHead, accountBelow, listHead, futures, stickySeg, attention, rest, footer, initialOpen, chart, chartRows, newsBy }: {
  t: string; after0811: boolean; phase: "pre" | "post"; view: "hold" | "watch"; rows: BRow[]; holdRows: BRow[]; sortLabel: string;
  accountTitle: string; accountHead: ReactNode; accountBelow: ReactNode; listHead: ReactNode; futures: ReactNode; stickySeg: ReactNode; footer: ReactNode;
  dayWord?: string;   // 지난 날짜면 그 날짜(위 계좌 줄 글자)
  attention: { title: string; sub: string } | null; rest: { title: string; sub: string } | null; initialOpen?: string;
  chart?: { title: string; note: string; rows: BarRow[] } | null;   // 종목별 오늘 예상 세로 막대(필터와 상관없이 보유/관심 전체)
  chartRows?: BRow[];   // 막대에서 연 종목이 필터로 목록에 없을 때 창을 열 자료
  newsBy?: Record<string, ReactNode>;   // 종목 창 '밤사이 소식' 창 안 기사 줄(서버에서 그려 넘김)
}) {
  const key = `qty:${t}`;
  const [ovr, setOvr] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<string | null>(initialOpen ?? null);
  const [newsOpen, setNewsOpen] = useState(false);
  // 계산기(components/calcdrop.tsx, 2026-11-26): 종목마다 띠에서 고른 값(어제 종가 대비)과 '모두 되돌리기'로 띠 손잡이를 지우는 신호.
  // 옆 종목으로 넘겨도 고른 값은 남고(돌아오면 손잡이가 그 자리에), 종목 창을 닫으면 지운다. 바꾼 수량은 지금처럼 목록이 기억한다
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [clr, setClr] = useState(0);
  useEffect(() => { if (!open) setPicks({}); }, [open]);   // 종목 창 위에 뜨는 그 종목 밤사이 소식 창(변경 기록 29)
  useEffect(() => setNewsOpen(false), [open]);
  useEffect(() => { try { setOvr(JSON.parse(sessionStorage.getItem(key) ?? "{}")); } catch { /* 저장소 없으면 처음 수량 */ } }, [key]);
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(ovr)); } catch { /* 무시 */ } }, [key, ovr]);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => { if (e.key !== "Escape") return; if (newsOpen) setNewsOpen(false); else setOpen(null); };
    document.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", esc); };
  }, [open, newsOpen]);

  const qtyOf = (r: BRow) => ovr[r.code] ?? r.qty;
  // 금액 원칙(2026-11-24): 계산은 정확히, 화면에 찍을 때만 1원 반올림. 장전은 홈·종목 창과 같은 예상(08:11이면 NXT 가격),
  // 장후는 수량 × (실제 시가 − 어제 종가)(DB 등락률 y는 잘린 값이라 금액에 쓰지 않는다)
  const pctOf = (r: BRow) => (phase === "post" ? r.y : r.nxtG ?? r.h);
  // 장전 금액은 예상 가격을 호가 단위로 맞춰 셈(lib/tick.ts). 계산기에서 띠로 고른 가격이 있으면 그 종목은 그 가격으로(종목 창 회색 칸 '계좌 예상'과 계산기가 같은 숫자가 되게, 2026-11-26)
  const amtOf = (r: BRow, q: number, usePick = true) => (r.pc == null ? null : usePick && picks[r.code] != null ? expAmt(q, r.pc, picks[r.code]) : phase === "post" ? (r.open != null ? q * (r.open - r.pc) : null) : (r.nxtG ?? r.h) != null ? expAmt(q, r.pc, (r.nxtG ?? r.h)!) : null);
  const acct = useMemo(() => {
    const all = new Map(holdRows.map((r) => [r.code, r]));
    for (const r of rows) if (ovr[r.code] != null && !all.has(r.code)) all.set(r.code, r);
    let value = 0, amount = 0, pre = 0;
    for (const r of all.values()) {
      const q = qtyOf(r), a = amtOf(r, q);
      if (r.pc == null || a == null) continue;
      value += q * r.pc; amount += a; pre += expAmt(q, r.pc, r.nxtG ?? r.h ?? 0);
    }
    return { value, amount, pre, after: value + amount, pct: value ? amount / value : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdRows, rows, ovr, phase, picks]);
  // 숫자가 바뀌는 순간 계좌 금액을 0.5초 동안 옅은 청록으로 깜빡인다(규칙·전달 개발 메모 421:6770 ③)
  const [flash, setFlash] = useState(0);
  const prevAmt = useRef<number | null>(null);
  useEffect(() => {
    if (prevAmt.current != null && Math.round(prevAmt.current) !== Math.round(acct.amount)) {
      setFlash((n) => n + 1);
    }
    prevAmt.current = acct.amount;
  }, [acct.amount]);
  const fl = flash ? `flash f${flash % 2}` : "";
  const changed = Object.entries(ovr).filter(([c, q]) => q !== (rows.find((r) => r.code === c) ?? holdRows.find((r) => r.code === c))?.qty);
  const nameOf = (c: string) => (rows.find((r) => r.code === c) ?? holdRows.find((r) => r.code === c))?.name ?? c;

  const att = rows.filter((r) => r.kind === "out" || r.kind === "low");
  const others = rows.filter((r) => r.kind !== "out" && r.kind !== "low");
  // 막대 그래프에서 연 종목이 필터로 목록에 없으면, 창은 보유/관심 전체 순서로 넘긴다
  const nav = open && !rows.some((r) => r.code === open) && chartRows?.some((r) => r.code === open) ? chartRows : rows;
  const k = open ? nav.findIndex((r) => r.code === open) : -1;
  const cur = k >= 0 ? nav[k] : null;

  const rowView = (r: BRow) => {
    const [bg, fg] = tint(r.sector);
    const q = qtyOf(r), p = pctOf(r);
    // 이름 아래 줄은 '보유 n주'만, 그 아래 줄은 소식(배포용 변경 기록 01). 긍정·부정 개수는 아직 정하지 않아 '소식 n건'·'소식 없음'으로 둔다
    let sub = view === "hold" ? `보유 ${q.toLocaleString("ko-KR")}주` : q > 0 ? `${q}주로 계산 중` : "관심 종목";
    const warn = r.kind === "out" || r.kind === "low";   // 범위 밖·믿을 정도 낮음은 아이콘 점으로만(문구는 '확인이 필요한 종목' 묶음과 종목 창에)
    if (q !== r.qty && view === "hold") sub = `${q}주로 계산 중`;
    else if (r.kind === "nocalc") sub = phase === "post" && r.h != null ? "실제 시가 확인 전" : "이 날 계산하지 못했어요(자료 부족)";
    // 셋째 줄(배포용 변경 기록 01): 부정·긍정 개수(0인 쪽은 숨김) · 중립만 있으면 '중립 소식만 있어요' · 판정 없는 소식만 있으면 '소식 n건' · 없으면 '소식 없음'
    const newsLine = !r.nNews ? <span className="nl3">소식 없음</span>
      : r.v && (r.v.neg || r.v.pos) ? <span className="nl3 vl">{r.v.neg ? <span><b className="neg">부정</b> {r.v.neg}</span> : null}{r.v.pos ? <span><b className="pos">긍정</b> {r.v.pos}</span> : null}</span>
      : r.v?.neu ? <span className="nl3">중립 소식만 있어요</span> : <span className="nl3">소식 {r.nNews}건</span>;
    const amt = amtOf(r, q);
    return (
      <button type="button" key={r.code} className="nrow" onClick={() => setOpen(r.code)}>
        <span className="ic" style={{ background: bg, color: fg }}>{r.name.slice(0, 1)}{warn ? <i /> : null}</span>
        <span className="nm">
          <b>{r.name}</b>
          <span className={q !== r.qty ? "teal" : ""}>{sub}</span>
          {newsLine}
        </span>
        {r.kind === "notservice" ? (
          <><span className="na">대상 아님</span><span className="val"><b className="g">—</b><small>계산 안 함</small></span></>
        ) : r.l80 != null && r.u80 != null && p != null ? (
          <>
            <BandMini l={r.l80} u={r.u80} dot={p} kind={phase === "post" ? "post" : r.nxtG != null ? "nxt" : "pre"} />
            <span className="val" style={{ color: colorOf(p) }}>
              <b>{pctText(p)}</b>
              <small className="amt">{amt != null && (view === "hold" || q > 0) ? swonText(amt) : phase === "post" ? "실제" : "예상"}</small>
            </span>
          </>
        ) : <><span className="na">—</span><span className="val"><b className="g">—</b></span></>}
        <em>›</em>
      </button>
    );
  };

  return (
    <>
      <StickyAccount targetId="acct-card">
        <span className="sa"><span>{phase === "post" ? `${dayWord} 실제 시가` : `${dayWord} 시가 예상`}</span>
          <b style={{ color: colorOf(acct.amount) }} className={fl}><span className="amt tot">{swonText(acct.amount)}</span> <small>{pctText(acct.pct)}</small></b></span>
        {stickySeg}
      </StickyAccount>
      <section className="acct" id="acct-card">
        <div className="at"><span>{accountTitle}</span>{accountHead}</div>
        <div className={`big ${fl}`} style={{ color: colorOf(acct.amount) }}>
          <span className="amt tot">{swonText(acct.amount)}</span><small>{pctText(acct.pct)}{phase === "post" ? <> · 예상 <span className="amt">{swonText(acct.pre)}</span></> : null}</small>
        </div>
        {changed.length ? (
          <div className="chg">
            <span>수량 바꿈 {changed.length} · {changed.slice(0, 2).map(([c, q]) => `${nameOf(c)} ${q}주`).join(", ")}{changed.length > 2 ? " 외" : ""}</span>
            <button type="button" onClick={() => setOvr({})}>↺ 되돌리기</button>
          </div>
        ) : null}
        <div className="flow">
          <div><span>어제 종가 기준</span><b className="amt">{wonText(acct.value)}</b></div>
          <em>→</em>
          <div className="r"><span>{phase === "post" ? "실제 시가 기준" : "예상 시가 기준"}</span><b className="amt">{wonText(acct.after)}</b></div>
        </div>
        {accountBelow}
      </section>
      {chart ? <NightBars rows={chart.rows} post={phase === "post"} title={chart.title} note={chart.note} onPick={setOpen} /> : null}
      {listHead}
      {attention && att.length ? <div className="ghead"><b><i />{attention.title}</b><span>{attention.sub}</span></div> : null}
      {att.map(rowView)}
      {changed.length && rows.some((r) => ovr[r.code] != null) ? <button type="button" className="resetall" onClick={() => setOvr({})}>수량 모두 되돌리기</button> : null}
      {futures}
      {rest && others.length ? <div className="ghead"><b>{rest.title}</b><span>{rest.sub}</span></div> : null}
      {others.map(rowView)}
      {footer}

      {cur ? (
        <Layer><div className="sheet-back light" onClick={() => setOpen(null)}>
          {(() => {   // 수량을 바꾸거나 띠에서 가격을 고른 종목이 하나라도 있으면 창 위 빈 곳에 계산기(옆 종목으로 넘겨도 남는다)
            const byCode = new Map([...(chartRows ?? []), ...rows, ...holdRows].map((r) => [r.code, r]));
            const ok = (r?: BRow): r is BRow => !!r && r.kind !== "notservice" && r.pc != null && r.h != null;
            const priceOf = (r: BRow, usePick = true) => {
              const pk = usePick ? picks[r.code] : undefined;
              const post = phase === "post" && r.y != null;
              const nx = phase === "pre" && after0811 ? r.nxtG : null;
              return tick(pk != null ? r.pc! * (1 + pk) : post && r.open != null ? r.open : r.pc! * (1 + (post ? r.y! : nx ?? r.h!)));
            };
            const labelOf = (r: BRow) => (picks[r.code] != null ? "띠에서 고른" : phase === "post" && r.y != null ? "실제 시가" : phase === "pre" && after0811 && r.nxtG != null ? "장전 기준" : "예상 시가");
            const codes = [...new Set([...Object.keys(ovr).filter((c) => byCode.get(c) && ovr[c] !== byCode.get(c)!.qty), ...Object.keys(picks)])];
            const list = codes.map((c) => byCode.get(c)).filter(ok);
            if (!list.length) return null;
            const calcRows: CalcRow[] = list.map((r) => ({ code: r.code, name: r.name, q0: r.qty, q: qtyOf(r), price: priceOf(r), label: labelOf(r), cur: r.code === cur.code }));
            const acctRows = [...new Map([...holdRows, ...list].map((r) => [r.code, r])).values()].filter(ok);
            const pnlNow = acctRows.reduce((s, r) => s + qtyOf(r) * (priceOf(r) - r.pc!), 0);
            const pnlOrig = holdRows.filter(ok).reduce((s, r) => s + r.qty * (priceOf(r, false) - r.pc!), 0);
            return <CalcDrop rows={calcRows} pnlNow={pnlNow} pnlOrig={pnlOrig} onReset={() => { setOvr({}); setPicks({}); setClr((c) => c + 1); }} />;
          })()}
          <section className="sheet-box stocksheet" role="dialog" aria-modal="true" aria-label={`${cur.name} 종목 창`} onClick={(e) => e.stopPropagation()}>
            <i className="grab" />
            <div className="shead">
              <button type="button" disabled={k <= 0} onClick={() => setOpen(nav[k - 1].code)} aria-label="이전 종목">‹</button>
              <span className="pos">{k + 1} / {nav.length} · {nav === rows ? sortLabel : "보유 금액 큰 순"}</span>
              <button type="button" disabled={k >= nav.length - 1} onClick={() => setOpen(nav[k + 1].code)} aria-label="다음 종목">›</button>
              <button type="button" className="close" onClick={() => setOpen(null)} aria-label="닫기">✕</button>
            </div>
            {cur.kind === "notservice" || cur.pc == null || cur.h == null || cur.l80 == null || cur.u80 == null || cur.l90 == null || cur.u90 == null ? (
              <div className="sname">
                <span className="ic" style={{ background: tint(cur.sector)[0], color: tint(cur.sector)[1] }}>{cur.name.slice(0, 1)}</span>
                <div><b>{cur.name}</b><span>{cur.qty ? `보유 ${cur.qty.toLocaleString("ko-KR")}주` : "관심 종목"}</span></div>
              </div>
            ) : null}
            {cur.kind === "notservice" ? (
              <div className="quiet">서비스 대상(코스피 전체 + 코스닥150)이 아닌 종목이라 예상 시가를 계산하지 않아요. <NotServiceHelp label="자세히" /></div>
            ) : cur.pc == null || cur.h == null || cur.l80 == null || cur.u80 == null || cur.l90 == null || cur.u90 == null ? (
              <p className="quiet">이 날은 이 종목의 예상 범위를 계산하지 못했어요. 과거 자료가 200거래일보다 짧거나 전날 종가가 없을 때 이렇게 돼요.</p>
            ) : (
              <>
                {cur.tier === 2 ? <p className="t2box">모델을 설계할 때 쓰지 않은 종목이에요. 같은 규칙으로 계산했지만, 과거 검증은 설계 종목(코스피 150 + 코스닥 50)으로만 했어요.</p> : null}
                <StockPanel icon={<span className="ic" style={{ background: tint(cur.sector)[0], color: tint(cur.sector)[1] }}>{cur.name.slice(0, 1)}</span>} phase={phase} after0811={after0811} qty={qtyOf(cur)} setQty={(q) => setOvr({ ...ovr, [cur.code]: q })} acctAmount={acct.amount} acctValue={acct.value} key={cur.code} start={picks[cur.code] ?? null} clearKey={clr}
                  onPick={(v) => setPicks((p) => { if (v == null) { if (!(cur.code in p)) return p; const o = { ...p }; delete o[cur.code]; return o; } return p[cur.code] === v ? p : { ...p, [cur.code]: v }; })}
                  s={{ code: cur.code, name: cur.name, qty: cur.qty, pc: cur.pc, h: cur.h, l80: cur.l80, u80: cur.u80, l90: cur.l90, u90: cur.u90, nxtG: cur.nxtG, y: cur.y, open: cur.open, avg: cur.avg }}
                  status={(() => {   // 상태 한 줄(2026-11-25 사용자 시안): 칩·90% 문장 대신. 06:30엔 실적 태그 · 08:11엔 장전 방향 등급 · 확인 뒤엔 띠 안/밖
                    const earn = cur.earn ? <em className="earn">실적 발표 다음 날 · 평소보다 덜 맞아요</em> : null;
                    if (phase === "post" && cur.y != null) return <>{postLine(cur.y, cur.nxtG ?? cur.h!, cur.l80!, cur.u80!)}{earn ? <> · {earn}</> : null}</>;
                    if (after0811) return cur.nxtG == null ? <><span className="mute">장전 거래 없음 · 06:30 예상 유지</span>{earn ? <> · {earn}</> : null}</>
                      : <><GradeHelp className={`gline ${cur.grade ? "g" : "n"}`} label={gradeLine(cur.grade, cur.p, cur.nxtG)} />{earn ? <> · {earn}</> : null}</>;
                    return earn;
                  })()} />
                <div className="schips"><span className="sec">{cur.sector} 업종 · {rows.filter((r) => r.sector === cur.sector).length}종목</span></div>
              </>
            )}
            <div className="slinks">
              {cur.nNews && newsBy?.[cur.code] ? <button type="button" onClick={() => setNewsOpen(true)}>밤사이 소식 <b>{cur.nNews}건</b> ›</button> : <span className="off">밤사이 소식 없음</span>}
              <Link href={`/mine/${cur.code}`}>종목 상세 ›</Link>
            </div>
          </section>
        </div></Layer>
      ) : null}

      {cur && newsOpen && newsBy?.[cur.code] ? (
        <Layer><div className="sheet-back" onClick={() => setNewsOpen(false)}>
          <section className="sheet-box nnsheet" role="dialog" aria-modal="true" aria-label={`${cur.name} 밤사이 소식`} onClick={(e) => e.stopPropagation()}>
            <i className="grab" />
            <div className="nn-head">
              <span className="ic" style={{ background: tint(cur.sector)[0], color: tint(cur.sector)[1] }}>{cur.name.slice(0, 1)}</span>
              <b>{cur.name} 밤사이 소식</b>
              <button type="button" className="x" aria-label="닫기" onClick={() => setNewsOpen(false)}>✕</button>
            </div>
            <p className="nn-sub">뉴스 {cur.nNews}건{cur.v?.neg ? <> · <b className="neg">부정</b> {cur.v.neg}</> : null}{cur.v?.pos ? <> · <b className="pos">긍정</b> {cur.v.pos}</> : null} · 어젯밤 18:00 ~ 06:00</p>
            <div className="nn-list">{newsBy[cur.code]}</div>
            <Link href={`/news?tab=mine&c=${cur.code}`} className="nn-more">뉴스 브리핑 내 종목에서 보기 ›</Link>
          </section>
        </div></Layer>
      ) : null}
    </>
  );
}
