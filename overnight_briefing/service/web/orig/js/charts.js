// 작은 그림들: 밤 흐름 선, 기록 막대, 종목 지난 기록, 관계 그림. 모두 SVG 문자열로 만든다.
import { pct, esc, dlabel } from "./fmt.js";

const css = (n) => `var(--${n})`;
const path = (pts) => pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");

/** 밤 흐름 작은 선(브리핑 카드) */
export function spark(night, w = 128, h = 46) {
  if (!night) return "";
  const pts = night.pts.filter((_, i) => i % 6 === 0 || i === night.pts.length - 1);
  const r = pts.map((p) => p[1] / night.day_close - 1), lo = Math.min(0, ...r), hi = Math.max(0, ...r), pad = 4;
  const X = (m) => pad + (m / 720) * (w - 2 * pad), Y = (v) => pad + (1 - (v - lo) / (hi - lo || 1)) * (h - 2 * pad);
  const xy = pts.map((p, i) => [X(p[0]), Y(r[i])]);
  const c = css(night.last_ret >= 0 ? "up" : "down"), end = xy[xy.length - 1];
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><line x1="${pad}" x2="${w - pad}" y1="${Y(0)}" y2="${Y(0)}" stroke="${css("mute")}" stroke-dasharray="2 3" stroke-width="1"/>
  <path d="${path(xy)}" fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${end[0]}" cy="${end[1]}" r="3" fill="${c}" stroke="${css("card")}" stroke-width="1.5"/></svg>`;
}

/** 밤사이 흐름: 야간선물 등락률 선 + 15분 기사 수 막대 + 이어진 기사 표식. 반환 {html, bind(el, onPick)} */
export function nightChart(night, news) {
  const W = 362, H = 262, L = 6, R = 46, T = 14, PH = 150, GAP = 44, BH = 40;
  const r = night.pts.map((p) => p[1] / night.day_close - 1);
  let lo = Math.min(0, ...r), hi = Math.max(0, ...r); const padv = (hi - lo) * 0.12 || 0.002; lo -= padv; hi += padv;
  const X = (m) => L + (Math.max(0, Math.min(720, m)) / 720) * (W - L - R), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * PH;
  const xy = night.pts.map((p, i) => [X(p[0]), Y(r[i])]);
  const c = css(night.last_ret >= 0 ? "up" : "down"), end = xy[xy.length - 1], y0 = Y(0);
  const t0 = new Date(night.t0.replace(" ", "T") + ":00+09:00");
  const mins = (ts) => (new Date(ts.replace(" ", "T") + ":00+09:00") - t0) / 60000;
  const step = (hi - lo) > 0.03 ? 0.01 : (hi - lo) > 0.012 ? 0.005 : 0.002;
  let grid = "";
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    const z = Math.abs(v) < 1e-9;
    grid += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${css(z ? "mute" : "line2")}" ${z ? 'stroke-dasharray="3 3"' : ""}/><text x="${W - R + 6}" y="${Y(v) + 3.5}" font-size="10.5" fill="${css(z ? "ink2" : "mute")}">${z ? "어제 종가" : pct(v, 1)}</text>`;
  }
  let xt = "";
  [["18:00", 0], ["21:00", 180], ["00:00", 360], ["03:00", 540], ["06:00", 720]].forEach(([t, m], i) => {
    xt += `<text x="${X(m)}" y="${T + PH + 15}" font-size="10.5" fill="${css("mute")}" text-anchor="${i === 0 ? "start" : i === 4 ? "end" : "middle"}">${t}</text>`;
  });
  const cmax = Math.max(1, ...night.counts.filter((q) => q[0] >= 0 && q[0] < 720).map((q) => q[1]));
  const by = T + PH + GAP + BH, bw = ((W - L - R) / 48) - 1.5;
  const bars = night.counts.filter((q) => q[0] >= 0 && q[0] < 720).map((q) => `<rect x="${X(q[0]) + 0.75}" y="${by - (q[1] / cmax) * BH}" width="${bw}" height="${Math.max(1, (q[1] / cmax) * BH)}" rx="1.5" fill="${css("line")}"/>`).join("");
  const marks = news.map((n) => ({ n, m: mins(n.ts) })).filter((q) => q.m >= 0 && q.m <= 720).map(({ n, m }) => {
    const i = Math.min(night.pts.length - 1, night.pts.findIndex((p) => p[0] >= m) < 0 ? night.pts.length - 1 : night.pts.findIndex((p) => p[0] >= m));
    const [px, py] = xy[i], mine = n.stocks.some((s) => s.mine);
    return `<g class="nmark" data-news="${n.id}" style="cursor:pointer"><circle cx="${px}" cy="${py}" r="11" fill="transparent"/><path d="M${px} ${py - 6}L${px + 5} ${py}L${px} ${py + 6}L${px - 5} ${py}Z" fill="${mine ? css("band") : css("card")}" stroke="${mine ? css("band-edge") : css("mute")}" stroke-width="1.4"/></g>`;
  }).join("");
  const html = `<div class="chart" data-night><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="코스피200 야간선물 밤사이 흐름">
    <defs><linearGradient id="ng" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".16"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>
    ${grid}${xt}
    <path d="${path(xy)}L${end[0]} ${y0}L${xy[0][0]} ${y0}Z" fill="url(#ng)"/>
    <path d="${path(xy)}" fill="none" stroke="${c}" stroke-width="1.7" stroke-linejoin="round"/>
    <circle cx="${end[0]}" cy="${end[1]}" r="3.5" fill="${c}" stroke="${css("card")}" stroke-width="1.8"/>
    <text x="${L}" y="${by - BH - 7}" font-size="10.5" fill="${css("sub")}">15분마다 나온 미국 기사 수 · 가장 많을 때 ${cmax}건</text>${bars}
    ${marks}
    <line class="cross" x1="0" x2="0" y1="${T}" y2="${by}" stroke="${css("ink")}" stroke-width="1" opacity="0"/><circle class="crossdot" r="4" fill="${css("ink")}" stroke="${css("card")}" stroke-width="2" opacity="0"/>
  </svg><div class="tip" hidden></div></div>`;
  const bind = (el, onPick) => {
    const box = el.querySelector("[data-night]"), svg = box.querySelector("svg"), tip = box.querySelector(".tip"), cross = svg.querySelector(".cross"), dot = svg.querySelector(".crossdot");
    const move = (e) => {
      const b = svg.getBoundingClientRect(), sx = ((e.clientX - b.left) / b.width) * W;
      const m = Math.max(0, Math.min(720, ((sx - L) / (W - L - R)) * 720));
      let i = night.pts.findIndex((p) => p[0] >= m); if (i < 0) i = night.pts.length - 1;
      const p = night.pts[i], d = new Date(t0.getTime() + p[0] * 60000), hh = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      const cnt = night.counts.find((q) => q[0] <= p[0] && p[0] < q[0] + 15);
      cross.setAttribute("x1", xy[i][0]); cross.setAttribute("x2", xy[i][0]); cross.setAttribute("opacity", ".35");
      dot.setAttribute("cx", xy[i][0]); dot.setAttribute("cy", xy[i][1]); dot.setAttribute("opacity", "1");
      tip.hidden = false; tip.innerHTML = `<b>${hh}</b> · ${p[1].toFixed(2)} · ${pct(r[i], 2)}<br>이 15분 기사 ${cnt ? cnt[1] : 0}건`;
      tip.style.left = Math.max(70, Math.min(b.width - 70, (xy[i][0] / W) * b.width)) + "px";
    };
    const leave = () => { tip.hidden = true; cross.setAttribute("opacity", "0"); dot.setAttribute("opacity", "0"); };
    svg.addEventListener("pointermove", move); svg.addEventListener("pointerdown", move); svg.addEventListener("pointerleave", leave);
    svg.querySelectorAll(".nmark").forEach((g) => g.addEventListener("click", () => onPick(g.dataset.news)));
  };
  return { html, bind };
}

/** 최근 거래일마다 내 종목이 범위 안에 든 비율 */
export function recordBars(daily, T, freeze = "20261103") {
  const d = daily.filter((x) => x.cov != null), W = 350, H = 132, L = 4, R = 30, Tp = 8, PH = 96;
  const bw = (W - L - R) / d.length, Y = (v) => Tp + (1 - v / 100) * PH;
  const bars = d.map((x, i) => `<rect x="${L + i * bw + 1.5}" y="${Y(Math.max(x.cov, 2))}" width="${bw - 3}" height="${PH - (Y(Math.max(x.cov, 2)) - Tp)}" rx="2.5" fill="${x.T === T ? css("ink") : x.T >= freeze ? css("mute") : css("line")}"><title>${dlabel(x.T)} ${x.cov}%</title></rect>`).join("");
  const lab = [0, Math.floor(d.length / 2), d.length - 1].map((i, k) => `<text x="${L + i * bw + bw / 2}" y="${Tp + PH + 15}" font-size="10.5" fill="${css("mute")}" text-anchor="${k === 0 ? "start" : k === 2 ? "end" : "middle"}">${dlabel(d[i].T).replace(/\(.+/, "")}</text>`).join("");
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="날마다 내 종목이 예상대로 시작한 비율">
    ${[0, 50, 100].map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${css("line2")}"/><text x="${W - R + 6}" y="${Y(v) + 3.5}" font-size="10.5" fill="${css("mute")}">${v}%</text>`).join("")}
    ${bars}<line x1="${L}" x2="${W - R}" y1="${Y(80)}" y2="${Y(80)}" stroke="${css("band-edge")}" stroke-width="1.5" stroke-dasharray="4 3"/><text x="${W - R + 6}" y="${Y(80) + 3.5}" font-size="10.5" font-weight="700" fill="${css("band-ink")}">80%</text>${lab}</svg></div>`;
}

/** 한 종목의 지난 날들: 날마다 띠(세로 막대)·예상(가로 줄)·실제(점) */
export function histChart(hist, T) {
  if (!hist || !hist.length) return "";
  const W = 350, H = 150, L = 4, R = 38, Tp = 10, PH = 112, n = hist.length;
  const vals = hist.flatMap((h) => [h.lo, h.hi, h.y]), m = Math.max(0.01, ...vals.map(Math.abs)) * 1.1;
  const cw = (W - L - R) / n, X = (i) => L + i * cw + cw / 2, Y = (v) => Tp + (1 - (v + m) / (2 * m)) * PH;
  const cols = hist.map((h, i) => `<g><title>${dlabel(h.T)} 예상 가격대 ${pct(h.lo)}~${pct(h.hi)} · 예상 ${pct(h.H)} · 실제 ${pct(h.y)}</title>
    <rect x="${X(i) - Math.min(5, cw / 2 - 1.5)}" y="${Y(h.hi)}" width="${Math.min(10, cw - 3)}" height="${Math.max(2, Y(h.lo) - Y(h.hi))}" rx="3" fill="${css("band")}" ${h.T === T ? `stroke="${css("band-edge")}" stroke-width="1.3"` : 'opacity=".75"'}/>
    <line x1="${X(i) - 5}" x2="${X(i) + 5}" y1="${Y(h.H)}" y2="${Y(h.H)}" stroke="${css("ink")}" stroke-width="1.6"/>
    <circle cx="${X(i)}" cy="${Y(h.y)}" r="3.3" fill="${css("card")}" stroke="${css(h.inb ? "ok" : "miss")}" stroke-width="2"/></g>`).join("");
  const tick = (v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${css(v === 0 ? "mute" : "line2")}" ${v === 0 ? 'stroke-dasharray="3 3"' : ""}/><text x="${W - R + 6}" y="${Y(v) + 3.5}" font-size="10.5" fill="${css("mute")}">${v === 0 ? "0%" : pct(v, 0)}</text>`;
  const st = m > 0.06 ? 0.04 : m > 0.03 ? 0.02 : 0.01, ticks = [];
  for (let v = -Math.floor(m / st) * st; v <= m; v += st) ticks.push(Math.abs(v) < 1e-9 ? 0 : v);
  const lab = [0, n - 1].map((i, k) => `<text x="${X(i)}" y="${Tp + PH + 16}" font-size="10.5" fill="${css("mute")}" text-anchor="${k ? "end" : "start"}">${dlabel(hist[i].T)}</text>`).join("");
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="지난 거래일의 예상 가격대와 실제 시작가">${ticks.map(tick).join("")}${cols}${lab}</svg></div>`;
}

/** 관계 그림: 왼쪽 해외 쪽, 오른쪽 내 종목. hot = 오늘 밤 기사가 붙은 (src|dst) → 건수, hotN = 상자별 기사 수.
 *  11/17: 왼쪽 상자는 호출하는 쪽이 '이어진 내 종목 순서'로 정렬해 넘기고, 오른쪽 상자는 이어진 왼쪽 상자들의 평균 높이에 둔다(선이 덜 엇갈린다).
 *  왼쪽 상자 둘째 줄에 관계 이름을 적어, 누르지 않아도 어떤 관계인지 보인다. */
const fit = (t, px, fs = 12.5) => {                 // 글자 폭을 어림해 넘치면 줄임표
  let w = 0, out = "";
  for (const ch of t) { w += /[ㄱ-힝]/.test(ch) ? fs : fs * 0.58; if (w > px) return out.trimEnd() + "…"; out += ch; }
  return out;
};
export function relGraph(nodes, edges, stocks, hot, hotN, sel) {
  const W = 366, LW = 168, RW = 110, NH = 42, GAPY = 8, T = 26, RH = 36;
  const left = nodes, li = Object.fromEntries(left.map((n, i) => [n.id, i]));
  const yL = (i) => T + i * (NH + GAPY), hL = left.length * (NH + GAPY);
  // 오른쪽: 이어진 왼쪽 상자들의 평균 높이 → 위에서부터 겹치지 않게 내려 놓고, 넘치면 아래에서부터 다시 올린다
  const want = stocks.map((s) => { const ys = edges.filter((e) => e.dst === s.code && li[e.src] != null).map((e) => yL(li[e.src]) + NH / 2); return { s, y: ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length - RH / 2 : null }; });
  const linked = want.filter((w) => w.y != null).sort((a, b) => a.y - b.y), lone = want.filter((w) => w.y == null);
  let prev = T - 6; linked.forEach((w) => { w.y = Math.max(w.y, prev + 6); prev = w.y + RH; });
  const bodyH = Math.max(hL, linked.length * (RH + 6), 120);
  let lim = T + bodyH - (lone.length ? lone.length * (RH + 6) : 0); [...linked].reverse().forEach((w) => { w.y = Math.min(w.y, lim - RH); lim = w.y - 6; });
  lone.forEach((w, i) => (w.y = T + bodyH - (lone.length - i) * (RH + 6) + 6));
  const yR = Object.fromEntries(want.map((w) => [w.s.code, w.y])), H = T + bodyH + 8;
  const on = (e) => !sel || sel === e.src || sel === e.dst;
  const seen = {};
  const draw = (e) => {
    const k = e.src + "|" + e.dst; seen[k] = (seen[k] || 0) + 1; if (seen[k] > 1 || li[e.src] == null || yR[e.dst] == null) return "";
    const y1 = yL(li[e.src]) + NH / 2, y2 = yR[e.dst] + RH / 2, x1 = LW + 2, x2 = W - RW - 2, h = hot[k] || 0, neg = e.sign === "−";
    const col = h ? css("band-edge") : neg ? css("miss") : css("mute");
    return `<path class="${on(e) ? "" : "dim"}" d="M${x1} ${y1}C${x1 + 30} ${y1},${x2 - 30} ${y2},${x2} ${y2}" stroke="${col}" stroke-width="${h ? 2.4 : 1.3}" ${e.strength === "추정" ? 'stroke-dasharray="4 3"' : ""} opacity="${h ? 1 : 0.7}"><title>${esc(e.relation)}</title></path>`;
  };
  const paths = edges.filter((e) => !hot[e.src + "|" + e.dst]).map(draw).join("") + edges.filter((e) => hot[e.src + "|" + e.dst]).map(draw).join("");   // 노란 선이 위로
  const active = (id) => !sel || sel === id || edges.some((e) => (e.src === sel && e.dst === id) || (e.dst === sel && e.src === id));
  const lbox = (n, i) => {
    const y = yL(i), h = hotN[n.id] || 0, mine = edges.filter((e) => e.src === n.id), rel = mine.length ? mine[0].relation + (new Set(mine.map((e) => e.relation)).size > 1 ? " 외" : "") : "";
    return `<g class="gn ${active(n.id) ? "" : "dim"}" data-node="${n.id}"><rect x="0.5" y="${y}" width="${LW}" height="${NH}" rx="10" fill="${h ? css("band-soft") : css("card")}" stroke="${sel === n.id ? css("accent") : h ? css("band-edge") : css("line")}" stroke-width="${sel === n.id ? 2 : 1}"/>
      <text x="11" y="${y + 17}" font-size="12.5" font-weight="650" fill="${css("ink")}">${esc(fit(n.short, LW - 22 - (h ? 26 : 0), 12.5))}</text>
      <text x="11" y="${y + 32}" font-size="10.5" font-weight="500" fill="${css("sub")}">${esc(fit(rel, LW - 22, 10.5))}</text>
      ${h ? `<g><rect x="${LW - 29}" y="${y + 6}" width="22" height="17" rx="8.5" fill="${css("band")}"/><text x="${LW - 18}" y="${y + 18.5}" font-size="10.5" font-weight="700" fill="#5C4500" text-anchor="middle">${h}</text></g>` : ""}</g>`;
  };
  const rbox = (s) => {
    const y = yR[s.code], deg = edges.some((e) => e.dst === s.code);
    return `<g class="gn ${active(s.code) ? "" : "dim"}" data-node="${s.code}"><rect x="${W - RW}" y="${y}" width="${RW - 0.5}" height="${RH}" rx="10" fill="${deg ? css("band-soft") : css("chip")}" ${sel === s.code ? `stroke="${css("accent")}" stroke-width="2"` : ""}/>
      <text x="${W - RW + 10}" y="${y + RH / 2 + 4.3}" font-size="12" font-weight="650" fill="${deg ? css("band-ink") : css("mute")}">${esc(fit(s.name, RW - 18, 12))}</text></g>`;
  };
  return `<div class="graph"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="해외 쪽과 내 종목의 관계 그림">
    <text x="0" y="14" font-size="11.5" font-weight="600" fill="${css("sub")}">해외 쪽 · 관계</text><text x="${W}" y="14" font-size="11.5" font-weight="600" fill="${css("sub")}" text-anchor="end">내 종목</text>
    ${paths}${left.map(lbox).join("")}${stocks.map(rbox).join("")}</svg></div>`;
}

/** 한눈에 지도(11/17 팀 의견): 맨 위 줄 = 밤사이 실제로 거래된 코스피200 야간선물(관측값), 그 아래 = 업종 이름과 종목 칸.
 *  크기 = 보유 금액, 색 = 종목마다 계산한 예상 시가 변화(어제 종가 기준, 파랑 아래·빨강 위·회색 0),
 *  노란 동그라미 = 밤사이 이어진 소식 수, 점선 테두리 = 관심 종목(보유 없음). 칸을 누르면 종목 창. 글자는 늘 글자색(색만으로 뜻을 전하지 않는다).
 *  11/17 낮 고침: 모델은 시장 → 업종 → 종목으로 나눠 계산하지 않는다. 그래서 맨 위 줄은 색 없이 '실제 값'이라고 적고,
 *  업종 줄은 %(보유 종목 평균일 뿐) 대신 금액 비중만 둔다. 업종 예상으로 읽히면 모델이 하지 않은 주장이 된다. */
const DV = [-0.03, -0.015, -0.003, 0.003, 0.015, 0.03];
export const dvClass = (v) => (v == null ? "dv0" : "dv" + ["n3", "n2", "n1", "0", "p1", "p2", "p3"][DV.filter((t) => v >= t).length]);
export function acctMap(rows, x, newsOf) {
  if (!rows.length) return "";
  const W = 366, G = 3, MH = 30, SH = 26, BODY = 168;
  const total = rows.reduce((a, r) => a + r.value, 0), unit = total > 0 ? total * 0.07 : 1;     // 관심 종목(금액 0)은 작은 칸 하나
  const wt = (r) => (r.value > 0 ? r.value : unit);
  const groups = {}; rows.forEach((r) => (groups[r.s.group || "기타"] = groups[r.s.group || "기타"] || []).push(r));
  let gs = Object.entries(groups).map(([name, rs]) => ({ name, rs: rs.sort((a, b) => wt(b) - wt(a)), w: rs.reduce((a, r) => a + wt(r), 0), val: rs.reduce((a, r) => a + r.value, 0) })).sort((a, b) => b.w - a.w);
  if (gs.length > 4) { const rest = gs.slice(3); gs = [...gs.slice(0, 3), { name: "그 외", rs: rest.flatMap((g) => g.rs), w: rest.reduce((a, g) => a + g.w, 0), val: rest.reduce((a, g) => a + g.val, 0) }]; }
  const sum = gs.reduce((a, g) => a + g.w, 0), inner = W - G * (gs.length - 1), MINW = 92;
  let ws = gs.map((g) => Math.max(MINW, (g.w / sum) * inner)); const k = inner / ws.reduce((a, b) => a + b, 0); ws = ws.map((w) => w * k);
  let h = `<rect x=".5" y=".5" width="${W - 1}" height="${MH - 1}" rx="8" fill="${css("card")}" stroke="${css("line")}"/><text x="10" y="${MH / 2 + 4.2}" font-size="11.5" fill="${css("sub")}">밤사이 실제 값 · 코스피200 야간선물 06:00</text><text x="${W - 10}" y="${MH / 2 + 4.4}" font-size="12.5" font-weight="700" fill="${css("ink")}" text-anchor="end">${x == null ? "–" : pct(x, 2)}</text>`;
  let x0 = 0;
  gs.forEach((g, gi) => {
    const w = ws[gi], y0 = MH + G, share = total > 0 && g.val > 0 ? Math.round((g.val / total) * 100) : null, wide = w > 124 && share != null;
    h += `<rect x="${x0}" y="${y0}" width="${w}" height="${SH}" rx="7" fill="${css("chip")}"/><text x="${x0 + 8}" y="${y0 + SH / 2 + 4}" font-size="11.5" font-weight="650" fill="${css("ink")}">${esc(fit(g.name, w - 14 - (wide ? 54 : 0), 11.5))}</text>${wide ? `<text x="${x0 + w - 8}" y="${y0 + SH / 2 + 4}" font-size="10.5" fill="${css("sub")}" text-anchor="end">비중 ${share}%</text>` : ""}`;
    const body = BODY - G * (g.rs.length - 1), MINH = 30; let hs = g.rs.map((r) => Math.max(MINH, (wt(r) / g.w) * body)); const kk = body / hs.reduce((a, b) => a + b, 0); hs = hs.map((v) => v * kk);
    let y = y0 + SH + G;
    g.rs.forEach((r, i) => {
      const ch = hs[i], n = newsOf(r.s.code), watch = r.value === 0;
      h += `<g class="mcell" data-act="stock" data-code="${r.s.code}" role="button" tabindex="0" aria-label="${esc(r.s.name)} 예상 ${pct(r.s.H)}"><title>${esc(r.s.name)} · 예상 ${pct(r.s.H)}${watch ? " · 관심 종목" : ""}${n ? ` · 밤사이 소식 ${n}건` : ""}</title>
        <rect class="${dvClass(r.s.H)}" x="${x0}" y="${y}" width="${w}" height="${ch}" rx="7" ${watch ? `stroke="${css("mute")}" stroke-dasharray="3 3" stroke-width="1.2"` : ""}/>
        <text x="${x0 + 8}" y="${y + (ch >= 44 ? 18 : ch / 2 + 4)}" font-size="12" font-weight="650" fill="${css("ink")}">${esc(fit(r.s.name, w - 16 - (n ? 22 : 0) - (ch < 44 && w >= 150 ? 44 : 0), 12))}</text>
        ${ch >= 44 || w >= 150 ? `<text x="${ch >= 44 ? x0 + 8 : x0 + w - 8 - (n ? 22 : 0)}" y="${y + (ch >= 44 ? 34 : ch / 2 + 4)}" font-size="11.5" fill="${css("ink2")}" ${ch >= 44 ? "" : 'text-anchor="end"'}>${pct(r.s.H)}</text>` : ""}
        ${n ? `<circle cx="${x0 + w - 14}" cy="${y + (ch >= 44 ? 15 : ch / 2)}" r="8.5" fill="${css("band")}" stroke="${css("card")}" stroke-width="2"/><text x="${x0 + w - 14}" y="${y + (ch >= 44 ? 18.6 : ch / 2 + 3.6)}" font-size="9.5" font-weight="700" fill="#5C4500" text-anchor="middle">${n > 99 ? "99" : n}</text>` : ""}</g>`;
      y += ch + G;
    });
    x0 += w + G;
  });
  const H = MH + G + SH + G + BODY;
  return `<div class="amap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="밤사이 야간선물 값과, 업종별로 묶은 내 종목의 예상 시작가 변화 지도">${h}</svg>
    <div class="amap-key"><span>종목 예상</span><span class="ramp">${["n3", "n2", "n1", "0", "p1", "p2", "p3"].map((c) => `<i class="dv${c}"></i>`).join("")}</span><span>−3%</span><span>어제 종가</span><span>+3%</span><span>크기 = 보유 금액</span><span><i class="nb"></i>밤사이 소식</span></div></div>`;
}
