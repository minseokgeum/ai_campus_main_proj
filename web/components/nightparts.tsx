// 밤사이 화면의 창·띠·상태 부품(서버에서 그림). 창은 components/sheet.tsx(움직이는 부분)로 연다.
import { FuturesFlow } from "@/components/futcard";
import Link from "next/link";
import { Sheet } from "@/components/sheet";
import { NamesTip } from "@/components/namestip";
export { GradeHelp, NotServiceHelp, FuturesHelp } from "@/components/helps";
import { FuturesHelp as FuturesHelpInline } from "@/components/helps";
import { NightChart, signColor } from "@/components/model";
import type { Night } from "@/lib/model";
import { bySector, P, SORT_LABEL, SORTS, type Phase, type Row } from "@/lib/night";
import { pct, swon } from "@/lib/format";

/** 오늘 아침 진행 창의 단계별 설명(창은 components/progress.tsx). day: 그날 개장 시각·채점 시각·개장 전 거래 여부(special_days.csv) */
export function progressDetails(stage: number, grades: { 높음: number; 보통: number; 낮음: number; 대상아님: number }, check: { scored: number; inN: number } | null,
  day: { openAt: string; chk: string; next: string; premarket: boolean } = { openAt: "09:00", chk: "09:05", next: "09:00 개장 직후", premarket: true }): [string, string, boolean][] {
  return [
    ["06:00 야간 마감", "야간선물 거래가 06:00에 끝나면 지난밤 움직임으로 종목별 예상 시가를 계산해요.", stage > 0],
    ["06:30 예상 범위 고정", "지난 비슷한 아침의 기록으로 종목마다 예상 범위(노란 띠)를 정해 공개해요.", stage > 1],
    !day.premarket ? ["08:11 장전 가격·방향 등급", `오늘은 개장 전 거래(NXT)가 없는 날이라 08:11 업데이트가 없어요. ${day.openAt} 시가가 나오면 바로 채점해요.`, stage > 2]
      : ["08:11 장전 가격·방향 등급", stage > 2 ? `장전 등락 방향이 시가까지 이어질 확률 · 높음 ${grades.높음} · 보통 ${grades.보통} · 낮음 ${grades.낮음}${grades.대상아님 ? ` · 서비스 대상 아님 ${grades.대상아님}` : ""}`
      : "08:10까지 확인한 NXT 가격을 2차 예상으로 쓰고, 같은 방향으로 개장할 확률을 등급으로 표시해요.", stage > 2],
    [`${check ? day.chk : day.next} 실제 시가로 채점`, check ? `${check.scored}종목 중 ${check.inN}종목이 06:30 범위 안에서 시작했어요.` : `${day.openAt} 시가가 나오면 바로 예상 범위 안에 들었는지 채점해요.`, !!check],
  ];
}



/** 업종별로 보면(피그마 379:2934) */
export function SectorSheet({ rows, acct, count, label }: { rows: Row[]; acct: { amount: number; pct: number }; count: number; label: string }) {
  const groups = bySector(rows.filter((r) => r.amount != null));
  const maxAbs = Math.max(1, ...groups.map((g) => Math.abs(g.amount)));
  const top = groups[0];
  return (
    <Sheet className="linkish teal" title="업종별로 보면" sub={`보유 ${count}종목 · 오늘 ${label} 금액 변화 큰 순`} trigger={<span>업종별 보기 ›</span>}>
      <p className="sacct">계좌 {label} <b style={{ color: signColor(acct.amount) }}><span className="amt">{swon(acct.amount)}</span> · {pct(P(acct.pct))}</b></p>
      {groups.map((g) => (
        <div key={g.sector} className="sgrp">
          <div className="sn"><b>{g.sector}</b><span className="cnt">{g.list.length}종목</span><NamesTip names={g.list.map((r) => r.name)} /></div>
          <div className="sbar"><i style={{ left: g.amount < 0 ? `${50 - (Math.abs(g.amount) / maxAbs) * 50}%` : "50%", width: `${(Math.abs(g.amount) / maxAbs) * 50}%`, background: signColor(g.amount) }} /></div>
          <b className="amt" style={{ color: signColor(g.amount) }}>{swon(g.amount)}</b>
        </div>
      ))}
      {top ? <p className="fine">{top.sector} {top.list.length}종목이 오늘 {label} 변화의 가장 큰 부분({swon(top.amount)})을 차지해요. 같은 업종은 같은 소식에 함께 움직이기 쉬워요.</p> : null}
    </Sheet>
  );
}

/** 정렬 선택(피그마 444:6560 · 444:6576): 고르면 닫히며 적용 */
export function SortSheet({ current, href }: { current: string; href: (o: string) => string }) {
  return (
    <Sheet className="linkish" title="정렬" close="none" trigger={<span>{SORT_LABEL(current)} ▾</span>}>
      <div className="sortopts">
        {SORTS.map(([o, label]) => <Link key={o} href={href(o)} className={o === current ? "on" : ""}><span>{label}</span>{o === "w" ? <small>내 계좌에서 차지하는 비율</small> : null}{o === current ? <em>✓</em> : null}</Link>)}
      </div>
    </Sheet>
  );
}

/** 주의 띠(피그마 563:697 월요일 · 461:7929 연휴 다음 날 · 461:7489 미국 휴장 다음 날 · 449:469 일부 못 받아옴) */
export function Banner({ kind, n, total, title, body }: { kind: "mon" | "hol" | "us" | "nonight" | "earn" | "partial" | "day"; n?: number; total?: number; title?: string; body?: string }) {
  const text = kind === "day" ? [title ?? "", body ?? ""] : {
    mon: ["월요일 아침이에요", "주말 동안 쌓인 소식이 한꺼번에 반영돼서, 과거 월요일엔 시가가 예상 범위를 벗어난 날이 더 많았어요. 다른 요일은 10번 중 2번, 월요일은 10번 중 2.6번꼴이에요."],
    hol: ["연휴 다음 날 아침이에요", "며칠 동안 쌓인 소식이 한꺼번에 반영돼서, 과거 연휴 다음 날엔 시가가 예상 범위를 벗어난 날이 더 많았어요."],
    us: ["어젯밤 미국 증시가 쉬었어요", `${body ?? ""}미국 장 소식이 없는 밤이에요. 오늘 예상 시가는 평소처럼 야간선물로 계산했어요.`],   // body: 휴일 이름 앞말(예: '추수감사절이라 ', 2026-11-25)
    nonight: ["어젯밤 야간 거래가 없었어요", "야간선물 없이 미국 시장 흐름만으로 계산해서 예상 범위가 평소보다 넓어요."],   // 컴포넌트 563:17
    earn: [`어제 실적 공시가 나온 종목이 ${n}개 있어요`, "과거 이런 아침엔 시가가 범위 밖으로 더 자주 나갔어요. 종목에 '어제 실적 공시' 표시를 붙였어요."],
    partial: [`${n}종목의 예상을 불러오지 못했어요`, `계좌 예상은 나머지 ${total}종목으로만 계산했어요.`],
  }[kind];   // day: 특별한 날 달력(special_days.csv)의 그날 안내(10시 개장 · 미국 조기 마감)
  return (
    <div className="banner">
      <span className="warn" aria-hidden>!</span>
      <div><b>{text[0]}</b><p>{text[1]}</p></div>
      {kind === "partial" ? <a href="" className="retry">다시 시도</a> : null}
    </div>
  );
}

/** 06:30 전 목록 자리(피그마 449:2): 종목 줄 대신 회색 막대 */
export function SkeletonList({ title, n, late }: { title: string; n: number; late?: boolean }) {   // late: 06:30이 지났는데 아직 예상이 없음(피그마 784:1573)
  return (
    <>
      <div className="lhead"><b>{title}</b><span className="linkish dis">금액 변화 큰 순 ▾</span></div>
      {Array.from({ length: Math.min(3, Math.max(1, n)) }, (_, k) => (
        <div key={k} className="skrow" aria-hidden><i className="c" /><span><i /><i /></span><i className="r" /></div>
      ))}
      <p className="fine skfine">{late ? "준비되면" : "06:30에"} 종목별 예상 범위가 채워져요</p>
    </>
  );
}

/** 06:30 전·주말·휴장일 화면의 큰 카드와 야간선물 흐름(피그마 449:2 · 461:8369) */
export function WaitState({ kicker, title, body, link, night, nightNote, seg, after }: {
  kicker: string; title: string; body: string; link?: { href: string; label: string }; night: Night | null; nightNote: string;
  seg?: React.ReactNode; after?: React.ReactNode;   // 카드 안 보유/관심 전환(피그마 449:2), 야간선물 아래 내용
}) {
  const last = night?.points.length ? night.points[night.points.length - 1].r : null;
  return (
    <>
      <section className="acct wait">
        <div className="at">{kicker}</div>
        <div className="big"><span>{title}</span></div>
        <p className="wb">{body}</p>
        {link ? <Link href={link.href} className="wlink">{link.label} <em>›</em></Link> : null}
        {seg ? <div className="seg w">{seg}</div> : null}
      </section>
      {night ? (
        <div className="fut">
          <FuturesFlow night={night} sub={nightNote}>
            <div className="fh"><b className="tq">코스피200 야간선물<FuturesHelpInline /></b><span className="futgo"><span style={{ color: signColor(last ?? 0) }}>{last != null ? pct(P(last)) : "—"}</span><em>›</em></span></div>
            <p className="fine">{nightNote}</p>
            <NightChart night={night} />
            <div className="axis"><span>18:00</span><span>23:30 미국 개장</span><span>06:00 마감</span></div>
          </FuturesFlow>
        </div>
      ) : null}
      {after}
    </>
  );
}

export type { Phase };
