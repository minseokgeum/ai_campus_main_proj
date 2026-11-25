// 숫자·글자 표기와 작은 그림 조각. 계산 규칙은 여기 없다.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const tone = (v) => (v == null || Number.isNaN(v) ? "flat" : v > 0 ? "up" : v < 0 ? "down" : "flat");
export const toneP = (v, d = 1) => tone(v == null ? v : Math.round(v * 10 ** (d + 2)) / 10 ** (d + 2));   // 화면에 보이는 자릿수로 반올림한 뒤의 색
const sign = (v) => (v > 0 ? "+" : v < 0 ? "−" : "");
export const pct = (v, d = 1) => (v == null ? "–" : sign(round(v * 100, d)) + Math.abs(v * 100).toFixed(d) + "%");
export const pct2 = (v) => pct(v, 2);
export function gradeText(g) {
  if (!Number.isFinite(g?.p) || g.p < 0 || g.p > 1) return g?.level ?? "등급 없음";
  // 기존 카드는 정밀한 p로 등급을 나눈 뒤 소수 세 자리까지 저장했다.
  if (g.level === "낮음" && g.p === 0.75) return "낮음 (75% 미만)";
  if (g.level === "보통" && g.p === 0.9) return "보통 (90% 미만)";
  if (g.p === 1) return `${g.level} (99.9% 이상)`;
  return `${g.level} (${Number((100 * g.p).toFixed(1))}%)`;
}
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
/** 11/20: 금액 가리기(지하철 등). 켜면 원 단위 금액만 ••••로, %는 그대로 */
export const MASK = { on: false };
const won0 = (v, signed = true) => (v == null ? "–" : (signed ? sign(Math.round(v)) : "") + Math.abs(Math.round(v)).toLocaleString("ko-KR") + "원");
export const num = (v) => (v == null ? "–" : Math.round(v).toLocaleString("ko-KR"));
export const won = (v, signed = true) => (MASK.on && v != null ? "••••원" : won0(v, signed));
export const man = (v, signed = true) => (MASK.on && v != null ? "••••원" : man0(v, signed));
function man0(v, signed = true) {          // 만원 단위로 짧게
  if (v == null) return "–";
  const a = Math.abs(v) / 1e4;
  const s = a >= 1e4 ? (a / 1e4).toFixed(2).replace(/\.?0+$/, "") + "억" : a >= 100 ? Math.round(a).toLocaleString("ko-KR") + "만" : a.toFixed(1) + "만";
  return (signed ? sign(v) : "") + s + "원";
}
export const tick = (p) => {                       // 호가 단위로 맞춘 가격(유가증권 기준)
  const u = p < 2000 ? 1 : p < 5000 ? 5 : p < 20000 ? 10 : p < 50000 ? 50 : p < 200000 ? 100 : p < 500000 ? 500 : 1000;
  return Math.round(p / u) * u;
};
export const dlabel = (T) => { const d = new Date(+T.slice(0, 4), +T.slice(4, 6) - 1, +T.slice(6)); return `${d.getMonth() + 1}/${d.getDate()}(${"일월화수목금토"[d.getDay()]})`; };
const HUES = [212, 262, 338, 18, 150, 190, 42, 286];
export const avatar = (code, name) => `<span class="avatar" style="background:hsl(${HUES[[...code].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length]} 52% 46%)">${esc(name.replace(/^(HD|LS|SK|KB|LG|GS|KT)/, "").trim().slice(0, 1) || name.slice(0, 1))}</span>`;
export const I = {
  chev: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l4 4-4 4"/></svg>',
  down: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5l4 4 4-4"/></svg>',
  arrow: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>',
  sm: '<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.5h7M6 2.5l3 3-3 3"/></svg>',
  back: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 4.5L7 11l6.5 6.5"/></svg>',
  moon: '<svg width="40" height="40" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#008C82"/><path d="M20.5 7.5a9.5 9.5 0 1 0 4 15.8 8 8 0 1 1-4-15.8z" fill="#FFD95A"/></svg>',
  hostLogo: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="7" fill="#3E4A5B"/><path d="M6 15.5l4-4.2 3 2.8 5-6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  host: {   // 11/20: 증권사 앱(예시) 하단 메뉴. 특정 증권사 모양을 따라 하지 않는 일반 아이콘
    home: '<svg viewBox="0 0 24 24"><path d="M4 11.2L12 4.5l8 6.7V19a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 19z"/><path d="M9.5 20v-5h5v5"/></svg>',
    watch: '<svg viewBox="0 0 24 24"><path d="M12 19.5s-7.5-4.4-7.5-9.6A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.5c0 5.2-7.5 9.6-7.5 9.6z"/></svg>',
    quote: '<svg viewBox="0 0 24 24"><path d="M3.5 17l5-5.5 4 3.5 7-8"/><path d="M15 7h4.5v4.5"/></svg>',
    order: '<svg viewBox="0 0 24 24"><path d="M6 8.5h13l-3.5-3.5M18 15.5H5l3.5 3.5"/></svg>',
    acct: '<svg viewBox="0 0 24 24"><rect x="3.5" y="6" width="17" height="13" rx="2.2"/><path d="M3.5 10h17M15.5 14.5h2"/></svg>',
  },
  eye: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 9s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5z"/><circle cx="9" cy="9" r="2.2"/></svg>',
  eyeOff: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2l14 14M7.3 4.2A7.6 7.6 0 0 1 9 4c4.7 0 7.5 5 7.5 5a12.8 12.8 0 0 1-2.3 2.9M5 5.6C2.8 7 1.5 9 1.5 9s2.8 5 7.5 5c1.2 0 2.3-.3 3.2-.8"/></svg>',
  minus: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7h8"/></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7h8M7 3v8"/></svg>',
  x: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 3l8 8M11 3l-8 8"/></svg>',
  warn: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.2l6.2 10.9H1.8L8 2.2zM8 6.5v3.2M8 11.6v.1"/></svg>',
  info: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="6.2"/><path d="M8 7.4v3.4M8 5.2v.1"/></svg>',
  news: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2" width="9" height="8" rx="1.5"/><path d="M4 4.8h4M4 7.2h2.5"/></svg>',
  check: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5l3.2 3.2L14 5.8"/></svg>',
  undo: '<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 5.2h5.2a2.8 2.8 0 0 1 0 5.6H5.4M2.5 5.2l2.3-2.3M2.5 5.2l2.3 2.3"/></svg>',
  tabs: {
    brief: '<svg viewBox="0 0 24 24"><path d="M4 11.2L12 4.5l8 6.7V19a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 19v-7.8z"/><path d="M9.5 20.2v-5.4h5v5.4"/></svg>',
    night: '<svg viewBox="0 0 24 24"><path d="M3.5 16.5l4.6-5 3.6 3.2 4.3-6.2 4.5 4.6"/><path d="M3.5 20.2h17"/></svg>',
    news: '<svg viewBox="0 0 24 24"><rect x="4" y="4.5" width="16" height="15" rx="2.2"/><path d="M8 9h8M8 12.5h8M8 16h4.5"/></svg>',
    graph: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.4"/><circle cx="17.5" cy="6" r="2.4"/><circle cx="17.5" cy="18" r="2.4"/><path d="M8.2 10.9l7.1-3.8M8.2 13.1l7.1 3.8"/></svg>',
    record: '<svg viewBox="0 0 24 24"><path d="M5 19.5V11M10 19.5V5.5M15 19.5v-6M20 19.5V8.5"/></svg>',
    mine: '<svg viewBox="0 0 24 24"><rect x="3.5" y="7" width="17" height="12.5" rx="2.2"/><path d="M9 7V5.6c0-.6.5-1.1 1.1-1.1h3.8c.6 0 1.1.5 1.1 1.1V7M3.5 12.5h17"/></svg>',
  },
  search: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="7" cy="7" r="4.6"/><path d="M10.5 10.5L14 14"/></svg>',
  ext: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2.5H2.5v7h7V7M7 2.5h2.5V5M9.5 2.5L5.5 6.5"/></svg>',
};
export const priceShort = (p) => (p >= 1e6 ? (p / 1e4).toLocaleString("ko-KR", { maximumFractionDigits: 1 }) + "만" : Math.round(p).toLocaleString("ko-KR"));   // 좁은 줄에서 100만원 넘는 가격은 만원 단위로

/** ISO(UTC) → 한국 시각 '11/16 05:12' */
export const kst = (iso) => {
  const d = new Date(iso || ""); if (Number.isNaN(d.getTime())) return "";
  const k = new Date(d.getTime() + 9 * 3600e3), p = (n) => String(n).padStart(2, "0");
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
};
/** AI가 쓴 문장 앞에 붙이는 표시 */
export const AI = '<span class="ai" title="AI가 기사와 숫자를 읽고 쓴 문장이에요">AI</span>';
