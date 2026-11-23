"use client";
// 설명 창(피그마 설명 · 믿을 정도 456:7547, 설명 · 서비스 대상 아님 456:7569, 오버레이 · 야간선물 설명 바텀 시트 363:83). 서버·화면 어디서나 쓴다.
import { Sheet } from "@/components/sheet";

export function GradeHelp({ label }: { label?: React.ReactNode }) {
  return (
    <Sheet className={label ? "linkish" : "qmark"} title="믿을 정도가 뭐예요?" confirm="확인" trigger={label ?? <span aria-label="믿을 정도 설명">?</span>}>
      <div className="help">
        <b>한 줄 설명</b><p>08:11에는 장 시작 전 거래(NXT 08:00~08:10)로 예상을 한 번 더 계산해요(2차 예측). 믿을 정도는 07:30 예상(1차)과 08:11 예상(2차)이 얼마나 가까운지예요.</p>
        <b>높음 ●●●</b><p>1차·2차가 가까워요. 지난 기록에서 시가가 07:30 예상 범위 안에서 열린 날이 10번 중 9번이에요.</p>
        <b>보통 ●●○</b><p>조금 달라요. 10번 중 8번이었어요.</p>
        <b>낮음 ●○○</b><p>크게 달라요. 10번 중 3번뿐이라, 2차 예측을 기준으로 보되 오차가 클 수 있으니 주의해서 보세요.</p>
        <b>장전 거래가 없으면</b><p>믿을 정도 없이 07:30 예상만 보여 드려요. 9시 전에 새 가격이 나오지 않는 종목이에요.</p>
        <b>방향 유지는 따로 봐요</b><p>장전 거래 방향(오름·내림)대로 시가가 열릴 가능성은 종목 화면의 ‘방향 유지’에 있어요. 숫자는 규칙을 고정한 뒤 15거래일(3,000종목-날) 기록이에요. 지난 결과는 기록 탭에서 볼 수 있어요.</p>
      </div>
    </Sheet>
  );
}

export function NotServiceHelp({ label = "서비스 대상 아님이 뭐예요?" }: { label?: string }) {
  return (
    <Sheet className="linkish" title="서비스 대상 아님은 뭐예요?" confirm="확인" trigger={<span>{label}</span>}>
      <div className="help">
        <b>한 줄 설명</b><p>이 종목은 오늘 예상 시가 범위를 계산하지 않아요.</p>
        <b>어떤 종목인가요?</b><p>코스피 전체와 코스닥150 밖의 종목(코스닥 나머지·ETF·해외 종목 등)이에요. 상장한 지 얼마 안 된 종목처럼 비슷한 아침의 기록이 충분하지 않은 종목도 계산하지 못해요.</p>
        <b>계좌 금액은요?</b><p>계좌 예상 금액에는 어제 종가 그대로 넣어요.</p>
        <b>나중에는요?</b><p>기록이 쌓여 대상이 되면 자동으로 예상이 시작돼요.</p>
        <b>모델 설계 밖 종목은요?</b><p>서비스 대상이지만 모델을 설계할 때 쓰지 않은 종목이에요. 같은 규칙으로 계산하되 과거 검증은 설계 종목(코스피 150 + 코스닥 50)으로만 했어요.</p>
      </div>
    </Sheet>
  );
}

export function FuturesHelp() {
  return (
    <Sheet className="qmark" title="코스피200 야간선물이란?" confirm="확인" trigger={<span aria-label="야간선물 설명">?</span>}>
      <div className="help">
        <b>코스피200</b><p>코스피 대형주 200개로 만든 지수예요. 삼성전자, SK하이닉스 같은 큰 종목이 들어 있어요.</p>
        <b>야간선물</b><p>이 지수의 앞으로의 가격을 미리 사고파는 거래예요. 한국 증시가 닫힌 뒤에도 오후 6시부터 다음 날 오전 6시까지 거래돼요.</p>
        <b>왜 보나요?</b><p>밤사이 미국 증시 같은 해외 소식이 먼저 반영돼서, 오늘 아침 코스피가 어떻게 시작할지 가늠하는 참고 지표로 많이 봐요.</p>
        <b>등락률 기준</b><p>어제 오후 정규장 마감 가격과 비교한 값이에요. 실제 오늘 시초가와는 차이가 날 수 있어요.</p>
      </div>
    </Sheet>
  );
}

/** 뉴스는 이렇게 모아요(배포용 변경 기록 '뉴스 수집 시간 안내', 피그마 812:1824): 뉴스 브리핑 제목 옆 ? → 모으는 시간·공개 시각.
 *  시각은 서버 일정과 같다(news_search/run_news.py: 전날 23:00 ~ 그날 06:15 발행분, 06:20 확정본, 06:30 공개. 2026-11-23) */
export function NewsTimeHelp() {
  return (
    <Sheet className="hq" title="뉴스는 이렇게 모아요" confirm="확인" xToo trigger={<span aria-label="뉴스 모으는 시간 안내">?</span>}>
      <dl className="ntime">
        <div><dt>모으는 뉴스</dt><dd>전날 밤 11시부터 아침 6시 15분까지 나온 뉴스</dd></div>
        <div><dt>공개</dt><dd>매일 아침 6시 30분에 오늘 브리핑이 나와요</dd></div>
      </dl>
      <p className="ntnote">아침 6시 15분 이후에 나온 뉴스는 오늘 브리핑에 들어가지 않아요.</p>
    </Sheet>
  );
}
