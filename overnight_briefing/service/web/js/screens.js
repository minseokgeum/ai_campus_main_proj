// 화면 다섯 개와 아래에서 올라오는 창의 HTML. 상태는 app.js가 넘겨 준다(m = 지금 계좌·수량으로 만든 값 묶음).
import { esc, tone, pct, pct2, won, num, man, tick, dlabel, avatar, priceShort, I, kst, AI } from "./fmt.js";
import { bandHtml, domain } from "./band.js";
import { spark, nightChart, recordBars, histChart, relGraph, acctMap } from "./charts.js";
import { summary, stockNote, nightCaption, glance } from "./llm.js";

const GRADE = { "높음": ["hi", 3], "보통": ["", 2], "낮음": ["lo", 1] };
const meter = (n) => `<span class="meter">${[1, 2, 3].map((i) => `<i class="${i <= n ? "f" : ""}"></i>`).join("")}</span>`;
// 믿을 정도 = 07:30 예상 믿을 정도(E107: 08:10 장전 가격이 07:30 범위의 가운데·가장자리·밖), 방향 유지 = 카드의 예전 등급(장전 거래 방향대로 시가가 열릴 가능성)
const trustChip = (t) => (t && t.trust ? `<button class="chip btn ${GRADE[t.trust][0]}" data-act="info" data-info="trust">믿을 정도 ${t.trust} ${meter(GRADE[t.trust][1])}</button>` : "");
const gradeChip = (g) => (g ? `<button class="chip btn ${GRADE[g.level][0]}" data-act="info" data-info="grade">방향 유지 ${g.level} ${meter(GRADE[g.level][1])}</button>` : "");
const hhmm = (n, T) => { const [d, t] = n.time.split(" "); const today = +d.split("/")[1] === +T.slice(6); return (today ? "오늘 " : "어제 ") + t; };
export const gist = (n) => { const p = (n.path || "").split(" → "); return n.tier === "AI 판정" && p.length >= 3 ? p[0] : null; };
export const usNode = (d, us) => { const k = us.replace(/\(.+\)/, "").trim(); return d.graph.nodes.find((x) => x.name === us || x.name.replace(/\(.+\)/, "").trim() === k || x.name.startsWith(k) || k.startsWith(x.name)); };
const tierChip = (n) => `<span class="chip ${n.tier === "규칙 확인" ? "yel" : ""}">${n.tier === "규칙 확인" ? "제목에 직접 언급" : "AI가 이은 관계"}</span>`;
const effChip = (e) => (e === "수요 증가 쪽" || e === "수요 감소 쪽" ? `<span class="chip">${e}</span>` : "");

const S_PIN = (r, s) => (r.pin != null ? `<button class="chip btn accent" data-act="unpin" data-code="${s.code}" aria-label="가정한 시가 지우기">시가 ${pct(r.pin)} 가정 ${I.x.replace('width="14" height="14"', 'width="10" height="10"')}</button>` : "");

export function newsItem(n, m, T) {
  const g = gist(n), mine = n.stocks.filter((s) => m.codes.has(s.code)), rest = n.stocks.length - mine.length;
  return `<button class="news" data-act="news" data-id="${n.id}">
    <div class="meta"><span class="t">${hhmm(n, T)}</span>${tierChip(n)}${effChip(n.effect)}</div>
    <h3 data-llm="2">${esc(g || n.headline)}</h3>${g ? `<div class="en">${esc(n.headline)}</div>` : ""}
    <div class="path"><span class="node us">${esc(short(n.us))}</span><span class="node rel">${I.sm} ${esc(n.relation)} ${I.sm}</span>${mine.slice(0, 3).map((s) => `<span class="node mine">${esc(s.name)}</span>`).join("")}${mine.length > 3 ? `<span class="node mine">+${mine.length - 3}</span>` : ""}${!mine.length && rest > 0 ? `<span class="node">다른 종목 ${rest}</span>` : ""}</div>
  </button>`;
}

function stockRow(r, m, st, d) {
  const s = r.s, live = r.pin != null, v = live ? r.pin : s.H, amt = r.value * v, watch = r.h.q === 0 && r.q === 0;
  const avgR = r.h.avg > 0 ? r.h.avg / s.pc - 1 : null;
  const news = (m.newsBy[s.code] || 0) + (m.briefBy[s.code] || 0), g = st.slot !== "0730" ? s.grade : null;
  const nxtOut = g && g.g != null && !(s.b80[0] <= g.g && g.g <= s.b80[1]);
  const chips = [S_PIN(r, s), trustChip(st.slot !== "0730" && !m.showAct ? s.t08 : null)];
  s.cautions.forEach((c) => chips.push(`<button class="chip btn lo" data-act="stock" data-code="${s.code}">${I.warn.replace('width="16" height="16"', 'width="12" height="12"')} ${esc(c.title)}</button>`));
  if (nxtOut) chips.push(`<button class="chip btn lo" data-act="info" data-info="nxtout">장전 거래가 범위 ${g.g > s.b80[1] ? "위" : "아래"}</button>`);
  if (news) chips.push(`<button class="chip btn" data-act="stock" data-code="${s.code}">${I.news} 밤사이 소식 ${news}</button>`);
  if (s.eve && s.eve.r != null) chips.push(`<button class="chip btn" data-act="info" data-info="eve">어제 저녁 거래 <b class="${tone(s.eve.r)}" style="margin-left:3px">${pct(s.eve.r)}</b></button>`);   // 참고용(띠 계산에 넣지 않음)
  if (watch) chips.unshift(`<span class="chip accent">관심 종목</span>`);
  if (avgR != null) { const e = tick(s.pc * (1 + v)) / r.h.avg - 1; chips.push(`<span class="chip" title="평균단가 ${num(r.h.avg)}원">${live ? "가정" : "예상"} 시가는 내 평단보다 <b class="${tone(e)}" style="margin-left:3px">${pct(e)}</b></span>`); }
  let flow = "";
  if (m.showAct && s.y != null) {
    flow = `<div class="stock-flow"><span>예상 <b class="${tone(s.H)}">${pct(s.H)}</b></span>${I.sm}${g && g.g != null ? `<span>장전 <b class="${tone(g.g)}">${pct(g.g)}</b></span>${I.sm}` : ""}<span>실제 <b class="${tone(s.y)}">${pct(s.y)}</b></span>
      <span class="chip ${s.inb ? "hi" : "lo"}" style="margin-left:auto">${s.inb ? "범위 안" : s.y > s.b80[1] ? "범위 위" : "범위 아래"}</span></div>`;
  } else if (st.slot === "0811" && g && g.g != null) {           // 11/17: 07:30 예상과 08:10 장전 거래를 한 줄로 잇는다(실시간 시세는 증권사 몫)
    flow = `<div class="stock-flow"><span>07:30 예상 <b class="${tone(s.H)}">${pct(s.H)}</b></span>${I.sm}<span>08:10 장전 거래 <b class="${tone(g.g)}">${pct(g.g)}</b></span>
      <span class="chip ${nxtOut ? "lo" : "hi"}" style="margin-left:auto">${nxtOut ? (g.g > s.b80[1] ? "범위 위" : "범위 아래") : "범위 안"}</span></div>`;
  }
  return `<article class="stock" data-row="${s.code}">
    <button class="stock-top" data-act="stock" data-code="${s.code}">${avatar(s.code, s.name)}
      <span class="nm"><b>${esc(s.name)}</b><span data-f="sub">어제 ${priceShort(s.pc)}원 ${I.sm} ${live ? "가정" : "예상"} ${priceShort(tick(s.pc * (1 + v)))}원</span></span>
      <span class="amt"><b class="num ${watch ? "" : tone(amt)}" data-f="amt">${watch ? "관심" : won(amt)}</b><span class="num" data-f="pct">${live ? "가정 " : ""}${pct2(v)}</span></span></button>
    ${bandHtml(s, { dom: m.dom, slot: st.slot, showActual: m.showAct, pin: r.pin, avg: avgR })}
    <div class="stock-foot">
      <div><span class="stepper${r.changed ? " changed" : ""}" data-stepper="${s.code}"><button data-step="-1" aria-label="수량 줄이기" ${r.q <= 0 ? "disabled" : ""}>${I.minus}</button><span class="q" data-act="qty" data-code="${s.code}"><span data-f="q">${num(r.q)}</span><small>주</small></span><button data-step="1" aria-label="수량 늘리기">${I.plus}</button></span></div>
      <div class="range"><span data-f="was" class="was" ${r.changed ? "" : "hidden"}>잔고 ${num(r.h.q)}주에서 바꿔 보는 중</span>범위 금액 <b data-f="range">${watch ? "수량을 넣으면 보여요" : `${man(r.lo)} ~ ${man(r.hi)}`}</b></div>
    </div>
    ${chips.filter(Boolean).length ? `<div class="stock-chips">${chips.join("")}</div>` : ""}${flow}${combinedHtml(d, s.code, { s, act: m.showAct, nb: m.newsBy[s.code] || 0 })}
  </article>`;
}

export function heroHtml(m, d, st) {
  const sv = m.stockValue, act = m.showAct && m.actSum != null, hypo = m.pinned;
  const main = act ? m.actSum : hypo ? m.hypoSum : m.Hsum;
  const label = act ? "개장 시가 기준 내 주식 변화" : hypo ? "내가 가정한 시가 기준 내 주식 변화" : m.rows.some((r) => r.s.H0730 != null) ? "오늘 시가 예상 · 08:11 장전 거래 반영" : "오늘 시가에 예상되는 내 주식 변화";
  const now = { "0730": 1, "0811": 2, "0900": 3 }[st.slot];
  const pillOpen = st.slot === "0900" && d.has_open;
  let h = `<div class="when"><span>${d.label}</span><span class="live${pillOpen ? " open" : ""}"><i></i>${st.slot === "0730" ? "07:30 기준 · 장 전" : st.slot === "0811" ? "08:11 기준 · 장 전" : pillOpen ? `${(d.special && d.special.open) || "09:00"} 개장` : "개장 전"}</span></div>
    <div class="label">${label}</div>
    <div class="big num ${tone(main)}">${won(main)}<small>${pct2(sv ? main / sv : null)}</small></div>
    <div class="flow"><div><span>어제 종가 기준</span><b class="num">${won(sv, false)}</b></div>${I.arrow}<div><span>${act ? "개장 시가 기준" : hypo ? "가정한 시가 기준" : "예상 시가 기준"}</span><b class="num">${won(sv + main, false)}</b></div></div>`;
  const basis = (r) => (act ? r.yAmt || 0 : r.pin != null ? r.value * r.pin : r.Hamt);
  const cs = m.rows.filter((r) => r.q > 0).map((r) => ({ n: r.s.name, v: basis(r) })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  if (cs.length > 1) {
    const top = cs.slice(0, 5), rest = cs.slice(5), all = rest.length ? [...top, { n: `그 외 ${rest.length}종목`, v: rest.reduce((a, c) => a + c.v, 0) }] : top;
    const mx = Math.max(...all.map((c) => Math.abs(c.v)), 1);
    h += `<div class="contrib"><div class="ch"><span>종목별로 보면</span><span>가운데 = 어제 종가</span></div>${all.map((c) => `<div class="cr"><span class="cn">${esc(c.n)}</span><span class="cb"><i class="${c.v < 0 ? "neg" : "pos"}" style="width:${((Math.abs(c.v) / mx) * 50).toFixed(1)}%"></i></span><b class="num ${tone(c.v)}">${won(c.v)}</b></div>`).join("")}</div>`;
  }
  // 11/19: 장전 거래가 없는 날(수능일 등, core/extras.py SPECIAL)엔 08:11도 07:30과 같은 값이다. 개장 시각도 그날 값을 쓴다
  const noPre = !!(d.special && d.special.premarket === false), openAt = (d.special && d.special.open) || "09:00";
  const sealed = d.record && d.record.sealed, no730 = !!(sealed && Object.keys(sealed).length && !sealed["0730"]);
  if (st.slot === "0811" && !act) h += `<div class="tiny" style="margin-top:8px">${noPre ? "오늘은 장전 거래(NXT 프리마켓)가 없어 07:30 예상 범위와 같은 값이에요." : "08:00~08:10 장전 거래까지 반영했어요. 실서비스에서는 증권사 실시간 시세로 개장 전까지 계속 바뀌어요."}</div>`;
  if (m.changed || m.pinned) h += `<div class="what-if"><span>${m.changed && m.pinned ? "수량과 시가를" : m.changed ? "수량을" : "시가를"} 바꿔서 보는 중이에요</span><button data-act="reset">${I.undo} 되돌리기</button></div>`;
  if (act) {
    const got = m.rows.filter((r) => r.s.y != null), ok = got.filter((r) => r.s.inb).length, dr = got.filter((r) => r.s.dir != null), dok = dr.filter((r) => r.s.dir).length;
    const hs = m.HsumAct != null ? m.HsumAct : m.Hsum;             // 시가를 못 받은 종목이 있으면 같은 종목끼리만 견준다
    h += `<div class="result"><span class="chip">아침 예상 ${won(hs)}</span><span class="chip">차이 ${won(m.actSum - hs)}</span><span class="chip ${ok === got.length ? "hi" : ""}">범위 안 ${ok}/${got.length}종목</span>${dr.length ? `<span class="chip">장전 방향 일치 ${dok}/${dr.length}</span>` : ""}${m.actMissing ? `<span class="chip lo">시가를 아직 못 받은 ${m.actMissing}종목은 빠졌어요</span>` : ""}</div>`;
  } else if (st.slot === "0900") {
    h += `<div class="notice info" style="margin-top:12px">${I.info}<div><b>아직 개장 전이에요</b>${openAt} 시가가 나오면 아침 예상과 나란히 보여 드려요.</div></div>`;
  }
  h += `<div class="steps"><i class="prog" style="width:${(now / 3) * 75}%"></i>${[["06:00", "야간장 마감", ""], ["07:30", no730 ? "예상 범위 · 없음" : "예상 범위", no730 ? "-" : "0730"], ["08:11", noPre ? "장전 거래 없음" : "장전 거래", "0811"], [openAt, "개장", "0900"]]
    .map(([t, n, sl], i) => `<button class="${i < now ? "done" : i === now ? "now" : ""}" ${sl === "-" ? "disabled" : sl ? `data-act="slot" data-slot="${sl}"` : 'data-act="tab" data-tab="night"'}><b>${t}</b>${n}</button>`).join("")}</div>
    <div class="tiny" style="margin-top:8px;display:flex;justify-content:space-between;gap:8px"><span>브리핑 받는 시각 ${st.notif || "06:30"} · 잠드는 시각 ${st.bed || "00:00"}</span><button class="link" data-act="notif">설정</button></div>`;
  if (st.slot !== "0730" && d.graded && sv) {
    const sh = { "높음": 0, "보통": 0, "낮음": 0, "없음": 0 };
    m.rows.forEach((r) => (sh[r.s.t08 && r.s.t08.trust ? r.s.t08.trust : "없음"] += r.value));
    const seg = [["높음", "g-hi", "var(--ok)"], ["보통", "g-mid", "var(--mute)"], ["낮음", "g-lo", "#F0A23C"], ["없음", "g-none", "var(--line)"]].filter(([k]) => sh[k] > 0);
    h += `<div class="trust"><div class="sub" style="display:flex;justify-content:space-between"><span>07:30 예상 믿을 정도 <span class="tiny">· 보유 금액 기준</span></span><button class="tiny" data-act="info" data-info="trust" style="text-decoration:underline">뜻 보기</button></div>
      <div class="bar">${seg.map(([k, c]) => `<i class="${c}" style="width:${(sh[k] / sv) * 100}%"></i>`).join("")}</div>
      <div class="legend">${seg.map(([k, , c]) => `<span style="--c:${c}">${k === "없음" ? "장전 거래 없음" : k} ${Math.round((sh[k] / sv) * 100)}%</span>`).join("")}</div></div>`;
  }
  return h;
}

/** 옛 브리핑 화면(원래 버전과 같은 것). 11/19부터 수연 버전의 '밤사이' 탭은 아래 brief(밤사이 v4)를 쓴다. */
export function briefOld(m, d, st) {
  const mine = d.news.filter((n) => n.stocks.some((s) => m.codes.has(s.code)));
  const x = d.market.x;
  const evs = d.events.filter((e) => !(e.codes && e.codes.length) || e.codes.some((c) => m.codes.has(c) || m.account.excluded.some((x) => x.code === c)));
  let h = statusHtml(d, st) + `<section class="sec"><div class="hero hero-card" id="hero">${heroHtml(m, d, st)}</div></section>` + marketHtml(d);
  if (d.market.cautions.length) h += `<section class="sec" style="padding-top:14px;padding-bottom:14px">${d.market.cautions.map((c) => `<div class="notice">${I.warn}<div><b>${esc(c.title)}</b>${esc(c.body)}</div></div>`).join("")}</section>`;
  h += `<section class="sec"><div class="sec-h"><h2>오늘 아침 볼 것</h2><button class="more" data-act="tab" data-tab="night">밤 흐름 ${I.chev}</button></div>
    <button class="night-card" data-act="tab" data-tab="night"><div><div class="sub">코스피200 야간선물 · 06:00 마감</div><div class="v num ${tone(x)}">${pct2(x)}</div>
      <div class="tiny">${d.night ? `어제 낮 종가 ${d.night.day_close.toFixed(2)} ${"→"} ${d.night.last.toFixed(2)}${d.night.lo_at && x < 0 ? ` · 가장 낮았던 때 ${d.night.lo_at}(${pct(d.night.lo_ret)})` : d.night.hi_at && x > 0 ? ` · 가장 높았던 때 ${d.night.hi_at}(${pct(d.night.hi_ret)})` : ""}` : "어제 낮 종가와 비교한 값"}</div></div>${spark(d.night)}</button>
    <div class="look">${glance(m, d, st.slot, evs).map((g) => `<${g.act ? "button " + g.act : 'div class="lk"'}><span class="ic ${g.cls}">${esc(g.ic)}</span><span><b>${esc(g.t)}</b><small>${esc(g.s)}</small></span>${g.act ? I.chev : "<span></span>"}</${g.act ? "button" : "div"}>`).join("")}</div></section>`;
  const nw = m.rows.filter((r) => r.h.q === 0).length, own = m.rows.length - nw;
  const hf = nw && own ? st.hold || "all" : "all";                      // 11/17: 보유 | 관심을 나눠 보기(둘 다 있을 때만 단추가 나온다)
  const shown = m.rows.filter((r) => hf === "all" || (hf === "watch") === (r.h.q === 0));
  const fa = d.forward && d.forward.after;
  h += `<section class="sec"><div class="sec-h"><h2>${nw && own ? "내 종목" : nw ? `관심 종목 ${nw}` : `보유 종목 ${own}`}</h2><button class="more" data-act="info" data-info="band">읽는 법 ${I.chev}</button></div>
    ${nw && own ? `<div class="filters holdf">${[["all", "전체", m.rows.length], ["own", "보유 종목", own], ["watch", "관심 종목", nw]].map(([v, t, n]) => `<button class="${hf === v ? "on" : ""}" data-act="hold" data-v="${v}">${t}<small>${n}</small></button>`).join("")}</div>` : ""}
    ${fa && fa.in80 != null ? `<button class="trustline" data-act="tab" data-tab="record"><span>규칙을 고정한 11/2 뒤 ${fa.days}거래일 동안, 200종목 가운데 <b>${fa.in80.toFixed(1)}%</b>가 예상 범위 안에서 시작했어요(기준 80%)</span>${I.chev}</button>` : ""}
    <div class="legend-row"><span><i class="lg-band"></i>예상 범위</span><span><i class="lg-dot"></i>예상 시가</span><span><i class="lg-zero"></i>어제 종가(가운데)</span>${m.rows.some((r) => r.h.avg > 0) ? '<span><i class="lg-avg"></i>내 평단</span>' : ""}${st.slot !== "0730" && !m.showAct ? '<span><i class="lg-nxt"></i>장전 거래</span>' : ""}${m.showAct ? '<span><i class="lg-act"></i>실제 시가</span>' : ""}</div>
    ${shown.map((r) => stockRow(r, m, st, d)).join("")}${m.rows.length ? "" : `<div class="empty">노란띠를 볼 수 있는 종목이 없어요.</div>`}
    ${excludedHtml(m, d)}
    <div class="tiny" style="margin-top:10px">띠를 누르거나 끌면 그 값에 열렸을 때의 내 금액을 볼 수 있어요. 수량을 바꿔도 실제 주문은 나가지 않아요.${d.brief && m.rows.some((r) => !(d.brief.stocks || {})[r.s.code]) ? " 밤사이 소식 한 줄(AI)은 지금 시험 종목 18개부터 나와요." : ""}</div></section>`;
  h += briefTop(m, d, mine);
  if (evs.length) h += `<section class="sec"><div class="sec-h"><h2>다가오는 일정</h2><span class="more">7일 안</span></div><div class="rows">${evs.slice(0, 5).map((e) => `<div class="rowline"><div><b style="text-align:left;display:block">${e.kind === "earnings" ? '<span class="chip" style="height:20px;margin-right:4px">내 종목과 이어짐</span>' : e.kind === "special" ? '<span class="chip lo" style="height:20px;margin-right:4px">장 시간 변경</span>' : ""}${esc(e.title)}</b><small>${esc(e.note)}</small></div><span class="chip ${e.dday <= 1 ? "accent" : ""}">${e.label} · ${e.dday ? "D-" + e.dday : "오늘"}</span></div>`).join("")}</div></section>`;
  return h + pipeHtml(d) + foot(d);
}

export const foot = (d) => `<div class="foot">예상 범위는 지난 비슷한 아침에 실제 시가가 들어온 정도로 만든 참고 범위예요. 확률이나 수익 보장이 아니고, 매수·매도 권유가 아니에요.<br>${esc(recordLine(d))}</div>`;
export function recordLine(d) {
  const r = d.record, s = r.sealed["0811"] || r.sealed["0730"];
  if (r.kind === "live") return s && s.before_open ? `이 예상은 ${s.issued}(개장 전)에 고정해 둔 기록이에요.` : `이 예상은 ${s ? s.issued : ""}에 발행돼 장 전에 고정한 기록은 아니에요.`;
  if (r.kind === "forward" && s) return `이 예상은 ${s.issued}에 발행돼 장 전에 고정한 기록은 아니에요.${r.same_as_sealed ? " 장 마감 뒤 다시 계산해도 같았어요." : ""}`;
  if (r.kind === "forward") return "이 날 예상은 11/2에 고정한 규칙으로, 그날 이전 자료만 써서 나중에 다시 계산한 값이에요.";
  return "이 날은 과거 자료를 그날 이전 것만 써서 다시 재생한 화면이에요.";
}

export function night(m, d, st) {
  const n = d.night;
  if (!n) return `<section class="sec"><div class="empty">이 날은 야간선물 1분 자료가 없어요.<br>브리핑의 예상 범위와 뉴스는 그대로 볼 수 있어요.</div></section>${foot(d)}`;
  const inWin = d.news.filter((x) => x.ts >= n.t0);
  const ch = nightChart(n, d.news);
  const h = `<section class="sec" style="padding-top:12px"><div class="sub">코스피200 야간선물 · 18:00 ~ 06:00</div>
    <div class="hero"><div class="big num ${tone(n.last_ret)}" style="margin-top:2px">${pct2(n.last_ret)}<small class="flat" style="color:var(--sub);font-weight:600">${n.last.toFixed(2)}</small></div></div>
    <div class="tiny">어제 주간 종가 ${n.day_close.toFixed(2)} 대비</div>${ch.html}
    <div class="legend-row" style="margin:10px 0 0"><span><svg width="11" height="12"><path d="M5.5 0l5 6-5 6-5-6z" fill="var(--band)" stroke="var(--band-edge)"/></svg>내 종목과 이어진 기사</span><span><svg width="11" height="12"><path d="M5.5 .7l4.4 5.3-4.4 5.3L1.1 6z" fill="var(--card)" stroke="var(--mute)"/></svg>다른 종목과 이어진 기사</span></div>
    <div class="kpis"><div class="kpi"><span>가장 높았던 때</span><b class="${tone(n.hi_ret)}">${pct(n.hi_ret)}</b><small>${n.hi_at}</small></div><div class="kpi"><span>가장 낮았던 때</span><b class="${tone(n.lo_ret)}">${pct(n.lo_ret)}</b><small>${n.lo_at}</small></div><div class="kpi"><span>거래량</span><b>${num(n.volume)}</b><small>계약</small></div></div>
    <p class="sub" style="margin:14px 0 0;font-size:13.5px;color:var(--ink2)" data-llm="5">${esc(nightCaption(n))}</p></section>
    ${mapSection(m, d, "그래서 오늘 아침 내 종목은")}
    <section class="sec"><div class="sec-h"><h2>밤사이 이어진 기사 ${inWin.length}</h2><span class="more">시간순</span></div>
    ${inWin.length ? inWin.map((x) => newsItem(x, m, d.T)).join("") : `<div class="empty">야간장 시간(18:00~06:00)에 이어진 기사가 없어요.</div>`}
    <div class="tiny" style="margin-top:6px">기사가 나온 시각과 가격 움직임이 겹쳐도, 그 기사 때문에 움직였다고 볼 수는 없어요.</div></section>${foot(d)}`;
  return { html: h, bind: ch.bind };
}

/* ───── 뉴스 브리핑(밤사이 처리·프롬프트 결과) ───── */
const STANCE = { aligned: "띠와 같은 쪽", opposite: "띠와 반대쪽", mixed: "방향이 엇갈림", unclear: "방향을 가리기 어려움" };
const LOCAL = ["127.0.0.1", "localhost"].includes(location.hostname);

/** 띠를 말로 옮긴 문장(코드 계산, 화면의 띠와 같은 값). 띠는 야간선물을 넣어 계산한 값이라 그 사실만 말한다(시장의 원인을 단정하지 않는다). */
export function bandWords(s, x, act) {
  const [lo, hi] = s.b80, H = s.H, k = hi <= 0 ? 0 : lo >= 0 ? 1 : H <= -0.003 ? 2 : H >= 0.003 ? 3 : 4;
  const head = x == null ? "예상 범위는" : `밤사이 야간선물(${pct2(x)})을 반영한 예상 범위는`;
  if (act && s.y != null) return `${head} ${["전체가 어제 종가보다 아래였고", "전체가 어제 종가보다 위였고", "어제 종가보다 아래쪽으로 치우쳐 있었고", "어제 종가보다 위쪽으로 치우쳐 있었고", "어제 종가를 가운데 두고 위아래로 비슷했고"][k]}, 9시에는 범위 ${s.inb ? "안" : s.y > hi ? "위" : "아래"}에서 시작했어요(${pct(s.y)}).`;
  return `${head} ${["전체가 어제 종가보다 아래예요", "전체가 어제 종가보다 위예요", "어제 종가보다 아래쪽으로 치우쳐 있어요", "어제 종가보다 위쪽으로 치우쳐 있어요", "어제 종가를 가운데 두고 위아래로 비슷해요"][k]}.`;
}

/** 소식의 방향과 띠를 나란히 읽는 한 문장(코드). 방향은 밤사이 프롬프트가 기사 내용만으로 가린 값(위쪽·아래쪽·엇갈림·불명)이고, 주가 방향이 아니다. */
function readTogether(c, s) {
  const dir = c && c.news_direction;
  if (dir === "위쪽" || dir === "아래쪽") {
    const good = dir === "위쪽" ? "좋은" : "나쁜", tail = " 기사의 방향이 주가 방향을 뜻하지는 않아요.";
    if (!s || Math.abs(s.H) < 0.001) return `기사 내용만 보면 이 종목에 ${good} 쪽 소식이에요.${tail}`;
    return `기사 내용만 보면 이 종목에 ${good} 쪽 소식이고, 예상 범위와는 ${(s.H > 0) === (dir === "위쪽") ? "같은" : "반대"} 방향이에요.${tail}`;
  }
  if (dir === "엇갈림") return "이어진 소식들의 방향이 서로 엇갈려요.";
  return "이 종목에 좋은 쪽인지 나쁜 쪽인지는 기사만으로 가리기 어려워요.";
}

/** 띠·뉴스 같이 읽기(11/17 낮 되살림): 종목 줄의 띠 아래에 ① 띠를 말로 ② 밤사이 소식(AI 한 줄) ③ 둘을 나란히 읽는 문장을 한 묶음으로.
 *  ctx.s를 주면(브리핑의 종목 줄) 소식이 없는 종목에도 띠 문장과 '소식 없음'을 보여 준다. ctx 없이 부르면(뉴스 탭·종목 창) 전처럼 소식 한 줄만. */
export function combinedHtml(d, code, ctx) {
  const b = d.brief, s = ctx && ctx.s, st = b && (b.stocks || {})[code], c = st && st.combined;
  const band = s ? `<b class="cb-h">띠와 밤사이 소식, 같이 읽기</b><p class="cb-band">${esc(bandWords(s, d.market.x, ctx.act))}</p>` : "";
  const box = (cls, body, meta) => `<div class="combined v4${cls}" data-llm="6">${band}${body}${meta ? `<div class="cb-meta">${meta}</div>` : ""}</div>`;
  const NOTE = "예상 범위는 이 소식을 반영하지 않은 값이에요";
  if (!b) return s && ctx.nb ? box(" plain", `<p>관계로 이은 미국 기사가 ${ctx.nb}건 있어요.</p>`, NOTE) : "";      // 밤사이 브리핑이 없던 날: 이은 기사가 있을 때만
  if (!st) return s ? box(" plain", `<p class="mute">이 종목의 밤사이 소식 연결은 아직 준비 중이에요.</p>`, "") : "";
  if (!st.news.length) return s ? (thin(d) ? box(" plain", `<p>모은 기사 중에는 이 종목과 이어진 미국 기사가 없었어요.</p>`, "오늘 밤은 뉴스 검색이 자주 막혀 일부만 모았어요")
    : box(" plain", `<p>밤사이 이 종목과 이어진 미국 기사는 없었어요.</p>`, "")) : "";
  const direct = st.news.filter((n) => n.tier !== "업종·테마"), theme = st.news.length - direct.length;
  if (!direct.length && b.prompt_version !== "stub") return s ? box(" plain", `<p>직접 이어진 미국 기사는 없었고, 같은 업종·테마 소식이 ${theme}건 있어요.</p>`, NOTE) : "";
  const top = direct[0] || st.news[0], n = direct.length || st.news.length;
  const meta = `직접 이어진 소식 ${n}건${top.media_count > 1 ? ` · 대표 소식은 매체 ${top.media_count}곳` : ""} · ${NOTE}`;
  if (c && c.line_ko && c.source !== "rule") return box("", `<p>${c.source === "llm" ? AI : ""}${esc(c.line_ko)}</p>${s ? `<p class="cb-read">${esc(readTogether(c, s))}</p>` : ""}`, meta);
  if (top.short_summary_ko) return box("", `<p>직접 이어진 미국 기사가 ${n}건 있어요. 대표 소식: ${esc(top.short_summary_ko)}</p>`, meta);
  return box(" pending", `<p><span class="ai off">AI</span>밤사이 소식을 풀어 쓴 한 줄은 준비 중이에요. 이어진 기사 ${st.news.length}건은 먼저 볼 수 있어요.</p>`, "");
}

/** 밤사이 한 줄이 '몇 시부터 몇 시까지 나온 소식'으로 쓰였는지(11/17: 한 줄 옆에 기준 시각을 적는다). 처리 기록에 적힌 값 그대로 */
export function winText(d) {
  const p = d.pipeline || {}, w = p.window;
  if (w && w.start && w.end) return `${w.start}~${w.end}에 나온 소식 기준`;
  const c = (p.cutoffs || []).filter((x) => x.deadline && x.deadline.slice(0, 5).replace("/", "") === d.T.slice(4)).map((x) => x.deadline.split(" ")[1]).sort().pop();
  return c ? `${c}까지 모은 소식 기준` : "";
}
const winTag = (d) => { const t = winText(d); return t ? `<span class="win">${t}</span>` : ""; };

/** 11/18: 밤새 뉴스 검색이 막혀 일부만 모은 날(core/extras.py _night_coverage). '이어진 기사 없음'을 '모은 기사 안에서 없음'으로 읽게 한다 */
const thin = (d) => !!(d.pipeline && d.pipeline.coverage && d.pipeline.coverage.partial);
const emptyMine = (d) => (thin(d) ? "모은 기사 중에는 내 종목과 이어진 미국 기사가 없어요." : "밤사이 내 종목과 이어진 미국 기사가 없어요.");
function thinHtml(d) {
  if (!thin(d)) return "";
  const c = d.pipeline.coverage;
  return `<div class="notice info" style="margin-top:8px">${I.info}<div><b>오늘 밤은 뉴스를 일부만 모았어요</b>AI 요약에 쓰는 구글 뉴스 검색이 밤새 자주 막혀 검색어 ${num(c.terms)}개 중 ${num(c.terms_ok)}개만 받았어요(끝까지 돈 수집 ${c.rounds}번 중 ${c.full_rounds}번). ‘이어진 기사 없음’은 모은 기사 안에서의 결과예요. 노란띠(예상 범위)는 뉴스를 쓰지 않아 그대로예요.</div></div>`;
}
/** 11/18: AI 요약(구글 뉴스)이 비어도 관계표로 이은 기사(다른 경로)는 있을 수 있다. 빈 칸에서 그쪽으로 안내 */
const linkedHint = (d, n) => (n ? `<div style="text-align:center;margin-top:-4px"><button style="font-size:12.5px;color:var(--sub);display:inline-flex;align-items:center;gap:2px;font-weight:500" data-act="filter" data-f="linked">관계표로 이은 기사 ${n}건은 따로 있어요${d.news_meta && d.news_meta.articles ? ` · 밤사이 기사 ${num(d.news_meta.articles)}건에서` : ""} ${I.chev}</button></div>` : "");

export function marketHtml(d) {
  const b = d.brief;
  if (!b) return "";
  const line = b.market && b.market.line_ko;
  return `<section class="sec" style="padding-top:4px"><div class="mkt${line ? "" : " pending"}" data-llm="1">${line ? AI : `<span class="ai off">AI</span>`}<div><b>밤사이 한 줄${winTag(d)}</b><p>${line ? esc(line) : "미국 장 마감까지 모은 기사로 쓰는 밤사이 요약은 준비 중이에요."}</p></div></div>${thinHtml(d)}</section>`;
}

const pathChips = (path) => { const p = String(path || "").split(" → "); return p.map((x, i) => `<span class="node ${i === 0 ? "mine" : i === p.length - 1 ? "us" : "rel"}">${i > 0 && i < p.length - 1 ? `${I.sm} ${esc(x)} ${I.sm}` : esc(x)}</span>`).join(""); };
const storyChip = (n) => (n.story === "새 소식" ? `<span class="chip accent">새 소식</span>` : n.story === "이어짐" ? `<span class="chip">이어지는 소식</span>` : "");

export function briefList(m, d) {
  const bs = (d.brief && d.brief.stocks) || {}, out = [];
  m.rows.forEach((r) => { const v = bs[r.s.code]; if (v && v.news.length) out.push({ code: r.s.code, name: r.s.name, out: false, items: v.news }); });
  m.account.excluded.forEach((x) => { const v = bs[x.code]; if (v && v.news.length) out.push({ code: x.code, name: x.name, out: true, items: v.news }); });
  return out;
}

export function briefItem(n, code) {
  const sum = n.short_summary_ko, rel = n.relation || {};
  return `<button class="news bnews" data-act="bnews" data-code="${code}" data-id="${esc(n.id)}">
    <div class="meta">${n.tier === "업종·테마" ? `<span class="chip">같은 업종·테마</span>` : storyChip(n)}${n.media_count > 1 ? `<span class="chip">매체 ${n.media_count}곳</span>` : ""}<span class="t">${esc(n.source || "")}</span><span>${kst(n.published_at)}</span></div>
    ${sum ? `<h3 data-llm="2">${AI}${esc(sum)}</h3><div class="en">${esc(n.title)}</div>` : `<h3 class="orig" data-llm="2" lang="en">${esc(n.title)}</h3><div class="tiny">한 줄 요약 준비 중 · 원문 제목</div>`}
    ${rel.path ? `<div class="path">${pathChips(rel.path)}</div>` : ""}
  </button>`;
}

export function briefSection(d, code) {
  const v = d.brief && (d.brief.stocks || {})[code];
  if (!v || !v.news.length) return "";
  return `<h4>밤사이 이어진 기사 ${v.news.length}</h4>${v.news.slice(0, 5).map((n) => briefItem(n, code)).join("")}`;
}

function briefTop(m, d, mine) {
  const bl = briefList(m, d), all = bl.flatMap((g) => g.items.map((n) => ({ n, code: g.code })));
  const top = [...all].sort((a, b) => (b.n.media_count || 0) - (a.n.media_count || 0) || (a.n.story === "새 소식" ? -1 : 1)).slice(0, 3);
  if (d.brief) {
    return `<section class="sec"><div class="sec-h"><h2>내 종목과 이어진 소식</h2>${all.length ? `<button class="more" data-act="tab" data-tab="news">전체 ${all.length}건 ${I.chev}</button>` : ""}</div>
      ${top.length ? top.map((x) => briefItem(x.n, x.code)).join("") : `<div class="empty">${emptyMine(d)}</div>`}
      <div class="tiny" style="margin-top:6px">이어졌다는 건 사업 관계로 검색어가 걸렸다는 뜻이에요. 이 기사가 시가를 움직였다는 뜻은 아니에요.</div></section>`;
  }
  return `<section class="sec"><div class="sec-h"><h2>내 종목과 이어진 소식</h2>${mine.length ? `<button class="more" data-act="tab" data-tab="news">전체 ${mine.length}건 ${I.chev}</button>` : ""}</div>
    ${mine.length ? mine.slice(-3).reverse().map((n) => newsItem(n, m, d.T)).join("") : `<div class="empty">밤사이 내 종목과 이어진 미국 기사가 없어요.</div>`}
    <div class="tiny" style="margin-top:6px">이어졌다는 건 사업 관계가 있다는 뜻이에요. 이 기사가 시가를 움직였다는 뜻은 아니에요.</div></section>`;
}

function excludedHtml(m, d) {
  const ex = m.account.excluded;
  if (!ex.length) return "";
  const bs = (d.brief && d.brief.stocks) || {};
  return `<div class="out-list"><div class="sub" style="margin:14px 0 6px">노란띠(예상 범위)는 지금 시가총액이 큰 ${d.universe_n || 200}종목에만 나와요. 아래 종목은 아직 예상 범위를 드리지 않고, 밤사이 뉴스만 보여 드려요.</div>
    ${ex.map((x) => { const n = (bs[x.code] || { news: [] }).news.length; return `<div class="out-row">${avatar(x.code, x.name)}<span class="nm"><b>${esc(x.name)}</b><small>${num(x.q)}주 · ${x.code}</small></span><span class="chip">노란띠 없음</span>${n ? `<button class="chip btn" data-act="bstock" data-code="${x.code}">${I.news} ${n}</button>` : ""}</div>`; }).join("")}</div>`;
}

/** 옛 뉴스 화면(원래 버전과 같은 것). 수연 버전 뉴스 탭은 아래 news(뉴스 브리핑 v2). */
export function newsOld(m, d, st) {
  const mine = d.news.filter((n) => n.stocks.some((s) => m.codes.has(s.code)));
  const f = st.filter, bl = briefList(m, d), nb = bl.reduce((a, g) => a + g.items.length, 0);
  const seg = m.rows.map((r) => [r.s, d.segnews[r.s.code]]).filter(([, v]) => v);
  const tabs = [["brief", "내 종목", nb], ["linked", "관계로 이은 기사", mine.length], ["graph", "관계 그림", null], ["macro", "시장 전반",((d.brief && d.brief.market && d.brief.market.items) || []).length || d.macro.length], ["live", "방금 들어온", st.liveFeed ? st.liveFeed.items.length : null]];
  const bar = `<div class="filters">${tabs.map(([id, t, n]) => `<button class="${f === id ? "on" : ""}" data-act="filter" data-f="${id}">${t}${n != null ? `<small>${n}</small>` : ""}</button>`).join("")}</div>`;
  if (f === "graph") return `<section class="sec" style="padding-top:12px;padding-bottom:0">${bar}</section>` + graph(m, d, st);
  if (f === "live") return `<section class="sec" style="padding-top:12px">${bar}${liveHtml(st.liveFeed)}</section>`;
  let body;
  const mk = (d.brief && d.brief.market && d.brief.market.items) || [];
  if (f === "macro" && mk.length) body = `${d.brief.market.line_ko ? `<div class="mkt" style="margin-bottom:8px">${AI}<div><b>밤사이 한 줄${winTag(d)}</b><p>${esc(d.brief.market.line_ko)}</p></div></div>` : ""}${mk.map((n) => `<a class="news bnews" ${n.url ? `href="${esc(n.url)}" target="_blank" rel="noopener noreferrer"` : ""}><div class="meta">${(n.topics || []).slice(0, 2).map((t) => `<span class="chip">${esc(t)}</span>`).join("")}${n.media_count > 1 ? `<span class="chip">매체 ${n.media_count}곳</span>` : ""}<span class="t">${esc(n.source || "")}</span></div>${n.short_summary_ko ? `<h3>${AI}${esc(n.short_summary_ko)}</h3><div class="en" lang="en">${esc(n.title)}</div>` : `<h3 lang="en">${esc(n.title)}</h3>`}</a>`).join("")}`;
  else if (f === "macro") body = d.macro.length ? `<div class="rows">${d.macro.map((x) => `<div class="rowline"><span class="tnum" style="flex:none;font-size:12px">${x.time.split(" ")[1]}</span><b style="text-align:left;flex:1;font-weight:500;font-size:13px;line-height:1.45" lang="en">${esc(x.headline)}</b></div>`).join("")}</div>` : `<div class="empty">시장 전반 기사가 없어요.</div>`;
  else if (f === "linked") body = (mine.length ? [...mine].reverse().map((n) => newsItem(n, m, d.T)).join("") : `<div class="empty">관계표로 이은 미국 기사가 없어요.</div>`)
    + (seg.length ? `<h4 class="h4">업종 낱말이 겹친 기사 <span class="tiny">관련성 확인 전</span></h4><div class="rows">${seg.map(([s, v]) => `<div class="rowline"><div style="min-width:0"><b style="text-align:left;display:block">${esc(s.name)} <span class="tiny">· ${esc(v.group)}</span></b><small style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block">${esc(v.items[v.items.length - 1].headline)}</small></div><span class="chip">${v.n}건</span></div>`).join("")}</div>` : "");
  else if (!d.brief) body = `<div class="empty">이 날은 밤사이 뉴스 브리핑을 만들지 않았어요.<br>‘관계로 이은 기사’에서 그날 기사를 볼 수 있어요.</div>`;
  else body = (d.brief.stub ? `<div class="notice info" style="margin-bottom:12px">${I.info}<div><b>요약·해석은 준비 중이에요</b>밤사이 모으고 같은 소식끼리 묶은 기사를 원문 제목 그대로 먼저 보여 드려요.</div></div>` : "")
    + (bl.length ? bl.map((g) => `<div class="bgroup"><div class="bg-h">${avatar(g.code, g.name)}<b>${esc(g.name)}</b>${g.out ? `<span class="chip">노란띠 없음</span>` : ""}<span class="tiny">${g.items.length}건</span></div>${combinedHtml(d, g.code)}${g.items.map((n) => briefItem(n, g.code)).join("")}</div>`).join("") : `${thinHtml(d)}<div class="empty">${emptyMine(d)}</div>${linkedHint(d, mine.length)}`);
  // 11/18: 08:15 작업이 프롬프트를 캐시로 다시 돌리면 generated_at이 08:22처럼 바뀐다. 수집 마감은 처리 기록의 창 끝(06:00)을 먼저 쓴다
  const wEnd = d.pipeline && d.pipeline.window && d.pipeline.window.end;
  const line = f === "brief" && d.brief ? `밤사이 수집 ${wEnd ? `${d.T.slice(4, 6) * 1}/${d.T.slice(6) * 1} ${wEnd} 마감분` : d.brief.generated_at ? kst(d.brief.generated_at) + " 마감분" : ""}${d.brief.model ? ` · 요약 ${esc(d.brief.model)}` : ""}` : esc(d.news_meta.line);
  return `<section class="sec" style="padding-top:12px">${bar}${body}</section>
    <div class="foot">${line}<br>이어졌다는 건 사업 관계가 있다는 뜻이에요. 기사의 방향은 주가 방향이 아니고, 원인을 단정하거나 매매를 권하지 않아요.</div>`;
}

export function briefSheet(n, code, d) {
  const rel = n.relation || {}, name = ((d.brief.stocks || {})[code] || {}).name || code;
  return `<div class="grab" data-act="close"><i></i></div><div class="sheet-h"><h3>밤사이 이어진 기사<small>${esc(name)} · ${kst(n.published_at)} · ${esc(n.source || "")}</small></h3><button class="x" data-act="close" aria-label="닫기">${I.x}</button></div>
  <div class="sheet-b"><div class="meta" style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">${storyChip(n)}${n.media_count ? `<span class="chip">매체 ${n.media_count}곳</span>` : ""}${(n.article_types || []).map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>
    ${n.short_summary_ko ? `<div class="bs-title">${AI}${esc(n.short_summary_ko)}</div><div class="sub" style="margin-top:6px" lang="en">${esc(n.title)}</div>` : `<div class="bs-title" lang="en">${esc(n.title)}</div><div class="tiny" style="margin-top:4px">한국어 한 줄 요약은 준비 중이에요.</div>`}
    <h4>어떻게 이어지나요</h4>
    <div class="edge-card" style="margin-top:0">${rel.path ? `<div class="hd">${pathChips(rel.path)}</div>` : ""}${rel.evidence ? esc(rel.evidence) : "그래프에 적힌 연결 근거가 없어요."}
      ${rel.source_ref ? `<div class="src">근거 출처: ${esc(rel.source_ref)}</div>` : ""}${rel.terms ? `<div class="src">걸린 검색어: ${esc(rel.terms)}</div>` : ""}</div>
    ${n.reason ? `<h4>AI가 본 연결 이유</h4><p class="sub ai-p" style="margin:0">${AI}${esc(n.reason)}</p>` : ""}
    ${(n.other_titles || []).length ? `<h4>같은 소식의 다른 제목</h4>${n.other_titles.map((t) => `<div class="sub" style="margin-bottom:6px" lang="en">${esc(t)}</div>`).join("")}` : ""}
    ${n.url ? `<a class="btn-line" style="margin-top:16px" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">원문 기사 열기 ${I.ext}</a>` : ""}
    <div class="tiny" style="margin-top:18px">이어졌다는 건 그래프의 사업 관계로 검색어가 걸렸다는 뜻이에요. 기사의 방향은 주가 방향이 아니에요.</div></div>`;
}

export function bstockSheet(code, d, name) {
  const v = d.brief && (d.brief.stocks || {})[code];
  return `<div class="grab" data-act="close"><i></i></div><div class="sheet-h">${avatar(code, name)}<h3>${esc(name)}<small>${code} · 노란띠 없음</small></h3><button class="x" data-act="close" aria-label="닫기">${I.x}</button></div>
  <div class="sheet-b"><p class="sub" style="margin:0 0 4px">노란띠(예상 범위)는 지금 시가총액이 큰 200종목에만 나와요. 이 종목은 밤사이 이어진 기사만 보여 드려요.</p>${combinedHtml(d, code)}${v ? v.news.map((n) => briefItem(n, code)).join("") : `<div class="empty">밤사이 이어진 기사가 없어요.</div>`}</div>`;
}

/* ───── 내 종목: 예시 계좌 보기 · 내 잔고 넣기 ───── */
/** 옛 '내 잔고 넣기' 줄(원래 버전과 같은 것) */
export function draftRowsOld(draft) {
  if (!draft.length) return `<div class="empty" style="padding:18px 0">아직 넣은 종목이 없어요. 위에서 종목을 찾아 넣거나, <button class="link" data-act="copyacct" data-id="A">예시 계좌 A를 가져와</button> 고쳐 보세요.</div>`;
  return draft.map((h) => `<div class="drow" data-code="${h.code}"><div class="dn"><b>${esc(h.name)}</b><small>${h.code}${h.in_model ? "" : " · 노란띠 없음"}</small></div>
    <label><span>수량${h.q === 0 ? " · 관심" : ""}</span><input type="number" inputmode="numeric" min="0" max="10000000" step="1" data-f="q" value="${h.q}" aria-label="${esc(h.name)} 수량(0이면 관심 종목)"></label>
    <label><span>평균단가</span><input type="number" inputmode="numeric" min="0" max="100000000" step="1" data-f="avg" value="${h.avg ?? ""}" placeholder="몰라도 돼요" aria-label="${esc(h.name)} 평균단가"></label>
    <button class="rm" data-act="rmdraft" data-code="${h.code}" aria-label="${esc(h.name)} 빼기">${I.x}</button></div>`).join("");
}

function holdingsCard(m, d) {
  const total = m.baseValue;
  const rows = m.rows.map((r) => { const v = r.h.q * r.s.pc, pl = r.h.avg ? (r.s.pc - r.h.avg) * r.h.q : null;
    return `<button class="hrow" data-act="stock" data-code="${r.s.code}"><span class="nm"><b>${esc(r.s.name)}</b><small>${num(r.h.q)}주${r.h.avg ? ` · 평단 ${num(r.h.avg)}원` : ""}</small><small>오늘 예상 <span class="${tone(r.s.H)}">${pct(r.s.H)}</span></small></span>
      <span class="amt"><b>${won(v, false)}</b>${pl != null ? `<small class="${tone(pl)}">${won(pl)} (${pct(r.s.pc / r.h.avg - 1)})</small>` : ""}<small>비중 ${total ? Math.round((v / total) * 100) : 0}%</small></span></button>`; }).join("");
  const outs = m.account.excluded.map((x) => `<div class="hrow"><span class="nm"><b>${esc(x.name)}</b><small>${num(x.q)}주${x.avg ? ` · 평단 ${num(x.avg)}원` : ""}</small></span><span class="amt"><span class="chip">노란띠 없음</span></span></div>`).join("");
  return `<section class="sec"><div class="hold-card"><div class="sub">어제 종가 기준 주식</div><div class="big num">${won(total, false)}</div>
    <div class="tiny">노란띠가 있는 ${m.rows.length}종목 기준${m.account.excluded.length ? ` · 노란띠가 없는 ${m.account.excluded.length}종목은 금액에서 빠져요` : ""}</div></div>${rows}${outs}</section>`;
}

/** 옛 내 종목 화면(원래 버전과 같은 것) */
export function mineOld(m, d, st) {
  const cur = st.acct, accts = st.accts || [];
  const pills = [...accts.map((a) => [a.id, `예시 ${a.id}`, a.name]), ["U", "내 잔고", st.draft.length ? `${st.draft.length}종목` : "직접 넣기"]];
  let h = `<section class="sec" style="padding-top:12px"><div class="acct-pills" role="tablist">${pills.map(([id, t, s]) => `<button role="tab" aria-selected="${id === cur}" class="${id === cur ? "on" : ""}" data-act="acct" data-id="${id}"><b>${t}</b><small>${esc(s)}</small></button>`).join("")}</div></section>`;
  if (cur !== "U") {
    return h + mapSection(m, d) + holdingsCard(m, d) + `<section class="sec"><button class="btn-line" data-act="copyacct" data-id="${cur}">이 계좌를 내 잔고로 가져와 고치기</button>
      <div class="tiny" style="margin-top:10px">예시 계좌의 계좌번호·평균단가는 시연용 가정이에요. 평균단가는 그 종목의 실제 과거 종가 하나를 썼어요.</div></section>`;
  }
  h += `<section class="sec" style="padding-top:4px"><div class="sec-h"><h2>내 잔고 넣기</h2><span class="more">최대 30종목</span></div>
    <div class="notice info" style="margin:-2px 0 12px">${I.info}<div><b>증권사 앱에 들어갈 모듈을 가정한 시연이에요</b>실서비스에서는 증권사 잔고가 자동으로 연결돼요. 여기서는 종목·수량을 직접 넣어 내 계좌처럼 볼 수 있어요. 평균단가는 몰라도 금액이 보이고, 수량을 0으로 두면 금액 없이 범위·뉴스만 보는 관심 종목이 돼요.</div></div>
    <p class="sub" style="margin:-4px 0 12px">넣은 잔고는 이 브라우저에만 저장되고, 브리핑을 만들 때만 서버로 보내요. 서버에는 남기지 않아요. 밤사이 뉴스 브리핑(AI 한 줄)은 지금 시험 종목 18개부터 만들고 있어요.</p>
    <div class="search">${I.search}<input id="stock-q" type="search" placeholder="종목명 또는 코드" autocomplete="off" maxlength="30" aria-label="종목 검색" aria-controls="stock-res"><div id="stock-res" class="search-res" role="listbox" hidden></div></div>
    <div id="draft">${draftRows(st.draft)}</div>
    <button class="btn-primary" data-act="applydraft" ${st.draft.length ? "" : "disabled"}>이 잔고로 브리핑 보기</button><div class="tiny" id="draft-msg" role="status" style="margin-top:8px"></div></section>`;
  if (st.pfUser && m.rows.length + m.account.excluded.length) h += mapSection(m, d) + holdingsCard(m, d);
  return h;
}

export const short = (nm) => String(nm || "").replace(/\(.+\)/, "").replace(/^미국 /, "").trim();
export function hotMap(m, d) {                       // hot: 관계 줄마다 오늘 밤 기사 수, hotN: 상자마다 기사 수(같은 기사는 한 번만)
  const hot = {}, sets = {};
  d.news.forEach((n) => { const u = usNode(d, n.us); if (!u) return; n.stocks.forEach((s) => { if (!m.codes.has(s.code)) return; hot[u.id + "|" + s.code] = (hot[u.id + "|" + s.code] || 0) + 1; (sets[u.id] = sets[u.id] || new Set()).add(n.id); (sets[s.code] = sets[s.code] || new Set()).add(n.id); }); });
  return { hot, hotN: Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, v.size])) };
}

export function graph(m, d, st) {
  const codes = m.rows.map((r) => r.s.code), edges = d.graph.edges.filter((e) => codes.includes(e.dst));
  const ids = [...new Set(edges.map((e) => e.src))], nodes = d.graph.nodes.filter((n) => ids.includes(n.id));
  const { hot, hotN } = hotMap(m, d), sel = st.sel;
  nodes.forEach((n) => (n.short = short(n.name)));
  const stocks = m.rows.map((r) => r.s), ord = Object.fromEntries(stocks.map((x, i) => [x.code, i]));
  const prim = (n) => Math.min(...edges.filter((e) => e.src === n.id).map((e) => ord[e.dst] ?? 99));     // 이어진 내 종목 순서대로 묶어 선이 덜 엇갈리게
  nodes.sort((a, b) => prim(a) - prim(b) || (hotN[b.id] || 0) - (hotN[a.id] || 0) || edges.filter((e) => e.src === b.id).length - edges.filter((e) => e.src === a.id).length);
  const nm = (id) => short((nodes.find((n) => n.id === id) || {}).name) || (d.stocks[id] || {}).name || id;
  const shown = sel ? edges.filter((e) => e.src === sel || e.dst === sel) : edges.filter((e) => hot[e.src + "|" + e.dst]).sort((a, b) => hot[b.src + "|" + b.dst] - hot[a.src + "|" + a.dst]);
  const seen = new Set(), cards = shown.filter((e) => { const k = e.src + e.dst + e.relation; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, sel ? 12 : 4).map((e) => {
    const tn = d.news.filter((n) => (usNode(d, n.us) || {}).id === e.src && n.stocks.some((s) => s.code === e.dst));
    return `<div class="edge-card"><div class="hd"><span class="node us">${esc(nm(e.src))}</span><span class="node rel">${I.sm} ${esc(e.relation)} ${I.sm}</span><span class="node mine">${esc(nm(e.dst))}</span></div>${esc(e.evidence)}
      ${e.trigger ? `<div class="src">함께 볼 만한 소식: ${esc(e.trigger)}</div>` : ""}<div class="src">${e.strength === "확인" ? "확인된 관계" : "추정 관계"} · 근거 ${esc(e.source)}</div>
      ${tn.length ? `<div style="margin-top:8px;display:grid;gap:4px">${tn.slice(-3).map((n) => `<button class="chip btn yel" style="height:auto;padding:5px 8px;white-space:normal;text-align:left;line-height:1.4" data-act="news" data-id="${n.id}">${I.news} ${esc(gist(n) || n.headline)}</button>`).join("")}</div>` : ""}</div>`;
  }).join("");
  const bySeg = {}; stocks.forEach((s) => (bySeg[s.group || "기타"] = bySeg[s.group || "기타"] || []).push(s));
  return `<section class="sec"><div class="sec-h"><h2>해외 쪽과 이어진 관계</h2></div><div class="sub" style="margin-top:-6px">내 종목이 해외 어느 회사와 사업으로 이어져 있는지예요. 실선은 공시·기사에 적힌 관계, 점선은 같은 제품을 만들거나 사는 회사라 추정한 연결이에요. 상자를 누르면 근거 문장이 나와요.</div>
    ${nodes.length ? relGraph(nodes, edges, stocks, hot, hotN, sel) : `<div class="empty">이 계좌 종목은 아직 해외 쪽 연결이 없어요.</div>`}
    <div class="legend-row" style="margin:8px 0 0"><span><svg width="22" height="6"><path d="M0 3h22" stroke="var(--band-edge)" stroke-width="2.6"/></svg>오늘 밤 기사가 나온 관계</span><span><svg width="22" height="6"><path d="M0 3h22" stroke="var(--mute)" stroke-width="1.5"/></svg>확인</span><span><svg width="22" height="6"><path d="M0 3h22" stroke="var(--mute)" stroke-width="1.5" stroke-dasharray="4 3"/></svg>추정</span><span><svg width="22" height="6"><path d="M0 3h22" stroke="var(--miss)" stroke-width="1.5"/></svg>규제·정책 노출</span></div></section>
    <section class="sec"><div class="sec-h"><h2>${sel ? esc(nm(sel)) + " 관계" : "오늘 밤 기사가 나온 관계"}</h2>${sel ? `<button class="more" data-act="gsel" data-id="">선택 풀기 ${I.x.replace('width="14" height="14"', 'width="11" height="11"')}</button>` : ""}</div>
    ${cards || `<div class="empty">${sel ? "이 상자에는 이어진 관계가 없어요." : "오늘 밤에는 내 종목 관계에 붙은 기사가 없어요. 상자를 눌러 관계를 살펴보세요."}</div>`}</section>
    <section class="sec"><div class="sec-h"><h2>업종으로 보면</h2></div><div class="rows">${Object.entries(bySeg).map(([g, ss]) => `<div class="rowline"><span>${esc(g)}</span><b style="font-weight:500;font-size:13px">${ss.map((s) => esc(s.name) + (s.seg && s.seg !== g ? ` <span class="tiny">${esc(s.seg)}</span>` : "")).join(" · ")}</b></div>`).join("")}</div>
    <div class="tiny" style="margin-top:8px">업종은 사업보고서의 매출 구성으로 나눈 묶음이에요.</div></section>
    <div class="foot">관계는 사업보고서·공시·보도에서 확인한 사업 관계예요. 관계가 있다고 주가가 같이 움직인다는 뜻은 아니에요.</div>`;
}

export function record(m, d, st) {
  const w = d.track[m.account.id] || {}, f = d.forward;
  if (!w.days) return `<section class="sec" style="padding-top:12px"><div class="empty">이 날 앞의 20거래일 기록은 이 시연판에 넣지 않았어요.<br>최근 날짜를 고르면 내 종목의 지난 기록을 볼 수 있어요.</div></section>${foot(d)}`;
  const a = f && f.after, v = (x, dg = 1) => (x == null ? "–" : x.toFixed(dg));
  const hi = a && a["dir_높음"];
  return casesHtml(w) + `<section class="sec" style="padding-top:12px"><div class="sec-h"><h2>내 종목, 최근 ${w.days || 0}거래일</h2></div>
    <div class="kpis"><div class="kpi"><span>범위 안에서 열림</span><b>${v(w.cov_mine)}%</b><small>기준 80%</small></div><div class="kpi"><span>예상 시가 오차</span><b>${v(w.err_H, 2)}%p</b><small>야간선물만 쓰면 ${v(w.err_x, 2)}</small></div><div class="kpi"><span>‘높음’ 방향 일치</span><b>${v(w.hi_match)}%</b><small>${w.hi_n || 0}건</small></div></div>
    ${w.daily && w.daily.length ? recordBars(w.daily, d.T) : ""}
    <div class="tiny">막대는 날마다 내 종목 가운데 예상 범위 안에서 열린 비율이에요. 진한 막대가 이 날, 회색은 규칙을 고정한 11/2 뒤의 날이에요.${w.n_fwd ? ` ${w.days}일 중 ${w.n_after}일이 규칙을 고정한 뒤에 처음 본 날이에요.` : ""}</div></section>
    ${a ? `<section class="sec"><div class="sec-h"><h2>규칙을 고정한 뒤, 200종목</h2><span class="more">${a.days}거래일${f.prov.length ? " · 오늘은 개장 직후 값" : ""}</span></div>
    <div class="kpis"><div class="kpi"><span>범위 안에서 열림</span><b>${v(a.in80)}%</b><small>기준 80%</small></div><div class="kpi"><span>예상 시가 오차</span><b>${v(a.mae_H, 2)}%p</b><small>야간선물만 쓰면 ${v(a.mae_x, 2)}</small></div><div class="kpi"><span>‘높음’ 방향 일치</span><b>${hi ? v(hi.rate) : "–"}%</b><small>${hi ? num(hi.n) : 0}건</small></div></div>
    <table class="tbl" style="margin-top:14px"><thead><tr><th>날짜</th><th>야간선물</th><th>범위 안</th><th>예상 오차</th><th>선물만 쓰면</th></tr></thead><tbody>
    ${[...f.per_day].reverse().map((p) => `<tr><td>${dlabel(p.T)}${f.prov.includes(p.T) ? ' <span class="tiny">개장 직후</span>' : ""}</td><td class="${tone(p.x)}">${pct(p.x / 100)}</td><td>${p.in80.toFixed(1)}%</td><td>${p.mae_H.toFixed(2)}</td><td>${p.mae_x.toFixed(2)}</td></tr>`).join("")}</tbody></table>
    <div class="tiny" style="margin-top:10px">11/2 15:17에 규칙을 고정했고, 그 뒤에 온 날은 규칙을 만들 때 보지 않은 날이에요. 날짜가 아직 적어서 판정이 아니라 쌓아 가는 기록이에요. 오차 단위는 %p예요.</div></section>` : ""}
    <section class="sec"><div class="sec-h"><h2>이 기록을 읽는 법</h2></div><div class="rows">
      <div class="rowline"><span>범위 안에서 열림</span><b style="font-weight:500;font-size:13px;max-width:210px">실제 시가가 노란띠 안에 든 비율. 10번 중 8번이 기준이에요.</b></div>
      <div class="rowline"><span>예상 시가 오차</span><b style="font-weight:500;font-size:13px;max-width:210px">예상 시가와 실제 시가의 차이 평균. 작을수록 가까웠어요.</b></div>
      <div class="rowline"><span>‘높음’ 방향 일치</span><b style="font-weight:500;font-size:13px;max-width:210px">방향 유지 ‘높음’ 종목에서 장전 거래 방향과 시가 방향이 같았던 비율이에요.</b></div></div>
      ${LOCAL ? `<a class="chip btn accent" style="margin-top:12px;height:34px;padding:0 12px;text-decoration:none" href="http://127.0.0.1:8510/track" target="_blank" rel="noopener">검증 기록 전체 보기 ${I.chev}</a>` : ""}</section>${foot(d)}`;
}

/* ───── 아래에서 올라오는 창 ───── */
export function stockSheet(r, m, d, st) {
  const s = r.s, g = st.slot !== "0730" ? s.grade : null, P = (v) => num(tick(s.pc * (1 + v)));
  const myNews = d.news.filter((n) => n.stocks.some((x) => x.code === s.code));
  const hasAvg = r.h.avg > 0, pl = hasAvg ? (s.pc - r.h.avg) * r.h.q : null, plr = hasAvg ? s.pc / r.h.avg - 1 : null, wt = m.baseValue ? (r.h.q * s.pc) / m.baseValue : 0;
  const line = (dot, name, v, bold) => `<tr><td><i style="background:${dot}"></i>${name}</td><td class="${tone(v)}">${pct2(v)}</td><td>${P(v)}원</td><td class="${tone(v)}" ${bold ? 'style="font-weight:750"' : ""}>${won(r.value * v)}</td></tr>`;
  const edges = d.graph.edges.filter((e) => e.dst === s.code), seenE = new Set();
  const hist = d.hist[s.code] || [], hin = hist.filter((x) => x.inb).length;
  return `<div class="grab" data-act="close"><i></i></div><div class="sheet-h">${avatar(s.code, s.name)}<h3>${esc(s.name)}<small>${s.code}${s.seg ? " · " + esc(s.seg) : ""}</small></h3><button class="x" data-act="close" aria-label="닫기">${I.x}</button></div>
  <div class="sheet-b"><p class="sub" style="font-size:13.5px;color:var(--ink2);margin:0 0 4px" data-llm="4">${esc(stockNote(r, st.slot, myNews.length))}</p>${combinedHtml(d, s.code)}
    ${bandHtml(s, { dom: domain([s.b90[0], s.b90[1], s.H, g ? g.g : null, m.showAct ? s.y : null].filter((v) => v != null)), slot: st.slot, showActual: m.showAct, pin: null, wide: true }).replace('data-band="', 'data-band-static="')}
    <table class="tbl"><thead><tr><th>${num(r.q)}주 기준</th><th>어제 종가 대비</th><th>가격</th><th>내 금액</th></tr></thead><tbody>
      ${line("var(--band)", "범위 위쪽 끝", s.b80[1])}${line("var(--ink)", "예상 시가", s.H, true)}${line("var(--band)", "범위 아래쪽 끝", s.b80[0])}
      ${s.eve && s.eve.r != null ? line("var(--mute)", `어제 저녁 거래(${s.eve.at || "20:00"})`, s.eve.r) : ""}${g && g.g != null ? line("var(--ink2)", "08:10 장전 거래", g.g) : ""}${m.showAct && s.y != null ? line(s.inb ? "var(--ok)" : "var(--miss)", "09:00 실제 시가", s.y, true) : ""}</tbody></table>
    <div class="tiny" style="margin-top:8px">옅은 띠는 10번 중 9번이 들어온 더 넓은 범위(${pct(s.b90[0])} ~ ${pct(s.b90[1])})예요.</div>
    ${s.cautions.map((c) => `<div class="notice" style="margin-top:12px">${I.warn}<div><b>${esc(c.title)}</b>${esc(c.body)}</div></div>`).join("")}
    ${s.t08 && s.t08.trust && st.slot !== "0730" && !m.showAct ? `<h4>07:30 예상 믿을 정도</h4><div class="rows"><div class="rowline"><span>등급</span><b>${trustChip(s.t08)}</b></div><div class="rowline"><span>08:11 보정 예상 시가</span><b class="${tone(s.t08.Hb)}">${pct2(s.t08.Hb)}</b></div><div class="rowline"><span>08:11 보정 범위</span><b>${pct(s.t08.adj[0])} ~ ${pct(s.t08.adj[1])}</b></div></div>
      <div class="tiny" style="margin-top:6px">08:10 장전 가격이 07:30 범위의 가운데면 높음, 가장자리면 보통, 밖이면 낮음이에요. 08:11에는 예상 시가를 장전 가격 쪽으로 옮기고(07:30 예상 ${pct2(s.H0730 ?? s.H)}) 범위 폭을 다시 맞춰요.</div>` : ""}
    ${g ? `<h4>방향 유지</h4><div class="rows"><div class="rowline"><span>등급</span><b>${gradeChip(g)}</b></div><div class="rowline"><span>지난 비슷한 경우 방향이 같았던 비율</span><b>${g.p >= 0.995 ? "99% 이상" : Math.round(g.p * 100) + "%"}</b></div></div>
      <div class="tiny" style="margin-top:6px">08:10 장전 거래(넥스트레이드)의 방향이 09:00 시가까지 이어질지를 본 값이에요. 예상 시가 숫자가 얼마나 정확한지와는 다른 얘기예요.</div>` : ""}
    <h4>내 잔고</h4><div class="rows">
      <div class="rowline"><span>보유 수량</span><b>${num(r.h.q)}주${r.changed ? ` <small style="color:var(--accent)">지금은 ${num(r.q)}주로 바꿔 보는 중</small>` : ""}</b></div>
      <div class="rowline"><span>평균 단가${m.account.sample ? ` <span class="tiny">예시 가정</span>` : ""}</span><b>${hasAvg ? num(r.h.avg) + "원" : "넣지 않음"}</b></div>
      <div class="rowline"><span>평가금액 <span class="tiny">어제 종가</span></span><b>${won(r.h.q * s.pc, false)}<small>계좌 주식의 ${Math.round(wt * 100)}%</small></b></div>
      ${hasAvg ? `<div class="rowline"><span>평가손익</span><b class="${tone(pl)}">${won(pl)}<small class="${tone(pl)}">${pct2(plr)}</small></b></div>` : ""}</div>
    ${briefSection(d, s.code)}<h4>관계로 이은 기사 ${myNews.length}</h4>${myNews.length ? [...myNews].reverse().slice(0, 4).map((n) => newsItem(n, m, d.T)).join("") : `<div class="sub">밤사이 이 종목과 이어진 미국 기사가 없어요.</div>`}
    ${edges.length ? `<h4>해외 쪽과 이어진 관계</h4><div style="display:flex;gap:6px;flex-wrap:wrap">${edges.filter((e) => { const k = e.src + e.relation; if (seenE.has(k)) return false; seenE.add(k); return true; }).map((e) => `<button class="chip btn" data-act="gjump" data-id="${e.src}"><b>${esc(short((d.graph.nodes.find((n) => n.id === e.src) || {}).name))}</b> ${esc(e.relation)}</button>`).join("")}</div>` : ""}
    ${hist.length ? `<h4>지난 ${hist.length}거래일, 이 종목</h4><div class="sub">범위 안에서 열린 날 <b style="color:var(--ink)">${hin}/${hist.length}일</b> · 노란 막대가 그날 범위, 가로줄이 예상, 동그라미가 실제 시가예요.</div>${histChart(hist, d.T)}` : ""}
  </div>`;
}

export function newsSheet(n, m, d) {
  const g = gist(n), u = usNode(d, n.us), mine = n.stocks.filter((s) => m.codes.has(s.code)), others = n.stocks.filter((s) => !m.codes.has(s.code));
  const parts = (n.path || "").split(" → "), reason = parts.length >= 3 ? parts.slice(1, -1).join(" → ") : null;
  const ev = u ? d.graph.edges.find((e) => e.src === u.id && mine.some((s) => s.code === e.dst)) : null;
  const wt = mine.reduce((a, s) => { const r = m.rows.find((x) => x.s.code === s.code); return a + (r ? r.h.q * r.s.pc : 0); }, 0);
  return `<div class="grab" data-act="close"><i></i></div><div class="sheet-h"><h3>이어진 소식<small>${n.time.replace(/^(\d+)\/(\d+) /, (_, a, b) => `${+a}월 ${+b}일 `)} · 미국 기사</small></h3><button class="x" data-act="close" aria-label="닫기">${I.x}</button></div>
  <div class="sheet-b"><div class="meta" style="display:flex;gap:6px;margin-bottom:8px">${tierChip(n)}${effChip(n.effect)}</div>
    <div style="font-size:17px;font-weight:700;line-height:1.45;letter-spacing:-.03em" data-llm="2">${esc(g || n.headline)}</div>${g ? `<div class="sub" style="margin-top:6px">${esc(n.headline)}</div>` : ""}
    <h4>어떻게 이어지나요</h4>
    <div class="edge-card" style="margin-top:0"><div class="hd"><span class="node us">${esc(short(n.us))}</span><span class="node rel">${I.sm} ${esc(n.relation)} ${I.sm}</span>${mine.map((s) => `<span class="node mine">${esc(s.name)}</span>`).join("") || `<span class="node">${esc(others[0] ? others[0].name : "")}</span>`}</div>
      ${reason ? `<div data-llm="3">${esc(reason)}</div>` : ev ? esc(ev.evidence) : "기사 제목에 이 회사 이름이 그대로 나와요."}
      ${n.tier === "AI 판정" && n.why ? `<div class="src">기사에서 찾은 구절: “${esc(n.why)}”</div>` : ""}${ev && reason ? `<div class="src">관계 근거: ${esc(ev.evidence)}</div>` : ""}</div>
    ${u ? `<button class="chip btn accent" style="margin-top:10px;height:34px;padding:0 12px" data-act="gjump" data-id="${u.id}">관계 그림에서 보기 ${I.chev}</button>` : ""}
    ${mine.length ? `<h4>이어진 내 종목</h4><div class="rows">${mine.map((s) => { const r = m.rows.find((x) => x.s.code === s.code); return `<button class="rowline" style="width:100%;text-align:left;align-items:center" data-act="stock" data-code="${s.code}"><span style="display:flex;gap:10px;align-items:center;color:var(--ink)">${avatar(s.code, s.name)}<b style="text-align:left">${esc(s.name)}<small>${esc(s.relation)}</small></b></span><b>${won(r.h.q * r.s.pc, false)}<small>예상 시가 <span class="${tone(r.s.H)}">${pct(r.s.H)}</span></small></b></button>`; }).join("")}</div>
      <div class="tiny" style="margin-top:8px">이어진 종목은 계좌 주식의 ${Math.round((wt / (m.baseValue || 1)) * 100)}%예요. 이 숫자는 계좌 구성일 뿐, 예상 손익이 아니에요.</div>` : ""}
    ${others.length ? `<h4>함께 이어진 다른 종목</h4><div style="display:flex;gap:6px;flex-wrap:wrap">${others.map((s) => `<span class="chip">${esc(s.name)}</span>`).join("")}</div>` : ""}
    <div class="tiny" style="margin-top:18px">이어졌다는 건 사업 관계가 있다는 뜻이에요. ‘수요 증가 쪽·감소 쪽’은 기사 내용의 방향이고, 주가 방향이나 시가를 움직인 원인을 뜻하지 않아요.</div></div>`;
}

export function acctSheet(list, cur, my) {
  const opt = (id, name, sub, badge) => `<button class="acct-opt" data-act="acct" data-id="${id}"><span class="avatar acct-av">${badge}</span><span><b>${esc(name)}</b><span>${sub}</span></span>${id === cur ? `<span class="ck">${I.check}</span>` : ""}</button>`;
  return `<div class="grab" data-act="close"><i></i></div><div class="sheet-h"><h3>계좌 고르기</h3><button class="x" data-act="close" aria-label="닫기">${I.x}</button></div><div class="sheet-b">
    <div class="tiny" style="margin:-2px 0 4px">예시 계좌</div>${list.map((a) => opt(a.id, a.name, `${a.holdings.length}종목${a.holdings.some((h) => !h.in_model) ? ` · 노란띠 없음 ${a.holdings.filter((h) => !h.in_model).length}` : ""}`, a.id)).join("")}
    <div class="tiny" style="margin:14px 0 4px">내가 넣은 잔고</div>${opt("U", "내 잔고", my ? `${my}종목 · 이 브라우저에만 저장` : "아직 넣은 종목이 없어요", "나")}</div>`;
}

const INFO = {
  band: ["노란띠 읽는 법", `<div class="rows">
    <div class="rowline"><span><i class="lg-band" style="display:inline-block;vertical-align:-1px;margin-right:6px"></i>예상 범위</span><b style="font-weight:500;font-size:13px;max-width:215px">지난 비슷한 아침 10번 중 8번은 실제 시가가 이 안에서 열렸어요. 양 끝 숫자가 범위의 끝이에요.</b></div>
    <div class="rowline"><span><i class="lg-dot" style="display:inline-block;margin-right:6px"></i>예상 시가</span><b style="font-weight:500;font-size:13px;max-width:215px">밤사이 야간선물 움직임으로 계산한 한 점이에요. 검은 말풍선의 숫자예요.</b></div>
    <div class="rowline"><span><i class="lg-zero" style="display:inline-block;vertical-align:-2px;margin:0 9px 0 3px"></i>어제 종가</span><b style="font-weight:500;font-size:13px;max-width:215px">0%. 띠가 이 선 왼쪽에 있으면 어제보다 낮게, 오른쪽이면 높게 열리는 쪽이에요.</b></div>
    <div class="rowline"><span><i class="lg-nxt" style="display:inline-block;margin-right:6px"></i>장전 거래</span><b style="font-weight:500;font-size:13px;max-width:215px">08:10까지 넥스트레이드에서 실제로 거래된 가격이에요. 08:11부터 보여요.</b></div>
    <div class="rowline"><span><i class="lg-act" style="display:inline-block;vertical-align:-1px;margin-right:6px"></i>실제 시가</span><b style="font-weight:500;font-size:13px;max-width:215px">09:00에 열린 가격. 범위 안이면 초록, 밖이면 빨강이에요.</b></div></div>
    <div class="notice info" style="margin-top:14px"><div><b>띠를 눌러 보세요</b>띠 위 아무 곳이나 누르거나 끌면 ‘그 값에 열리면 내 금액이 얼마인지’ 바로 보여요. 수량은 − + 로 바꿔 볼 수 있고, 실제 주문은 나가지 않아요.</div></div>
    <div class="tiny" style="margin-top:12px">범위는 확률이나 약속이 아니에요. 10번 중 2번쯤은 범위 밖에서 열려요. 띠의 폭은 얼마나 믿을 만한지가 아니라 그 종목이 평소 얼마나 흔들렸는지를 따라가요.</div>`],
  trust: ["믿을 정도란", `<p class="sub" style="font-size:13.5px;color:var(--ink2);margin:0">07:30 예상 범위를 얼마나 믿을 수 있는지, 08:10 장전 거래 가격이 그 범위의 어디에 있는지로 08:11에 세 단계로 나눈 값이에요.</p>
    <div class="rows" style="margin-top:8px"><div class="rowline"><span class="chip hi">높음 ${meter(3)}</span><b style="font-weight:500;font-size:13px">범위 가운데. 지난 기록에서 시가가 범위 안 10번 중 9번</b></div><div class="rowline"><span class="chip">보통 ${meter(2)}</span><b style="font-weight:500;font-size:13px">범위 가장자리. 10번 중 8번</b></div><div class="rowline"><span class="chip lo">낮음 ${meter(1)}</span><b style="font-weight:500;font-size:13px">범위 밖. 10번 중 3번</b></div></div>
    <div class="tiny" style="margin-top:12px">08:11에는 예상 시가를 장전 가격 쪽으로 옮기고 범위 폭을 다시 맞춘 ‘08:11 보정’도 함께 보여 드려요. 숫자는 규칙을 고정한 뒤 14거래일(2,800종목-날) 기록이에요. 장전 거래가 없는 종목은 07:30 예상만 있어요.</div>`],
  grade: ["방향 유지란", `<p class="sub" style="font-size:13.5px;color:var(--ink2);margin:0">08:10 장전 거래가 가리키는 방향(어제 종가보다 위/아래)이 09:00 시가까지 이어질지를 세 단계로 나눈 값이에요.</p>
    <div class="rows" style="margin-top:8px"><div class="rowline"><span class="chip hi">높음 ${meter(3)}</span><b style="font-weight:500;font-size:13px">지난 비슷한 경우 10번 중 9번 이상 같은 방향</b></div><div class="rowline"><span class="chip">보통 ${meter(2)}</span><b style="font-weight:500;font-size:13px">10번 중 7~9번</b></div><div class="rowline"><span class="chip lo">낮음 ${meter(1)}</span><b style="font-weight:500;font-size:13px">그보다 낮음. 방향이 자주 바뀌었어요</b></div></div>
    <div class="tiny" style="margin-top:12px">장전 거래가 어제 종가에서 멀리 움직였을수록 방향이 이어지는 일이 많았어요. 노란띠의 폭이나 예상 시가의 정확도와는 따로 보는 값이에요.</div>`],
  eve: ["어제 저녁 거래란", `<p class="sub" style="font-size:13.5px;color:var(--ink2);margin:0">어제 낮 장이 끝난 뒤 저녁 8시까지 열리는 넥스트레이드(대체거래소) 시장에서 마지막으로 거래된 가격을, 어제 낮 종가와 비교한 값이에요.</p>
    <div class="rows" style="margin-top:8px"><div class="rowline"><span>언제 값인가요</span><b style="font-weight:500;font-size:13px;max-width:215px">어제 저녁 6~8시 사이 마지막 거래. 미국 장이 열리기 전이에요.</b></div><div class="rowline"><span>예상 범위에 들어가나요</span><b style="font-weight:500;font-size:13px;max-width:215px">아니요. 참고로만 보여 드려요.</b></div></div>
    <div class="tiny" style="margin-top:12px">이 값을 예상 범위 계산에 넣어 보았지만 예상이 눈에 띄게 가까워지지 않아 쓰지 않아요. 저녁 거래 뒤에 미국 장과 야간선물이 움직이기 때문에, 아침 시작 가격은 이 값과 다를 수 있어요. 저녁 거래가 없던 종목에는 나오지 않아요.</div>`],
  nightfx: ["코스피200 야간선물", `<p class="sub" style="font-size:13.5px;color:var(--ink2);margin:0">한국거래소 코스피200 선물은 낮 장이 끝난 뒤 밤(18:00~다음 날 06:00)에도 거래돼요. 미국 장이 열려 있는 시간이라 밤사이 소식이 이 값에 먼저 반영돼요.</p>
    <div class="rows" style="margin-top:8px"><div class="rowline"><span>어떤 값인가요</span><b style="font-weight:500;font-size:13px;max-width:215px">06:00 마감 값이 어제 낮 장 종가보다 몇 % 움직였는지예요.</b></div><div class="rowline"><span>어디에 쓰나요</span><b style="font-weight:500;font-size:13px;max-width:215px">이 값과 지난 기록으로 내 종목의 오늘 시가 예상 범위(노란띠)를 계산해요.</b></div></div>
    <div class="tiny" style="margin-top:12px">띠를 누르면 밤사이 흐름과 그 시간의 기사를 볼 수 있어요. 기사가 나온 시각과 움직임이 겹쳐도 그 기사 때문이라고 단정하지 않아요.</div>`],
  hmap: ["내 종목 지도 읽는 법", `<p class="sub" style="font-size:13.5px;color:var(--ink2);margin:0">시장(야간선물) → 업종 → 내 종목 순서로 묶었어요.</p>
    <div class="rows" style="margin-top:8px"><div class="rowline"><span>칸 크기</span><b style="font-weight:500;font-size:13px;max-width:215px">보유 금액</b></div><div class="rowline"><span>칸 색</span><b style="font-weight:500;font-size:13px;max-width:215px">종목마다 계산한 오늘 예상 시가가 어제 종가보다 위면 빨강, 아래면 파랑</b></div><div class="rowline"><span>소식 수</span><b style="font-weight:500;font-size:13px;max-width:215px">밤사이 그 종목과 이어진 미국 기사 수</b></div><div class="rowline"><span>점선 칸</span><b style="font-weight:500;font-size:13px;max-width:215px">관심 종목(수량 0)</b></div></div>
    <div class="tiny" style="margin-top:12px">업종별 예상은 따로 계산하지 않아서 업종 줄에는 금액 비중만 적었어요. 칸을 누르면 그 종목을 볼 수 있어요.</div>`],
  nxtout: ["장전 거래가 범위 밖이에요", `<p class="sub" style="font-size:13.5px;color:var(--ink2);margin:0">08:10 장전 거래가 이미 아침 예상 범위 밖에 있어요. 지난 1년 이런 종목은 범위 안에서 열린 경우가 10번 중 3번 남짓이었고, 시가도 장전 거래 쪽으로 벗어난 경우가 10번 중 6~7번이었어요.</p><div class="tiny" style="margin-top:12px">아직 확인 중인 표시예요.</div>`],
};
export const infoSheet = (k) => `<div class="grab" data-act="close"><i></i></div><div class="sheet-h"><h3>${INFO[k][0]}</h3><button class="x" data-act="close" aria-label="닫기">${I.x}</button></div><div class="sheet-b">${INFO[k][1]}</div>`;

/* ───── 11/17 데모 피드백 반영 ───── */
const kstNow = () => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value])); return { T: p.year + p.month + p.day, hm: (+p.hour % 24) * 100 + +p.minute }; };

/** 지금 시각에 따른 상태 띠(가장 최근 날짜를 볼 때만). 밤 18:00~06:00 수집 중 · 06:00~09:00 오늘 브리핑 · 09:00~18:00 밤사이 시간이 아님 */
export function statusHtml(d, st) {
  if (!st.meta || !st.liveMode) return d.special ? specialHtml(d) : "";      // 상태 띠는 '실시간' 보기에서만
  const { hm } = kstNow(), lf = st.liveFeed || {};
  let h;
  if (hm >= 1800 || hm < 600) h = `<div class="status"><i class="dotlive"></i><div><b>밤사이 소식을 모으는 중이에요</b>미국 장이 열린 동안 한 시간마다 기사를 모아요${lf.last_fetch ? ` · 마지막 수집 ${lf.last_fetch}` : ""}. 다음 아침 브리핑은 06:00까지 모은 기사로 06:30에 나와요. <button class="link" data-act="golive">방금 들어온 소식 보기</button></div></div>`;
  else if (hm < 900) h = `<div class="status"><i class="dotlive"></i><div><b>오늘 아침 브리핑이에요</b>06:00 미국 장 마감까지 모은 기사와 야간선물로 만들었어요. 08:11에는 장전 거래를 더해요.</div></div>`;
  else h = `<div class="status day"><i class="dotlive"></i><div><b>지금은 밤사이 시간이 아니에요</b>아래는 오늘 아침 기록이에요. 오늘 18:00부터 다시 모아요.</div></div>`;
  return `<section class="sec" style="padding-top:10px;padding-bottom:0">${h}</section>` + (d.special ? specialHtml(d) : "");
}
const specialHtml = (d) => `<section class="sec" style="padding-top:10px;padding-bottom:0"><div class="notice">${I.warn}<div><b>${esc(d.special.title)}</b>${esc(d.special.note)}</div></div></section>`;

/** 자료 상태: 이 브리핑이 어떤 자료로 언제 만들어졌는지 */
export function pipeHtml(d) {
  const p = d.pipeline; if (!p || !p.collected) return "";
  const cut = p.cutoffs.map((c) => `${c.label.replace(" 마감", "")} ${c.deadline.split(" ")[1]}`).join("·");
  const proc = p.processed.length ? ` · 묶기·본문 ${p.processed.map((x) => x.seconds + "초").join("+")}` : "";
  const re = p.brief_at && p.brief_at.slice(0, 5).replace("/", "") !== d.T.slice(4) ? " (다시 만든 판)" : "";
  const cov = thin(d) ? ` · 검색어 ${num(p.coverage.terms_ok)}/${num(p.coverage.terms)}개만 받음` : "";
  return `<section class="sec" style="padding-top:0"><div class="pipe">자료 · 밤사이 미국 기사 ${num(p.collected)}건 모음(마감 ${cut})${cov}${proc}${p.brief_at ? ` · AI 문장 ${esc(p.model || "")} ${p.brief_at}${re}` : ""} · 숫자는 모두 코드 계산</div></section>`;
}

/** 방금 들어온 소식: 지금 모으는 밤의 최신 기사(검색어로 걸린 그대로) */
export function liveHtml(lf) {
  if (!lf) return `<div class="empty">불러오는 중이에요…</div>`;
  if (!lf.items.length) return `<div class="empty">아직 들어온 기사가 없어요.</div>`;
  return `<div class="notice info" style="margin-bottom:10px">${I.info}<div><b>지금 모으는 밤 · 기사 ${num(lf.collected)}건 중 제목에 종목 검색어가 있는 ${num(lf.direct || lf.items.length)}건</b>마지막 수집 ${esc(lf.last_fetch || "–")}${lf.built ? ` · 화면 갱신 ${esc(lf.built)}` : ""}. 아직 거르기 전이에요. 아침 브리핑에서 같은 소식끼리 묶고 관련 없는 건 빼요.</div></div>
    <div class="feed">${lf.items.map((x) => `<a ${x.link ? `href="${esc(x.link)}" target="_blank" rel="noopener noreferrer"` : ""}><b lang="en">${esc(x.title)}</b><small>${(x.stocks || []).map((s) => `<span class="chip" style="height:18px;font-size:10.5px;margin-right:4px">${esc(s)}</span>`).join("")}${esc(x.outlet)} · 보도 ${esc(x.published)}</small></a>`).join("")}</div>`;
}

/** 브리핑 알림 시각(시연: 이 브라우저에만 저장) */
export function notifSheet(st, d) {
  const chips = (act, opts, cur, note = {}) => `<div class="optchips">${opts.map((o) => `<button class="${o[0] === cur ? "on" : ""}" data-act="${act}" data-v="${o[0]}" aria-pressed="${o[0] === cur}">${o[1] || o[0]}${note[o[0]] ? `<small>${note[o[0]]}</small>` : ""}</button>`).join("")}</div>`;
  const win = d ? winText(d) : "";
  return `<div class="grab" data-act="close"><i></i></div><div class="sheet-h"><h3>브리핑 설정</h3><button class="x" data-act="close" aria-label="닫기">${I.x}</button></div>
  <div class="sheet-b"><h4 style="margin-top:0">브리핑 받는 시각</h4>
    <p class="sub" style="margin:0">미국 장이 끝나는 06:00까지 모은 기사와 야간선물로 만들어 06:30부터 볼 수 있어요. 처리량에 따라 몇 분 늦을 수 있어요.</p>
    ${chips("setnotif", [["06:30"], ["07:00"], ["07:30"], ["08:00"], ["08:30"]], st.notif || "06:30", { "06:30": "가장 빠름" })}
    <h4>잠드는 시각</h4>
    <p class="sub" style="margin:0">이 시각부터 06:00까지 나온 소식을 ‘자는 동안 생긴 소식’으로 모아요. 그 전에 나온 소식은 이미 본 것으로 보고, 이어지는 소식인지 가릴 때만 써요.</p>
    ${chips("setbed", [["22:00"], ["23:00"], ["00:00"], ["01:00"], ["02:00"]], st.bed || "00:00", { "00:00": "기본" })}
    <h4>글자 크기</h4>
    ${chips("setbig", [["0", "보통"], ["1", "크게"]], st.big ? "1" : "0")}
    <div class="tiny" style="margin-top:14px">시연에서는 고른 값을 이 브라우저에만 저장해요.${win ? ` 지금 화면의 브리핑은 ${win}으로 만든 것을 그대로 보여 드려요.` : ""} 실서비스에서는 고른 시각대로 모아서 증권사 앱 알림으로 보내요.</div></div>`;
}

/** 처음 안내(3단계) */
export function introSheet(step) {
  const demo = bandHtml({ code: "000000", name: "예시", H: -0.009, b80: [-0.036, 0.018], b90: [-0.046, 0.027], grade: { g: -0.004 }, y: null }, { dom: [-0.05, 0.05], slot: "0811", avg: 0.02 });
  const pages = [
    ["자는 동안 생긴 일, 내 주식 기준으로", `<p>한국 주식을 갖고 있으면, <b>밤사이 미국 시장에서 생긴 일</b>이 다음 날 아침 9시 내 주식이 시작하는 가격에 영향을 줘요. 이 화면은 그걸 <b>장이 열리기 전에</b> 내 종목 기준으로 미리 정리해 줘요.</p>
      <ul><li>오늘 아침 내 주식이 대략 얼마에 시작할지</li><li>밤사이 미국 뉴스 가운데 내 종목과 관련 있는 것</li><li>9시에 실제로 얼마에 시작했는지</li></ul>
      <p class="tiny">지금은 시연판이에요. 증권사 앱 안에 들어가는 기능으로 만들고 있어요. 사거나 팔라고 권하지 않아요.</p>`],
    ["노란띠 = 오늘 시작 가격의 예상 범위", `<div class="demo-band">${demo}</div>
      <ul><li><b>가운데 점선</b>이 어제 끝난 가격이에요. 띠가 왼쪽이면 어제보다 낮게, 오른쪽이면 높게 시작하는 쪽이에요</li><li><b>노란 띠</b> 안에서 시작한 날이 지난 비슷한 아침 10번 중 8번쯤이었어요</li><li><b>검은 점</b>은 그중 가장 그럴듯한 한 점, <b>세모</b>는 8시부터 실제로 거래된 가격, <b>가는 점선</b>은 내가 산 평균 가격이에요</li></ul>
      <p class="tiny">꼭 그 안에서 시작한다는 약속은 아니에요. 띠를 누르거나 끌면 ‘그 값에 시작하면 내 돈이 얼마나 달라지는지’ 볼 수 있어요.</p>`],
    ["이렇게 써 보세요", `<ul><li><b>예시 계좌 3개</b>가 들어 있어요. 오른쪽 위에서 바꿔 볼 수 있어요</li><li><b>내 종목</b> 탭에서 내가 가진 종목과 수량을 직접 넣을 수 있어요. 산 가격은 몰라도 되고, 수량을 0으로 두면 ‘관심 종목’으로 볼 수 있어요</li><li>맨 위 <b>날짜</b>를 누르면 지난 아침을 다시 볼 수 있어요. ‘실시간’은 지금 시각을 따라가요</li></ul>
      <p class="tiny">아침 6시 30분에 첫 브리핑이 나오고, 8시 11분에 장 열리기 전 거래를 더해요. 9시 뒤에는 실제 시작 가격과 나란히 보여 드려요.</p>`],
  ];
  const [t, body] = pages[step];
  return `<div class="grab" data-act="close"><i></i></div><div class="sheet-h"><h3>처음이세요?</h3><button class="x" data-act="introdone" aria-label="닫기">${I.x}</button></div>
  <div class="sheet-b intro"><div class="step-dots">${pages.map((_, i) => `<i class="${i === step ? "on" : ""}"></i>`).join("")}</div><h4>${t}</h4>${body}
  <div class="nav">${step ? `<button class="btn-line" data-act="intro" data-step="${step - 1}">이전</button>` : ""}${step < pages.length - 1 ? `<button class="btn-primary" data-act="intro" data-step="${step + 1}">다음</button>` : `<button class="btn-primary" data-act="introdone">시작하기</button>`}</div></div>`;
}

/** 실시간 · 밤(다음 아침 브리핑 준비 중): 지금 모으는 기사 중 내 종목 것, 06:30까지 남은 시간, 지난 아침 기록으로 가기 */
export function pendingBrief(m, d, st) {
  const p = st.pending, lf = st.liveFeed || { items: [] };
  const names = new Set([...m.rows.map((r) => r.s.name), ...m.account.excluded.map((x) => x.name)]);
  const mine = lf.items.filter((x) => (x.stocks || []).some((s) => names.has(s)));
  const now = kstNow(), mins = (() => { const [h, mi] = [Math.floor(now.hm / 100), now.hm % 100]; let t = 6 * 60 + 30 - (h * 60 + mi); if (t < 0) t += 24 * 60; return t; })();
  const left = mins >= 60 ? `${Math.floor(mins / 60)}시간 ${mins % 60}분` : `${mins}분`;
  let h = (p.preview ? `<section class="sec" style="padding-top:10px;padding-bottom:0"><div class="notice info">${I.info}<div><b>밤 화면 미리 보기예요</b>실제로는 18:00부터 다음 날 06:30 브리핑이 나오기 전까지 이 화면이 보여요. 아래 기사 수는 지금 모으고 있는 실제 값이에요. <button class="link" data-act="pickday" data-t="live">지금 시각 화면으로</button></div></div></section>` : "")
    + `<section class="sec" style="padding-top:10px;padding-bottom:0"><div class="status"><i class="dotlive"></i><div><b>${esc(p.label)} 아침 브리핑을 준비하고 있어요</b>미국 장이 열린 동안 한 시간마다 기사를 모아요${lf.last_fetch ? ` · 마지막 수집 ${esc(lf.last_fetch)}` : ""}. 06:00(미국 장·야간선물 마감)까지 모은 자료로 06:30에 브리핑이 나와요.</div></div></section>`;
  h += `<section class="sec"><div class="hero hero-card"><div class="label">다음 아침 브리핑까지</div><div class="big num">${left}<small>${esc(p.label)} 06:30</small></div>
    <div class="flow"><div><span>지금까지 모은 미국 기사</span><b class="num">${num(lf.collected || 0)}건</b></div>${I.arrow}<div><span>제목에 종목 검색어</span><b class="num">${num(lf.direct || 0)}건</b></div></div>
    <div class="tiny" style="margin-top:8px">야간선물 실시간 시세는 실서비스에서 증권사 연결로 받아요. 시연에서는 06:00 마감 뒤에 반영돼요.</div></div></section>`;
  h += `<section class="sec"><div class="sec-h"><h2>내 종목과 이어진 방금 들어온 소식</h2>${lf.items.length ? `<button class="more" data-act="golive">전체 ${lf.items.length}건 ${I.chev}</button>` : ""}</div>
    ${mine.length ? `<div class="feed">${mine.slice(0, 8).map((x) => `<a ${x.link ? `href="${esc(x.link)}" target="_blank" rel="noopener noreferrer"` : ""}><b lang="en">${esc(x.title)}</b><small>${(x.stocks || []).map((s) => `<span class="chip" style="height:18px;font-size:10.5px;margin-right:4px">${esc(s)}</span>`).join("")}${esc(x.outlet)} · 보도 ${esc(x.published)}</small></a>`).join("")}</div>`
      : `<div class="empty">아직 내 종목 검색어가 제목에 들어간 기사가 없어요.${m.rows.length ? "" : " 내 종목을 넣으면 여기에 모여요."}</div>`}
    <div class="tiny" style="margin-top:6px">아직 거르기 전이에요. 06:30 브리핑에서 같은 소식끼리 묶고 관련 없는 건 빼요.</div></section>`;
  h += `<section class="sec"><div class="sec-h"><h2>내 종목 ${m.rows.length + m.account.excluded.length}</h2><span class="more">06:30에 예상 범위가 나와요</span></div><div class="rows">${m.rows.map((r) => `<div class="rowline"><div><b style="text-align:left;display:block">${esc(r.s.name)}</b><small>어제 종가 ${priceShort(r.s.pc)}원${r.h.q ? ` · ${num(r.h.q)}주` : " · 관심"}</small></div><span class="chip">준비 중</span></div>`).join("")}</div></section>`;
  h += `<section class="sec"><button class="btn-line" data-act="pickday" data-t="${d.T}">지난 아침 기록 보기 · ${esc(d.label)}</button></section>`;
  return h + `<div class="foot">실시간 보기는 지금 시각을 따라가요. 지난 날짜는 위 날짜를 눌러 고를 수 있어요.</div>`;
}

/** 날짜 고르기(휴대폰에서도): 실시간 + 지난 날짜 */
export function daySheet(days, cur) {
  const KIND = { live: "오늘 기록", forward: "사후 계산", replay: "과거 재생" };
  return `<div class="grab" data-act="close"><i></i></div><div class="sheet-h"><h3>날짜</h3><button class="x" data-act="close" aria-label="닫기">${I.x}</button></div>
  <div class="sheet-b"><button class="opt-row${cur === "live" ? " on" : ""}" data-act="pickday" data-t="live"><span><b>● 실시간</b> · 지금 시각을 따라가요</span>${cur === "live" ? I.check : ""}</button>
  <button class="opt-row${cur === "night" ? " on" : ""}" data-act="pickday" data-t="night"><span><b>☾ 밤 화면 미리 보기</b> · 18:00~06:30에 보이는 ‘모으는 중’ 화면</span>${cur === "night" ? I.check : ""}</button>
  <div class="tiny" style="margin:10px 0 2px">지난 아침(시험 결과 확인용)</div>
  ${days.map((x) => `<button class="opt-row${cur === x.T ? " on" : ""}" data-act="pickday" data-t="${x.T}"><span>${x.label} <small class="tiny">${KIND[x.kind] || ""}${x.brief ? " · 뉴스 브리핑" : ""}</small></span>${cur === x.T ? I.check : ""}</button>`).join("")}</div>`;
}

/** 한눈에 지도 구역(내 종목 탭·관계 그림 위) */
export function mapSection(m, d, title = "한눈에 지도") {
  if (!m.rows.length) return "";
  const newsOf = (c) => (m.briefBy[c] || 0) + (m.newsBy[c] || 0);
  return `<section class="sec"><div class="sec-h"><h2>${title}</h2><span class="more">업종별 내 종목</span></div>${acctMap(m.rows, d.market.x, newsOf)}
    <div class="tiny" style="margin-top:6px">맨 위 줄은 밤사이 실제로 거래된 야간선물 값이에요. 칸의 색은 종목마다 따로 계산한 오늘 예상 시작 가격(어제 끝난 가격 대비)이에요. 업종별 예상은 계산하지 않아서 업종 줄에는 금액 비중만 적었어요. 칸을 누르면 그 종목을 볼 수 있어요.</div></section>`;
}

/** 큰 밤 다시 보기(사후 복기): 규칙을 고정한 뒤, 야간선물이 크게 움직인 날의 아침 예상과 9시 실제 */
function casesHtml(w) {
  const cs = (w.cases || []).filter((c) => c.x != null && c.act != null).sort((a, b) => Math.abs(b.x) - Math.abs(a.x)).slice(0, 3);
  if (!cs.length) return "";
  return `<section class="sec" style="padding-top:12px"><div class="sec-h"><h2>큰 밤 다시 보기</h2><span class="more">규칙을 고정한 11/3 뒤</span></div>
    <p class="sub" style="margin:-4px 0 2px">밤사이 야간선물이 크게 움직인 날, 아침에 본 예상과 9시에 실제로 시작한 값을 나란히 놓았어요. 지금 가진 종목·수량을 그날에 대입한 계산이에요.</p>
    ${cs.map((c) => `<div class="case"><div class="ch"><b>${dlabel(c.T)}</b><span>밤사이 야간선물 ${pct(c.x)} · ${c.n_in === c.n ? `${c.n}종목 모두 범위 안` : `${c.n}종목 중 ${c.n_in}종목 범위 안`}</span></div>
      <div class="cmp"><div><span>아침에 본 예상</span><b class="num ${tone(c.exp)}">${pct2(c.exp)}</b></div>${I.arrow}<div><span>9시 실제 시작</span><b class="num ${tone(c.act)}">${pct2(c.act)}</b></div></div>
      <p>지금 가진 만큼이었다면 아침 예상은 ${man(c.value * c.exp)}, 실제는 ${man(c.value * c.act)}이었어요. 야간선물 숫자만 그대로 따랐다면 ${man(c.value * c.x)}으로 봤을 거예요.</p></div>`).join("")}
    <div class="tiny" style="margin-top:8px">지난 일을 다시 본 것이고, 앞으로도 같다는 뜻이나 수익을 뜻하지 않아요. 조용한 밤에는 ‘어제 가격 그대로’와 차이가 작았어요.</div></section>`;
}


/* ───── 홈(11/19, 수연 피그마 '홈 (최종 · v2)' 464:8207을 옮김) ─────
   계좌 카드 → 뉴스 브리핑 핵심 → 미국 시장 → 야간선물 띠 → 내 종목 지도. 숫자는 모두 서버 값 그대로이고,
   '확인 필요'는 피그마 밤사이 v4 정의(범위 밖 + 믿을 정도 낮음, 개장 뒤엔 범위 밖에서 시작)를 따른다. */
const HI = "img/home/";
export const homeBar = (sub) => `<div class="hb-l"><h1 class="hb-t">투자 브리핑</h1><button class="hb-s" data-act="daysheet" aria-label="날짜 바꾸기">${esc(sub)}</button></div>
  <button class="hb-i" data-act="acctsheet" aria-label="마이 · 계좌 바꾸기"><img src="${HI}my.svg" width="23" height="23" alt=""></button>
  <button class="hb-i" data-act="notif" aria-label="알림 · 브리핑 받는 시각"><img src="${HI}bell.svg" width="23" height="23" alt=""></button>`;

export function homeNeed(m, st) {                       // 확인이 필요한 보유 종목
  const held = m.rows.filter((r) => r.h.q > 0);
  if (m.showAct) return { held, need: held.filter((r) => r.s.y != null && !r.s.inb), base: held.filter((r) => r.s.y != null).length };
  if (st.slot === "0730") return { held, need: [], base: null };
  const need = held.filter((r) => { const g = r.s.grade; return g && ((g.g != null && !(r.s.b80[0] <= g.g && g.g <= r.s.b80[1])) || g.level === "낮음"); });
  return { held, need, base: held.length };
}

export function home(m, d, st) {
  const a = m.account, act = m.showAct && m.actSum != null, hypo = m.pinned, sv = m.stockValue;
  const out = (a.excluded || []).filter((x) => !(x.q === 0)).length;
  let h = statusHtml(d, st) + `<div class="home">`;
  if (!m.rows.length && !out) {
    h += `<button class="h-acct h-empty" data-act="tab" data-tab="mine"><div class="r1"><span>오늘 시가에 예상되는 내 주식 변화</span></div><b>보유 종목을 넣으면 밤사이 변화를 계산해 드려요</b><span class="c1">종목 넣기 <i class="ch">›</i></span></button>`;
  } else {
    const main = act ? m.actSum : hypo ? m.hypoSum : m.Hsum;
    const label = act ? "개장 시가 기준 내 주식 변화" : hypo ? "내가 가정한 시가 기준 내 주식 변화" : m.rows.some((r) => r.s.H0730 != null) ? "오늘 시가 예상 · 08:11 장전 거래 반영" : "오늘 시가에 예상되는 내 주식 변화";
    const { need, base } = homeNeed(m, st);
    const amt = st.hideAmt ? "••••••원" : won(main);
    const c1 = base == null ? "" : need.length
      ? `<button class="c1" data-act="needgo"><img src="${HI}dot-orange.svg" width="7" height="7" alt="">${act ? "범위 밖 시작" : "확인 필요"} ${need.length}종목 <i class="ch">›</i></button>`
      : `<span class="c1">${act ? "모두 범위 안에서 시작" : "확인 필요 없음"} <i class="ch">›</i></span>`;
    const c2 = base == null ? `예상 ${m.rows.filter((r) => r.h.q > 0).length}종목${out ? ` · 대상 아님 ${out}` : ""}` : `범위 안 ${base - need.length}${out ? ` · 대상 아님 ${out}` : ""}`;
    h += `<div class="h-acct" data-act="tab" data-tab="brief" role="link" tabindex="0">
      <div class="r1"><span>${label}</span><button class="eye" data-act="hideamt" aria-label="${st.hideAmt ? "금액 보기" : "금액 숨기기"}" aria-pressed="${st.hideAmt ? "true" : "false"}"><img src="${HI}eye.svg" width="18" height="12" alt=""${st.hideAmt ? ' style="opacity:.35"' : ""}></button><em>밤사이 ›</em></div>
      <div class="amt ${tone(main)}"><b class="num">${amt}</b><small class="num">${pct2(sv ? main / sv : null)}</small></div>
      <div class="chips">${c1}<span class="c2">${c2}</span></div></div>`;
  }
  if (d.market.cautions.length) h += d.market.cautions.map((c) => `<div class="notice">${I.warn}<div><b>${esc(c.title)}</b>${esc(c.body)}</div></div>`).join("");

  const b = d.brief, line = b && b.market && b.market.line_ko, tc = {}, kn = kstNow(), prepping = !line && d.T === kn.T && kn.hm < 700;   // 아침 07:00 전 그날만 '준비 중'
  ((b && b.market && b.market.items) || []).forEach((it) => (it.topics || []).forEach((t) => (tc[t] = (tc[t] || 0) + (it.media_count || 1))));
  const topics = Object.entries(tc).sort((x, y) => y[1] - x[1]).slice(0, 3).map((x) => x[0]);
  const mineN = Object.values(m.briefBy).reduce((x, y) => x + y, 0);
  h += `<div class="h-sec"><div class="h-row"><h2>뉴스 브리핑</h2><button class="h-more" data-act="nf" data-v="market">전체 보기</button></div>
    <button class="h-core" data-act="nf" data-v="market" data-llm="1"><span class="k">${topics.length >= 2 ? `오늘의 핵심 ${topics.length}가지` : "밤사이 한 줄"}${line ? AI : ""}</span>
      <span class="hl${line && line.length > 28 ? " long" : ""}">${line ? esc(line) : prepping ? "미국 장 마감까지 모은 기사로 쓰는 밤사이 요약을 준비하고 있어요." : "이 날은 밤사이 AI 요약이 없어요. 뉴스 브리핑에서 관계로 이은 기사를 볼 수 있어요."}</span>
      <span class="kw">${topics.length ? topics.map(esc).join(" · ") : mineN ? `내 종목과 이어진 밤사이 소식 ${mineN}건` : "시장 전체 소식은 전체 보기에서"}</span>
      <span class="ft">3분 브리핑 읽기<i>›</i></span></button></div>`;

  const us = d.us_market;
  if (us && us.items.length) h += `<div class="h-sec h-us"><div class="h-row"><h3>미국 시장</h3><span>${esc(us.note)}</span></div>
    <div class="h-chips">${us.items.map((i) => `<div class="h-chip" title="${i.k === "환율" ? "원/달러 환율, 전날 대비" : esc(i.k) + ", 전날 종가 대비"}"><span>${esc(i.k)}</span><b class="num ${tone(i.r)}">${pct2(i.r)}</b></div>`).join("")}</div></div>`;

  const n = d.night, x = d.market.x;
  h += `<div class="h-night" data-act="tab" data-tab="night" role="link" tabindex="0"><div class="hn-l"><div class="hn-t"><b>코스피200 야간선물</b><span class="hn-q" data-act="info" data-info="nightfx" role="button" tabindex="0" aria-label="야간선물 설명">?</span></div><small>어젯밤 18:00 ~ 06:00</small></div>
    ${n ? spark(n, 60, 22) : ""}<div class="hn-r"><b class="num ${tone(x)}">${pct2(x)}</b><small>어제 마감 대비</small></div><span class="h-chev">›</span></div>`;

  if (m.rows.length) {
    const newsOf = (c) => (m.briefBy[c] || 0) + (m.newsBy[c] || 0);
    const when = act ? "개장 뒤" : `${st.slot.slice(0, 2)}:${st.slot.slice(2)} 기준 · 장 전`;
    h += `<div class="h-sec h-map"><div class="h-row"><div class="h-mt"><h3>오늘 아침 내 종목 지도</h3><button class="h-q2" data-act="info" data-info="hmap" aria-label="지도 읽는 법">?</button></div><button class="h-link" data-act="tab" data-tab="brief">밤사이 자세히 ›</button></div>
      <p class="h-sub">${when} · 오늘 예상 시가</p>${acctMap(m.rows, x, newsOf)}</div>`;
  }
  h += `<p class="h-foot">${a.sample ? "예시 계좌예요" : "직접 넣은 잔고예요"} · 투자 권유가 아니에요</p></div>`;
  return h + foot(d);
}


/* ───── 밤사이 v4(11/19, 수연 피그마 '밤사이 v4 · 보유 탭' 448:6559, 시트 400:5083, 정렬 444:6560) ─────
   목록은 한 줄씩(작은 띠), 종목을 누르면 시트. 시트 안의 노란띠 끌기·누르기와 수량 −/+는 원래 버전과 같은 코드(bandHtml·bindBands·data-step)가 그대로 돈다. */
const NI = "img/night/";
const TINTS = [["rgba(241,163,60,.18)", "#B86E12"], ["rgba(139,111,214,.18)", "#6A4FB8"], ["rgba(124,92,255,.14)", "#7C5CFF"], ["rgba(0,140,130,.14)", "#007A72"],
  ["rgba(76,111,195,.16)", "#3E5FAE"], ["rgba(211,93,102,.14)", "#B8434C"], ["rgba(102,119,122,.14)", "#45555A"]];
export const SORT4 = { amt: "금액 변화 큰 순", weight: "비중 큰 순", rate: "등락률 큰 순", name: "이름 순" };
const grpOf = (s) => s.group || "기타";
function tintMap(m) {                                   // 업종 색: 보유 금액 큰 업종부터 차례로
  const tot = {}; m.rows.forEach((r) => (tot[grpOf(r.s)] = (tot[grpOf(r.s)] || 0) + r.value + 1));
  const out = {}; Object.entries(tot).sort((a, b) => b[1] - a[1]).forEach(([g], i) => (out[g] = TINTS[Math.min(i, TINTS.length - 1)])); return out;
}
const ico4 = (s, tm, size = 28, warn = false) => { const [bg, fg] = tm[grpOf(s)] || TINTS[6]; const ch = s.name.replace(/^(HD|LS|SK|KB|LG|GS|KT)/, (x) => x[0]).slice(0, 1);
  return `<span class="n4-ico" style="width:${size}px;height:${size}px;background:${bg};color:${fg};font-size:${size > 28 ? 14 : 12}px">${esc(ch)}${warn ? `<img class="n4-warn" src="${NI}dot-warn.svg" width="9" height="9" alt="">` : ""}</span>`; };

/** 한 줄마다 쓰는 값: 표시 등락(개장 뒤엔 실제 시가, 아니면 가정·예상), 금액, 범위 밖·믿을 정도 낮음 */
export function rows4(m, st) {
  const watch = (st.hold4 || (m.rows.some((r) => r.h.q > 0) ? "own" : "watch")) === "watch";
  const out = m.rows.filter((r) => (watch ? r.h.q === 0 : r.h.q > 0)).map((r) => {
    const s = r.s, g = st.slot !== "0730" ? s.grade : null, act = m.showAct && s.y != null;
    const isOut = act ? !s.inb : !!(g && g.g != null && !(s.b80[0] <= g.g && g.g <= s.b80[1]));
    const low = false;   // E107: 믿을 정도 낮음 = 장전 가격이 07:30 범위 밖(isOut)이라 따로 묶지 않는다
    const ref = act ? s.y : g && g.g != null ? g.g : s.H, dir = ref > s.b80[1] ? "상승" : "하락";
    const v = act ? s.y : r.pin != null ? r.pin : s.H, amt = r.q > 0 ? r.value * v : null;
    const news = (m.newsBy[s.code] || 0) + (m.briefBy[s.code] || 0);
    const tag = (isOut ? `범위보다 크게 ${dir}` : low ? "믿을 정도 낮음" : r.q > 0 ? `보유 ${num(r.q)}주` : "관심 종목") + (news ? ` · 소식 ${news}` : "");
    return { r, s, g, act, isOut, low, need: isOut || low, v, amt, news, tag };
  });
  const k = st.sort4 || "amt";
  const key = { amt: (x) => -Math.abs(x.amt ?? x.v), weight: (x) => -x.r.value, rate: (x) => -Math.abs(x.v), name: () => 0 }[k];
  out.sort((a, b) => (k === "name" ? a.s.name.localeCompare(b.s.name, "ko") : key(a) - key(b)));
  return { list: out, watch };
}

/** 화면에 보이는 순서(시트 ‹ ›도 이 순서): 전체면 확인 필요 먼저, 아니면 고른 필터만 */
function order4(list, f) {
  if (f === "all") return [...list.filter((x) => x.need), ...list.filter((x) => !x.need)];
  if (f === "nc") return [];
  return list.filter((x) => (f === "out" ? x.isOut : f === "low" ? x.low : grpOf(x.s) === f.slice(2)));
}
function mini4(v, s, dom, mark) {   // mark: 범위 밖으로 판단한 근거 값(08:10 장전 거래) — 주황 고리                             // 작은 범위 띠 64×14(피그마 '작은 범위 띠'와 같은 모양, 값은 실제)
  const X = (x) => Math.max(5, Math.min(59, ((x - dom[0]) / (dom[1] - dom[0])) * 64));
  const lo = X(s.b80[0]), hi = X(s.b80[1]), c = X(0), p = X(v);
  return `<svg class="n4-mini" width="64" height="14" viewBox="0 0 64 14" aria-hidden="true"><rect y="5" width="64" height="4" rx="2" fill="var(--n4-track)"/><rect x="${lo.toFixed(1)}" y="3" width="${Math.max(4, hi - lo).toFixed(1)}" height="8" rx="4" fill="var(--n4-band)"/>
    <rect x="${(c - 0.57).toFixed(1)}" y="1" width="1.14" height="12" fill="var(--sub)"/>${mark != null ? `<circle cx="${X(mark).toFixed(1)}" cy="7" r="3.6" fill="var(--card)" stroke="var(--n4-need)" stroke-width="2"/>` : ""}<ellipse cx="${p.toFixed(1)}" cy="7" rx="5.14" ry="4.5" fill="var(--n4-dot)" stroke="var(--card)" stroke-width="1.5"/></svg>`;
}
const row4 = (x, tm, dom) => `<button class="n4-row" data-act="s4" data-code="${x.s.code}">${ico4(x.s, tm, 28, x.need)}
  <span class="n4-nm"><b>${esc(x.s.name)}</b><small class="${x.need ? "need" : ""}">${esc(x.tag)}</small></span>${mini4(x.v, x.s, dom, x.isOut && !x.act && x.g ? x.g.g : null)}
  <span class="n4-v ${tone(x.amt ?? x.v)}"><b class="num">${pct(x.v)}</b><small class="num">${x.amt == null ? "관심" : won(x.amt)}</small></span><i class="n4-chev">›</i></button>`;

export function acct4Html(m, d, st) {
  const act = m.showAct && m.actSum != null, hypo = m.pinned, sv = m.stockValue, main = act ? m.actSum : hypo ? m.hypoSum : m.Hsum;
  const label = act ? "개장 시가 기준 내 주식 변화" : hypo ? "내가 가정한 시가 기준 내 주식 변화" : m.rows.some((r) => r.s.H0730 != null) ? "오늘 시가 예상 · 08:11 장전 거래 반영" : "오늘 시가에 예상되는 내 주식 변화";
  const tm = tintMap(m), held = m.rows.filter((r) => r.h.q > 0), gc = {};
  held.forEach((r) => (gc[grpOf(r.s)] = (gc[grpOf(r.s)] || 0) + 1));
  const gs = Object.entries(gc).sort((a, b) => b[1] - a[1]), big = gs.filter(([, n]) => n >= 2), rest = gs.filter(([, n]) => n < 2).reduce((a, [, n]) => a + n, 0);
  const own = held.length, nw = m.rows.length - own, watch = (st.hold4 || (own ? "own" : "watch")) === "watch";
  return `<div class="r1"><span>${label}</span><button class="eye" data-act="hideamt" aria-label="${st.hideAmt ? "금액 보기" : "금액 숨기기"}"><img src="img/home/eye.svg" width="18" height="12" alt=""${st.hideAmt ? ' style="opacity:.35"' : ""}></button><button class="n4-link" data-act="map4">종목별 보기 ›</button></div>
    <div class="amt ${tone(main)}"><b class="num">${st.hideAmt ? "••••••원" : won(main)}</b><small class="num">${pct2(sv ? main / sv : null)}</small></div>
    <div class="n4-flow"><div><span>어제 종가 기준</span><b class="num">${st.hideAmt ? "••••••원" : won(sv, false)}</b></div><i>→</i><div class="r"><span>${act ? "개장 시가 기준" : hypo ? "가정한 시가 기준" : "예상 시가 기준"}</span><b class="num">${st.hideAmt ? "••••••원" : won(sv + main, false)}</b></div></div>
    ${own ? `<div class="n4-groups"><span>같은 업종에 묶인 내 종목</span><div>${big.map(([g, n], i) => `<button class="${i === 0 ? "hl" : ""}" data-act="f4" data-v="g:${esc(g)}"${i === 0 ? ` style="background:${tm[g][0]};color:${tm[g][1]}"` : ""}>${esc(g)} ${n}${i === 0 ? "종목" : ""}</button>`).join("")}${rest ? `<button data-act="f4" data-v="all">그 외 ${rest}</button>` : ""}</div></div>` : ""}
    <div class="n4-hold"><button class="${watch ? "" : "on"}" data-act="hold4" data-v="own">보유 ${own}</button><button class="${watch ? "on" : ""}" data-act="hold4" data-v="watch"${nw ? "" : " disabled"}>관심 ${nw}</button></div>`;
}

const usOpen = (T) => {                                 // 미국 정규장 개장(한국 시각): 서머타임이면 22:30, 아니면 23:30. 밤 = T 전날
  const d = new Date(Date.UTC(+T.slice(0, 4), +T.slice(4, 6) - 1, +T.slice(6) - 1)), y = d.getUTCFullYear();
  const nth = (mo, n) => { const f = new Date(Date.UTC(y, mo, 1)); return new Date(Date.UTC(y, mo, 1 + ((7 - f.getUTCDay()) % 7) + 7 * (n - 1))); };
  return d >= nth(2, 2) && d < nth(10, 1) ? 22.5 : 23.5;
};
function night4Card(m, d) {
  const n = d.night, x = d.market.x, sv = m.stockValue, a = sv ? (m.showAct && m.actSum != null ? m.actSum : m.Hsum) / sv : null;
  const uo = usOpen(d.T), up = ((uo - 18) / 12) * 100;
  const verdict = a == null || x == null ? "" : a >= 0 && x < 0 ? "시장과 반대로 올라요" : a < 0 && x >= 0 ? "시장과 반대로 내려요" : x < 0 ? (a > x ? "시장보다 덜 내려요" : "시장보다 더 내려요") : a > x ? "시장보다 더 올라요" : "시장보다 덜 올라요";
  return `<div class="n4-night" data-act="tab" data-tab="night" role="link" tabindex="0"><div class="n4n-h"><b>코스피200 야간선물</b><span class="hn-q" data-act="info" data-info="nightfx" role="button" tabindex="0" aria-label="야간선물 설명">?</span><i></i><b class="num ${tone(x)}">${pct2(x)}</b><span class="h-chev">›</span></div>
    <small>어젯밤 18:00 ~ 오늘 06:00 · 어제 마감 대비</small>${n ? `<div class="n4n-chart">${spark(n, 310, 62)}</div>` : ""}
    <div class="n4n-axis"><span>18:00</span><span class="us" style="left:${up.toFixed(1)}%">${uo === 22.5 ? "22:30" : "23:30"} 미국 개장</span><span>06:00 마감</span></div>
    ${a == null ? "" : `<div class="n4n-cmp"><span>시장 <b class="num ${tone(x)}">${pct2(x)}</b></span><i></i><span>내 계좌 예상 <b class="num ${tone(a)}">${pct2(a)}</b></span><em>${verdict}</em></div>`}</div>`;
}

function prog4(m, d, st) {                              // 진행 한 줄(피그마 '진행 한 줄')
  const open = (d.special && d.special.open) || "09:00", noPre = !!(d.special && d.special.premarket === false);
  const held = m.rows.filter((r) => r.h.q > 0), c = { "높음": 0, "보통": 0, "낮음": 0 };
  held.forEach((r) => r.s.t08 && r.s.t08.trust && (c[r.s.t08.trust] = (c[r.s.t08.trust] || 0) + 1));
  let step, t, sub;
  if (st.slot === "0900" && m.showAct) { const got = held.filter((r) => r.s.y != null); step = 4; t = `${open} 시가 채점 완료`; sub = `범위 안 ${got.filter((r) => r.s.inb).length} / ${got.length}종목`; }
  else if (st.slot === "0900") { step = 3; t = "아직 개장 전이에요"; sub = `${open} 시가가 나오면 채점해요`; }
  else if (st.slot === "0811" && noPre) { step = 3; t = "오늘은 장전 거래가 없어요"; sub = `07:30 범위 그대로 · 다음 ${open} 채점`; }
  else if (st.slot === "0811") { step = 3; t = "08:11 믿을 정도 반영 완료"; sub = `높음 ${c["높음"]} · 보통 ${c["보통"]} · 낮음 ${c["낮음"]} · 다음 ${open} 채점`; }
  else { step = 2; t = "07:30 예상 범위 나옴"; sub = `장전 거래(08:00~08:10)는 08:11에 반영 · 개장 ${open}`; }
  const dots = [3, 13, 24, 35].map((cx, i) => `<circle cx="${cx}" cy="4" r="${i + 1 === step ? 4 : 3}" fill="${i < step ? "var(--ok)" : "var(--n4-off)"}"/>`).join("");
  return `<button class="n4-prog" data-act="prog4"><img src="${NI}dot-prog.svg" width="8" height="8" alt=""><span><b>${t}</b><small>${sub}</small></span><svg width="38" height="8" viewBox="0 0 38 8" aria-hidden="true">${dots}</svg><i class="n4-chev">›</i></button>`;
}

/** 수연 버전 '밤사이' 탭(옛 tab=brief 자리) */
export function brief(m, d, st) {
  const tm = tintMap(m), { list, watch } = rows4(m, st), f = st.f4 || "all";
  const days = (st.meta && st.meta.days) || [], i = days.findIndex((x) => x.T === d.T), dayInfo = days[i] || {};
  const pre = st.slot !== "0900", preSlot = (dayInfo.slots || []).includes("0811") ? "0811" : "0730";
  const open = (d.special && d.special.open) || "09:00";
  const when = st.slot === "0900" ? (m.showAct ? `${open} 개장 · 시가 반영` : `${open} 개장 전`) : `${st.slot.slice(0, 2)}:${st.slot.slice(2)} 기준 · 장 시작 전 · 다음 갱신 ${st.slot === "0730" && preSlot === "0811" ? "08:11" : open + " 직후"}`;
  const ex = (m.account.excluded || []).filter((x) => x.q > 0);
  const outN = list.filter((x) => x.isOut).length, lowN = list.filter((x) => x.low).length;
  const gcount = {}; list.forEach((x) => (gcount[grpOf(x.s)] = (gcount[grpOf(x.s)] || 0) + 1));
  const chips = [["all", `전체 ${list.length}`], ["out", `범위 밖 ${outN}`], ["nc", `서비스 대상 아님 ${watch ? 0 : ex.length}`],
    ...Object.entries(gcount).sort((a, b) => b[1] - a[1]).map(([g, n]) => [`g:${g}`, `${g} ${n}`])];
  let h = statusHtml(d, st) + `<div class="n4">
    <div class="n4-top"><div class="n4-date"><button class="n4-arr" data-act="dayshift" data-dir="-1" aria-label="전 거래일"${days[i + 1] ? "" : " disabled"}>‹</button><button class="n4-d" data-act="daysheet">${esc(d.label)}</button><button class="n4-arr" data-act="dayshift" data-dir="1" aria-label="다음 거래일"${i > 0 ? "" : " disabled"}>›</button><i></i>
      <div class="n4-seg"><button class="${pre ? "on" : ""}" data-act="slot" data-slot="${preSlot}">장전</button><button class="${pre ? "" : "on"}" data-act="slot" data-slot="0900"${d.has_open || dayInfo.has_open ? "" : " disabled"}>장후</button></div></div>
      <p class="n4-when">${when}</p></div>
    ${prog4(m, d, st)}`;
  if (!m.rows.length && !ex.length) return h + `<button class="h-acct h-empty" data-act="tab" data-tab="mine"><b>보유 종목을 넣으면 밤사이 변화를 계산해 드려요</b><span class="c1">종목 넣기 <i class="ch">›</i></span></button></div>` + foot(d);
  h += `<div class="n4-acct" id="acct4">${acct4Html(m, d, st)}</div>`;
  if (d.market.cautions.length) h += d.market.cautions.map((c) => `<div class="notice" style="margin-top:10px">${I.warn}<div><b>${esc(c.title)}</b>${esc(c.body)}</div></div>`).join("");
  h += `<button class="n4-sort" data-act="sort4"><b>${watch ? "관심" : "보유"} ${list.length}종목</b><span>${SORT4[st.sort4 || "amt"]} ▾</span></button>
    <div class="n4-chips">${chips.map(([v, t]) => `<button class="${f === v ? "on" : ""}" data-act="f4" data-v="${esc(v)}">${esc(t)}</button>`).join("")}</div>`;
  const dom = m.dom, R = (xs) => xs.map((x) => row4(x, tm, dom)).join("");
  if (f === "nc") {
    h += `<div class="n4-title"><b>서비스 대상 아님 ${ex.length}</b><small>노란띠(예상 범위)는 시가총액 큰 ${d.universe_n || 200}종목에만 나와요</small></div>${ex.map((x) => `<div class="n4-row nc">${ico4({ name: x.name, group: "" }, tm)}<span class="n4-nm"><b>${esc(x.name)}</b><small>보유 ${num(x.q)}주 · 노란띠 없음</small></span></div>`).join("") || `<div class="empty">없어요</div>`}`;
  } else if (f !== "all") {
    const sel = list.filter((x) => (f === "out" ? x.isOut : f === "low" ? x.low : grpOf(x.s) === f.slice(2)));
    h += `<div class="n4-title"><b>${esc(chips.find((c) => c[0] === f)?.[1] || "")}</b><small>누르면 아래에서 자세히 열려요</small></div>${R(sel) || `<div class="empty">해당하는 종목이 없어요</div>`}`;
  } else {
    const need = list.filter((x) => x.need), rest = list.filter((x) => !x.need);
    if (need.length) h += `<div class="n4-title"><b><img src="${NI}dot-need.svg" width="8" height="8" alt="">확인이 필요한 종목 ${need.length}</b><small>${m.showAct ? "범위 밖에서 시작" : `장전 거래가 07:30 범위 밖 ${outN}(믿을 정도 낮음)`} — 눌러서 자세히 보세요</small></div>${R(need)}`;
    h += night4Card(m, d);
    h += `<div class="n4-title"><b>${need.length ? `나머지 ${rest.length}종목` : `${watch ? "관심" : "보유"} ${rest.length}종목`}</b><small>누르면 아래에서 자세히 열려요</small></div>${R(rest)}`;
  }
  h += `<p class="n4-foot">예상 범위는 지난 비슷한 아침에 실제 시가가 들어온 정도를 바탕으로 계산해요. 08:11에는 장전 거래 가격이 07:30 범위의 어디에 있는지로 믿을 정도를 매기고, 장전 거래 쪽으로 예상 시가를 보정해요. 범위 밖(믿을 정도 낮음) 종목은 위로 올려 펼쳐 둬요. 수량을 바꾸면 이 화면의 예상 금액만 다시 계산해요. ${m.account.sample ? "예시 계좌이며 " : ""}투자 권유가 아니에요.<br>${esc(recordLine(d))}</p></div>`;
  return h;
}

export const nightBar = (sub) => `<div class="nb-r"><h1>밤사이</h1><button class="hb-i" data-act="notif" aria-label="알림 설정"><img src="${NI}bell.svg" width="19" height="20" alt=""></button><button class="hb-i" data-act="acctsheet" aria-label="마이 · 계좌 바꾸기"><img src="${NI}my.svg" width="23" height="23" alt=""></button></div>
  <div class="nb-tabs"><button class="${sub === "rec" ? "" : "on"}" data-act="nsub" data-v="pred">밤사이 시가예측</button><button class="${sub === "rec" ? "on" : ""}" data-act="nsub" data-v="rec">기록</button></div>`;

/** 종목 시트(피그마 '시트 · 보유 · n'). data-row·data-f·data-step은 원래 버전과 같아서 수량 −/+·띠 끌기가 그대로 동작한다 */
export const s4acct = (m, r) => { const tot = m.pinned ? m.hypoSum : m.Hsum, v = r.pin != null ? r.pin : r.s.H, amt = r.q > 0 ? r.value * v : null;
  return `<span>계좌 예상</span><b class="num ${tone(tot)}">${won(tot)}</b><em>${amt == null ? "관심 종목" : `이 종목 ${won(amt)}`}</em>`; };
export function s4Sheet(code, m, d, st) {
  const list = order4(rows4(m, st).list, st.f4 || "all"), idx = list.findIndex((x) => x.s.code === code), x = list[idx] || rows4(m, { ...st, hold4: st.hold4 === "watch" ? "own" : "watch" }).list.find((y) => y.s.code === code);
  if (!x) return "";
  const r = x.r, s = r.s, tm = tintMap(m), live = r.pin != null, v = live ? r.pin : s.H, amt = r.q > 0 ? r.value * v : null;
  const prev = list[idx - 1], next = list[idx + 1], g = st.slot !== "0730" ? s.grade : null, same = m.rows.filter((y) => y.h.q > 0 && grpOf(y.s) === grpOf(s)).length;
  const avgR = r.h.avg > 0 ? r.h.avg / s.pc - 1 : null, [bg, fg] = tm[grpOf(s)] || TINTS[6];
  return `<div class="grab" data-act="close"><i></i></div>
  <div class="s4-head" data-s4="${code}"><button class="s4-nav" data-act="s4" data-code="${prev ? prev.s.code : ""}" aria-label="이전 종목"${prev ? "" : " disabled"}>‹</button><p>${idx + 1} / ${list.length} · ${SORT4[st.sort4 || "amt"]}</p><button class="s4-nav" data-act="s4" data-code="${next ? next.s.code : ""}" aria-label="다음 종목"${next ? "" : " disabled"}>›</button><button class="s4-x" data-act="close" aria-label="닫기">✕</button></div>
  <div class="s4-card stock" data-row="${code}">
    <div class="s4-acct" id="s4acct">${s4acct(m, r)}</div>
    <div class="s4-stock">${ico4(s, tm, 32)}<span class="nm"><b>${esc(s.name)}</b><small>${r.h.q > 0 ? `보유 ${num(r.h.q)}주` : "관심 종목"}</small></span>
      <span class="stepper s4-step${r.changed ? " changed" : ""}" data-stepper="${code}"><button data-step="-1" aria-label="수량 줄이기"${r.q <= 0 ? " disabled" : ""}><img src="${NI}minus.svg" width="12" height="12" alt=""></button><span class="q" data-act="qty" data-code="${code}"><span data-f="q">${num(r.q)}</span><small>주</small></span><button data-step="1" aria-label="수량 늘리기"><img src="${NI}plus.svg" width="12" height="12" alt=""></button></span></div>
    <p class="s4-lbl">오늘 예상 시가 범위</p>
    <div class="s4-big"><b class="num ${tone(v)}" data-f="pct">${live ? "가정 " : ""}${pct2(v)}</b><span data-f="sub">${live ? "가정" : "예상"} ${num(tick(s.pc * (1 + v)))}원 · 어제 ${num(s.pc)}원</span></div>
    ${bandHtml(s, { dom: m.dom, slot: st.slot, showActual: m.showAct, pin: r.pin, avg: avgR })}
    <div class="s4-badges">${S_PIN(r, s)}${s.t08 && s.t08.trust && st.slot !== "0730" && !m.showAct ? `<button class="b-grade" data-act="info" data-info="trust">믿을 정도 ${s.t08.trust} ${"●".repeat(GRADE[s.t08.trust][1])}${"○".repeat(3 - GRADE[s.t08.trust][1])} <i>ⓘ</i></button>` : ""}<span class="b-grp" style="background:${bg};color:${fg}">${esc(grpOf(s))} 업종 · ${same}종목</span>${x.isOut ? `<span class="b-out">${x.act ? "범위 밖에서 시작" : "장전 거래가 범위 " + (g.g > s.b80[1] ? "위" : "아래")}</span>` : ""}</div>
    <hr>
    <div class="s4-amt"><span>예상 금액 변화</span><b class="num ${tone(amt)}" data-f="amt">${amt == null ? "관심" : won(amt)}</b><small data-f4="qb">(${num(r.q)}주 기준)</small></div>
    <span data-f="range" hidden></span><span data-f="was" hidden></span>
  </div>
  <div class="s4-btns"><button data-act="newsmine"><b>밤사이 소식</b><em>${x.news}건</em><i>›</i></button><button data-act="stock" data-code="${code}"><b>종목 상세</b><i>›</i></button></div>`;
}

export const sort4Sheet = (cur) => `<div class="grab" data-act="close"><i></i></div><div class="sheet-h"><h3>정렬</h3></div><div class="s4-sort">${Object.entries(SORT4).map(([k, t]) => `<button class="${k === cur ? "on" : ""}" data-act="setsort4" data-v="${k}"><b>${t}</b>${k === "weight" ? "<small>내 계좌에서 차지하는 비율</small>" : ""}${k === cur ? "<i>✓</i>" : ""}</button>`).join("")}</div>`;
export function prog4Sheet(m, d, st) {
  const open = (d.special && d.special.open) || "09:00", sealed = (d.record && d.record.sealed) || {}, noPre = !!(d.special && d.special.premarket === false);
  const now = { "0730": 2, "0811": 3, "0900": m.showAct ? 4 : 3 }[st.slot];
  const steps = [["06:00", "야간장 마감", "밤사이 야간선물·미국 장 마감", ""], ["07:30", "예상 범위", sealed["0730"] ? `${sealed["0730"].issued} 발행` : "오늘은 없음", "0730"],
    ["08:11", noPre ? "장전 거래 없음" : "믿을 정도 반영", sealed["0811"] ? `${sealed["0811"].issued} 발행` : "", "0811"], [open, "개장 · 채점", m.showAct ? "시가 반영 완료" : "개장 직후", "0900"]];
  return `<div class="grab" data-act="close"><i></i></div><div class="sheet-h"><h3>오늘 아침 진행</h3><button class="x" data-act="close" aria-label="닫기">${I.x}</button></div><div class="sheet-b"><div class="s4-steps">${steps.map(([t, n, sub, sl], i) => `<button class="${i + 1 < now ? "done" : i + 1 === now ? "now" : ""}"${sl && !(sl === "0730" && !sealed["0730"] && Object.keys(sealed).length) ? ` data-act="slot" data-slot="${sl}"` : " disabled"}><i></i><b>${t}</b><span>${n}<small>${sub}</small></span></button>`).join("")}</div></div>`;
}
export const map4Sheet = (m, d) => `<div class="grab" data-act="close"><i></i></div><div class="sheet-h"><h3>종목별 보기</h3><button class="x" data-act="close" aria-label="닫기">${I.x}</button></div><div class="sheet-b" style="padding-top:0">${mapSection(m, d, "업종별 내 종목")}</div>`;


/* ───── 뉴스 브리핑 v2(11/19, 수연 피그마 시장 522:6706 · 산업별 493:9838 · 내 종목 532:6226) ─────
   AI 요약은 밤사이 프롬프트 결과(brief) 그대로, 기사는 brief 기사(한국어 한 줄) + 관계표로 이은 기사(영문 제목). */
const WI = "img/news/";
/** AI 종목 한 줄 중 실제 소식이 있는 것만, 같은 문장은 한 번(빈 기본 문장 '…기사는 없었어요' 제외) */
const aiLines = (d, codes, n = 3) => { const bs = (d.brief || {}).stocks || {}, seen = new Set();
  return codes.map((c) => bs[c]).filter((v) => v && (v.news || []).length && v.combined && v.combined.line_ko && !/기사는 없었어요/.test(v.combined.line_ko))
    .map((v) => v.combined.line_ko).filter((l) => !seen.has(l) && seen.add(l)).slice(0, n); };
const kHM = (iso) => { if (!iso) return ""; const t = new Date(iso); return isNaN(t) ? String(iso).slice(-5) : new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(t); };
const sents = (t) => String(t || "").split(/(?<=요\.|다\.)\s*/).map((x) => x.trim()).filter(Boolean);
const TONE = { "긍정": "pos", "부정": "neg", "중립": "neu", "혼합": "neu" };
export const newsBar = (f) => `<div class="nb-r"><h1>뉴스 브리핑</h1><button class="hb-i" data-act="acctsheet" aria-label="마이 · 계좌 바꾸기"><img src="img/night/my.svg" width="23" height="23" alt=""></button></div>
  <p class="wb-sub">국내 종목에 영향을 줄 미국 뉴스만 모았어요 · 06:00 마감 기준</p>
  <div class="nb-tabs wb-tabs">${[["market", "시장"], ["ind", "산업별"], ["brief", "내 종목"]].map(([v, t]) => `<button class="${f === v ? "on" : ""}" data-act="nf" data-v="${v}">${t}</button>`).join("")}</div>`;
const aiCard = (meta, lines, foot) => `<div class="nw-ai"><div class="nw-ai-h"><span class="nw-chip">AI 전체 요약</span><i></i><small>${esc(meta)}</small></div>
  ${lines.map((l) => `<div class="nw-li"><img src="${WI}bullet.svg" width="5" height="14" alt=""><p>${esc(l)}</p></div>`).join("")}<small class="nw-foot">${esc(foot)}</small></div>`;
const secH = (t, right, dot = true) => `<div class="nw-sec"><b><i></i>${esc(t)}</b><span>${dot ? `<img src="${WI}dot-red.svg" width="6" height="6" alt="">` : ""}${esc(right)}</span></div>`;
const toneChip = (t) => (t ? `<span class="nw-tone ${TONE[t] || "neu"}">${esc(t)}</span>` : "");
const link = (u) => (u ? `<a class="nw-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer">원문 보기 <b>↗</b></a>` : "");

/** 내 종목 기사: brief(한국어 한 줄·논조·출처) + 관계표로 이은 기사(영문 제목) */
function newsOf(d, code) {
  const out = ((((d.brief || {}).stocks || {})[code] || {}).news || []).map((n) => ({ id: "b" + n.id, t: n.short_summary_ko || n.title, tone: n.tone, src: n.source, at: kHM(n.published_at), url: n.url, ts: n.published_at || "", tier: n.tier }));
  d.news.filter((n) => n.stocks.some((s) => s.code === code)).forEach((n) => out.push({ id: "n" + n.id, t: n.headline, tone: null, src: "관계표로 이은 기사", at: String(n.time || "").slice(-5), url: null, ts: n.ts || "", linked: true }));
  return out.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
}
const card = (x, tags) => `<div class="nw-card"><b class="nw-t">${esc(x.t)}</b>${tags ? `<div class="nw-tags">${tags}</div>` : ""}<div class="nw-meta"><span>${esc(x.src || "")}${x.at ? ` · ${esc(x.at)}` : ""}</span>${link(x.url)}</div></div>`;

function newsMarket(m, d) {
  const b = d.brief, mk = b && b.market, items = (mk && mk.items) || [];
  let h = mk && mk.line_ko ? aiCard(`06:00 마감 기준 · 뉴스 ${items.length}건`, sents(mk.line_ko), "AI가 요약했어요. 원문과 다를 수 있어요.")
    : `<div class="nw-ai"><div class="nw-ai-h"><span class="nw-chip">AI 전체 요약</span></div><p class="nw-empty">이 날은 밤사이 AI 요약이 없어요. 아래 기사는 관계표로 내 종목과 이은 미국 기사예요.</p></div>`;
  if (items.length) {
    h += secH("최신 뉴스", `${kHM(b.generated_at)} 갱신`);
    h += items.map((it) => card({ t: it.short_summary_ko || it.title, src: it.source + (it.media_count > 1 ? ` · 매체 ${it.media_count}곳` : ""), url: it.url }, (it.topics || []).map((t, i) => `<span class="${i ? "" : "hl"}">${esc(t)}</span>`).join(""))).join("");
  } else if (d.news.length) {
    h += secH("관계표로 이은 기사", `${d.news.length}건`, false);
    h += d.news.slice(0, 12).map((n) => card({ t: n.headline, src: n.us, at: String(n.time).slice(-5) }, n.stocks.slice(0, 3).map((s) => `<span>${esc(s.name)}</span>`).join(""))).join("");
  }
  return h;
}

function newsInd(m, d, st) {
  const by = {};
  m.rows.forEach((r) => { const g = r.s.group || "기타"; (by[g] = by[g] || { codes: [], items: {} }).codes.push(r.s.code); newsOf(d, r.s.code).forEach((x) => (by[g].items[x.id] = { ...x, names: [...((by[g].items[x.id] || {}).names || []), r.s.name] })); });
  const gs = Object.entries(by).sort((a, b) => Object.keys(b[1].items).length - Object.keys(a[1].items).length);
  const sel = (st.ind || []).filter((g) => by[g]), all = !sel.length, pick = all ? gs.map((x) => x[0]) : sel;
  let h = `<div class="nw-pick"><div class="nw-pick-in"><button class="${all ? "all on" : "all"}" data-act="indsel" data-v="">내 업종 전체</button>${gs.map(([g]) => `<button class="${sel.includes(g) ? "on" : ""}" data-act="indsel" data-v="${esc(g)}"><img src="${WI}bullet.svg" width="5" height="14" alt="" class="dot">${esc(g)}${sel.includes(g) ? " <em>✓</em>" : ""}</button>`).join("")}</div></div>
    <p class="nw-cap">● 내 종목이 있는 업종 · 오늘 뉴스 많은 순</p>`;
  const codes = pick.flatMap((g) => by[g].codes), bs = (d.brief || {}).stocks || {};
  const lines = aiLines(d, codes);
  const items = Object.values(Object.assign({}, ...pick.map((g) => by[g].items))).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  const label = all ? "내 업종 전체" : pick.join(" · ");
  if (lines.length) h += aiCard(`${label} · 뉴스 ${items.length}건`, lines, "AI가 요약했어요. 원문과 다를 수 있어요.");
  h += secH(`${all ? "내 업종" : pick.join("·")} 관련 뉴스`, `최신순 · ${items.length}건`);
  h += items.length ? items.slice(0, 20).map((x) => card(x, [toneChip(x.tone), ...(x.names || []).slice(0, 3).map((n) => `<span>${esc(n)}</span>`)].join(""))).join("") : `<div class="nw-none">밤사이 이 업종과 이어진 소식이 없어요</div>`;
  return h;
}

function newsMine(m, d, st) {
  const own = m.rows.filter((r) => r.h.q > 0), wat = m.rows.filter((r) => r.h.q === 0), ex = (m.account.excluded || []).filter((x) => x.q > 0);
  const watch = (st.hold4 || (own.length ? "own" : "watch")) === "watch", base = watch ? wat : own;
  const stocks = [...base.map((r) => ({ code: r.s.code, name: r.s.name })), ...(watch ? [] : ex.map((x) => ({ code: x.code, name: x.name })))];
  const sel = (st.nsel || []).filter((c) => stocks.some((s) => s.code === c)), shown = sel.length ? stocks.filter((s) => sel.includes(s.code)) : stocks;
  const blocks = shown.map((s) => ({ ...s, items: newsOf(d, s.code) })), withN = blocks.filter((b) => b.items.length), noN = blocks.filter((b) => !b.items.length);
  withN.sort((a, b) => (b.items.some((x) => x.tone === "부정") ? 1 : 0) - (a.items.some((x) => x.tone === "부정") ? 1 : 0) || b.items.length - a.items.length);
  const tc = { "긍정": 0, "부정": 0, "중립": 0, "혼합": 0 }; withN.forEach((b) => b.items.forEach((x) => x.tone && (tc[x.tone] = (tc[x.tone] || 0) + 1)));
  const lines = aiLines(d, withN.map((b) => b.code));
  const total = withN.reduce((a, b) => a + b.items.length, 0);
  let h = `<div class="n4-hold nw-hold"><button class="${watch ? "" : "on"}" data-act="hold4" data-v="own">보유 ${own.length + ex.length}</button><button class="${watch ? "on" : ""}" data-act="hold4" data-v="watch"${wat.length ? "" : " disabled"}>관심 ${wat.length}</button></div>
    <div class="nw-pick"><div class="nw-pick-in"><button class="${sel.length ? "all" : "all on"}" data-act="nsel" data-v="">${watch ? "관심" : "보유"} 종목 전체</button>${stocks.map((s) => `<button class="${sel.includes(s.code) ? "on" : ""}" data-act="nsel" data-v="${s.code}">${esc(s.name)}${sel.includes(s.code) ? " <em>✓</em>" : ""}</button>`).join("")}</div></div>`;
  if (lines.length) h += aiCard(`긍정 ${tc["긍정"]} · 부정 ${tc["부정"]} · 중립 ${tc["중립"] + tc["혼합"]}`, lines, `${watch ? "관심" : "보유"} ${stocks.length}종목 · 밤사이 소식 ${total}건 기준 · AI가 요약했어요`);
  h += secH("종목별 뉴스", "부정 소식이 있는 종목 먼저");
  const exp = st.nexp || {};
  h += withN.map((b) => { const lim = exp[b.code] ? b.items.length : 2;
    return `<div class="nw-blk"><div class="nw-blk-h"><b>${esc(b.name)}</b><small>뉴스 ${b.items.length}건</small></div>${b.items.slice(0, lim).map((x) => `<div class="nw-it"><b class="nw-t">${esc(x.t)}</b>${x.tone || x.linked ? `<div class="nw-tags">${x.tone ? toneChip(x.tone) : `<span>관계로 이은 기사</span>`}</div>` : ""}<div class="nw-meta"><span>${esc(x.src || "")}${x.at ? ` · ${esc(x.at)}` : ""}</span>${link(x.url)}</div></div>`).join("")}
      ${b.items.length > 2 ? `<button class="nw-more" data-act="nexp" data-v="${b.code}">${exp[b.code] ? "접기" : `${esc(b.name)} 뉴스 ${b.items.length}건 모두 보기 ›`}</button>` : ""}</div>`; }).join("");
  if (noN.length) h += `<div class="nw-none">밤사이 소식 없음 · ${noN.slice(0, 2).map((b) => esc(b.name)).join(", ")}${noN.length > 2 ? ` 외 ${noN.length - 2}종목` : ""}</div>`;
  h += `<p class="nw-note">긍정·부정·혼합은 AI가 기사 논조를 판단한 거예요. 주가 방향 예측이 아니에요.</p>`;
  return h;
}

/** 수연 버전 '뉴스 브리핑' 탭 */
export function news(m, d, st) {
  const f = ["market", "ind", "brief"].includes(st.filter) ? st.filter : "market";
  return `<div class="nw">${f === "ind" ? newsInd(m, d, st) : f === "brief" ? newsMine(m, d, st) : newsMarket(m, d)}</div>`;
}


/* ───── 내 종목 v2(11/19, 수연 피그마 보유 513:9980 · 관심 513:10329 · 종목 추가 541:8111) ─────
   종목 검색·담기·적용은 원래 코드 그대로(#stock-q · #stock-res · #draft · applydraft), 모양만 피그마. */
const GCOL = ["#008C82", "#6A5BE0", "#A0522D", "#3E5FAE", "#C2477F"];
export const MSORT = { weight: "비중 큰 순", pl: "수익률 큰 순", name: "이름 순" };
export const mineAddMode = (st) => st.msub === "add" || (st.acct === "U" && !st.pfUser);
export const mineBar = (d, add) => add
  ? `<div class="nb-r mb-add"><button class="mb-back" data-act="mlist" aria-label="뒤로">‹</button><h1>종목 추가</h1></div>`
  : `<div class="nb-r"><h1>내 종목</h1><button class="hb-i" data-act="acctsheet" aria-label="마이 · 계좌 바꾸기"><img src="img/night/my.svg" width="23" height="23" alt=""></button></div><p class="wb-sub">${esc(d.label)} · 어제 종가 기준</p>`;

/** 담은 종목 줄(피그마 '추가한 종목'): − 수량 + ✕. 수량 칸은 원래 입력(data-f="q")이라 직접 쳐도 된다 */
export function draftRows(draft) {
  if (!draft.length) return `<div class="ma-empty">아직 담은 종목이 없어요. 위에서 찾아 넣거나, <button class="link" data-act="copyacct" data-id="A">예시 계좌 A를 가져와</button> 고쳐 보세요.</div>`;
  return draft.map((h) => `<div class="drow ma-row" data-code="${h.code}"><div class="dn"><b>${esc(h.name)}</b>${h.q === 0 || !h.in_model ? `<small>${h.q === 0 ? "관심 종목" : ""}${h.q === 0 && !h.in_model ? " · " : ""}${h.in_model ? "" : "노란띠 없음"}</small>` : ""}</div>
    <span class="ma-step"><button data-act="dstep" data-code="${h.code}" data-d="-1" aria-label="${esc(h.name)} 수량 줄이기"${h.q <= 0 ? " disabled" : ""}><img src="img/night/minus.svg" width="12" height="12" alt=""></button><label><input type="number" inputmode="numeric" min="0" max="10000000" step="1" data-f="q" value="${h.q}" aria-label="${esc(h.name)} 수량(0이면 관심 종목)"><span>주</span></label><button data-act="dstep" data-code="${h.code}" data-d="1" aria-label="${esc(h.name)} 수량 늘리기"><img src="img/night/plus.svg" width="12" height="12" alt=""></button></span>
    <button class="ma-rm" data-act="rmdraft" data-code="${h.code}" aria-label="${esc(h.name)} 빼기">✕</button></div>`).join("");
}

function mineAdd(st) {
  return `<div class="ma"><h2>추가할 종목을<br>찾아보세요</h2><p class="ma-sub">보유 종목은 수량을 넣고, 관심 종목은 수량 0으로 추가하면 돼요.${st.acct !== "U" ? " 예시 계좌는 고칠 수 없어서 ‘내 잔고’에 담아요." : ""}</p>
    <div class="ma-search">${I.search}<input id="stock-q" type="search" placeholder="종목명이나 코드로 찾기" autocomplete="off" maxlength="30" aria-label="종목 검색" aria-controls="stock-res"><div id="stock-res" class="search-res" role="listbox" hidden></div></div>
    <p class="ma-cnt">추가한 종목 ${st.draft.length}</p><div id="draft">${draftRows(st.draft)}</div>
    <p class="ma-hint">수량을 넣으면 내 계좌 기준 금액으로, 0으로 두면 관심 종목으로 %만 보여 드려요. 넣은 잔고는 이 브라우저에만 저장돼요.</p>
    <div class="tiny" id="draft-msg" role="status"></div>
    <button class="ma-go" data-act="applydraft"${st.draft.length ? "" : " disabled"}>${st.draft.length}종목 추가하기</button></div>`;
}

export function mine(m, d, st) {
  if (mineAddMode(st)) return mineAdd(st);
  const a = m.account, tm = tintMap(m), held = m.rows.filter((r) => r.h.q > 0), wat = m.rows.filter((r) => r.h.q === 0), ex = (a.excluded || []).filter((x) => x.q > 0);
  const watch = (st.hold4 || (held.length || ex.length ? "own" : "watch")) === "watch", hide = st.hideAmt, H = (v) => (hide ? "••••••원" : won(v, false));
  const val = (r) => r.h.q * r.s.pc, total = held.reduce((x, r) => x + val(r), 0);
  const allAvg = held.length && held.every((r) => r.h.avg > 0), cost = allAvg ? held.reduce((x, r) => x + r.h.avg * r.h.q, 0) : 0, pl = allAvg ? total - cost : null;
  const g = {}; held.forEach((r) => { const k = r.s.group || "기타"; (g[k] = g[k] || { v: 0, names: [] }).v += val(r); g[k].names.push(r.s.name); });
  let gs = Object.entries(g).sort((x, y) => y[1].v - x[1].v);
  if (gs.length > 4) { const rest = gs.slice(3); gs = [...gs.slice(0, 3), ["그 외", { v: rest.reduce((x, [, o]) => x + o.v, 0), names: rest.flatMap(([, o]) => o.names) }]]; }
  const top = gs[0] && total ? gs[0][1].v / total : 0;
  let h = `<div class="mn"><div class="mn-add"><button data-act="madd">+ 종목 추가</button></div>
    <div class="mn-card"><div class="mn-h"><b>업종별 투자 비중</b><button class="mn-eye" data-act="hideamt"><img src="img/home/eye.svg" width="18" height="12" alt=""${hide ? ' style="opacity:.35"' : ""}>${hide ? "금액 보기" : "금액 숨기기"}</button></div>
      <div class="mn-total num">${H(total)}</div>
      ${pl != null ? `<div class="mn-pl">평단 대비 <b class="num ${tone(pl)}">${pl >= 0 ? "▲" : "▼"} ${hide ? "••••••원" : won(Math.abs(pl), false)} (${pct(pl / cost)})</b></div>` : ""}
      <p class="mn-note">입력한 수량 기준 · ${a.sample ? `예시 계좌 ${esc(a.id)}` : "이 브라우저에 저장한 잔고"}${ex.length ? ` · 노란띠 없는 ${ex.length}종목은 금액에서 빠져요` : ""}</p>
      <div class="mn-bars">${gs.map(([k, o], i) => { const p = total ? o.v / total : 0, c = k === "그 외" ? "#93A3A5" : GCOL[i] || "#93A3A5";
        return `<div class="mn-bar"><div class="mn-bar-h"><i style="background:${c}"></i><b>${esc(k)}</b><small>${esc(o.names.join(" · "))}</small><span class="num">${H(o.v)}</span><em class="num">${Math.round(p * 100)}%</em></div><div class="mn-track"><span style="width:${(p * 100).toFixed(1)}%;background:${c}"></span></div></div>`; }).join("")}</div>
      ${top >= 0.5 ? `<div class="mn-warn"><i>ⓘ</i><span>${esc(gs[0][0])} 업종이 ${Math.round(top * 100)}%예요. 같이 움직이는 날에는 계좌 전체가 크게 흔들릴 수 있어요.</span></div>` : ""}
      <div class="n4-hold"><button class="${watch ? "" : "on"}" data-act="hold4" data-v="own">보유 ${held.length + ex.length}</button><button class="${watch ? "on" : ""}" data-act="hold4" data-v="watch"${wat.length ? "" : " disabled"}>관심 ${wat.length}</button></div></div>
    <div class="mn-sort"><button data-act="msort">${MSORT[st.msort || "weight"]} ▾</button>${a.sample ? `<button class="mn-copy" data-act="copyacct" data-id="${esc(a.id)}">내 잔고로 가져와 고치기 ›</button>` : ""}</div>`;
  const k = st.msort || "weight", rr = (r) => (r.h.avg > 0 ? r.s.pc / r.h.avg - 1 : -Infinity);
  const list = [...(watch ? wat : held)].sort((x, y) => (k === "name" ? x.s.name.localeCompare(y.s.name, "ko") : k === "pl" ? rr(y) - rr(x) : val(y) - val(x)));
  h += `<div class="mn-list">${list.map((r) => { const v = val(r), plr = r.h.avg > 0 ? (r.s.pc - r.h.avg) * r.h.q : null;
    return watch
      ? `<button class="mn-row" data-act="stock" data-code="${r.s.code}">${ico4(r.s, tm, 32)}<span class="nm"><b>${esc(r.s.name)}</b><small>관심 종목 · 어제 종가 ${num(r.s.pc)}원</small></span><span class="v"><small>오늘 예상</small><b class="num ${tone(r.s.H)}">${pct(r.s.H)}</b></span></button>`
      : `<button class="mn-row" data-act="stock" data-code="${r.s.code}">${ico4(r.s, tm, 32)}<span class="nm"><b>${esc(r.s.name)}</b><small>${num(r.h.q)}주${r.h.avg > 0 ? ` · 평단 ${num(r.h.avg)}원` : ""}</small></span><span class="v"><b class="num">${H(v)}</b>${plr != null ? `<small class="num ${tone(plr)}">${hide ? "••••" : won(plr)} (${pct(r.s.pc / r.h.avg - 1)})</small>` : ""}<small class="w">비중 ${total ? Math.round((v / total) * 100) : 0}%</small></span></button>`; }).join("")}
    ${watch ? "" : ex.map((x) => `<div class="mn-row nc">${ico4({ name: x.name, group: "" }, tm, 32)}<span class="nm"><b>${esc(x.name)}</b><small>${num(x.q)}주${x.avg ? ` · 평단 ${num(x.avg)}원` : ""}</small></span><span class="v"><span class="chip">노란띠 없음</span></span></div>`).join("")}
    ${list.length || (!watch && ex.length) ? "" : `<div class="empty">${watch ? "관심 종목이 없어요" : "보유 종목이 없어요"}</div>`}</div>
    <p class="n4-foot">평가 금액은 어제 종가 × 입력한 수량이에요. ${a.sample ? "예시 계좌의 평균단가는 시연용 가정이에요. " : ""}투자 권유가 아니에요.</p></div>`;
  return h;
}

