// LLM이 채울 자리 목록과, 지금 그 자리를 채우는 규칙 문장. 규칙 문장은 화면에 이미 있는 숫자만 다시 말한다(원인·권유·전망 없음).
import { pct, won, man, num, tick } from "./fmt.js";

export const SLOTS = [
  { id: "1", tab: "brief", name: "밤사이 요약", where: "브리핑 › 밤사이 한눈에 아래 3~4줄",
    input: "야간선물 등락률·고저 시각, 내 종목별 예상 시가·금액, 08:10 장전 거래, 이어진 기사 수와 미국 쪽 이름",
    output: "문장 3~4개, 문장마다 40자 안팎, 해요체. 숫자는 입력값 그대로",
    ban: "원인 단정(‘~때문에’), 매수·매도 권유, 오늘 장중 전망",
    now: "규칙 문장(코드)으로 채움" },
  { id: "2", tab: "news", name: "기사 한 줄 제목", where: "소식 목록·소식 창의 굵은 제목",
    input: "영어 기사 제목(+본문 앞부분)", output: "한국어 한 줄, 30자 안팎, 회사 이름은 한국어 표기",
    ban: "제목에 없는 숫자·평가 덧붙이기", now: "AI 판정 경로의 첫 마디를 빌려 씀. 직접 언급 기사는 영어 제목 그대로" },
  { id: "3", tab: "news", name: "이어지는 이유", where: "소식 창 › 어떻게 이어지나요",
    input: "기사 제목·근거 구절, 관계표 줄(미국 쪽 → 관계 → 종목, 근거 문장)", output: "한 문장, ‘A의 ○○ → △△ 흐름 → 종목(관계)’ 순서",
    ban: "주가 방향 예측, 관계표에 없는 연결 만들기", now: "판정 단계가 만든 경로 문장" },
  { id: "4", tab: "brief", name: "종목 한 줄", where: "종목 창 맨 위 설명",
    input: "예상 시가·범위(%, 원), 믿을 정도 등급, 주의 표시, 이어진 기사 수", output: "문장 2개 이내, 숫자는 화면과 같은 자릿수",
    ban: "‘오를/내릴 것’ 같은 단정, 범위를 확률처럼 말하기", now: "규칙 문장(코드)으로 채움" },
  { id: "5", tab: "night", name: "밤 흐름 한 줄", where: "밤사이 › 차트 아래 설명",
    input: "야간선물 1분 가격(시작·가장 높은/낮은 때·마감), 15분 기사 수", output: "문장 1~2개, 시각과 등락률만",
    ban: "기사와 가격 움직임을 원인으로 잇기", now: "규칙 문장(코드)으로 채움" },
];
export const FIXED = "주의 문구(월요일·실적 공시·장전 거래가 범위 밖), 믿을 정도 설명, 맨 아래 안내는 미리 정한 고정 문구라 LLM이 쓰지 않아요.";

const josa = (w, a, b) => { const c = w.charCodeAt(w.length - 1); return w + (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? a : b); };

export function summary(m, d, slot) {
  const out = [], x = d.market.x, n = m.rows.length;
  if (x != null) {
    let s = `밤사이 코스피200 야간선물은 어제 주간 종가보다 ${pct(Math.abs(x), 2).replace("+", "")} ${x < 0 ? "낮게" : "높게"} 마감했어요.`;
    if (d.night) s += ` 가장 ${x < 0 ? "낮았던" : "높았던"} 때는 ${x < 0 ? d.night.lo_at : d.night.hi_at}(${pct(x < 0 ? d.night.lo_ret : d.night.hi_ret)})였어요.`;
    out.push(s);
  }
  if (n) {
    const dn = m.rows.filter((r) => r.s.H < 0).length, top = [...m.rows].sort((a, b) => Math.abs(b.Hamt) - Math.abs(a.Hamt))[0];
    const head = dn === n ? `내 종목 ${n}개 모두 예상 시가가 어제 종가보다 낮아요.` : dn === 0 ? `내 종목 ${n}개 모두 예상 시가가 어제 종가보다 높거나 같아요.` : `내 종목 ${n}개 중 ${dn}개는 예상 시가가 어제 종가보다 낮아요.`;
    out.push(`${head} 금액 변화가 가장 큰 종목은 ${josa(top.s.name, "으로", "로")} ${won(top.Hamt)}이에요.`);
  }
  if (slot !== "0730") {
    const g = m.rows.filter((r) => r.s.grade && r.s.grade.g != null), inb = g.filter((r) => r.s.b80[0] <= r.s.grade.g && r.s.grade.g <= r.s.b80[1]);
    if (g.length) out.push(`08:10 장전 거래는 ${g.length}종목 중 ${inb.length}종목이 예상 범위 안이에요.` + (g.length - inb.length ? ` 범위 밖은 ${g.filter((r) => !inb.includes(r)).map((r) => r.s.name).join("·")}예요.` : ""));
  }
  if (slot === "0900" && m.showAct) {
    const got = m.rows.filter((r) => r.s.y != null), ok = got.filter((r) => r.s.inb);
    if (got.length) out.push(`개장 시가는 ${got.length}종목 중 ${ok.length}종목이 예상 범위 안에서 열렸어요.`);
  }
  const mine = d.news.filter((nw) => nw.stocks.some((s) => m.codes.has(s.code)));
  if (d.news_meta.articles || d.news.length) {
    const by = {}; mine.forEach((nw) => (by[nw.us] = (by[nw.us] || 0) + 1));
    const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
    out.push(mine.length ? `밤사이 미국 기사${d.news_meta.articles ? " " + num(d.news_meta.articles) + "건" : ""} 가운데 내 종목과 이어진 기사는 ${mine.length}건이에요.` + (top ? ` ${top[0].replace(/\(.+\)/, "")} 쪽이 ${top[1]}건으로 가장 많아요.` : "")
      : `밤사이 미국 기사${d.news_meta.articles ? " " + num(d.news_meta.articles) + "건" : ""} 가운데 내 종목과 이어진 기사는 없었어요.`);
  }
  return out;
}

export function stockNote(r, slot, nNews) {
  const s = r.s, p = tick(s.pc * (1 + s.H));
  let t = `예상 시가는 어제 종가보다 ${pct(Math.abs(s.H)).replace("+", "")} ${s.H < 0 ? "낮은" : "높은"} ${num(p)}원이에요. 지난 비슷한 아침 10번 중 8번은 ${num(tick(s.pc * (1 + s.b80[0])))}원~${num(tick(s.pc * (1 + s.b80[1])))}원 사이에서 열렸어요.`;
  if (slot !== "0730" && s.grade) t += ` 08:10 장전 거래는 ${pct(s.grade.g)}이고, 이 방향이 시가까지 이어질 믿을 정도는 ‘${s.grade.level}’이에요.`;
  if (nNews) t += ` 밤사이 이어진 미국 기사가 ${nNews}건 있어요.`;
  return t;
}

export function nightCaption(n) {
  if (!n) return "";
  const first = n.pts[0][1] / n.day_close - 1;
  return `18:00에 ${pct(first)}로 시작해 ${n.hi_at}에 가장 높았고(${pct(n.hi_ret)}) ${n.lo_at}에 가장 낮았어요(${pct(n.lo_ret)}). 06:00에는 ${pct(n.last_ret, 2)}로 마감했어요.`;
}
export { man };
