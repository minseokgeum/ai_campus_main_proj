// 상태·그리기·누르기. 금액 계산은 '수량 × 어제 종가 × 등락률' 하나뿐이고, 나머지 숫자는 서버가 준 그대로 보여 준다.
import { esc, tone, pct2, won, num, man, tick, priceShort, I } from "./fmt.js";
import { bindBands, domain } from "./band.js";
import * as V from "./screens.js";
import { SLOTS, FIXED } from "./llm.js";

const $ = (s, r = document) => r.querySelector(s);
const S = { meta: null, day: null, T: null, slot: "0811", acct: "A", tab: "brief", filter: "mine", sel: null, qty: {}, pin: {}, live: null };
const TABS = [["brief", "브리핑", "아침 브리핑"], ["night", "밤사이", "밤사이 흐름"], ["news", "소식", "이어진 소식"], ["graph", "관계", "관계 그림"], ["record", "기록", "지난 기록"]];
const key = (code) => `${S.T}|${S.acct}|${code}`;
let DOM = [-0.02, 0.02];

function model() {
  const d = S.day, account = d.accounts.find((a) => a.id === S.acct) || d.accounts[0];
  const showAct = S.slot === "0900" && d.has_open;
  const rows = account.holdings.filter((h) => d.stocks[h.code]).map((h) => {
    const s = d.stocks[h.code], q = S.qty[key(h.code)] ?? h.q, value = q * s.pc;
    let pin = S.pin[key(h.code)]; if (S.live && S.live.code === h.code) pin = S.live.v;
    return { s, h, q, value, pin, changed: q !== h.q, Hamt: value * s.H, lo: value * s.b80[0], hi: value * s.b80[1], yAmt: showAct && s.y != null ? value * s.y : null };
  }).sort((a, b) => b.h.q * b.s.pc - a.h.q * a.s.pc);
  const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
  const vals = rows.flatMap((r) => [r.s.b80[0], r.s.b80[1], r.s.H, S.slot !== "0730" && r.s.grade && !showAct ? r.s.grade.g : null, showAct ? r.s.y : null, S.pin[key(r.s.code)]]).filter((v) => v != null);
  const codes = new Set(rows.map((r) => r.s.code)), newsBy = {};
  d.news.forEach((n) => n.stocks.forEach((s) => { if (codes.has(s.code)) newsBy[s.code] = (newsBy[s.code] || 0) + 1; }));
  return { account, rows, codes, newsBy, showAct, stockValue: sum((r) => r.value), baseValue: sum((r) => r.h.q * r.s.pc), Hsum: sum((r) => r.Hamt),
    hypoSum: sum((r) => (r.pin != null ? r.value * r.pin : r.Hamt)), actSum: showAct && rows.every((r) => r.yAmt != null) ? sum((r) => r.yAmt) : showAct ? sum((r) => r.yAmt || 0) : null,
    changed: rows.some((r) => r.changed), pinned: rows.some((r) => r.pin != null), dom: domain(vals) };
}

/* ───── 그리기 ───── */
function renderShell() {
  const d = S.day, m = model(), a = m.account, t = TABS.find((x) => x[0] === S.tab);
  $("#clock").textContent = S.slot.slice(0, 2) + ":" + S.slot.slice(2);
  $("#appbar").innerHTML = `<h1>${t[2]}</h1><button class="acct" data-act="acctsheet">${esc(a.name)} ${I.down}</button>`;
  const mine = d.news.filter((n) => n.stocks.some((s) => m.codes.has(s.code))).length;
  $("#tabbar").innerHTML = TABS.map(([id, nm]) => `<button class="${S.tab === id ? "on" : ""}" data-act="tab" data-tab="${id}">${I.tabs[id]}${nm}${id === "news" && mine ? `<span class="dot">${mine}</span>` : ""}</button>`).join("");
  document.querySelectorAll("#ctl-slot button").forEach((b) => b.classList.toggle("on", b.dataset.slot === S.slot));
  $("#ctl-day").value = S.T; $("#ctl-acct").value = S.acct;
  const r = d.record, s8 = r.sealed["0811"], s7 = r.sealed["0730"];
  $("#record").innerHTML = r.kind === "live"
    ? ((s7 || s8 || {}).before_open ? `<span class="tag sealed">장 전 고정 기록</span><b>개장 전에 고정해 둔 예상</b>07:30 카드 ${s7 ? s7.issued : "–"} · 08:11 카드 ${s8 ? s8.issued : "–"} 발행${r.open_at ? ` · 시가 ${r.open_at} 수신` : ""}`
      : `<span class="tag late">개장 뒤 발행</span><b>장 전에 고정한 기록이 아니에요</b>카드가 ${s7 ? s7.issued : "–"}·${s8 ? s8.issued : "–"}에 발행됐어요. 입력은 장 전 자료만 썼어요.${r.open_at ? ` 시가는 ${r.open_at}에 받았어요.` : ""}`)
    : r.kind === "forward" && (s7 || s8) ? `<span class="tag late">개장 뒤 발행</span><b>장 전에 고정한 기록이 아니에요</b>카드가 ${s7 ? s7.issued : "–"}·${s8 ? s8.issued : "–"}에 발행됐어요.${r.same_as_sealed ? " 장 마감 뒤 같은 규칙으로 다시 계산해도 숫자가 같았어요." : ""}`
    : r.kind === "forward" ? `<span class="tag post">${r.after_freeze ? "규칙 고정 뒤 · 사후 계산" : "규칙 고정 전 · 사후 계산"}</span><b>고정한 규칙으로 다시 계산한 날</b>그날 이전 자료만 썼지만, 그 아침에 실제로 발행한 화면은 아니에요.`
      : `<span class="tag post">과거 재생</span><b>규칙을 만들 때 이미 본 기간</b>그날 이전 자료만 써서 다시 계산한 화면이에요.`;
  $("#llm-list").innerHTML = SLOTS.map((s) => `<div class="llm-item${s.tab === S.tab ? " here" : ""}"><h5><i>${s.id}</i>${s.name}</h5><dl><dt>자리</dt><dd>${s.where}</dd><dt>입력</dt><dd>${s.input}</dd><dt>출력</dt><dd>${s.output}</dd><dt>금지</dt><dd>${s.ban}</dd></dl><div class="now">지금: ${s.now}</div></div>`).join("") + `<div class="llm-item"><div class="now" style="margin:0">${FIXED}</div></div>`;
}

function renderScreen(keep = false) {
  const scr = $("#screen"), top = scr.scrollTop, m = model(), d = S.day;
  DOM = m.dom;                                // 끄는 동안에는 눈금을 바꾸지 않는다(손가락 밑에서 띠가 움직이지 않게)
  let out = V[S.tab](m, d, S);
  scr.innerHTML = typeof out === "string" ? out : out.html;
  if (typeof out !== "string" && out.bind) out.bind(scr, (id) => openNews(id));
  scr.scrollTop = keep ? top : 0;
  if (!keep) scr.firstElementChild && scr.firstElementChild.classList.add("fade-in");
  if (S.tab === "brief") bindBands(scr, () => DOM, onBand);
  $("#appbar").classList.toggle("scrolled", scr.scrollTop > 4);
}
const render = (keep) => { renderShell(); renderScreen(keep); saveHash(); };

function patchRow(code) {                      // 수량·가정 시가가 바뀔 때 그 줄과 맨 위 숫자만 고친다(누르고 있는 단추가 사라지지 않게)
  const m = model(), r = m.rows.find((x) => x.s.code === code), el = $(`[data-row="${code}"]`);
  if (r && el) {
    const v = r.pin != null ? r.pin : r.s.H, amt = r.value * v, f = (k) => $(`[data-f="${k}"]`, el);
    f("amt").textContent = won(amt); f("amt").className = "num " + tone(amt);
    f("pct").textContent = (r.pin != null ? "가정 " : "") + pct2(v);
    f("sub").innerHTML = `어제 ${priceShort(r.s.pc)}원 ${I.sm} ${r.pin != null ? "가정" : "예상"} ${priceShort(tick(r.s.pc * (1 + v)))}원`;
    f("q").textContent = num(r.q); f("range").textContent = `${man(r.lo)} ~ ${man(r.hi)}`;
    f("was").hidden = !r.changed; if (r.changed) f("was").textContent = `잔고 ${num(r.h.q)}주에서 바꿔 보는 중`;
    $("[data-stepper]", el).classList.toggle("changed", r.changed); $('[data-step="-1"]', el).disabled = r.q <= 0;
  }
  const hero = $("#hero"); if (hero) hero.innerHTML = V.heroHtml(m, S.day, S);
}

function onBand(code, v, commit) {
  if (commit) { S.live = null; S.pin[key(code)] = v; renderScreen(true); return; }
  S.live = v == null ? null : { code, v }; patchRow(code);
}

/* ───── 아래 창 ───── */
function openSheet(html) { const s = $("#sheet"); s.innerHTML = html; s.hidden = false; $("#backdrop").hidden = false; s.scrollTop = 0; }
function closeSheet() { $("#sheet").hidden = true; $("#backdrop").hidden = true; }
const openNews = (id) => { const n = S.day.news.find((x) => x.id === id); if (n) openSheet(V.newsSheet(n, model(), S.day)); };
function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 1800); }

/* ───── 수량 − + ───── */
function setQty(code, q) { q = Math.max(0, Math.min(99999, Math.round(q))); const h = model().account.holdings.find((x) => x.code === code); if (q === h.q) delete S.qty[key(code)]; else S.qty[key(code)] = q; patchRow(code); }
let hold = null;
function stepStart(btn) {
  const code = btn.closest("[data-stepper]").dataset.stepper, dir = +btn.dataset.step; let n = 0;
  const cur = () => S.qty[key(code)] ?? model().account.holdings.find((x) => x.code === code).q;
  const go = () => { n++; setQty(code, cur() + dir * (n > 40 ? 10 : n > 15 ? 5 : 1)); };
  go(); hold = { t: setTimeout(() => { hold.i = setInterval(go, 70); }, 380) };
}
function stepStop() { if (hold) { clearTimeout(hold.t); clearInterval(hold.i); hold = null; } }
function editQty(el) {
  const code = el.dataset.code, cur = S.qty[key(code)] ?? model().account.holdings.find((x) => x.code === code).q;
  el.innerHTML = `<input type="number" inputmode="numeric" min="0" value="${cur}" aria-label="수량">`;
  const inp = $("input", el); inp.focus(); inp.select();
  const done = () => { const v = parseInt(inp.value, 10); el.innerHTML = `<span data-f="q"></span><small>주</small>`; setQty(code, Number.isFinite(v) ? v : cur); };
  inp.addEventListener("blur", done, { once: true }); inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
}

/* ───── 누르기 ───── */
async function act(el) {
  const a = el.dataset.act;
  if (a === "tab") { S.tab = el.dataset.tab; closeSheet(); render(); }
  else if (a === "slot") { S.slot = el.dataset.slot; render(true); }
  else if (a === "filter") { S.filter = el.dataset.f; renderScreen(true); saveHash(); }
  else if (a === "stock") { const m = model(), r = m.rows.find((x) => x.s.code === el.dataset.code); if (r) openSheet(V.stockSheet(r, m, S.day, S)); }
  else if (a === "news") openNews(el.dataset.id);
  else if (a === "info") openSheet(V.infoSheet(el.dataset.info));
  else if (a === "acctsheet") openSheet(V.acctSheet(S.day, S.acct));
  else if (a === "acct") { S.acct = el.dataset.id; S.sel = null; closeSheet(); render(); }
  else if (a === "close") closeSheet();
  else if (a === "unpin") { delete S.pin[key(el.dataset.code)]; renderScreen(true); }
  else if (a === "reset") { const m = model(); m.rows.forEach((r) => { delete S.qty[key(r.s.code)]; delete S.pin[key(r.s.code)]; }); renderScreen(true); toast("잔고 수량과 예상 시가로 되돌렸어요"); }
  else if (a === "gsel") { S.sel = el.dataset.id || null; renderScreen(true); }
  else if (a === "gjump") { S.sel = el.dataset.id; S.tab = "graph"; closeSheet(); render(); }
  else if (a === "qty") { if (!$("input", el)) editQty(el); }
}
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-node]"); if (g) { S.sel = S.sel === g.dataset.node ? null : g.dataset.node; renderScreen(true); return; }
  const el = e.target.closest("[data-act]"); if (el) { e.preventDefault(); act(el); }
});
document.addEventListener("pointerdown", (e) => { const b = e.target.closest("[data-step]"); if (b && !b.disabled) { e.preventDefault(); stepStart(b); } });
["pointerup", "pointercancel", "pointerleave"].forEach((t) => document.addEventListener(t, stepStop, true));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
$("#backdrop").addEventListener("click", closeSheet);
$("#screen").addEventListener("scroll", () => $("#appbar").classList.toggle("scrolled", $("#screen").scrollTop > 4), { passive: true });

/* ───── 조작판 ───── */
$("#ctl-day").addEventListener("change", (e) => load(e.target.value));
$("#ctl-acct").addEventListener("change", (e) => { S.acct = e.target.value; S.sel = null; render(); });
$("#ctl-slot").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.slot = b.dataset.slot; render(true); } });
$("#ctl-llm").addEventListener("change", (e) => document.body.classList.toggle("llm-on", e.target.checked));
$("#ctl-dark").addEventListener("change", (e) => { if (e.target.checked) $("#device").dataset.theme = "dark"; else delete $("#device").dataset.theme; });

/* ───── 주소(#)에 지금 보고 있는 것 남기기 ───── */
function saveHash() { history.replaceState(null, "", `#T=${S.T}&slot=${S.slot}&acct=${S.acct}&tab=${S.tab}`); }
function readHash() { const p = new URLSearchParams(location.hash.slice(1)); ["T", "slot", "acct", "tab"].forEach((k) => { if (p.get(k)) S[k] = p.get(k); }); if (p.get("llm")) { $("#ctl-llm").checked = true; document.body.classList.add("llm-on"); } if (p.get("dark")) { $("#ctl-dark").checked = true; $("#device").dataset.theme = "dark"; } }

window.addEventListener("hashchange", async () => {      // 주소를 바꾸면 그 화면으로(뒤로 가기·바로 가기 주소)
  const T0 = S.T; readHash();
  if (!S.meta.days.some((d) => d.T === S.T)) S.T = T0;
  if (!TABS.some((t) => t[0] === S.tab)) S.tab = "brief";
  closeSheet();
  if (S.T !== T0) await load(S.T); else render();
});

async function load(T) {
  const scr = $("#screen");
  scr.innerHTML = `<section class="sec"><div class="skel" style="height:20px;width:40%"></div><div class="skel" style="height:44px;width:70%;margin-top:14px"></div><div class="skel" style="height:56px;margin-top:14px"></div></section><section class="sec"><div class="skel" style="height:120px"></div></section><section class="sec"><div class="skel" style="height:220px"></div></section>`;
  try {
    const r = await fetch(`api/day/${T}`); const d = await r.json();
    if (!r.ok) throw new Error(d.error || r.status);
    S.day = d; S.T = T; S.live = null; S.sel = null;
    if (!d.accounts.some((a) => a.id === S.acct)) S.acct = d.accounts[0].id;
    $("#ctl-acct").innerHTML = d.accounts.map((a) => `<option value="${a.id}">${a.id} · ${esc(a.name)}</option>`).join("");
    render();
  } catch (err) { scr.innerHTML = `<section class="sec"><div class="empty">이 날 자료를 불러오지 못했어요.<br><span class="tiny">${esc(err.message)}</span></div></section>`; }
}

(async function boot() {
  readHash();
  S.meta = await (await fetch("api/meta")).json();
  const kind = { live: "오늘 기록", forward: "사후 계산", replay: "과거 재생" };
  $("#ctl-day").innerHTML = S.meta.days.map((d) => `<option value="${d.T}">${d.label} · ${kind[d.kind] || ""}</option>`).join("");
  if (!S.meta.days.some((d) => d.T === S.T)) S.T = S.meta.default;
  if (!TABS.some((t) => t[0] === S.tab)) S.tab = "brief";
  await load(S.T);
})();
