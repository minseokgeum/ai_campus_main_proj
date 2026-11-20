// 3분 브리핑 창(피그마 199:121 · 205:121): 오늘의 핵심 3가지. 제목·소제목은 news_headline, 본문은 시장 핫이슈, 근거는 그 줄의 기사.
import Link from "next/link";
import { Sheet } from "@/components/sheet";
import type { Brief } from "@/lib/summary";
import { dateLabel } from "@/lib/format";

export function BriefSheet({ brief, date, trigger, className }: { brief: Brief; date: string; trigger: React.ReactNode; className?: string }) {
  if (!brief.macro.length) return <Link href="/news" className={className}>{trigger}</Link>;
  return (
    <Sheet className={className} title={brief.title ?? "오늘의 핵심 3가지"} sub={`${dateLabel(date)} 06:00 KST 기준`} trigger={trigger}
      kicker={<p className="bkick">오늘의 핵심 3가지 <span>AI 요약</span></p>}>
      <hr className="bdiv" />
      {brief.macro.map((line, i) => (
        <section key={i} className="bpoint">
          <h3><i>{i + 1}</i>{brief.headings[i] ?? `핵심 ${i + 1}`}</h3>
          <p>{line}</p>
          {(brief.evidence[i] ?? []).map((e) => (
            <p key={e.key} className="bev">근거 <a href={e.link} target="_blank" rel="noreferrer noopener">{e.ko ?? e.title}</a></p>
          ))}
        </section>
      ))}
      <Link href="/news" className="cta bmore">뉴스 브리핑에서 더 보기</Link>
    </Sheet>
  );
}
