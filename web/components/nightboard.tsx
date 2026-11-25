"use client";
// 밤사이 목록 + 종목 창(피그마 밤사이 v4 보유 탭 448:6559, 종목 창 400:4926~400:5933, 수량 바꾼 상태 402:5851).
// 종목 줄을 누르면 목록 위로 창이 반쯤 올라오고(바깥을 누르면 닫힘), ‹ ›로 목록 순서대로 넘긴다.
// 창에서 바꾼 수량은 목록·계좌 카드에 남고(이 기기의 이 날짜에만, 실제 주문 없음) '되돌리기'로 원래 수량으로 돌린다.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BandMini } from "@/components/model";
import { gradeText, type DirectionGrade } from "@/lib/trust";
import { GradeHelp, NotServiceHelp } from "@/components/helps";
import { Layer, StickyAccount } from "@/components/sheet";
import { StockPanel, colorOf, pctText, swonText, wonText } from "@/components/stockpanel";

export type BRow = {
  code: string; name: string; sector: string; tier: 1 | 2 | 3; kind: "ok" | "out" | "low" | "nocalc" | "notservice"; side: "up" | "down" | null;
  qty: number; pc: number | null; h: number | null; l80: number | null; u80: number | null; l90: number | null; u90: number | null;
  grade: DirectionGrade | null; p: number | null; nxtG: number | null; earn: boolean; y: number | null; open: number | null; in80: boolean | null; nNews: number; v?: { neg: number; pos: number; neu: number };   // v: 밤사이 소식의 이 종목 기준 판정 개수
  avg: number | null;   // 평단(보유 종목에 넣었을 때)
};

const TINTS: [string, string][] = [["rgba(241,163,60,0.18)", "#b86e12"], ["rgba(139,111,214,0.18)", "#6a4fb8"], ["rgba(0,140,130,0.14)", "#008c82"],
  ["rgba(76,111,195,0.14)", "#4c6fc3"], ["rgba(214,51,108,0.14)", "#d6336c"], ["rgba(154,164,168,0.18)", "#5e6e72"]];
const tint = (sector: string) => TINTS[[...sector].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TINTS.length];

export function NightBoard({ t, after0811, phase, view, rows, holdRows, sortLabel, accountTitle, accountHead, accountBelow, listHead, futures, stickySeg, attention, rest, footer, initialOpen }: {
  t: string; after0811: boolean; phase: "pre" | "post"; view: "hold" | "watch"; rows: BRow[]; holdRows: BRow[]; sortLabel: string;
  accountTitle: string; accountHead: ReactNode; accountBelow: ReactNode; listHead: ReactNode; futures: ReactNode; stickySeg: ReactNode; footer: ReactNode;
  attention: { title: string; sub: string } | null; rest: { title: string; sub: string } | null; initialOpen?: string;
}) {
  const key = `qty:${t}`;
  const [ovr, setOvr] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<string | null>(initialOpen ?? null);
  useEffect(() => { try { setOvr(JSON.parse(sessionStorage.getItem(key) ?? "{}")); } catch { /* 저장소 없으면 처음 수량 */ } }, [key]);
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(ovr)); } catch { /* 무시 */ } }, [key, ovr]);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", esc); };
  }, [open]);

  const qtyOf = (r: BRow) => ovr[r.code] ?? r.qty;
  // 금액 원칙(2026-11-24): 계산은 정확히, 화면에 찍을 때만 1원 반올림. 장전은 홈·종목 창과 같은 예상(08:11이면 NXT 가격),
  // 장후는 수량 × (실제 시가 − 어제 종가)(DB 등락률 y는 잘린 값이라 금액에 쓰지 않는다)
  const pctOf = (r: BRow) => (phase === "post" ? r.y : r.nxtG ?? r.h);
  const amtOf = (r: BRow, q: number) => (r.pc == null ? null : phase === "post" ? (r.open != null ? q * (r.open - r.pc) : null) : (r.nxtG ?? r.h) != null ? q * r.pc * (r.nxtG ?? r.h)! : null);
  const acct = useMemo(() => {
    const all = new Map(holdRows.map((r) => [r.code, r]));
    for (const r of rows) if (ovr[r.code] != null && !all.has(r.code)) all.set(r.code, r);
    let value = 0, amount = 0, pre = 0;
    for (const r of all.values()) {
      const q = qtyOf(r), a = amtOf(r, q);
      if (r.pc == null || a == null) continue;
      value += q * r.pc; amount += a; pre += q * r.pc * (r.nxtG ?? r.h ?? 0);
    }
    return { value, amount, pre, after: value + amount, pct: value ? amount / value : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdRows, rows, ovr, phase]);
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
  const k = open ? rows.findIndex((r) => r.code === open) : -1;
  const cur = k >= 0 ? rows[k] : null;

  const rowView = (r: BRow) => {
    const [bg, fg] = tint(r.sector);
    const q = qtyOf(r), p = pctOf(r);
    // 이름 아래 줄은 '보유 n주'만, 그 아래 줄은 소식(배포용 변경 기록 01). 긍정·부정 개수는 아직 정하지 않아 '소식 n건'·'소식 없음'으로 둔다
    let sub = view === "hold" ? `보유 ${q.toLocaleString("ko-KR")}주` : q > 0 ? `${q}주로 계산 중` : "관심 종목";
    const warn = r.kind === "out" || r.kind === "low";   // 범위 밖·믿을 정도 낮음은 아이콘 점으로만(문구는 '확인이 필요한 종목' 묶음과 종목 창에)
    if (q !== r.qty && view === "hold") sub = `${q}주로 계산 중`;
    else if (r.kind === "nocalc") sub = phase === "post" && r.h != null ? "시가 채점 전" : "이 날 계산하지 못했어요(자료 부족)";
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
            <BandMini l={r.l80} u={r.u80} dot={p} hollow={phase === "pre" && r.nxtG != null ? r.nxtG : null} />
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
        <span className="sa"><span>{phase === "post" ? "오늘 실제 시가" : "오늘 시가 예상"}</span>
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
          <section className="sheet-box stocksheet" role="dialog" aria-modal="true" aria-label={`${cur.name} 종목 창`} onClick={(e) => e.stopPropagation()}>
            <i className="grab" />
            <div className="shead">
              <button type="button" disabled={k <= 0} onClick={() => setOpen(rows[k - 1].code)} aria-label="이전 종목">‹</button>
              <span className="pos">{k + 1} / {rows.length} · {sortLabel}</span>
              <button type="button" disabled={k >= rows.length - 1} onClick={() => setOpen(rows[k + 1].code)} aria-label="다음 종목">›</button>
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
                <StockPanel icon={<span className="ic" style={{ background: tint(cur.sector)[0], color: tint(cur.sector)[1] }}>{cur.name.slice(0, 1)}</span>} phase={phase} qty={qtyOf(cur)} setQty={(q) => setOvr({ ...ovr, [cur.code]: q })} acctAmount={acct.amount} acctValue={acct.value}
                  s={{ code: cur.code, name: cur.name, qty: cur.qty, pc: cur.pc, h: cur.h, l80: cur.l80, u80: cur.u80, l90: cur.l90, u90: cur.u90, nxtG: cur.nxtG, y: cur.y, open: cur.open, avg: cur.avg }} />
                <div className="schips">
                  <span className={cur.grade ? "g tq" : "n"}>{gradeText(cur.grade, cur.p, cur.nxtG, after0811)}<GradeHelp /></span>
                  {cur.kind === "out" ? <span className="w">{phase === "pre" ? "07:30 예상과 크게 달라짐" : "범위 밖"}</span> : null}
                  {phase === "post" && cur.in80 != null ? <span className={cur.in80 ? "g" : "w"}>{cur.in80 ? "범위 안에서 시작" : "범위 밖에서 시작"}</span> : null}
                  <span className="sec">{cur.sector} 업종 · {rows.filter((r) => r.sector === cur.sector).length}종목</span>
                  {cur.earn ? <span className="w">어제 실적 공시</span> : null}
                </div>
                <p className="fine">노란 띠는 07:30 예상 범위(80%)예요. 90% 범위는 {pctText(cur.l90)} ~ {pctText(cur.u90)}.{after0811 ? <><br />{cur.nxtG != null ? `07:30 예상 ${pctText(cur.h)} → 08:11 2차 예상 ${pctText(cur.nxtG)} (08:10까지의 마지막 NXT 가격).` : "장전 가격 미확인으로 07:30 예상을 유지했어요."}</> : null}</p>
              </>
            )}
            <div className="slinks">
              <Link href={`/news?tab=mine&c=${cur.code}`}>밤사이 소식 <b>{cur.nNews}건</b> ›</Link>
              <Link href={`/mine/${cur.code}`}>종목 상세 ›</Link>
            </div>
          </section>
        </div></Layer>
      ) : null}
    </>
  );
}
