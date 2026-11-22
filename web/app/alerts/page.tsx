// 알림(피그마 465:8273): 오늘·어제의 아침 모델 소식(07:30 예상, 08:11 범위 밖, 09:05 채점)을 내 보유 종목 기준으로 모아 보여 준다.
// 휴대폰 푸시는 보내지 않는다(사용자 결정). 알림 설정 화면은 모양만 있다.
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { portfolio } from "@/lib/portfolio";
import { dayModel, modelDates } from "@/lib/model";
import { account, buildRows, P } from "@/lib/night";
import { addDays, kstNow } from "@/lib/calendar";
import { dateLabel } from "@/lib/format";
import { isoDay } from "@/lib/model";
import { pct, swon } from "@/lib/format";
import { appNow } from "@/lib/clock";
import { checkTime } from "@/lib/marketdays";

export const dynamic = "force-dynamic";

type Note = { at: string; icon: "warn" | "star" | "check"; title: string; body: string; href: string; fresh: boolean };

export default async function Alerts() {
  const user = await requireUser();
  const [pf, dates] = await Promise.all([portfolio(user.id), modelDates(2)]);
  const today = kstNow(await appNow()).ymd;
  const items = pf.holdings.map((h) => ({ code: h.code, qty: h.qty }));
  const days: { label: string; notes: Note[] }[] = [];
  for (const t of dates) {
    const m = await dayModel(t);
    if (!m?.card || m.card.status !== "ok") continue;
    const notes: Note[] = [];
    const pre = buildRows(m, items, "pre");
    const a = account(pre);
    if (m.check) {
      const post = buildRows(m, items, "post").filter((r) => r.c);
      notes.push({ at: m.check.checkedAt ?? checkTime(t)[0], icon: "check", title: "채점 결과가 나왔어요", body: `${post.length}종목 중 ${post.filter((r) => r.c!.in80).length}종목이 예상 범위 안에서 시작했어요`, href: `/night/record`, fresh: t === today });
    }
    const out = pre.filter((r) => r.kind === "out");
    if (m.card.slot === "0811" && out.length)
      notes.push({ at: "08:11", icon: "warn", title: `NXT 체결가가 범위 밖인 종목이 ${out.length}개예요`, body: `${out.slice(0, 3).map((r) => r.name).join(" · ")} — 시가 주문 전에 확인해 보세요`, href: `/night?d=${t}&f=out`, fresh: t === today });
    notes.push({ at: "07:30", icon: "star", title: "오늘 시가 예상이 나왔어요", body: `오늘 시가 예상 ${swon(a.amount)} (${pct(P(a.pct))})`, href: `/night?d=${t}`, fresh: t === today });
    days.push({ label: t === today ? "오늘" : t === addDays(today, -1) ? "어제" : dateLabel(isoDay(t)), notes });
  }
  return (
    <>
      <main className="sheet">
        <div className="shead"><Link href="/" aria-label="뒤로">‹</Link><span className="ttl">알림</span><Link href="/settings/alerts" className="right">알림 설정</Link></div>
        {!days.length ? <p className="state">아직 알림이 없어요.</p> : days.map((d) => (
          <section key={d.label} className="alist">
            <h3>{d.label}</h3>
            {d.notes.map((n) => (
              <Link key={n.at + n.title} href={n.href} className="anote">
                <span className={`ai-ic ${n.icon}`}>{n.icon === "warn" ? "!" : n.icon === "check" ? "✓" : "☀"}</span>
                <span className="ab"><b>{n.title}</b><small>{n.body}</small></span>
                <span className="at">{n.at}{n.fresh ? <i /> : null}</span>
              </Link>
            ))}
          </section>
        ))}
        <p className="fine">알림은 30일 동안 보관돼요.</p>
      </main>
    </>
  );
}
