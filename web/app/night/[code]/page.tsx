// 예전 주소(/night/종목코드): 종목 창은 밤사이 목록 위에 반쯤 올라오는 창이라 목록으로 보내며 그 종목 창을 연다.
import { redirect } from "next/navigation";

export default async function StockSheetRedirect({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string>> }) {
  const { code } = await params;
  const sp = await searchParams;
  const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && ["d", "p", "v", "o"].includes(k)) as [string, string][]);
  q.set("open", code);
  if (!q.get("d")) q.delete("d");
  redirect(`/night?${q.toString()}`);
}
