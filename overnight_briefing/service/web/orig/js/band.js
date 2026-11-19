// 노란띠 한 줄: 범위 양 끝·예상 시가 점의 숫자를 늘 보여 주고, 띠 위를 누르거나 끌면 '만약 이 값에 열리면'을 보여 준다.
// 눈금(dom = [왼쪽 끝, 오른쪽 끝])은 한 화면의 모든 종목이 같이 쓴다. 그래야 띠 폭과 위치를 종목끼리 견줄 수 있다.
import { pct, toneP as tone, esc } from "./fmt.js";

const G = 50;                                           // 양쪽에 숫자 자리로 남기는 폭(px)
const frac = (v, dom) => (Math.max(dom[0], Math.min(dom[1], v)) - dom[0]) / (dom[1] - dom[0]);
export const posCss = (v, dom, dx = 0) => `calc(${G + dx}px + (100% - ${2 * G}px) * ${frac(v, dom).toFixed(5)})`;

/** 화면에 나오는 값들을 다 담는 눈금. 11/17(팀 피드백): 0(어제 종가)을 늘 가운데에 둔다.
 *  위·아래를 같은 폭으로 잡아 종목·계좌·화면이 바뀌어도 0 기준선 자리가 같고, 위로 열림·아래로 열림을 같은 눈으로 읽는다. */
export function domain(vals, minWidth = 0.04) {
  const m = Math.max(minWidth / 2, ...vals.map((v) => Math.abs(v))) * 1.04;
  return [-m, m];
}

/** s: 종목(b80, b90, H, grade, y, inb), o: {dom, slot, showActual, pin, wide, avg}
 *  avg: 평균단가를 어제 종가 대비 등락률로 바꾼 값(내가 넣은 평단). 눈금 안이면 세로선, 밖이면 끝에 화살표로 적는다. 눈금은 평단 때문에 넓히지 않는다. */
export function bandHtml(s, o) {
  const { dom, slot } = o, width = dom[1] - dom[0], zone = 0.2 * width;
  const x = (v, dx) => posCss(v, dom, dx);
  const w = (a, b) => `calc((100% - ${2 * G}px) * ${(frac(b, dom) - frac(a, dom)).toFixed(5)})`;
  const [lo, hi] = s.b80, [lo9, hi9] = s.b90;
  const g = slot !== "0730" && s.grade ? s.grade.g : null;
  const act = o.showActual && s.y != null ? s.y : null;
  const out = act != null && !(lo <= act && act <= hi);
  // 실제 시가·장전 거래 표식이 끝 숫자 자리에 오면 숫자를 표식 바깥으로 민다
  const mk = act != null ? act : g;
  const loAt = mk != null && mk < lo && mk > lo - zone ? [mk, -9] : [lo, 0], hiAt = mk != null && mk > hi && mk < hi + zone ? [mk, 9] : [hi, 0];
  const near = (v) => (v == null ? "" : (Math.abs(v - s.H) < 0.25 * width ? " near" : "") + (v > hi && v < hi + zone ? " dim-hi" : "") + (v < lo && v > lo - zone ? " dim-lo" : ""));
  let h = `<div class="band${o.pin != null ? " pinned" + near(o.pin) : ""}" data-band="${s.code}" data-h="${s.H}" data-lo="${lo}" data-hi="${hi}" style="--g:${G}px" role="img" aria-label="${esc(s.name)} 예상 가격대 ${pct(lo)}에서 ${pct(hi)}, 예상 시작가 ${pct(s.H)}">`;
  h += `<i class="track"></i>${o.wide ? `<i class="f90" style="left:${x(lo9)};width:${w(lo9, hi9)}"></i>` : ""}<i class="f80" style="left:${x(lo)};width:${w(lo, hi)}"></i>`;
  h += `<i class="zero" style="left:${x(0)}"></i>`;
  if (o.avg != null && isFinite(o.avg)) {
    if (o.avg >= dom[0] && o.avg <= dom[1]) h += `<i class="avg" style="left:${x(o.avg)}"></i><span class="avg-l" style="left:${x(o.avg)}">평균가</span>`;
  }
  h += `<span class="end lo ${tone(lo)}" style="left:${x(loAt[0], loAt[1])}">${pct(lo)}</span><span class="end hi ${tone(hi)}" style="left:${x(hiAt[0], hiAt[1])}">${pct(hi)}</span>`;
  h += `<i class="dot" style="left:${x(s.H)}"></i><span class="dot-l" style="left:${x(s.H)}">${pct(s.H)}</span>`;
  if (g != null && act == null) h += `<span class="mk" style="left:${x(g)}"><i></i>개장 전 ${pct(g)}</span>`;      // 개장 뒤에는 실제 시가 표식만 두고, 장전 거래는 아래 흐름 줄에 적는다
  if (act != null) h += `<i class="act${out ? " out" : ""}" style="left:${x(act)}"></i><span class="mk actl${out ? " out" : ""}" style="left:${x(act)}"><i></i>실제 ${pct(act)}</span>`;
  if (o.pin != null) h += `<i class="scrub" style="left:${x(o.pin)}"></i><span class="bubble" style="left:${x(o.pin)}">${pct(o.pin)}에 열리면</span>`;
  return h + "</div>";
}

/** 띠 위 누르기·끌기·올려 두기. onMove(code, v|null, pinned) */
export function bindBands(root, getDom, onMove) {
  root.querySelectorAll("[data-band]").forEach((el) => {
    const code = el.dataset.band, H = +el.dataset.h, lo = +el.dataset.lo, hi = +el.dataset.hi, was = el.className;
    const val = (e) => {
      const r = el.getBoundingClientRect(), dom = getDom();
      const f = Math.max(0, Math.min(1, (e.clientX - r.left - G) / (r.width - 2 * G)));
      return Math.round((dom[0] + f * (dom[1] - dom[0])) * 1000) / 1000;          // 0.1% 단위
    };
    let down = false;
    const show = (v) => {
      const dom = getDom(), width = dom[1] - dom[0], zone = 0.2 * width;
      el.classList.add("scrubbing");
      el.classList.toggle("near", Math.abs(v - H) < 0.25 * width); el.classList.toggle("dim-hi", v > hi && v < hi + zone); el.classList.toggle("dim-lo", v < lo && v > lo - zone);
      let s = el.querySelector(".scrub.live"), b = el.querySelector(".bubble.live");
      if (!s) { el.insertAdjacentHTML("beforeend", '<i class="scrub live"></i><span class="bubble live"></span>'); s = el.querySelector(".scrub.live"); b = el.querySelector(".bubble.live"); }
      const left = posCss(v, dom);
      s.style.left = left; b.style.left = left; b.textContent = pct(v) + "에 열리면";
      el.querySelectorAll(".scrub:not(.live), .bubble:not(.live)").forEach((n) => (n.style.display = "none"));
    };
    const clear = () => { el.className = was; el.querySelectorAll(".live").forEach((n) => n.remove()); el.querySelectorAll(".scrub, .bubble").forEach((n) => (n.style.display = "")); };
    el.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; down = true; el.setPointerCapture(e.pointerId); const v = val(e); show(v); onMove(code, v, false); });
    el.addEventListener("pointermove", (e) => { if (!down && e.pointerType !== "mouse") return; const v = val(e); show(v); onMove(code, v, false); });
    el.addEventListener("pointerup", (e) => { if (!down) return; down = false; const v = val(e); clear(); onMove(code, v, true); });
    el.addEventListener("pointercancel", () => { down = false; clear(); onMove(code, null, false); });
    el.addEventListener("pointerleave", () => { if (!down) { clear(); onMove(code, null, false); } });
  });
}
