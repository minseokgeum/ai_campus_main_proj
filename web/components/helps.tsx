"use client";
// 설명 창(피그마 설명 · 믿을 정도 456:7547, 설명 · 서비스 대상 아님 456:7569, 오버레이 · 야간선물 설명 바텀 시트 363:83). 서버·화면 어디서나 쓴다.
import { Sheet } from "@/components/sheet";

export function GradeHelp({ label }: { label?: React.ReactNode }) {
  return (
    <Sheet className={label ? "linkish" : "qmark"} title="믿을 정도가 뭐예요?" confirm="확인" trigger={label ?? <span aria-label="믿을 정도 설명">?</span>}>
      <div className="help">
        <b>한 줄 설명</b><p>장 시작 전 거래(NXT 08:00~08:10)가 가리키는 방향(어제 종가보다 위·아래)대로 9시 시가가 열릴지를 3단계로 알려줘요.</p>
        <b>높음 ●●●</b><p>지난 비슷한 아침에 10번 중 9번 넘게 같은 방향으로 열렸어요.</p>
        <b>보통 ●●○</b><p>10번 중 7~9번 같은 방향이었어요.</p>
        <b>낮음 ●○○</b><p>그보다 낮아요. 장전 거래와 다른 방향으로 열린 날이 많았어요.</p>
        <b>예상 범위와는 따로 봐요</b><p>믿을 정도는 방향만 다뤄요. 시가가 예상 범위 안에 들지는 따로 보고, 장전 거래 가격이 범위를 벗어나면 ‘범위 밖’으로 알려 드려요. 지난 결과는 기록 탭에서 볼 수 있어요.</p>
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

/** 뉴스는 이렇게 모아요(배포용 변경 기록 '뉴스 수집 시간 안내', 피그마 812:1824): 뉴스 브리핑 제목 옆 ? → 모으는 시간·확정 시각.
 *  시각은 서버 일정과 같다(news_search/run_news.py: 전날 23:00 ~ 그날 05:45 수집분, 05:50 확정본) */
export function NewsTimeHelp() {
  return (
    <Sheet className="hq" title="뉴스는 이렇게 모아요" confirm="확인" xToo trigger={<span aria-label="뉴스 모으는 시간 안내">?</span>}>
      <dl className="ntime">
        <div><dt>모으는 시간</dt><dd>전날 밤 11시부터 아침 5시 45분까지</dd></div>
        <div><dt>확정</dt><dd>매일 아침 5시 50분에 오늘 뉴스가 확정돼요</dd></div>
      </dl>
      <p className="ntnote">아침 5시 45분 이후에 나온 뉴스는 오늘 브리핑에 들어가지 않아요.</p>
    </Sheet>
  );
}
