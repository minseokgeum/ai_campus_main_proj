// 불러오는 중(뼈대) — 피그마 '공통/상태 · 불러오는 중'
export default function Loading() {
  return (
    <main className="scroll" aria-busy="true" aria-label="불러오는 중">
      <div className="skel" style={{ height: 44, marginTop: 120 }} />
      <div className="skel" style={{ height: 150, borderRadius: 18 }} />
      <div className="skel" style={{ height: 110 }} />
      <div className="skel" style={{ height: 110 }} />
    </main>
  );
}
