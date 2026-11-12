// 화면 다섯 개와 아래에서 올라오는 창의 HTML. 상태는 app.js가 넘겨 준다(m = 지금 계좌·수량으로 만든 값 묶음).
import { esc, tone, pct, pct2, won, num, man, tick, dlabel, avatar, priceShort, I } from "./fmt.js";
import { bandHtml, domain } from "./band.js";
import { spark, nightChart, recordBars, histChart, relGraph } from "./charts.js";
import { summary, stockNote, nightCaption } from "./llm.js";

const GRADE = { "높음": ["hi", 3], "보통": ["", 2], "낮음": ["lo", 1] };
const meter = (n) => `<span class="meter">${[1, 2, 3].map((i) => `<i class="${i <= n ? "f" : ""}"></i>`).join("")}</span>`;
const gradeChip = (g) => (g ? `<button class="chip btn ${GRADE[g.level][0]}" data-act="info" data-info="grade">믿을 정도 ${g.level} ${meter(GRADE[g.level][1])}</button>` : "");
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

function stockRow(r, m, st) {
  const s = r.s, live = r.pin != null, v = live ? r.pin : s.H, amt = r.value * v;
  const news = m.newsBy[s.code] || 0, g = st.slot !== "0730" ? s.grade : null;
  const nxtOut = g && g.g != null && !(s.b80[0] <= g.g && g.g <= s.b80[1]);
  const chips = [S_PIN(r, s), gradeChip(g)];
  s.cautions.forEach((c) => chips.push(`<button class="chip btn lo" data-act="stock" data-code="${s.code}">${I.warn.replace('width="16" height="16"', 'width="12" height="12"')} ${esc(c.title)}</button>`));
  if (nxtOut) chips.push(`<button class="chip btn lo" data-act="info" data-info="nxtout">장전 거래가 범위 ${g.g > s.b80[1] ? "위" : "아래"}</button>`);
  if (news) chips.push(`<button class="chip btn" data-act="stock" data-code="${s.code}">${I.news} 이어진 소식 ${news}</button>`);
  let flow = "";
  if (m.showAct && s.y != null) {
    flow = `<div class="stock-flow"><span>예상 <b class="${tone(s.H)}">${pct(s.H)}</b></span>${I.sm}${g && g.g != null ? `<span>장전 <b class="${tone(g.g)}">${pct(g.g)}</b></span>${I.sm}` : ""}<span>실제 <b class="${tone(s.y)}">${pct(s.y)}</b></span>
      <span class="chip ${s.inb ? "hi" : "lo"}" style="margin-left:auto">${s.inb ? "범위 안" : s.y > s.b80[1] ? "범위 위" : "범위 아래"}</span></div>`;
  }
  return `<article class="stock" data-row="${s.code}">
    <button class="stock-top" data-act="stock" data-code="${s.code}">${avatar(s.code, s.name)}
      <span class="nm"><b>${esc(s.name)}</b><span data-f="sub">어제 ${priceShort(s.pc)}원 ${I.sm} ${live ? "가정" : "예상"} ${priceShort(tick(s.pc * (1 + v)))}원</span></span>
      <span class="amt"><b class="num ${tone(amt)}" data-f="amt">${won(amt)}</b><span class="num" data-f="pct">${live ? "가정 " : ""}${pct2(v)}</span></span></button>
    ${bandHtml(s, { dom: m.dom, slot: st.slot, showActual: m.showAct, pin: r.pin })}
    <div class="stock-foot">
      <div><span class="stepper${r.changed ? " changed" : ""}" data-stepper="${s.code}"><button data-step="-1" aria-label="수량 줄이기" ${r.q <= 0 ? "disabled" : ""}>${I.minus}</button><span class="q" data-act="qty" data-code="${s.code}"><span data-f="q">${num(r.q)}</span><small>주</small></span><button data-step="1" aria-label="수량 늘리기">${I.plus}</button></span></div>
      <div class="range"><span data-f="was" class="was" ${r.changed ? "" : "hidden"}>잔고 ${num(r.h.q)}주에서 바꿔 보는 중</span>범위 금액 <b data-f="range">${man(r.lo)} ~ ${man(r.hi)}</b></div>
    </div>
    ${chips.filter(Boolean).length ? `<div class="stock-chips">${chips.join("")}</div>` : ""}${flow}
  </article>`;
}

export function heroHtml(m, d, st) {
  const sv = m.stockValue, act = m.showAct && m.actSum != null, hypo = m.pinned;
  const main = act ? m.actSum : hypo ? m.hypoSum : m.Hsum;
  const label = act ? "개장 시가 기준 내 주식 변화" : hypo ? "내가 가정한 시가 기준 내 주식 변화" : "오늘 시가에 예상되는 내 주식 변화";
  const now = { "0730": 1, "0811": 2, "0900": 3 }[st.slot];
  const pillOpen = st.slot === "0900" && d.has_open;
  let h = `<div class="when"><span>${d.label}</span><span class="live${pillOpen ? " open" : ""}"><i></i>${st.slot === "0730" ? "07:30 기준 · 장 전" : st.slot === "0811" ? "08:11 기준 · 장 전" : pillOpen ? "09:00 개장" : "개장 전"}</span></div>
    <div class="label">${label}</div>
    <div class="big num ${tone(main)}">${won(main)}<small>${pct2(sv ? main / sv : null)}</small></div>
    <div class="flow"><div><span>어제 종가 기준</span><b class="num">${won(sv, false)}</b></div>${I.arrow}<div><span>${act ? "개장 시가 기준" : hypo ? "가정한 시가 기준" : "예상 시가 기준"}</span><b class="num">${won(sv + main, false)}</b></div></div>`;
  if (m.changed || m.pinned) h += `<div class="what-if"><span>${m.changed && m.pinned ? "수량과 시가를" : m.changed ? "수량을" : "시가를"} 바꿔서 보는 중이에요</span><button data-act="reset">${I.undo} 되돌리기</button></div>`;
  if (act) {
    const got = m.rows.filter((r) => r.s.y != null), ok = got.filter((r) => r.s.inb).length, dr = got.filter((r) => r.s.dir != null), dok = dr.filter((r) => r.s.dir).length;
    h += `<div class="result"><span class="chip">아침 예상 ${won(m.Hsum)}</span><span class="chip">차이 ${won(m.actSum - m.Hsum)}</span><span class="chip ${ok === got.length ? "hi" : ""}">범위 안 ${ok}/${got.length}종목</span>${dr.length ? `<span class="chip">장전 방향 일치 ${dok}/${dr.length}</span>` : ""}</div>`;
  } else if (st.slot === "0900") {
    h += `<div class="notice info" style="margin-top:12px">${I.info}<div><b>아직 개장 전이에요</b>09:00 시가가 나오면 아침 예상과 나란히 보여 드려요.</div></div>`;
  }
  h += `<div class="steps"><i class="prog" style="width:${(now / 3) * 75}%"></i>${[["06:00", "야간장 마감", ""], ["07:30", "예상 범위", "0730"], ["08:11", "장전 거래", "0811"], ["09:00", "개장", "0900"]]
    .map(([t, n, sl], i) => `<button class="${i < now ? "done" : i === now ? "now" : ""}" ${sl ? `data-act="slot" data-slot="${sl}"` : 'data-act="tab" data-tab="night"'}><b>${t}</b>${n}</button>`).join("")}</div>`;
  if (st.slot !== "0730" && d.graded && sv) {
    const sh = { "높음": 0, "보통": 0, "낮음": 0, "없음": 0 };
    m.rows.forEach((r) => (sh[r.s.grade ? r.s.grade.level : "없음"] += r.value));
    const seg = [["높음", "g-hi", "var(--ok)"], ["보통", "g-mid", "var(--mute)"], ["낮음", "g-lo", "#F0A23C"], ["없음", "g-none", "var(--line)"]].filter(([k]) => sh[k] > 0);
    h += `<div class="trust"><div class="sub" style="display:flex;justify-content:space-between"><span>장전 거래 방향을 믿을 정도 <span class="tiny">· 보유 금액 기준</span></span><button class="tiny" data-act="info" data-info="grade" style="text-decoration:underline">뜻 보기</button></div>
      <div class="bar">${seg.map(([k, c]) => `<i class="${c}" style="width:${(sh[k] / sv) * 100}%"></i>`).join("")}</div>
      <div class="legend">${seg.map(([k, , c]) => `<span style="--c:${c}">${k === "없음" ? "장전 거래 없음" : k} ${Math.round((sh[k] / sv) * 100)}%</span>`).join("")}</div></div>`;
  }
  return h;
}

export function brief(m, d, st) {
  const mine = d.news.filter((n) => n.stocks.some((s) => m.codes.has(s.code)));
  const x = d.market.x, sum = summary(m, d, st.slot);
  let h = `<section class="sec hero" id="hero">${heroHtml(m, d, st)}</section>`;
  if (d.market.cautions.length) h += `<section class="sec" style="padding-top:14px;padding-bottom:14px">${d.market.cautions.map((c) => `<div class="notice">${I.warn}<div><b>${esc(c.title)}</b>${esc(c.body)}</div></div>`).join("")}</section>`;
  h += `<section class="sec"><div class="sec-h"><h2>밤사이 한눈에</h2><button class="more" data-act="tab" data-tab="night">흐름 보기 ${I.chev}</button></div>
    <button class="night-card" data-act="tab" data-tab="night"><div><div class="sub">코스피200 야간선물 · 06:00 마감</div><div class="v num ${tone(x)}">${pct2(x)}</div>
      <div class="tiny">${d.night ? `어제 주간 종가 ${d.night.day_close.toFixed(2)} ${"→"} ${d.night.last.toFixed(2)}` : "어제 주간 종가 대비"}</div></div>${spark(d.night)}</button>
    <ul class="summary" data-llm="1">${sum.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></section>`;
  h += `<section class="sec"><div class="sec-h"><h2>보유 종목 ${m.rows.length}</h2><button class="more" data-act="info" data-info="band">읽는 법 ${I.chev}</button></div>
    <div class="legend-row"><span><i class="lg-band"></i>예상 범위</span><span><i class="lg-dot"></i>예상 시가</span><span><i class="lg-zero"></i>어제 종가</span>${st.slot !== "0730" && !m.showAct ? '<span><i class="lg-nxt"></i>장전 거래</span>' : ""}${m.showAct ? '<span><i class="lg-act"></i>실제 시가</span>' : ""}</div>
    ${m.rows.map((r) => stockRow(r, m, st)).join("")}
    ${m.account.excluded.length ? `<div class="tiny" style="margin-top:8px">이 날 범위를 내지 못한 종목 ${m.account.excluded.length}개는 빼고 보여 드려요.</div>` : ""}
    <div class="tiny" style="margin-top:10px">띠를 누르거나 끌면 그 값에 열렸을 때의 내 금액을 볼 수 있어요. 수량을 바꿔도 실제 주문은 나가지 않아요.</div></section>`;
  h += `<section class="sec"><div class="sec-h"><h2>내 종목과 이어진 소식</h2>${mine.length ? `<button class="more" data-act="tab" data-tab="news">전체 ${mine.length}건 ${I.chev}</button>` : ""}</div>
    ${mine.length ? mine.slice(-3).reverse().map((n) => newsItem(n, m, d.T)).join("") : `<div class="empty">밤사이 내 종목과 이어진 미국 기사가 없어요.</div>`}
    <div class="tiny" style="margin-top:6px">이어졌다는 건 사업 관계가 있다는 뜻이에요. 이 기사가 시가를 움직였다는 뜻은 아니에요.</div></section>`;
  if (d.events.length) h += `<section class="sec"><div class="sec-h"><h2>다가오는 일정</h2><span class="more">7일 안</span></div><div class="rows">${d.events.slice(0, 4).map((e) => `<div class="rowline"><div><b style="text-align:left;display:block">${esc(e.title)}</b><small>${esc(e.note)}</small></div><span class="chip ${e.dday <= 1 ? "accent" : ""}">${e.label} · D-${e.dday}</span></div>`).join("")}</div></section>`;
  return h + foot(d);
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
  if (!n) return `<section class="sec"><div class="empty">이 날은 야간선물 1분 자료가 없어요.</div></section>`;
  const inWin = d.news.filter((x) => x.ts >= n.t0);
  const ch = nightChart(n, d.news);
  const h = `<section class="sec" style="padding-top:12px"><div class="sub">코스피200 야간선물 · 18:00 ~ 06:00</div>
    <div class="hero"><div class="big num ${tone(n.last_ret)}" style="margin-top:2px">${pct2(n.last_ret)}<small class="flat" style="color:var(--sub);font-weight:600">${n.last.toFixed(2)}</small></div></div>
    <div class="tiny">어제 주간 종가 ${n.day_close.toFixed(2)} 대비</div>${ch.html}
    <div class="legend-row" style="margin:10px 0 0"><span><svg width="11" height="12"><path d="M5.5 0l5 6-5 6-5-6z" fill="var(--band)" stroke="var(--band-edge)"/></svg>내 종목과 이어진 기사</span><span><svg width="11" height="12"><path d="M5.5 .7l4.4 5.3-4.4 5.3L1.1 6z" fill="var(--card)" stroke="var(--mute)"/></svg>다른 종목과 이어진 기사</span></div>
    <div class="kpis"><div class="kpi"><span>가장 높았던 때</span><b class="${tone(n.hi_ret)}">${pct(n.hi_ret)}</b><small>${n.hi_at}</small></div><div class="kpi"><span>가장 낮았던 때</span><b class="${tone(n.lo_ret)}">${pct(n.lo_ret)}</b><small>${n.lo_at}</small></div><div class="kpi"><span>거래량</span><b>${num(n.volume)}</b><small>계약</small></div></div>
    <p class="sub" style="margin:14px 0 0;font-size:13.5px;color:var(--ink2)" data-llm="5">${esc(nightCaption(n))}</p></section>
    <section class="sec"><div class="sec-h"><h2>밤사이 이어진 기사 ${inWin.length}</h2><span class="more">시간순</span></div>
    ${inWin.length ? inWin.map((x) => newsItem(x, m, d.T)).join("") : `<div class="empty">야간장 시간(18:00~06:00)에 이어진 기사가 없어요.</div>`}
    <div class="tiny" style="margin-top:6px">기사가 나온 시각과 가격 움직임이 겹쳐도, 그 기사 때문에 움직였다고 볼 수는 없어요.</div></section>${foot(d)}`;
  return { html: h, bind: ch.bind };
}

export function news(m, d, st) {
  const mine = d.news.filter((n) => n.stocks.some((s) => m.codes.has(s.code)));
  const f = st.filter, list = f === "mine" ? mine : f === "all" ? d.news : [];
  const seg = m.rows.map((r) => [r.s, d.segnews[r.s.code]]).filter(([, v]) => v);
  let body = "";
  if (f === "macro") body = d.macro.length ? `<div class="rows">${d.macro.map((x) => `<div class="rowline"><span class="tnum" style="flex:none;font-size:12px">${x.time.split(" ")[1]}</span><b style="text-align:left;flex:1;font-weight:500;font-size:13px;line-height:1.45">${esc(x.headline)}</b></div>`).join("")}</div>` : `<div class="empty">시장 전체 기사가 없어요.</div>`;
  else body = list.length ? [...list].reverse().map((n) => newsItem(n, m, d.T)).join("") : `<div class="empty">${f === "mine" ? "밤사이 내 종목과 이어진 미국 기사가 없어요." : "이 밤에는 이어진 기사가 없어요."}</div>`;
  return `<section class="sec" style="padding-top:12px"><div class="filters">
      <button class="${f === "mine" ? "on" : ""}" data-act="filter" data-f="mine">내 종목<small>${mine.length}</small></button>
      <button class="${f === "all" ? "on" : ""}" data-act="filter" data-f="all">이어진 기사 전체<small>${d.news.length}</small></button>
      <button class="${f === "macro" ? "on" : ""}" data-act="filter" data-f="macro">시장 전체<small>${d.macro.length}</small></button></div>${body}</section>
    ${f === "mine" && seg.length ? `<section class="sec"><div class="sec-h"><h2>업종 낱말이 겹친 기사</h2><span class="more">관련성 확인 전</span></div>
      <div class="rows">${seg.map(([s, v]) => `<div class="rowline"><div style="min-width:0"><b style="text-align:left;display:block">${esc(s.name)} <span class="tiny">· ${esc(v.group)}</span></b><small style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block">${esc(v.items[v.items.length - 1].headline)}</small></div><span class="chip">${v.n}건</span></div>`).join("")}</div>
      <div class="tiny" style="margin-top:8px">업종마다 정해 둔 낱말이 제목에 나온 기사예요. 내 종목과 관련 있는지는 아직 확인하지 않았어요.</div></section>` : ""}
    <div class="foot">${esc(d.news_meta.line)}<br>이어졌다는 건 사업 관계가 있다는 뜻이에요. 기사의 방향은 주가 방향이 아니에요.</div>`;
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
  nodes.sort((a, b) => edges.filter((e) => e.src === b.id).length - edges.filter((e) => e.src === a.id).length);
  const stocks = m.rows.map((r) => r.s), nm = (id) => short((nodes.find((n) => n.id === id) || {}).name) || (d.stocks[id] || {}).name || id;
  const shown = sel ? edges.filter((e) => e.src === sel || e.dst === sel) : edges.filter((e) => hot[e.src + "|" + e.dst]).sort((a, b) => hot[b.src + "|" + b.dst] - hot[a.src + "|" + a.dst]);
  const seen = new Set(), cards = shown.filter((e) => { const k = e.src + e.dst + e.relation; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, sel ? 12 : 4).map((e) => {
    const tn = d.news.filter((n) => (usNode(d, n.us) || {}).id === e.src && n.stocks.some((s) => s.code === e.dst));
    return `<div class="edge-card"><div class="hd"><span class="node us">${esc(nm(e.src))}</span><span class="node rel">${I.sm} ${esc(e.relation)} ${I.sm}</span><span class="node mine">${esc(nm(e.dst))}</span></div>${esc(e.evidence)}
      ${e.trigger ? `<div class="src">함께 볼 만한 소식: ${esc(e.trigger)}</div>` : ""}<div class="src">${e.strength === "확인" ? "확인된 관계" : "추정 관계"} · 근거 ${esc(e.source)}</div>
      ${tn.length ? `<div style="margin-top:8px;display:grid;gap:4px">${tn.slice(-3).map((n) => `<button class="chip btn yel" style="height:auto;padding:5px 8px;white-space:normal;text-align:left;line-height:1.4" data-act="news" data-id="${n.id}">${I.news} ${esc(gist(n) || n.headline)}</button>`).join("")}</div>` : ""}</div>`;
  }).join("");
  const bySeg = {}; stocks.forEach((s) => (bySeg[s.group || "기타"] = bySeg[s.group || "기타"] || []).push(s));
  return `<section class="sec" style="padding-top:12px"><div class="sub">미국 기업·정책과 내 종목이 사업으로 어떻게 이어져 있는지예요. 상자를 누르면 근거가 나와요.</div>
    ${nodes.length ? relGraph(nodes, edges, stocks, hot, hotN, sel) : `<div class="empty">이 계좌 종목은 관계표에 미국 쪽 연결이 아직 없어요.</div>`}
    <div class="legend-row" style="margin:8px 0 0"><span><svg width="22" height="6"><path d="M0 3h22" stroke="var(--band-edge)" stroke-width="2.6"/></svg>오늘 밤 기사가 나온 관계</span><span><svg width="22" height="6"><path d="M0 3h22" stroke="var(--mute)" stroke-width="1.5"/></svg>확인</span><span><svg width="22" height="6"><path d="M0 3h22" stroke="var(--mute)" stroke-width="1.5" stroke-dasharray="4 3"/></svg>추정</span><span><svg width="22" height="6"><path d="M0 3h22" stroke="var(--miss)" stroke-width="1.5"/></svg>규제·정책 노출</span></div></section>
    <section class="sec"><div class="sec-h"><h2>${sel ? esc(nm(sel)) + " 관계" : "오늘 밤 기사가 나온 관계"}</h2>${sel ? `<button class="more" data-act="gsel" data-id="">선택 풀기 ${I.x.replace('width="14" height="14"', 'width="11" height="11"')}</button>` : ""}</div>
    ${cards || `<div class="empty">${sel ? "이 상자에는 이어진 관계가 없어요." : "오늘 밤에는 내 종목 관계에 붙은 기사가 없어요. 상자를 눌러 관계를 살펴보세요."}</div>`}</section>
    <section class="sec"><div class="sec-h"><h2>업종으로 보면</h2></div><div class="rows">${Object.entries(bySeg).map(([g, ss]) => `<div class="rowline"><span>${esc(g)}</span><b style="font-weight:500;font-size:13px">${ss.map((s) => esc(s.name) + (s.seg && s.seg !== g ? ` <span class="tiny">${esc(s.seg)}</span>` : "")).join(" · ")}</b></div>`).join("")}</div>
    <div class="tiny" style="margin-top:8px">업종은 사업보고서의 매출 구성으로 나눈 묶음이에요.</div></section>
    <div class="foot">관계는 사업보고서·공시·보도에서 확인한 사업 관계예요. 관계가 있다고 주가가 같이 움직인다는 뜻은 아니에요.</div>`;
}

export function record(m, d, st) {
  const w = d.track[m.account.id] || {}, f = d.forward, a = f && f.after, v = (x, dg = 1) => (x == null ? "–" : x.toFixed(dg));
  const hi = a && a["dir_높음"];
  return `<section class="sec" style="padding-top:12px"><div class="sec-h"><h2>내 종목, 최근 ${w.days || 0}거래일</h2></div>
    <div class="kpis"><div class="kpi"><span>범위 안에서 열림</span><b>${v(w.cov_mine)}%</b><small>기준 80%</small></div><div class="kpi"><span>예상 시가 오차</span><b>${v(w.err_H, 2)}%p</b><small>야간선물만 쓰면 ${v(w.err_x, 2)}</small></div><div class="kpi"><span>‘높음’ 방향 일치</span><b>${v(w.hi_match)}%</b><small>${w.hi_n || 0}건</small></div></div>
    ${w.daily ? recordBars(w.daily, d.T) : ""}
    <div class="tiny">막대는 날마다 내 종목 가운데 예상 범위 안에서 열린 비율이에요. 진한 막대가 이 날, 회색은 규칙을 고정한 11/2 뒤의 날이에요.${w.n_fwd ? ` ${w.days}일 중 ${w.n_after}일이 규칙을 고정한 뒤에 처음 본 날이에요.` : ""}</div></section>
    ${a ? `<section class="sec"><div class="sec-h"><h2>규칙을 고정한 뒤, 200종목</h2><span class="more">${a.days}거래일${f.prov.length ? " · 오늘은 개장 직후 값" : ""}</span></div>
    <div class="kpis"><div class="kpi"><span>범위 안에서 열림</span><b>${v(a.in80)}%</b><small>기준 80%</small></div><div class="kpi"><span>예상 시가 오차</span><b>${v(a.mae_H, 2)}%p</b><small>야간선물만 쓰면 ${v(a.mae_x, 2)}</small></div><div class="kpi"><span>‘높음’ 방향 일치</span><b>${hi ? v(hi.rate) : "–"}%</b><small>${hi ? num(hi.n) : 0}건</small></div></div>
    <table class="tbl" style="margin-top:14px"><thead><tr><th>날짜</th><th>야간선물</th><th>범위 안</th><th>예상 오차</th><th>선물만 쓰면</th></tr></thead><tbody>
    ${[...f.per_day].reverse().map((p) => `<tr><td>${dlabel(p.T)}${f.prov.includes(p.T) ? ' <span class="tiny">개장 직후</span>' : ""}</td><td class="${tone(p.x)}">${pct(p.x / 100)}</td><td>${p.in80.toFixed(1)}%</td><td>${p.mae_H.toFixed(2)}</td><td>${p.mae_x.toFixed(2)}</td></tr>`).join("")}</tbody></table>
    <div class="tiny" style="margin-top:10px">11/2 15:17에 규칙을 고정했고, 그 뒤에 온 날은 규칙을 만들 때 보지 않은 날이에요. 날짜가 아직 적어서 판정이 아니라 쌓아 가는 기록이에요. 오차 단위는 %p예요.</div></section>` : ""}
    <section class="sec"><div class="sec-h"><h2>이 기록을 읽는 법</h2></div><div class="rows">
      <div class="rowline"><span>범위 안에서 열림</span><b style="font-weight:500;font-size:13px;max-width:210px">실제 시가가 노란띠 안에 든 비율. 10번 중 8번이 기준이에요.</b></div>
      <div class="rowline"><span>예상 시가 오차</span><b style="font-weight:500;font-size:13px;max-width:210px">예상 시가와 실제 시가의 차이 평균. 작을수록 가까웠어요.</b></div>
      <div class="rowline"><span>‘높음’ 방향 일치</span><b style="font-weight:500;font-size:13px;max-width:210px">믿을 정도 ‘높음’ 종목에서 장전 거래 방향과 시가 방향이 같았던 비율이에요.</b></div></div>
      <a class="chip btn accent" style="margin-top:12px;height:34px;padding:0 12px;text-decoration:none" href="http://127.0.0.1:8510/track" target="_blank" rel="noopener">검증 기록 전체 보기 ${I.chev}</a></section>${foot(d)}`;
}

/* ───── 아래에서 올라오는 창 ───── */
export function stockSheet(r, m, d, st) {
  const s = r.s, g = st.slot !== "0730" ? s.grade : null, P = (v) => num(tick(s.pc * (1 + v)));
  const myNews = d.news.filter((n) => n.stocks.some((x) => x.code === s.code));
  const pl = (s.pc - r.h.avg) * r.h.q, plr = s.pc / r.h.avg - 1, wt = m.baseValue ? (r.h.q * s.pc) / m.baseValue : 0;
  const line = (dot, name, v, bold) => `<tr><td><i style="background:${dot}"></i>${name}</td><td class="${tone(v)}">${pct2(v)}</td><td>${P(v)}원</td><td class="${tone(v)}" ${bold ? 'style="font-weight:750"' : ""}>${won(r.value * v)}</td></tr>`;
  const edges = d.graph.edges.filter((e) => e.dst === s.code), seenE = new Set();
  const hist = d.hist[s.code] || [], hin = hist.filter((x) => x.inb).length;
  return `<div class="grab" data-act="close"><i></i></div><div class="sheet-h">${avatar(s.code, s.name)}<h3>${esc(s.name)}<small>${s.code}${s.seg ? " · " + esc(s.seg) : ""}</small></h3><button class="x" data-act="close" aria-label="닫기">${I.x}</button></div>
  <div class="sheet-b"><p class="sub" style="font-size:13.5px;color:var(--ink2);margin:0 0 4px" data-llm="4">${esc(stockNote(r, st.slot, myNews.length))}</p>
    ${bandHtml(s, { dom: domain([s.b90[0], s.b90[1], s.H, g ? g.g : null, m.showAct ? s.y : null].filter((v) => v != null)), slot: st.slot, showActual: m.showAct, pin: null, wide: true }).replace('data-band="', 'data-band-static="')}
    <table class="tbl"><thead><tr><th>${num(r.q)}주 기준</th><th>어제 종가 대비</th><th>가격</th><th>내 금액</th></tr></thead><tbody>
      ${line("var(--band)", "범위 위쪽 끝", s.b80[1])}${line("var(--ink)", "예상 시가", s.H, true)}${line("var(--band)", "범위 아래쪽 끝", s.b80[0])}
      ${g && g.g != null ? line("var(--ink2)", "08:10 장전 거래", g.g) : ""}${m.showAct && s.y != null ? line(s.inb ? "var(--ok)" : "var(--miss)", "09:00 실제 시가", s.y, true) : ""}</tbody></table>
    <div class="tiny" style="margin-top:8px">옅은 띠는 10번 중 9번이 들어온 더 넓은 범위(${pct(s.b90[0])} ~ ${pct(s.b90[1])})예요.</div>
    ${s.cautions.map((c) => `<div class="notice" style="margin-top:12px">${I.warn}<div><b>${esc(c.title)}</b>${esc(c.body)}</div></div>`).join("")}
    ${g ? `<h4>장전 거래 방향을 믿을 정도</h4><div class="rows"><div class="rowline"><span>등급</span><b>${gradeChip(g)}</b></div><div class="rowline"><span>지난 비슷한 경우 방향이 같았던 비율</span><b>${g.p >= 0.995 ? "99% 이상" : Math.round(g.p * 100) + "%"}</b></div></div>
      <div class="tiny" style="margin-top:6px">08:10 장전 거래(넥스트레이드)의 방향이 09:00 시가까지 이어질지를 본 값이에요. 예상 시가 숫자가 얼마나 정확한지와는 다른 얘기예요.</div>` : ""}
    <h4>내 잔고</h4><div class="rows">
      <div class="rowline"><span>보유 수량</span><b>${num(r.h.q)}주${r.changed ? ` <small style="color:var(--accent)">지금은 ${num(r.q)}주로 바꿔 보는 중</small>` : ""}</b></div>
      <div class="rowline"><span>평균 단가</span><b>${num(r.h.avg)}원</b></div>
      <div class="rowline"><span>평가금액 <span class="tiny">어제 종가</span></span><b>${won(r.h.q * s.pc, false)}<small>계좌 주식의 ${Math.round(wt * 100)}%</small></b></div>
      <div class="rowline"><span>평가손익</span><b class="${tone(pl)}">${won(pl)}<small class="${tone(pl)}">${pct2(plr)}</small></b></div></div>
    <h4>밤사이 이어진 소식 ${myNews.length}</h4>${myNews.length ? [...myNews].reverse().slice(0, 4).map((n) => newsItem(n, m, d.T)).join("") : `<div class="sub">밤사이 이 종목과 이어진 미국 기사가 없어요.</div>`}
    ${edges.length ? `<h4>미국 쪽과 이어진 관계</h4><div style="display:flex;gap:6px;flex-wrap:wrap">${edges.filter((e) => { const k = e.src + e.relation; if (seenE.has(k)) return false; seenE.add(k); return true; }).map((e) => `<button class="chip btn" data-act="gjump" data-id="${e.src}"><b>${esc(short((d.graph.nodes.find((n) => n.id === e.src) || {}).name))}</b> ${esc(e.relation)}</button>`).join("")}</div>` : ""}
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

export function acctSheet(d, cur) {
  return `<div class="grab" data-act="close"><i></i></div><div class="sheet-h"><h3>계좌 선택</h3><button class="x" data-act="close" aria-label="닫기">${I.x}</button></div><div class="sheet-b">
    ${d.accounts.map((a) => { const v = a.holdings.reduce((x, h) => x + h.q * ((d.stocks[h.code] || {}).pc || 0), 0); return `<button class="acct-opt" data-act="acct" data-id="${a.id}"><span class="avatar" style="background:var(--navy);border-radius:12px">${a.id}</span><span><b>${esc(a.name)}</b><span>위탁종합 ${a.no} · 주식 ${man(v, false)} · ${a.holdings.length}종목</span></span>${a.id === cur ? `<span class="ck">${I.check}</span>` : ""}</button>`; }).join("")}</div>`;
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
  grade: ["믿을 정도란", `<p class="sub" style="font-size:13.5px;color:var(--ink2);margin:0">08:10 장전 거래가 가리키는 방향(어제 종가보다 위/아래)이 09:00 시가까지 이어질지를 세 단계로 나눈 값이에요.</p>
    <div class="rows" style="margin-top:8px"><div class="rowline"><span class="chip hi">높음 ${meter(3)}</span><b style="font-weight:500;font-size:13px">지난 비슷한 경우 10번 중 9번 이상 같은 방향</b></div><div class="rowline"><span class="chip">보통 ${meter(2)}</span><b style="font-weight:500;font-size:13px">10번 중 7~9번</b></div><div class="rowline"><span class="chip lo">낮음 ${meter(1)}</span><b style="font-weight:500;font-size:13px">그보다 낮음. 방향이 자주 바뀌었어요</b></div></div>
    <div class="tiny" style="margin-top:12px">장전 거래가 어제 종가에서 멀리 움직였을수록 방향이 이어지는 일이 많았어요. 노란띠의 폭이나 예상 시가의 정확도와는 따로 보는 값이에요.</div>`],
  nxtout: ["장전 거래가 범위 밖이에요", `<p class="sub" style="font-size:13.5px;color:var(--ink2);margin:0">08:10 장전 거래가 이미 아침 예상 범위 밖에 있어요. 지난 1년 이런 종목은 범위 안에서 열린 경우가 10번 중 3번 남짓이었고, 시가도 장전 거래 쪽으로 벗어난 경우가 10번 중 6~7번이었어요.</p><div class="tiny" style="margin-top:12px">아직 확인 중인 표시예요.</div>`],
};
export const infoSheet = (k) => `<div class="grab" data-act="close"><i></i></div><div class="sheet-h"><h3>${INFO[k][0]}</h3><button class="x" data-act="close" aria-label="닫기">${I.x}</button></div><div class="sheet-b">${INFO[k][1]}</div>`;
