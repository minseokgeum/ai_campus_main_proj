"use client";
// 뉴스 브리핑을 불러오지 못함(배포 784:2173)
export default function NewsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="statebox gray" role="alert">
      <span className="mk" aria-hidden>!</span>
      <b>불러오지 못했어요</b>
      <p>뉴스를 불러오지 못했어요.<br />잠시 후 다시 시도해 주세요.</p>
      <button type="button" className="sb" onClick={() => reset()}>다시 시도</button>
    </div>
  );
}
