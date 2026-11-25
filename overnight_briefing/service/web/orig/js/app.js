// 상태·그리기·누르기. 금액 계산은 '수량 × 어제 종가 × 등락률' 하나뿐이고, 나머지 숫자는 서버가 준 그대로 보여 준다.
import { esc, tone, pct2, won, num, man, tick, priceShort, I, MASK } from "./fmt.js";
const API = "../api";   // 원래 버전은 /orig/ 아래에서 열린다
import { bindBands, domain } from "./band.js";
import * as V from "./screens.js";
import { SLOTS, FIXED } from "./llm.js";

const $ = (s, r = document) => r.querySelector(s);
const S = { meta: null, base: null, day: null, T: null, slot: "0811", acct: "A", tab: "brief", filter: "brief", sel: null, qty: {}, pin: {}, live: null, accts: [], draft: loadDraft(), pfUser: false, liveFeed: null, notif: lsGet("ob.notif") || "06:30",
  liveMode: true, pending: null,        // liveMode: '실시간' 보기(지금 시각을 따라감). pending: 다음 아침 브리핑을 모으는 중(밤)
  preview: false, hold: "all", bed: lsGet("ob.bed") || "00:00", big: lsGet("ob.big") === "1",
  hideAmt: lsGet("ob.hide") === "1", ord: lsGet("ob.ord") || "need" };   // 11/20: 금액 가리기, 보유 종목 순서(먼저 볼 순|보유 금액 순)
MASK.on = S.hideAmt; S.view = "module";   // view: host = 증권사 앱 홈(예시), module = 이 기능. preview: 밤 화면을 낮에도 미리 보기. hold: 보유|관심 나눠 보기. bed·big: 브리핑 설정(시연, 이 브라우저에만)
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장하지 못해도 화면은 그대로 */ } }
const TABS = [["brief", "브리핑", "아침 브리핑"], ["news", "뉴스", "뉴스 브리핑"], ["night", "밤사이", "밤사이 흐름"], ["mine", "내 종목", "내 종목"], ["record", "기록", "지난 기록"]];
const HOSTNAV = [["home", "홈"], ["watch", "관심"], ["quote", "시세"], ["order", "주문"], ["acct", "계좌"]];   // 11/20: 증권사 앱(예시) 하단 메뉴
const key = (code) => `${S.T}|${S.acct}|${code}`;
let DOM = [-0.02, 0.02];

function model() {
  const d = S.day, account = d.accounts[0];
  const showAct = S.slot === "0900" && d.has_open;
  const rows = account.holdings.filter((h) => d.stocks[h.code]).map((h) => {
    const original = d.stocks[h.code];
    const s = S.slot === "0811" && original.nxt_g != null
      ? { ...original, H: original.nxt_g, H0730: original.H } : original;
    const q = S.qty[key(h.code)] ?? h.q, value = q * s.pc;
    let pin = S.pin[key(h.code)]; if (S.live && S.live.code === h.code) pin = S.live.v;
    return { s, h, q, value, pin, changed: q !== h.q, Hamt: value * s.H, lo: value * s.b80[0], hi: value * s.b80[1], yAmt: showAct && s.y != null ? value * s.y : null };
  }).sort((a, b) => b.h.q * b.s.pc - a.h.q * a.s.pc);
  const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
  const vals = rows.flatMap((r) => [r.s.b80[0], r.s.b80[1], r.s.H, r.s.H0730, S.slot !== "0730" && !showAct ? r.s.nxt_g : null, showAct ? r.s.y : null, S.pin[key(r.s.code)]]).filter((v) => v != null);
  const codes = new Set(rows.map((r) => r.s.code)), newsBy = {};
  d.news.forEach((n) => n.stocks.forEach((s) => { if (codes.has(s.code)) newsBy[s.code] = (newsBy[s.code] || 0) + 1; }));
  const briefBy = {}; Object.entries((d.brief && d.brief.stocks) || {}).forEach(([c, v]) => (briefBy[c] = (v.news || []).length));
  return { account, rows, codes, newsBy, briefBy, showAct, stockValue: sum((r) => r.value), baseValue: sum((r) => r.h.q * r.s.pc), Hsum: sum((r) => r.Hamt), H0730sum: sum((r) => r.value * (r.s.H0730 ?? r.s.H)),
    hypoSum: sum((r) => (r.pin != null ? r.value * r.pin : r.Hamt)), actSum: showAct && rows.every((r) => r.yAmt != null) ? sum((r) => r.yAmt) : showAct ? sum((r) => r.yAmt || 0) : null,
    actMissing: showAct ? rows.filter((r) => r.q > 0 && r.yAmt == null).length : 0,                       // 개장 직후 시가가 아직 안 온 종목 수
    HsumAct: showAct && rows.some((r) => r.yAmt == null) ? sum((r) => (r.yAmt != null ? r.Hamt : 0)) : null,   // 그럴 땐 예상도 같은 종목끼리만 더해 견준다
    changed: rows.some((r) => r.changed), pinned: rows.some((r) => r.pin != null), dom: domain(vals) };
}

/* ───── 실시간: 지금 한국 시각에 맞춰 날짜·슬롯을 고른다 ───── */
const kst = () => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { T: p.year + p.month + p.day, hm: (+p.hour % 24) * 100 + +p.minute, hhmm: `${String(+p.hour % 24).padStart(2, "0")}:${p.minute}`, wd: p.weekday }; };
function nextMorning(k) {                       // 밤에 모으는 기사가 들어갈 아침(주말은 월요일로, 휴장일은 따지지 않음)
  const d = new Date(Date.UTC(+k.T.slice(0, 4), +k.T.slice(4, 6) - 1, +k.T.slice(6)));
  if (k.hm >= 1800) d.setUTCDate(d.getUTCDate() + 1);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  const T = d.toISOString().slice(0, 10).replace(/-/g, "");
  return { T, label: `${+T.slice(4, 6)}월 ${+T.slice(6)}일 (${"일월화수목금토"[d.getUTCDay()]})` };
}
function liveTarget() {
  const k = kst(), today = S.meta.days.find((d) => d.T === k.T);
  if (S.preview) return { T: S.meta.default, slot: "0811", pending: { ...nextMorning({ ...k, hm: Math.max(k.hm, 1800) }), since: k.hhmm, preview: true } };   // 밤 화면 미리 보기(낮에도)
  if (today && k.hm < 1800) {                   // 오늘 카드가 나왔으면 오늘(시각에 맞는 슬롯), 18:00부터는 다음 밤으로
    const slot = k.hm >= 900 && today.has_open ? "0900" : k.hm >= 811 && (today.slots || []).includes("0811") ? "0811" : "0730";
    return { T: k.T, slot, pending: null };
  }
  return { T: S.meta.default, slot: "0811", pending: { ...nextMorning(k), since: k.hhmm } };
}
async function goLive() {
  const t = liveTarget(); S.liveMode = true; S.pending = t.pending; S.slot = t.slot;
  await load(t.T);
}
async function refreshLive() {                  // 5분마다: 새 날짜·새 기사가 올라왔는지
  try {
    const [m, lf] = await Promise.all([getJSON(`${API}/meta`), getJSON(`${API}/live`)]); S.meta = m; S.liveFeed = lf; fillDays();
    if (!S.liveMode) return;
    const t = liveTarget();
    if (t.T !== S.T || t.slot !== S.slot || !!t.pending !== !!S.pending) { S.pending = t.pending; S.slot = t.slot; await load(t.T); } else renderScreen(true);
  } catch { /* 다음에 다시 */ }
}

/* ───── 그리기 ───── */
function renderShell() {
  const d = S.day, m = model(), a = m.account, t = TABS.find((x) => x[0] === S.tab);
  $("#clock").textContent = S.liveMode ? kst().hhmm : S.slot.slice(0, 2) + ":" + S.slot.slice(2);
  const when = S.slot === "0730" ? "07:30 기준 · 장 전" : S.slot === "0811" ? "08:11 기준 · 장 전" : d.has_open ? `${(d.special && d.special.open) || "09:00"} 개장` : "개장 전";
  const sub = S.liveMode && S.pending ? `${S.pending.preview ? "미리 보기" : "실시간"} · ${S.pending.label} 아침 준비 중` : `${S.liveMode ? "실시간 · " : ""}${d.label} · ${when}`;
  const host = S.view === "host", acctBtn = `<button class="acct" data-act="acctsheet" aria-label="계좌 바꾸기">${a.sample ? "예시 " + a.id : "내 잔고"} ${I.down}</button>`;
  $("#appbar").innerHTML = host   // 11/20: 증권사 앱 안 — 증권사 홈(예시) 머리 | 이 기능을 연 화면(뒤로 가기 + 기능 이름)
    ? `<div class="host-brand">${I.hostLogo}<b>예시증권</b><small>증권사 앱 예시</small></div>${acctBtn}`
    : `<button class="back" data-act="hosthome" aria-label="증권사 홈으로">${I.back}</button><h1>당신이 잠든 사이에<button class="sub-btn" data-act="daysheet" aria-label="날짜 바꾸기"><small>${sub} ${I.down}</small></button></h1><button class="help" data-act="intro" data-step="0" aria-label="처음 안내 보기">?</button>${acctBtn}`;
  $("#tabbar").hidden = host;
  $("#hostnav").innerHTML = HOSTNAV.map(([id, nm]) => `<button class="${id === "home" ? "on" : ""}" data-act="hostnav" data-v="${id}">${I.host[id]}${nm}</button>`).join("");
  const mine = Object.values(m.briefBy).reduce((x, y) => x + y, 0);
  $("#tabbar").innerHTML = TABS.map(([id, nm]) => `<button class="${S.tab === id ? "on" : ""}" data-act="tab" data-tab="${id}">${nm}${id === "news" && mine ? `<span class="dot">${mine}</span>` : ""}</button>`).join("");
  document.querySelectorAll("#ctl-slot button").forEach((b) => { b.classList.toggle("on", b.dataset.slot === S.slot); b.classList.toggle("auto", S.liveMode); });
  $("#ctl-day").value = S.preview ? "night" : S.liveMode ? "live" : S.T; $("#ctl-acct").value = S.acct;
  $("#src").textContent = S.meta.mode === "live" ? "실제 자료(매일 갱신)를 바로 읽는 중" : "배포용 스냅샷을 읽는 중";
  const r = d.record, s8 = r.sealed["0811"], s7 = r.sealed["0730"];
  $("#record").innerHTML = r.kind === "live"
    ? ((s7 || s8 || {}).before_open ? `<span class="tag sealed">장 전 고정 기록</span><b>개장 전에 고정해 둔 예상</b>07:30 카드 ${s7 ? s7.issued : "–"} · 08:11 카드 ${s8 ? s8.issued : "–"} 발행${r.open_at ? ` · 시작가 ${r.open_at} 받음` : ""}`
      : `<span class="tag late">개장 뒤 발행</span><b>장 전에 고정한 기록이 아니에요</b>카드가 ${s7 ? s7.issued : "–"}·${s8 ? s8.issued : "–"}에 발행됐어요. 입력은 장 전 자료만 썼어요.${r.open_at ? ` 시작가는 ${r.open_at}에 받았어요.` : ""}`)
    : r.kind === "forward" && (s7 || s8) && (s7 || s8).before_open ? `<span class="tag sealed">개장 전 발행</span><b>${r.same_as_sealed ? "개장 전에 고정해 둔 예상과 같은 숫자" : "개장 전에 발행한 예상을 다시 계산한 숫자"}</b>07:30 카드 ${s7 ? s7.issued : "–"} · 08:11 카드 ${s8 ? s8.issued : "–"} 발행(개장 전).${r.same_as_sealed ? " 장 마감 뒤 같은 규칙으로 다시 계산해도 같았어요." : " 화면 숫자는 장 마감 뒤 확정된 자료로 같은 규칙을 다시 계산한 값이에요."}`
    : r.kind === "forward" && (s7 || s8) ? `<span class="tag late">개장 뒤 발행</span><b>장 전에 고정한 기록이 아니에요</b>카드가 ${s7 ? s7.issued : "–"}·${s8 ? s8.issued : "–"}에 발행됐어요.${r.same_as_sealed ? " 장 마감 뒤 같은 규칙으로 다시 계산해도 숫자가 같았어요." : ""}`
    : r.kind === "forward" ? `<span class="tag post">${r.after_freeze ? "규칙 고정 뒤 · 사후 계산" : "규칙 고정 전 · 사후 계산"}</span><b>고정한 규칙으로 다시 계산한 날</b>그날 이전 자료만 썼지만, 그 아침에 실제로 발행한 화면은 아니에요.`
      : `<span class="tag post">과거 재생</span><b>규칙을 만들 때 이미 본 기간</b>그날 이전 자료만 써서 다시 계산한 화면이에요.`;
  $("#llm-list").innerHTML = SLOTS.map((s) => `<div class="llm-item${s.tab === S.tab ? " here" : ""}"><h5><i>${s.id}</i>${s.name}</h5><dl><dt>자리</dt><dd>${s.where}</dd><dt>입력</dt><dd>${s.input}</dd><dt>출력</dt><dd>${s.output}</dd><dt>금지</dt><dd>${s.ban}</dd></dl><div class="now">지금: ${s.now}</div></div>`).join("") + `<div class="llm-item"><div class="now" style="margin:0">${FIXED}</div></div>`;
}

function renderScreen(keep = false) {
  const scr = $("#screen"), top = scr.scrollTop, m = model(), d = S.day;
  DOM = m.dom;                                // 끄는 동안에는 눈금을 바꾸지 않는다(손가락 밑에서 띠가 움직이지 않게)
  let out = S.view === "host" ? V.hostHome(m, d, S) : S.liveMode && S.pending && S.tab === "brief" ? V.pendingBrief(m, d, S) : V[S.tab](m, d, S);
  scr.innerHTML = typeof out === "string" ? out : out.html;
  if (typeof out !== "string" && out.bind) out.bind(scr, (id) => openNews(id));
  scr.scrollTop = keep ? top : 0;
  if (!keep) scr.firstElementChild && scr.firstElementChild.classList.add("fade-in");
  if (S.view !== "host" && S.tab === "brief") bindBands(scr, () => DOM, onBand);
  if (S.view !== "host" && S.tab === "brief" && !lsGet("ob.coach")) {   // 11/20: 처음 한 번, 노란 막대를 눌러 보게 알려 준다
    const band = scr.querySelector("[data-band]");
    if (band) band.insertAdjacentHTML("afterend", `<div class="coach" role="note"><span>노란 막대를 눌러 보세요. 그 가격에 시작하면 내 금액이 바로 보여요.</span><button data-act="coachok">알겠어요</button></div>`);
  }
  if (S.view !== "host" && S.tab === "mine") bindEditor(scr);
  $("#appbar").classList.toggle("scrolled", scr.scrollTop > 4);
}
const render = (keep) => { renderShell(); renderScreen(keep); saveHash(); };

function patchRow(code) {                      // 수량·가정 시가가 바뀔 때 그 줄과 맨 위 숫자만 고친다(누르고 있는 단추가 사라지지 않게)
  const m = model(), r = m.rows.find((x) => x.s.code === code), el = $(`[data-row="${code}"]`);
  if (r && el) {
    const v = r.pin != null ? r.pin : r.s.H, amt = r.value * v, f = (k) => $(`[data-f="${k}"]`, el);
    const watch = r.q === 0 && r.h.q === 0;
    f("amt").textContent = watch ? "관심" : won(amt); f("amt").className = "num " + (watch ? "" : tone(amt));
    f("pct").textContent = (r.pin != null ? "가정 " : "") + pct2(v);
    f("sub").innerHTML = `어제 ${priceShort(r.s.pc)}원 ${I.sm} ${r.pin != null ? "가정" : "예상"} ${priceShort(tick(r.s.pc * (1 + v)))}원`;
    f("q").textContent = num(r.q); f("range").textContent = r.q === 0 ? "수량을 넣으면 보여요" : `${man(r.lo)} ~ ${man(r.hi)}`;
    f("was").hidden = !r.changed; if (r.changed) f("was").textContent = `잔고 ${num(r.h.q)}주에서 바꿔 보는 중`;
    $("[data-stepper]", el).classList.toggle("changed", r.changed); $('[data-step="-1"]', el).disabled = r.q <= 0;
  }
  const hero = $("#hero"); if (hero) hero.innerHTML = V.heroHtml(m, S.day, S);
}

const coachDone = () => { lsSet("ob.coach", "1"); document.querySelectorAll(".coach").forEach((x) => x.remove()); };
function onBand(code, v, commit) {
  if (!lsGet("ob.coach")) coachDone();
  if (commit) { S.live = null; S.pin[key(code)] = v; renderScreen(true); return; }
  S.live = v == null ? null : { code, v }; patchRow(code);
}

/* ───── 아래 창 ───── */
function openSheet(html) { const s = $("#sheet"); s.innerHTML = html; s.hidden = false; $("#backdrop").hidden = false; s.scrollTop = 0; }
function closeSheet() { $("#sheet").hidden = true; $("#backdrop").hidden = true; }
const openNews = (id) => { const n = S.day.news.find((x) => x.id === id); if (n) openSheet(V.newsSheet(n, model(), S.day)); };
const openBrief = (code, id) => { const v = ((S.day.brief || {}).stocks || {})[code], n = v && v.news.find((x) => String(x.id) === id); if (n) openSheet(V.briefSheet(n, code, S.day)); };
function jumpTo(code) {                       // 먼저 볼 종목 칩 → 그 종목 줄로 이동 + 잠깐 표시
  let row = $(`#screen [data-row="${code}"]`);
  if (!row && S.hold !== "all") { S.hold = "all"; renderScreen(true); row = $(`#screen [data-row="${code}"]`); }
  if (!row) return;
  row.scrollIntoView({ behavior: "smooth", block: "start" }); row.classList.remove("flash"); void row.offsetWidth; row.classList.add("flash");
}
let bulkCat = null;
async function bulkAdd() {                    // 여러 종목 붙여넣기: '종목명|코드 수량 [평단]' 한 줄씩
  const ta = $("#bulk-in"), msg = $("#bulk-msg"); if (!ta || !msg) return;
  const lines = ta.value.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) { msg.textContent = "종목과 수량을 한 줄에 하나씩 적어 주세요"; return; }
  msg.textContent = "종목을 찾는 중이에요…";
  try { if (!bulkCat) bulkCat = await getJSON(`${API}/stocks?limit=2000`); } catch (err) { msg.textContent = `종목 목록을 받지 못했어요. ${err.message}`; return; }
  const added = [], miss = [], norm = (x) => x.replace(/\s/g, "").toLowerCase();
  for (const l of lines) {
    const nums = [], name = [];
    l.replace(/(\d),(?=\d{3}\b)/g, "$1").replace(/[,\t:：·]/g, " ").replace(/(\d)\s*(주|원)/g, "$1 ").split(/\s+/).filter(Boolean).forEach((t) => {
      if (/^\d{6}$/.test(t)) name.push(t); else if (/^[\d.]+$/.test(t)) nums.push(+t); else name.push(t);
    });
    const key = name.join(" ").trim(), k = norm(key);
    const r = key && (bulkCat.find((x) => x.code === key) || bulkCat.find((x) => norm(x.name) === k) || bulkCat.find((x) => norm(x.name).startsWith(k)) || bulkCat.find((x) => norm(x.name).includes(k)));
    if (!r) { miss.push(l); continue; }
    const q = nums.length ? Math.max(0, Math.round(nums[0])) : 0, avg = nums.length > 1 ? Math.round(nums[1]) : null;
    const ex = S.draft.find((h) => h.code === r.code);
    if (ex) { ex.q = q; if (avg) ex.avg = avg; }
    else if (S.draft.length < 30) S.draft.push({ code: r.code, name: r.name, q, avg, in_model: !!r.in_model });
    else { miss.push(`${l}(30종목 넘음)`); continue; }
    added.push(r.name);
  }
  saveDraft(); refreshDraft();
  msg.textContent = `${added.length}종목을 넣었어요${added.length ? `: ${added.slice(0, 4).join("·")}${added.length > 4 ? " 외" : ""}` : ""}${miss.length ? ` · 못 찾은 줄 ${miss.length}개: ${miss.slice(0, 2).join(", ")}` : ""}`;
  if (added.length && !miss.length) ta.value = "";
}
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
  else if (a === "slot") { if (S.liveMode && S.pending) return; S.liveMode = false; S.slot = el.dataset.slot; render(true); }
  else if (a === "filter") { S.filter = el.dataset.f; renderScreen(true); saveHash(); }
  else if (a === "stock") { const m = model(), r = m.rows.find((x) => x.s.code === el.dataset.code); if (r) openSheet(V.stockSheet(r, m, S.day, S)); }
  else if (a === "news") openNews(el.dataset.id);
  else if (a === "info") openSheet(V.infoSheet(el.dataset.info));
  else if (a === "acctsheet") openSheet(V.acctSheet(S.accts, S.acct, S.draft.length));
  else if (a === "acct") { closeSheet(); await switchAcct(el.dataset.id); }
  else if (a === "bnews") openBrief(el.dataset.code, el.dataset.id);
  else if (a === "bstock") { const x = model().account.excluded.find((e) => e.code === el.dataset.code); openSheet(V.bstockSheet(el.dataset.code, S.day, x ? x.name : el.dataset.code)); }
  else if (a === "copyacct") { const src = S.accts.find((x) => x.id === el.dataset.id); if (src) { S.draft = src.holdings.map((h) => ({ code: h.code, name: h.name, q: h.q, avg: h.avg ? Math.round(h.avg) : null, in_model: h.in_model })); saveDraft(); S.tab = "mine"; await switchAcct("U", true); toast(`예시 ${src.id} 계좌를 가져왔어요`); } }
  else if (a === "rmdraft") { S.draft = S.draft.filter((h) => h.code !== el.dataset.code); saveDraft(); refreshDraft(); }
  else if (a === "addstock") addDraft(JSON.parse(el.dataset.row));
  else if (a === "applydraft") await applyDraft();
  else if (a === "close") closeSheet();
  else if (a === "unpin") { delete S.pin[key(el.dataset.code)]; renderScreen(true); }
  else if (a === "reset") { const m = model(); m.rows.forEach((r) => { delete S.qty[key(r.s.code)]; delete S.pin[key(r.s.code)]; }); renderScreen(true); toast("잔고 수량과 예상 시작가로 되돌렸어요"); }
  else if (a === "gsel") { S.sel = el.dataset.id || null; renderScreen(true); }
  else if (a === "gjump") { S.sel = el.dataset.id; S.tab = "news"; S.filter = "graph"; closeSheet(); render(); }
  else if (a === "qty") { if (!$("input", el)) editQty(el); }
  else if (a === "intro") openSheet(V.introSheet(+el.dataset.step || 0));
  else if (a === "introdone") { lsSet("ob.intro", "1"); closeSheet(); }
  else if (a === "notif") openSheet(V.notifSheet(S, S.day));
  else if (a === "setnotif") { S.notif = el.dataset.v; lsSet("ob.notif", S.notif); openSheet(V.notifSheet(S, S.day)); renderScreen(true); toast(`${S.notif}에 아침 브리핑 알림을 받아요(시연)`); }
  else if (a === "setbed") { S.bed = el.dataset.v; lsSet("ob.bed", S.bed); openSheet(V.notifSheet(S, S.day)); renderScreen(true); toast(`잠드는 시각 ${S.bed}로 저장했어요(시연)`); }
  else if (a === "setbig") { S.big = el.dataset.v === "1"; lsSet("ob.big", S.big ? "1" : "0"); applyBig(); openSheet(V.notifSheet(S, S.day)); }
  else if (a === "hold") { S.hold = el.dataset.v; renderScreen(true); }
  else if (a === "coachok") coachDone();
  else if (a === "hosthome") { S.view = "host"; render(); }
  else if (a === "openmodule") { S.view = "module"; S.tab = "brief"; render(); }
  else if (a === "hostnav") { if (el.dataset.v === "home") { S.view = "host"; render(); } else toast("시연에서는 증권사 화면을 따로 만들지 않았어요"); }
  else if (a === "hideamt") { S.hideAmt = !S.hideAmt; MASK.on = S.hideAmt; lsSet("ob.hide", S.hideAmt ? "1" : "0"); render(true); toast(S.hideAmt ? "금액을 가렸어요" : "금액을 다시 보여 드려요"); }
  else if (a === "ord") { S.ord = el.dataset.v; lsSet("ob.ord", S.ord); renderScreen(true); }
  else if (a === "jump") { jumpTo(el.dataset.code); }
  else if (a === "lastmorning") { const t = S.meta.days[0]; S.liveMode = false; S.pending = null; S.preview = false; S.tab = "brief"; S.slot = t.has_open ? "0900" : (t.slots || []).includes("0811") ? "0811" : "0730"; await load(t.T); }
  else if (a === "bulk") await bulkAdd();
  else if (a === "golive") { S.tab = "news"; S.filter = "live"; render(); }
  else if (a === "daysheet") openSheet(V.daySheet(S.meta.days, S.preview ? "night" : S.liveMode ? "live" : S.T));
  else if (a === "pickday") { closeSheet(); await pickDay(el.dataset.t); }
}
async function pickDay(t) {                     // 'live' = 지금 시각, 'night' = 밤 화면 미리 보기, 그 밖 = 지난 날짜
  S.preview = t === "night";
  if (t === "live" || t === "night") { if (S.preview) S.tab = "brief"; await goLive(); } else { S.liveMode = false; S.pending = null; await load(t); }
}
const applyBig = () => { if (S.big) $("#device").dataset.zoom = "lg"; else delete $("#device").dataset.zoom; };
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-node]"); if (g) { S.sel = S.sel === g.dataset.node ? null : g.dataset.node; renderScreen(true); return; }
  const el = e.target.closest("[data-act]"); if (el) { e.preventDefault(); act(el); }
});
document.addEventListener("pointerdown", (e) => { const b = e.target.closest("[data-stepper] [data-step]"); if (b && !b.disabled) { e.preventDefault(); stepStart(b); } });   // 11/20: 처음 안내의 data-step(쪽 번호)과 섞이지 않게 수량 단추 안의 것만
["pointerup", "pointercancel", "pointerleave"].forEach((t) => document.addEventListener(t, stepStop, true));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
$("#backdrop").addEventListener("click", closeSheet);
$("#screen").addEventListener("scroll", () => $("#appbar").classList.toggle("scrolled", $("#screen").scrollTop > 4), { passive: true });

/* ───── 조작판 ───── */
$("#ctl-day").addEventListener("change", (e) => pickDay(e.target.value));
$("#ctl-acct").addEventListener("change", (e) => switchAcct(e.target.value));
$("#ctl-slot").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { if (S.liveMode && S.pending) { toast("실시간 보기는 지금 시각을 따라가요. 지난 날짜를 고르면 시각을 바꿀 수 있어요"); return; } S.liveMode = false; S.slot = b.dataset.slot; render(true); } });
$("#ctl-llm").addEventListener("change", (e) => document.body.classList.toggle("llm-on", e.target.checked));
$("#ctl-dark").addEventListener("change", (e) => { if (e.target.checked) $("#device").dataset.theme = "dark"; else delete $("#device").dataset.theme; });

/* ───── 주소(#)에 지금 보고 있는 것 남기기 ───── */
function saveHash() { history.replaceState(null, "", `#T=${S.liveMode ? "live" : S.T}${S.liveMode ? (S.preview ? "&preview=night" : "") : "&slot=" + S.slot}&acct=${S.acct}&tab=${S.tab}${S.tab === "news" ? "&f=" + S.filter : ""}`); }
function readHash() { const p = new URLSearchParams(location.hash.slice(1)); ["T", "slot", "acct", "tab"].forEach((k) => { if (p.get(k)) S[k] = p.get(k); }); S.liveMode = !p.get("T") || p.get("T") === "live"; if (S.liveMode) S.T = null; S.preview = S.liveMode && p.get("preview") === "night"; if (p.get("f")) S.filter = p.get("f"); if (p.get("llm")) { $("#ctl-llm").checked = true; document.body.classList.add("llm-on"); } const dark = p.get("dark") ? p.get("dark") === "1" : matchMedia("(prefers-color-scheme: dark)").matches; $("#ctl-dark").checked = dark; if (dark) $("#device").dataset.theme = "dark"; else delete $("#device").dataset.theme; }

window.addEventListener("hashchange", async () => {      // 주소를 바꾸면 그 화면으로(뒤로 가기·바로 가기 주소)
  const T0 = S.T, A0 = S.acct, L0 = S.liveMode, P0 = S.preview; readHash();
  if (S.liveMode) { if (!L0 || S.acct !== A0 || S.preview !== P0) await goLive(); else render(); closeSheet(); return; }
  S.pending = null;
  if (!S.meta.days.some((d) => d.T === S.T)) S.T = T0;
  if (!TABS.some((t) => t[0] === S.tab)) S.tab = "brief";
  closeSheet();
  if (S.T !== T0 || S.acct !== A0) await load(S.T); else render();
});

/* ───── 불러오기: 그날 공통 묶음(/api/day) + 계좌 묶음(/api/portfolio) ───── */
async function getJSON(url, opt) {
  const r = await fetch(url, opt); let d = null;
  try { d = await r.json(); } catch { /* 빈 응답 */ }
  if (!r.ok) throw new Error((d && typeof d.detail === "string" && d.detail) || (r.status === 422 ? "입력한 종목·수량을 확인해 주세요" : `서버 오류 ${r.status}`));
  return d;
}
const post = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
function loadDraft() { try { const v = JSON.parse(localStorage.getItem("ob.draft") || "[]"); return Array.isArray(v) ? v.slice(0, 30) : []; } catch { return []; } }
function saveDraft() { try { localStorage.setItem("ob.draft", JSON.stringify(S.draft)); } catch { /* 저장하지 못해도 화면은 그대로 */ } }
const EMPTY_PF = { account: { id: "U", name: "내 잔고", holdings: [], excluded: [], sample: false }, stocks: {}, hist: {}, graph: { nodes: [], edges: [] }, segnews: {}, track: {}, brief: null };
function compose(base, pf) {
  return { ...base, accounts: [pf.account], stocks: pf.stocks, hist: pf.hist, graph: pf.graph, segnews: pf.segnews, track: { [pf.account.id]: pf.track },
    brief: base.brief ? { ...base.brief, stocks: (pf.brief && pf.brief.stocks) || {} } : null };
}
function fetchPf(T) {
  if (S.acct !== "U") return getJSON(`${API}/portfolio`, post({ T, account_id: S.acct }));
  const hs = S.draft.filter((h) => h.q >= 0).map((h) => ({ code: h.code, q: Math.round(h.q), avg: h.avg > 0 ? h.avg : null }));   // 수량 0 = 관심 종목
  return hs.length ? getJSON(`${API}/portfolio`, post({ T, name: "내 잔고", holdings: hs })) : Promise.resolve(EMPTY_PF);
}
async function load(T) {
  const scr = $("#screen");
  scr.innerHTML = `<section class="sec"><div class="skel" style="height:20px;width:40%"></div><div class="skel" style="height:44px;width:70%;margin-top:14px"></div><div class="skel" style="height:56px;margin-top:14px"></div></section><section class="sec"><div class="skel" style="height:120px"></div></section><section class="sec"><div class="skel" style="height:220px"></div></section>`;
  try {
    const [base, pf] = await Promise.all([getJSON(`${API}/day/${T}?slot=${S.slot}`), fetchPf(T)]);
    S.base = base; S.day = compose(base, pf); S.T = T; S.live = null; S.sel = null;
    S.pfUser = S.acct === "U" && pf.account.holdings.length + pf.account.excluded.length > 0;
    if (S.acct === "U" && !S.pfUser) S.tab = "mine";
    render();
  } catch (err) { scr.innerHTML = `<section class="sec"><div class="empty">이 날 자료를 불러오지 못했어요.<br><span class="tiny">${esc(err.message)}</span></div></section>`; }
}
const KIND = { live: "오늘 기록", forward: "사후 계산", replay: "과거 재생" };
function fillDays() { $("#ctl-day").innerHTML = `<option value="live">● 실시간 · 지금 시각</option><option value="night">☾ 밤 화면 미리 보기</option>` + S.meta.days.map((d) => `<option value="${d.T}">${d.label} · ${KIND[d.kind] || ""}${d.brief ? " · 뉴스" : ""}</option>`).join(""); $("#ctl-day").value = S.preview ? "night" : S.liveMode ? "live" : S.T || ""; }
async function switchAcct(id, keepTab) {
  S.acct = id; S.sel = null;
  if (id === "U" && !keepTab && !S.draft.length) S.tab = "mine";
  await load(S.T);
}

/* ───── 내 잔고 넣기 ───── */
let searchT = null, searchSeq = 0;
function bindEditor(root) {
  const q = $("#stock-q", root), res = $("#stock-res", root); if (!q) return;
  q.addEventListener("input", () => { clearTimeout(searchT); const v = q.value.trim(); if (!v) { res.hidden = true; return; } searchT = setTimeout(() => runSearch(v, res), 160); });
  q.addEventListener("keydown", (e) => { if (e.key === "Enter" && !res.hidden) { const b = $("button", res); if (b) { e.preventDefault(); b.click(); } } if (e.key === "Escape") res.hidden = true; });
}
async function runSearch(v, res) {
  const my = ++searchSeq;
  try {
    const rows = await getJSON(`${API}/stocks?q=${encodeURIComponent(v)}&limit=8`);
    if (my !== searchSeq) return;
    res.innerHTML = rows.length ? rows.map((r) => `<button role="option" data-act="addstock" data-row="${esc(JSON.stringify(r))}"><b>${esc(r.name)}</b><small>${r.code}${r.market ? " · " + esc(r.market) : ""}${r.in_model ? "" : " · 예상 없음"}</small>${S.draft.some((h) => h.code === r.code) ? '<span class="chip">넣음</span>' : ""}</button>`).join("")
      : `<div class="empty" style="padding:12px">‘${esc(v)}’에 맞는 종목이 없어요. 이름이나 6자리 코드로 찾아보세요.</div>`;
    res.hidden = false;
  } catch (err) { res.innerHTML = `<div class="empty" style="padding:12px">찾지 못했어요. ${esc(err.message)}</div>`; res.hidden = false; }
}
function refreshDraft() { const el = $("#draft"); if (el) el.innerHTML = V.draftRows(S.draft); const b = $('[data-act="applydraft"]'); if (b) b.disabled = !S.draft.length; }
function addDraft(r) {
  if (S.draft.some((h) => h.code === r.code)) toast("이미 넣은 종목이에요");
  else if (S.draft.length >= 30) toast("최대 30종목까지 넣을 수 있어요");
  else { S.draft.push({ code: r.code, name: r.name, q: 10, avg: null, in_model: !!r.in_model }); saveDraft(); }
  const res = $("#stock-res"), q = $("#stock-q"); if (res) res.hidden = true; if (q) q.value = "";
  refreshDraft();
  const inp = $(`#draft [data-code="${r.code}"] input[data-f="q"]`); if (inp) { inp.focus(); inp.select(); }
}
document.addEventListener("change", (e) => {
  const inp = e.target.closest && e.target.closest("#draft input"); if (!inp) return;
  const h = S.draft.find((x) => x.code === inp.closest("[data-code]").dataset.code); if (!h) return;
  const v = inp.value === "" ? null : Number(inp.value);
  if (inp.dataset.f === "q") { h.q = Math.max(0, Math.min(10000000, Math.round(v ?? 0))); inp.value = h.q; refreshDraft(); }
  else { h.avg = v == null || !(v > 0) ? null : Math.min(100000000, Math.round(v)); inp.value = h.avg ?? ""; }
  saveDraft();
});
async function applyDraft() {
  if (!S.draft.length) return;
  const msg = $("#draft-msg"); if (msg) msg.textContent = "브리핑을 만드는 중이에요…";
  S.acct = "U"; await load(S.T);
  if (S.pfUser) { S.tab = "brief"; render(); toast("내 잔고로 브리핑을 만들었어요"); }
}

(async function boot() {
  readHash(); applyBig();
  try {
    [S.meta, S.accts] = await Promise.all([getJSON(`${API}/meta`), getJSON(`${API}/accounts`)]);
  } catch (err) { $("#screen").innerHTML = `<section class="sec"><div class="empty">서버에 연결하지 못했어요.<br><span class="tiny">${esc(err.message)}</span></div></section>`; return; }
  fillDays();
  $("#ctl-acct").innerHTML = S.accts.map((a) => `<option value="${a.id}">예시 ${a.id} · ${esc(a.name)}</option>`).join("") + `<option value="U">내 잔고(직접 넣기)</option>`;
  if (!S.liveMode && !S.meta.days.some((d) => d.T === S.T)) S.T = S.meta.default;
  if (!TABS.some((t) => t[0] === S.tab)) S.tab = "brief";
  if (S.acct !== "U" && !S.accts.some((a) => a.id === S.acct)) S.acct = S.accts[0].id;
  getJSON(`${API}/live`).then((v) => { S.liveFeed = v; if (S.day && (S.tab === "brief" || S.tab === "news")) renderScreen(true); }).catch(() => { S.liveFeed = { items: [], collected: 0 }; });
  if (S.liveMode) await goLive(); else await load(S.T);
  setInterval(() => { if (S.liveMode) { $("#clock").textContent = kst().hhmm; } }, 30000);
  setInterval(refreshLive, 5 * 60000);
  if (!lsGet("ob.intro") && !new URLSearchParams(location.hash.slice(1)).get("nointro")) openSheet(V.introSheet(0));
})();
