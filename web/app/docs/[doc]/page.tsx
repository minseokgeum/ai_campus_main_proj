// 약관 · 문서 보기(피그마 539:6355)
import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS, type DocKey } from "@/lib/docs";

export default async function Doc({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const d = DOCS[doc as DocKey];
  if (!d) notFound();
  return (
    <main className="sheet">
      <div className="shead"><Link href="/my" aria-label="뒤로">‹</Link><span className="ttl">{d.title}</span></div>
      <p className="fine dsince">시행일 {d.since}</p>
      <div className="docbody">{d.body.map(([h, p], i) => <section key={i}><h3>{h}</h3><p>{p}</p></section>)}</div>
    </main>
  );
}
