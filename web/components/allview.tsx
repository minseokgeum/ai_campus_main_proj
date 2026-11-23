// 홈 '한 화면에 보기'(2026-11-22): 원래 버전(overnight_briefing/service/web/orig) 브리핑처럼 밤사이 정보를 한 화면에 이어서 보여 준다.
// 순서: ① 9시 내 주식 변화(기여 종목·어제→예상 합계·종목별 막대·오늘 진행) ② 먼저 확인할 것 ③ 내 종목과 이어진 밤사이 소식
//       ④ 보유 종목 카드(노란 띠 80% 예상 범위·08:10 장전 거래·띠 안 금액·믿을 정도·소식·예상과 소식 같이 읽기) ⑤ 소식 더 ⑥ 밤사이 시장(미국 지수·야간선물)
// 모양은 피그마 버전(globals.css의 카드·색·글자)을 쓴다. 숫자는 모두 계산값이고, 소식은 예상 계산에 넣지 않는다(원인 단정 금지).
import Link from "next/link";
import { Avatar, StockNews } from "@/components/ui";
import { MaskToggle } from "@/components/sheet";
import { signColor } from "@/components/model";
import { FuturesCard } from "@/components/futcard";
import { FuturesHelp } from "@/components/helps";
import { account, ordered, P, type Row } from "@/lib/night";
import { impactFor, verdictsOf, type Article } from "@/lib/news";
import type { Night } from "@/lib/model";
import type { UsDay } from "@/lib/market";
import { md, US } from "@/lib/market";
import { pct, swon, won } from "@/lib/format";
import type { CardStock } from "@/lib/model";
import type { Reason } from "@/lib/summary";
import type { Ev } from "@/lib/events";

const DOTS: Record<string, string> = { 높음: "●●●", 보통: "●●○", 낮음: "●○○" };
const BAND = "#FFD970";

type Props = {
  rows: Row[];               // 장전: 예상 · 장후: 실제(채점)
  preRows: Row[];            // 장전 예상(장후에도 '예상' 칸과 띠에 씀)
  post: boolean;             // 채점 뒤인가
  slot0811: boolean;         // 08:11 카드(장전 거래 반영)인가
  steps: { t: string; label: string; done: boolean }[];
  news: Map<string, Article[]>;   // 종목코드 → 그 종목 기사
  reasons: Map<string, Reason>;
  x: number | null;          // 밤사이 야간선물 변화(카드 x, 비율). 같이 읽기 첫 문장
  events: Ev[];              // 다가오는 일정(7일 안, lib/events.ts)
  nxtHist: Map<string, [number, number]>;   // 종목 → [최근 08:11 카드 중 장전 거래 있던 날, 센 날]
  noPre: boolean;            // 오늘은 개장 전 거래가 없는 날(수능일 등)
  openAt: string;            // 오늘 개장 시각
  lines: Map<string, { line: string | null }>;   // 종목 한 줄(hot_company): 이유 문장이 없을 때
  record: { inN: number; n: number } | null;     // 지난 20거래일 내 종목 범위 안
  us: Map<string, UsDay>;
  night: Night | null;
  buckets: number[];
  nightLive: boolean;
  briefSlot?: React.ReactNode;   // 밤사이 뉴스 AI 요약 카드(홈과 같은 것)
};

/** 노란 띠(종목 카드용, 정적): 80% 예상 범위 · 대표 예상(검은 점) · 어제 종가(회색 점선) · 08:10 장전 거래(빨간 선) · 실제 시가(빈 동그라미) */
function Band({ l, u, h, nxt, y }: { l: number; u: number; h: number; nxt?: number | null; y?: number | null }) {
  const W = 342, pad = 12;
  const m = Math.max(0.01, Math.abs(l), Math.abs(u), Math.abs(h), Math.abs(nxt ?? 0), Math.abs(y ?? 0)) * 1.25;
  const X = (v: number) => pad + ((v + m) / (2 * m)) * (W - 2 * pad);
  const pc = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(2)}%`;
  const near = (a: number, b: number) => Math.abs(X(a) - X(b)) < 34;
  const lx = nxt != null && near(l, nxt) ? Math.max(20, X(nxt) - 36) : X(l);
  const ux = nxt != null && near(u, nxt) ? Math.min(W - 20, X(nxt) + 36) : X(u);
  return (
    <svg width="100%" viewBox={`0 0 ${W} 58`} role="img" aria-label={`예상 범위 ${pc(l)} ~ ${pc(u)}, 대표 예상 ${pc(h)}`} className="aband">
      <text x={X(0)} y={10} textAnchor="middle" fontSize={10} fill="#66777a">어제 종가</text>
      <rect x={pad} y={23} width={W - 2 * pad} height={8} rx={4} fill="#eef1f2" />
      <rect x={X(l)} y={21} width={Math.max(3, X(u) - X(l))} height={12} rx={6} fill={BAND} />
      <line x1={X(0)} x2={X(0)} y1={15} y2={39} stroke="#8a9598" strokeWidth={1.5} strokeDasharray="3 3" />
      {nxt != null ? <><rect x={X(nxt) - 1} y={16} width={2} height={22} fill="#d35d66" /><text x={X(nxt)} y={50} textAnchor="middle" fontSize={10} fontWeight={700} fill="#d35d66">08:10</text></> : null}
      <circle cx={X(h)} cy={27} r={6} fill="#2f3437" stroke="#fff" strokeWidth={2} />
      {y != null ? <circle cx={X(y)} cy={27} r={6} fill="#fff" stroke="#192d31" strokeWidth={2} /> : null}
      <text x={lx} y={55} textAnchor="middle" fontSize={11} fill={signColor(l)}>{pc(l)}</text>
      <text x={ux} y={55} textAnchor="middle" fontSize={11} fill={signColor(u)}>{pc(u)}</text>
    </svg>
  );
}


/* 예상과 밤사이 소식, 같이 읽기(원래 버전 overnight_briefing/service/web/orig/js/screens.js combinedHtml·bandWords·readTogether와 같은 규칙, 2026-11-23)
   ① 노란 띠를 말로 ② AI 문장(07:00대 종목 이유 + 관계사 기사면 관계 문장) ③ 기사 방향과 예상을 나란히 ④ 소식 수·매체 수. 소식은 예상 계산에 넣지 않는다 */
const NOTE = "예상 가격대는 이 소식을 넣지 않고 계산했어요";
function bandWords(s: CardStock, x: number | null, y: number | null): string {
  const lo = s.l80, hi = s.u80, H = s.h;
  const k = hi <= 0 ? 0 : lo >= 0 ? 1 : H <= -0.003 ? 2 : H >= 0.003 ? 3 : 4;
  const head = x == null ? "예상 가격대는" : `밤사이 야간선물(${pct(P(x))})을 반영한 예상 가격대는`;
  if (y != null) {
    const past = ["전체가 어제 종가보다 아래였고", "전체가 어제 종가보다 위였고", "어제 종가보다 아래쪽으로 치우쳐 있었고", "어제 종가보다 위쪽으로 치우쳐 있었고", "어제 종가를 가운데 두고 위아래로 비슷했고"][k];
    return `${head} ${past}, 9시에는 ${lo <= y && y <= hi ? "예상대로" : y > hi ? "예상보다 높게" : "예상보다 낮게"} 시작했어요(${pct(P(y))}).`;
  }
  return `${head} ${["전체가 어제 종가보다 아래예요", "전체가 어제 종가보다 위예요", "어제 종가보다 아래쪽으로 치우쳐 있어요", "어제 종가보다 위쪽으로 치우쳐 있어요", "어제 종가를 가운데 두고 위아래로 비슷해요"][k]}.`;
}
function readTogether(dir: Reason["dir"], s: CardStock): string {
  if (dir === "위쪽" || dir === "아래쪽") {
    const good = dir === "위쪽" ? "좋은" : "나쁜", tail = " 기사의 방향이 주가 방향을 뜻하지는 않아요.";
    if (Math.abs(s.h) < 0.001) return `기사 내용만 보면 이 종목에 ${good} 쪽 소식이에요.${tail}`;
    return `기사 내용만 보면 이 종목에 ${good} 쪽 소식이고, 예상과는 ${(s.h > 0) === (dir === "위쪽") ? "같은" : "반대"} 방향이에요.${tail}`;
  }
  if (dir === "엇갈림") return "이어진 소식들의 방향이 서로 엇갈려요.";
  return "이 종목에 좋은 쪽인지 나쁜 쪽인지는 기사만으로 가리기 어려워요.";
}
function Combined({ s, x, y, reason, arts }: { s: CardStock; x: number | null; y: number | null; reason?: Reason; arts: Article[] }) {
  const head = <><b className="cb-h">예상과 밤사이 소식, 같이 읽기</b><p className="cb-band">{bandWords(s, x, y)}</p></>;
  if (!arts.length && !reason) return <div className="combined plain">{head}<p className="mute">밤사이 이 종목과 이어진 미국 기사는 없었어요.</p></div>;
  const n = arts.length || 1;
  const outlets = reason?.outlets ?? null;
  const meta = `직접 이어진 소식 ${n}건${outlets && outlets > 1 ? ` · 대표 소식은 매체 ${outlets}곳` : ""} · ${NOTE}`;
  if (reason) {
    return (
      <div className="combined">{head}
        <p><span className="ai">AI</span>{reason.line}{reason.relation ? ` ${reason.relation}` : ""}</p>
        <p className="cb-read">{readTogether(reason.dir, s)}</p>
        <div className="cb-meta">{meta}</div>
      </div>
    );
  }
  const top = arts.find((a) => a.ko) ?? arts[0];
  return (
    <div className="combined">{head}
      <p>직접 이어진 미국 기사가 {n}건 있어요. 대표 소식: {top.ko ?? top.title}</p>
      <div className="cb-meta">{meta}</div>
    </div>
  );
}


/* 먼저 확인할 것(원래 버전 screens.js firstLook·checks·topNews와 같은 규칙, 2026-11-23): 칸 3개 — 내(금액) · 8시/9시(확인할 표시·다음에 볼 것) · 소식
   권유·원인 단정 없음. 금액은 원 단위로 쓴다(원래 버전은 만원) */
const jo = (w: string, a: string, b: string) => { const c = w.charCodeAt(w.length - 1); return w + (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? a : b); };
type Ck = { r: Row; why: string; strong: boolean; w: number; nxo: boolean };
function FirstLook(p: Props & { shown: Set<string> }) {
  const held = p.rows.filter((r) => r.qty > 0 && r.s && r.amount != null && r.value != null);
  if (!held.length) return null;
  const post = p.post, pre = p.slot0811 && !p.noPre;
  const val = (r: Row) => r.value!, h730 = (r: Row) => r.value! * r.s!.h;
  const band = (r: Row) => [r.value! * r.s!.l80, r.value! * r.s!.u80] as const;
  const nxtNone = (code: string) => { const h = p.nxtHist.get(code); return !!(h && h[1] >= 3 && h[0] === 0); };
  const sv = held.reduce((a, r) => a + val(r), 0) || 1;
  // 확인할 표시: 강한 것(개장 전 거래·시작가가 예상 밖, 어제 실적 공시)은 크기와 상관없이, 약한 것(방향 유지 낮음·개장 전 거래 없음)은 보유 금액 10% 이상만
  const anyG = pre && held.some((r) => r.s!.nxtG != null);
  const ck: Ck[] = [];
  for (const r of held) {
    const s = r.s!, g = pre ? s.nxtG : null, w = val(r) / sv;
    let why = "", strong = false, nxo = false;
    if (post) { if (r.c && !(s.l80 <= r.c.y && r.c.y <= s.u80)) { why = `예상보다 ${r.c.y > s.u80 ? "높게" : "낮게"} 시작했어요`; strong = true; } }
    else if (g != null && !(s.l80 <= g && g <= s.u80)) { why = `개장 전 거래가 예상보다 ${g > s.u80 ? "높아요" : "낮아요"}`; strong = true; nxo = true; }
    if (!why && s.earn) { why = "어제 실적 공시"; strong = true; }
    if (!why && !post && anyG && w >= 0.1) {
      if (g != null && s.dir === "낮음") why = "개장 전 거래 방향 유지 낮음";
      else if (g == null) why = nxtNone(r.code) ? "평소 개장 전 거래가 없는 종목 · 새 숫자는 08:50 예상체결가부터" : "개장 전 거래가 없어 07:30 예상 그대로예요";
    }
    if (why) ck.push({ r, why, strong, w, nxo });
  }
  ck.sort((a, b) => Number(b.strong) - Number(a.strong) || b.w - a.w);
  const heldCodes = new Set(held.map((r) => r.code));
  const isLate = (e: Ev) => e.dday === 0 && /06:00 마감 뒤/.test(e.title) && e.codes.some((c) => heldCodes.has(c));
  const late = post ? null : p.events.find(isLate);
  const ev = p.events.find((e) => !isLate(e) && e.dday <= 1);
  const evTxt = ev ? ` 일정: ${ev.dday === 0 ? "오늘" : "내일"} ${ev.title}.` : "";
  const lateTxt = late ? (() => {
    const mine = held.filter((r) => late.codes.includes(r.code)).map((r) => r.name).join("·");
    const first = p.noPre ? `발표 뒤 첫 국내 가격은 ${p.openAt} 시작가예요` : "발표 뒤 첫 국내 가격은 08:00 개장 전 거래예요(08:11 화면에 반영)";
    return `07:30 예상에 안 들어간 일정: ${late.title.replace(/\s*·\s*06:00 마감 뒤/, "")}. 06:00 야간선물 마감 뒤 발표라 예상 가격대에 없어요. 이어진 내 종목: ${mine}. ${first}.`;
  })() : "";

  // ① 내 돈
  const byAmt = [...held].sort((a, b) => Math.abs(b.amount!) - Math.abs(a.amount!)), top = byAmt[0], n = held.length;
  const done = post && !!top.c;
  const dn = held.filter((r) => (r.pct ?? r.s!.h) < 0).length;
  const dirTxt = done ? "" : dn === n ? `${n}종목 모두 어제보다 낮게 시작할 것으로 보여요.` : dn === 0 ? `${n}종목 모두 어제보다 높게 시작할 것으로 보여요.` : `${n}종목 중 ${dn}종목은 낮게, ${n - dn}종목은 높게 보여요.`;
  const [lo, hi] = band(top);
  const t1 = done ? `${jo(top.name, "이", "가")} 가장 크게 움직였어요 · ${swon(top.amount!)}` : `${jo(top.name, "이", "가")} 가장 크게 움직여요 · 예상 ${swon(top.amount!)}`;
  const s1 = done ? `07:30 예상 ${swon(h730(top))}, 노란 막대(${swon(lo)} ~ ${swon(hi)}) ${top.s!.l80 <= top.c!.y && top.c!.y <= top.s!.u80 ? "안에서" : "밖에서"} 시작했어요.`
    : `노란 막대 안에서 시작하면 이 종목 금액 변화는 ${swon(lo)} ~ ${swon(hi)}이에요. ${dirTxt}`;

  // ② 확인할 때
  const ic2 = post ? "9시" : p.noPre ? "개장" : "8시";
  let b2: React.ReactNode;
  if (ck.length) {
    const nxr = ck.filter((x) => x.nxo).map((x) => x.r);
    const tot = held.reduce((a, r) => a + Math.abs(h730(r)), 0);
    const sh = tot ? Math.round((100 * nxr.reduce((a, r) => a + Math.abs(h730(r)), 0)) / tot) : 0;
    const h730sum = held.reduce((a, r) => a + h730(r), 0), hsum = held.reduce((a, r) => a + r.amount!, 0);
    const why = nxr.length ? `${nxr.map((r) => r.name).join("·")}의 개장 전 거래가 07:30 가격대 밖이에요(믿을 정도 낮음, 아침 예상 금액 변화의 ${sh}%). 그래서 08:11 계좌 예상은 개장 전 가격 쪽으로 보정했어요(07:30 ${swon(h730sum)} → ${swon(hsum)}). 지난 기록에서 이런 종목은 시작가가 07:30 가격대 안에서 열린 날이 10번 중 3번이었어요.`
      : post ? "예상 가격대 밖에서 시작한 종목이에요." : "방향 유지가 낮을수록 시작가 방향이 개장 전 거래 방향과 달라지는 날이 많았어요.";
    b2 = <><b>확인할 표시 {ck.length}종목</b><small>{why + evTxt}</small>
      {ck.slice(0, 3).map((x) => (
        <a key={x.r.code} className="mini" href={`#ac-${x.r.code}`}><span><b>{x.r.name}</b> <span className={x.strong ? "lo" : ""}>{x.why}</span></span>
          <b style={{ color: signColor(x.nxo ? x.r.s!.nxtG! : x.r.amount!) }}>{x.nxo ? `개장 전 ${pct(P(x.r.s!.nxtG!))}` : swon(x.r.amount!)}</b></a>
      ))}
      {ck.length > 3 ? <small className="fl-more">{ck.slice(3).map((x) => x.r.name).join("·")} 더</small> : null}</>;
  } else if (post) {
    b2 = <><b>시작가가 나온 {held.filter((r) => r.c).length}종목 모두 예상대로 시작했어요</b><small>{"아침 예상 가격대 안에서 시작했다는 뜻이에요. 날마다의 결과는 '기록'에 쌓여요." + evTxt}</small></>;
  } else if (!p.slot0811 && !p.noPre) {
    const top2 = [...held].sort((a, b) => Math.abs(h730(b)) - Math.abs(h730(a))).slice(0, 2), nx2 = top2.filter((r) => !nxtNone(r.code)), nn = top2.filter((r) => nxtNone(r.code));
    const nm = (rs: Row[]) => rs.map((r) => r.name).join("·");
    const t = nx2.length ? `08:11에 다시 볼 것: ${nm(nx2)}` : `08:50에 다시 볼 것: ${nm(nn)}`;
    const sub = (nn.length && nx2.length ? "예상 금액 변화가 가장 큰 두 종목 가운데 개장 전 거래가 있는 종목이에요." : `예상 금액 변화가 가장 큰 ${top2.length > 1 ? "두 종목" : "종목"}이에요.`)
      + (nx2.length ? " 08:11 화면에서는 개장 전 거래가 노란 막대 밖인 종목과 거래가 없는 종목을 이 칸 맨 위에 나눠 보여 드려요." : "")
      + (nn.length ? ` ${jo(nm(nn), "은", "는")} 최근 ${p.nxtHist.get(nn[0].code)?.[1] ?? 0}거래일 동안 개장 전 거래가 없었던 종목이라, 새 숫자는 08:50 거래소 예상체결가부터 나와요.` : "");
    b2 = <><b>{t}</b><small>{sub + evTxt}</small></>;
  } else if (p.noPre) {
    b2 = <><b>오늘은 개장 전 거래가 없어요</b><small>{`개장은 ${p.openAt}이에요. 07:30 예상이 개장 전 마지막 숫자예요.` + evTxt}</small></>;
  } else {
    const gr = held.filter((r) => r.s!.nxtG != null), lv = (k: string) => gr.filter((r) => r.s!.dir === k).length;
    const mix = ["높음", "보통", "낮음"].map((k) => (lv(k) ? `${k} ${lv(k)}` : "")).filter(Boolean).join(" · ");
    const noneR = held.filter((r) => r.s!.nxtG == null);
    const noneTxt = !noneR.length ? "" : noneR.every((r) => nxtNone(r.code)) ? ` ${jo(noneR.map((r) => r.name).join("·"), "은", "는")} 평소에도 개장 전 거래가 없는 종목이라 새 숫자는 08:50 거래소 예상체결가부터예요.` : ` 개장 전 거래가 없던 ${noneR.length}종목은 07:30 예상 그대로예요.`;
    b2 = gr.length ? <><b>개장 전 거래가 있던 {gr.length}종목 모두 예상대로예요</b><small>{`아침 예상 가격대 안에서 거래되고 있어요. 시작가 방향 믿을 정도: ${mix}.${noneTxt}` + evTxt}</small></>
      : <><b>개장 전 거래가 있었던 종목이 없어요</b><small>{"07:30 예상 그대로예요." + evTxt}</small></>;
  }

  // ③ 이어진 소식: 회사 자체 → 거래 상대 → 그 밖(제품·업종), 같으면 보유 금액 큰 순. 한 종목에 1건, 최대 2건
  const cand: { a: Article; r: Row; rank: number }[] = [];
  for (const r of held) for (const a of p.news.get(r.code) ?? []) { const k = a.rank[r.code] ?? 9; cand.push({ a, r, rank: k <= 1 ? 0 : k === 3 ? 2 : 4 }); }
  cand.sort((x, y) => x.rank - y.rank || val(y.r) - val(x.r));
  const tn: typeof cand = [], seen = new Set<string>();
  for (const x of cand) if (tn.length < 2 && !seen.has(x.r.code) && !p.shown.has(x.a.key)) { seen.add(x.r.code); p.shown.add(x.a.key); tn.push(x); }
  const who = (k: number) => (k === 0 ? "회사 소식" : k === 2 ? "거래 상대 소식" : "제품·업종 소식");

  return (
    <section className="allsec" id="firstlook">
      <div className="hrow"><h3>먼저 확인할 것</h3></div>
      <div className="look3">
        <a className="l3" href={`#ac-${top.code}`}><span className="ic a">내</span><span className="bd"><b>{t1}</b><small>{s1}</small></span><em aria-hidden>›</em></a>
        <div className="l3"><span className={`ic ${ck.length || late ? "w" : ""}`}>{ic2}</span><span className="bd">{b2}{lateTxt ? <small className="late">{lateTxt}</small> : null}</span><span /></div>
        <div className="l3"><span className={`ic ${tn.length ? "y" : ""}`}>소식</span><span className="bd">
          {tn.length ? tn.map((x, i) => (
            <Link key={x.a.key} className={i ? "mini nw" : "nw0"} href={`/news/a/${encodeURIComponent(x.a.key)}`}>
              <span className="who">{x.r.name} · {who(x.rank)}</span><b>{x.a.ko ? <span className="ai">AI</span> : null}{x.a.ko ?? x.a.title}</b>{!i ? <small>{x.a.source}</small> : null}
            </Link>
          )) : <><b>밤사이 내 종목과 이어진 미국 기사가 없어요.</b><small>시장 전체 소식은 아래 &apos;밤사이 시장&apos;에서 볼 수 있어요.</small></>}
        </span><span /></div>
      </div>
      <p className="fine">이어졌다는 건 사업 관계가 있다는 뜻이에요. 이 소식 때문에 주가가 움직였다는 뜻은 아니에요.</p>
    </section>
  );
}

export function AllView(p: Props) {
  const ac = account(p.rows);
  const calc = p.rows.filter((r) => r.amount != null);
  // 기여: 합계와 같은 방향 종목 중 가장 큰 종목이 그 방향 금액의 몇 %인가(원래 버전 "줄어들 금액의 84%가 SK하이닉스예요")
  const same = calc.filter((r) => Math.sign(r.amount!) === Math.sign(ac.amount) && r.amount !== 0).sort((a, b) => Math.abs(b.amount!) - Math.abs(a.amount!));
  const sameSum = same.reduce((a, r) => a + Math.abs(r.amount!), 0);
  const top = same[0];
  const verb = ac.amount < 0 ? (p.post ? "줄어든" : "줄어들") : (p.post ? "늘어난" : "늘어날");
  // 종목별로 보면: 금액 변화 큰 3종목 + 그 외
  const byAmt = [...calc].sort((a, b) => Math.abs(b.amount!) - Math.abs(a.amount!));
  const absSum = byAmt.reduce((a, r) => a + Math.abs(r.amount!), 0) || 1;
  const head = byAmt.slice(0, 3), rest = byAmt.slice(3);
  const restAmt = rest.reduce((a, r) => a + r.amount!, 0);
  const maxAbs = Math.max(1, ...head.map((r) => Math.abs(r.amount!)), Math.abs(restAmt));
  const bars: [string, number, string][] = [...head.map((r) => [r.name, r.amount!, r.code] as [string, number, string]), ...(rest.length ? [[`그 외 ${rest.length}종목`, restAmt, ""] as [string, number, string]] : [])];

  const pre = new Map(p.preRows.map((r) => [r.code, r]));

  // 내 종목과 이어진 소식: 판정이 있는 기사 먼저, 같은 기사는 한 번만
  const seen = new Set<string>();
  const items: { a: Article; code: string }[] = [];
  for (const r of p.rows) for (const a of p.news.get(r.code) ?? []) if (!seen.has(a.key)) { seen.add(a.key); items.push({ a, code: r.code }); }
  items.sort((x, y) => Number(!!impactFor(y.a, y.code)) - Number(!!impactFor(x.a, x.code)) || y.a.published.localeCompare(x.a.published));
  const nameOf = new Map(p.rows.map((r) => [r.code, r.name]));
  const shown = new Set<string>();   // 먼저 확인할 것 소식 칸에 보인 기사(소식 더에서 뺀다)
  const more = () => items.filter((x) => !shown.has(x.a.key));

  const list = ordered(p.rows.filter((r) => r.kind !== "notservice" && r.kind !== "nocalc"));
  const none = p.rows.filter((r) => r.kind === "notservice" || r.kind === "nocalc");

  return (
    <div className="allview">
      {/* ① 9시 내 주식 변화 */}
      <section className="acct allacct">
        <div className="at"><span>{p.post ? "오늘 시가로 실제 바뀐 내 주식" : "9시에 예상되는 내 주식 변화"}</span><MaskToggle /></div>
        <div className="big" style={{ color: signColor(ac.amount) }}><span className="amt tot">{swon(ac.amount)}</span><small>{pct(P(ac.pct))}</small></div>
        {top && sameSum ? <p className="allwho">{verb} 금액의 <b>{Math.round((Math.abs(top.amount!) / sameSum) * 100)}%</b>가 {top.name}예요.</p> : null}
        <div className="flow">
          <div><small>어제 종가 기준</small><b className="amt">{won(ac.value)}</b></div><span aria-hidden>→</span>
          <div className="r"><small>{p.post ? "실제 시가 기준" : "예상 시가 기준"}</small><b className="amt">{won(ac.after)}</b></div>
        </div>
        <div className="allbars">
          <p className="ab-h"><span>종목별로 보면</span><span>가운데 = 어제 종가</span></p>
          {bars.map(([name, amt, code]) => {
            const w = (Math.abs(amt) / maxAbs) * 50;
            return (
              <div key={name} className="ab-r">
                <span className="ab-n">{code ? <Link href={`/night?open=${code}`}>{name}</Link> : name}</span>
                <span className="ab-b"><i style={{ left: amt < 0 ? `${50 - w}%` : "50%", width: `${w}%`, background: signColor(amt) }} /></span>
                <span className="ab-v"><b className="amt" style={{ color: signColor(amt) }}>{swon(amt)}</b><small>{Math.round((Math.abs(amt) / absSum) * 100)}%</small></span>
              </div>
            );
          })}
        </div>
        <ol className="allsteps">
          {p.steps.map((s) => <li key={s.t} className={s.done ? "done" : ""}><i /><b>{s.t}</b><span>{s.label}</span></li>)}
        </ol>
      </section>

      {/* ② 먼저 확인할 것(원래 버전 칸 3개) */}
      {FirstLook({ ...p, shown })}

      {/* ④ 보유 종목 카드 */}
      <section className="allsec">
        <div className="hrow"><h3>보유 종목 {list.length}</h3><Link href="/night" className="linkish teal">밤사이에서 정렬·필터 ›</Link></div>
        {p.record ? <Link href="/night/record" className="allrec"><span>지난 20거래일 동안 내 종목 <b>{p.record.inN}/{p.record.n}</b>번이 예상 범위 안에서 열렸어요(목표 80%)</span><em>›</em></Link> : null}
        <p className="alllegend"><span><i className="lb" />노란 띠 · 80% 예상 범위</span><span><i className="ld" />대표 예상</span>{p.slot0811 && !p.post ? <span><i className="ln" />08:10 장전 거래</span> : null}{p.post ? <span><i className="lo" />실제 시가</span> : null}</p>
        {list.map((r) => {
          const s = r.s!, q = pre.get(r.code), vd = verdictsOf(p.news.get(r.code) ?? [], r.code);
          const nxt = p.slot0811 && !p.post ? s.nxtG ?? null : null;
          const yv = p.post ? r.c?.y ?? null : null;
          const nArt = p.news.get(r.code)?.length ?? 0;
          return (
            <article key={r.code} id={`ac-${r.code}`} className={`allcard ${r.kind === "out" || r.kind === "low" ? "warn" : ""}`}>
              <div className="ac-h">
                <Avatar name={r.name} size={30} />
                <div className="ac-n"><b>{r.name}</b><small>어제 {won(s.pc)} → {p.post && r.c ? `실제 ${won(r.c.open)}` : `예상 ${won(s.pc * (1 + s.h))}`}</small></div>
                <div className="ac-v"><b style={{ color: signColor(r.pct ?? 0) }}>{r.pct != null ? pct(P(r.pct)) : "—"}</b><small className="amt" style={{ color: signColor(r.amount ?? 0) }}>{r.amount != null ? swon(r.amount) : ""}</small></div>
              </div>
              <Band l={s.l80} u={s.u80} h={s.h} nxt={nxt} y={yv} />
              <p className="ac-range">보유 {r.qty.toLocaleString("ko-KR")}주 · 노란 띠 안이면 <b className="amt">{swon(r.qty * s.pc * s.l80)}</b> ~ <b className="amt">{swon(r.qty * s.pc * s.u80)}</b></p>
              <div className="schips">
                {p.slot0811 && s.grade ? <span className="g">믿을 정도 {s.grade} {DOTS[s.grade]}</span> : <span className="n">믿을 정도는 08:11에 나와요</span>}
                {vd.neg || vd.pos ? <span className="n">{vd.neg ? `부정 ${vd.neg}` : ""}{vd.neg && vd.pos ? " · " : ""}{vd.pos ? `긍정 ${vd.pos}` : ""}</span> : <span className="n">{nArt ? `소식 ${nArt}건` : "소식 없음"}</span>}
                {s.earn ? <span className="w">어제 실적 공시</span> : null}
              </div>
              {p.post && r.c ? (() => {   // 개장 뒤: 예상 → 개장 전 → 실제(원래 버전 stock-flow)
                const y = r.c.y, g = s.nxtG, inb = s.l80 <= y && y <= s.u80;
                return (
                  <p className="ac-step">
                    <span>예상 <b style={{ color: signColor(s.h) }}>{pct(P(s.h))}</b></span><span aria-hidden>→</span>
                    {g != null ? <><span>개장 전 <b style={{ color: signColor(g) }}>{pct(P(g))}</b></span><span aria-hidden>→</span></> : null}
                    <span>실제 <b style={{ color: signColor(y) }}>{pct(P(y))}</b></span>
                    <em className={inb ? "in" : "out"}>{inb ? "예상대로" : y > s.u80 ? "예상보다 높게" : "예상보다 낮게"}</em>
                  </p>
                );
              })() : nxt != null ? (() => {   // 08:11: 07:30 예상 → 08:10 개장 전 거래
                const out = nxt > s.u80 || nxt < s.l80;
                return (
                  <>
                    <p className="ac-step">
                      <span>07:30 예상 <b style={{ color: signColor(s.h) }}>{pct(P(s.h))}</b></span><span aria-hidden>→</span>
                      <span>08:10 개장 전 거래 <b style={{ color: signColor(nxt) }}>{pct(P(nxt))}</b></span>
                      <em className={out ? "out" : "in"}>{out ? (nxt > s.u80 ? "예상보다 높게" : "예상보다 낮게") : "예상대로"}</em>
                    </p>
                    {out ? <p className="ac-flownote">지난 1년 기록으로는 이런 날 10번 중 6~7번, 9시 시작가도 {nxt > s.u80 ? "높은" : "낮은"} 쪽으로 벗어났어요</p> : null}
                  </>
                );
              })() : null}
              <Combined s={s} x={p.x} y={p.post && r.c ? r.c.y : null} reason={p.reasons.get(r.code)} arts={p.news.get(r.code) ?? []} />
              <div className="ac-links"><Link href={`/night?open=${r.code}`}>종목 창 ›</Link>{nArt ? <Link href={`/news?tab=mine&c=${r.code}`}>밤사이 소식 {nArt}건 ›</Link> : null}<Link href={`/mine/${r.code}`}>종목 상세 ›</Link></div>
            </article>
          );
        })}
        {none.length ? (
          <div className="allnone"><b>예상 범위를 계산하지 않는 종목</b>{none.map((r) => <span key={r.code}>{r.name}{r.kind === "notservice" ? " · 서비스 대상 아님" : " · 자료 없음"}</span>)}</div>
        ) : null}
      </section>

      {/* ⑤ 소식 더 */}
      {more().length ? (
        <section className="allsec">
          <div className="hrow"><h3>내 종목과 이어진 소식 더</h3><Link href="/news?tab=mine" className="linkish teal">전체 {items.length}건 ›</Link></div>
          {more().slice(0, 5).map(({ a, code }) => <div key={a.key} className="allnews"><span className="alltag">{nameOf.get(code)}</span><StockNews a={a} impact={impactFor(a, code)} /></div>)}
        </section>
      ) : null}

      {p.briefSlot ? <section className="allsec"><div className="hrow"><h3>밤사이 뉴스 요약 <span className="aimark">AI</span></h3><Link href="/news" className="linkish teal">뉴스 브리핑 ›</Link></div>{p.briefSlot}</section> : null}

      {/* ⑥ 밤사이 시장 */}
      <section className="allsec">
        <div className="hrow"><h3>밤사이 시장</h3><span className="fine">{(() => { const d = p.us.get("^GSPC")?.usDate; return d ? `${md(d)} 16:00 마감 (미 동부)` : "자료 준비 중"; })()}</span></div>
        <div className="uschips">
          {US.map((u) => { const d = p.us.get(u.sym); return <Link key={u.sym} href={`/us?s=${encodeURIComponent(u.sym)}`} className="uschip"><span>{u.short}</span><b style={{ color: signColor(d?.chg ?? 0) }}>{d ? pct(P(d.chg)) : "—"}</b></Link>; })}
        </div>
        {p.night?.points.length ? <FuturesCard night={p.night} live={p.nightLive} buckets={p.buckets} />
          : <div className="futbar off"><span className="nm"><b className="tq">코스피200 야간선물<FuturesHelp /></b><small>어젯밤 18:00 ~ 06:00</small></span><span className="chg"><b>거래 없음</b></span></div>}
        <p className="fine">야간선물이 밤사이 미국 시장과 소식이 모이는 한국 쪽 가격이에요. 오늘 예상 범위는 06:00 마감 변화로 계산했어요.</p>
      </section>
      <p className="fine">모델 추정이며 투자 권유가 아니에요.</p>
      {/* ⑦ 다가오는 일정(원래 버전: 7일 안, 내 종목과 이어진 것 · 모두에게 해당하는 것, 최대 5개) */}
      {p.events.length ? (
        <section className="allsec">
          <div className="hrow"><h3>다가오는 일정</h3><span className="fine">7일 안</span></div>
          <div className="allevents">
            {p.events.slice(0, 5).map((e, i) => (
              <div key={i} className="evrow">
                <div><b>{e.codes.length ? <span className="evchip">내 종목과 이어짐</span> : e.kind === "special" ? <span className="evchip lo">장 시간 변경</span> : null}{e.title}</b>{e.note ? <small>{e.note}</small> : null}</div>
                <span className={`evday ${e.dday <= 1 ? "on" : ""}`}>{e.label} · {e.dday ? `D-${e.dday}` : "오늘"}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
