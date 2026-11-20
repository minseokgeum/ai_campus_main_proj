"use client";
// 불러오지 못함(다시 시도) — 피그마 '공통/상태 · 불러오지 못함'
export default function ErrorState({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="state" role="alert">
      <p>불러오지 못했어요.<br />잠시 뒤 다시 시도해 주세요.</p>
      <button className="retry" onClick={() => reset()}>다시 시도</button>
    </div>
  );
}
