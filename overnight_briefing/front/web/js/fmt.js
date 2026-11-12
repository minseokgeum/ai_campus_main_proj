// 숫자·글자 표기와 작은 그림 조각. 계산 규칙은 여기 없다.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const tone = (v) => (v == null || Number.isNaN(v) ? "flat" : v > 0 ? "up" : v < 0 ? "down" : "flat");
export const toneP = (v, d = 1) => tone(v == null ? v : Math.round(v * 10 ** (d + 2)) / 10 ** (d + 2));   // 화면에 보이는 자릿수로 반올림한 뒤의 색
const sign = (v) => (v > 0 ? "+" : v < 0 ? "−" : "");
export const pct = (v, d = 1) => (v == null ? "–" : sign(round(v * 100, d)) + Math.abs(v * 100).toFixed(d) + "%");
export const pct2 = (v) => pct(v, 2);
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
export const won = (v, signed = true) => (v == null ? "–" : (signed ? sign(Math.round(v)) : "") + Math.abs(Math.round(v)).toLocaleString("ko-KR") + "원");
export const num = (v) => (v == null ? "–" : Math.round(v).toLocaleString("ko-KR"));
export function man(v, signed = true) {          // 만원 단위로 짧게
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
  },
};
export const priceShort = (p) => (p >= 1e6 ? (p / 1e4).toLocaleString("ko-KR", { maximumFractionDigits: 1 }) + "만" : Math.round(p).toLocaleString("ko-KR"));   // 좁은 줄에서 100만원 넘는 가격은 만원 단위로
