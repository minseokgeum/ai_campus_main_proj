// 탈퇴 완료(피그마 539:6336)
import Link from "next/link";

export default function Bye() {
  return (
    <main className="login">
      <h1>탈퇴가 끝났어요</h1>
      <p className="lead">그동안 이용해 주셔서 고마워요. 계정과 보유 종목을 모두 지웠어요.</p>
      <div className="lform"><Link href="/start" className="primary">처음 화면으로</Link></div>
    </main>
  );
}
