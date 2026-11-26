// 홈 '뉴스 브리핑' 카드(배포용 변경 기록 07, 피그마 784:720): 카드 3장을 시장 / 산업 / 내 종목으로 고정. 카드 머리에 구분 이름, 그 아래 주제 제목, 본문, 근거 뉴스 1~2개.
// 시장: 시장 핫이슈 첫 줄(소제목·근거 포함) · 산업: 내 업종 중 밤사이 뉴스가 가장 많은 업종의 한 줄 · 내 종목: 보유 종목 한 줄(긍정·부정 판정 먼저, 2종목까지).
// 산업·내 종목 카드의 짧은 주제 제목은 요약 결과에 아직 없어(지시문 쪽 작업) 업종 이름·종목 이름으로 대신한다.
import Link from "next/link";
import type { Brief, Evidence } from "@/lib/summary";

export type BriefFocus = { codes: string[]; names: Record<string, string>; sectors: string[] };   // 보유 종목(순서대로), 이름, 뉴스 많은 순 내 업종

type Card = { kick: string; title: string | null; body: string; ev: Evidence[] };

function cardsOf(brief: Brief, focus?: BriefFocus): Card[] {
  const out: Card[] = [];
  if (brief.macro[0]) out.push({ kick: "시장", title: brief.headings[0] ?? null, body: brief.macro[0], ev: (brief.evidence[0] ?? []).slice(0, 2) });
  const sector = (focus?.sectors ?? []).find((s) => brief.sectors.get(s)) ?? (focus ? undefined : [...brief.sectors.keys()][0]);
  if (sector) out.push({ kick: `산업 · ${sector}`, title: null, body: brief.sectors.get(sector)!, ev: brief.sectorEv.get(sector) ? [brief.sectorEv.get(sector)!] : [] });
  if (focus) {
    const rank = (c: string) => { const i = brief.companies.get(c)?.impact; return i === "negative" || i === "positive" ? 0 : 1; };
    const picked = focus.codes.filter((c) => brief.companies.get(c)?.line).sort((a, b) => rank(a) - rank(b)).slice(0, 2);
    if (picked.length) out.push({ kick: "내 종목", title: picked.map((c) => focus.names[c] ?? c).join(" · "), body: picked.map((c) => brief.companies.get(c)!.line).join(" "),
      ev: picked.map((c) => brief.companyEv.get(c)).filter(Boolean) as Evidence[] });
  }
  return out;
}

/** 홈 3분 브리핑 카드(배포용 변경 '홈 3분 브리핑: 바텀 시트 없이 카드 넘기기', 피그마 769:6759): 가로로 넘기는 카드 3장 + 마지막 '뉴스 브리핑에서 더 보기' 카드 */
export function BriefCards({ brief, focus, mineFirst }: { brief: Brief; focus?: BriefFocus; mineFirst?: boolean }) {
  // mineFirst: 홈 나눠 보기에서는 내 종목 → 산업 → 시장 순서(2026-11-24 사용자 결정)
  const cards = mineFirst ? cardsOf(brief, focus).reverse() : cardsOf(brief, focus);
  if (!cards.length) return null;
  return (
    <div className="bslide" role="list" aria-label="오늘의 핵심">
      {cards.map((c, i) => (
        <section key={c.kick} className="bpoint bs" role="listitem">
          <p className="bshd"><span className="bk">{c.kick}</span><span className="bn">{i + 1} / {cards.length}</span></p>
          {c.title ? <h3>{c.title}</h3> : null}
          <p>{c.body}</p>
          {c.ev.map((e) => (
            <p key={e.key} className="bev">근거 <a href={e.link} target="_blank" rel="noreferrer noopener">{e.ko ?? e.title}</a></p>
          ))}
        </section>
      ))}
      <Link href="/news" className="bpoint bs bsmore" role="listitem"><b>더 많은 뉴스는<br />뉴스 브리핑에서 봐요</b><span>보러 가기 ›</span></Link>
    </div>
  );
}
