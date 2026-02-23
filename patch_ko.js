const fs = require('fs');
const file = 'src/messages/ko.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

if (!data.portfolioGuide) {
    data.portfolioGuide = {
        subtitle: "포트폴리오의 각 지표와 화면 구성 요소를 상세히 안내합니다.",
        cards: {
            alphaScore: {
                meaning: "AI가 수익성과 리스크를 종합 분석한 최종 점수",
                desc: {
                    a: "90-100: 최상위 등급, 적극 보유",
                    b: "80-89: 우수 등급, 보유 유지",
                    c: "70-79: 보통 등급, 추세 확인용",
                    d: "60-69: 주의 등급, 비중 축소 고려",
                    f: "0-59: 위험 등급, 매도 검토"
                }
            },
            signalBadge: {
                badge: "AI 의견",
                meaning: "현재 시점의 매매 의견",
                add: "적극 매수/비중 확대",
                hold: "현재 비중 유지",
                watch: "관망 요망",
                trim: "비중 축소/차익 실현"
            },
            confidence: {
                badge: "AI 확신도",
                meaning: "AI 시그널에 대한 데이터 신뢰도",
                high: "데이터 일치도 높음, 신호 신뢰",
                mid: "일부 혼조세, 분할 접근",
                low: "안정적 신호 부재, 보수적 접근"
            },
            sparkline: {
                badge: "5D Flow",
                meaning: "최근 5일간의 단기 모멘텀 흐름",
                descIntro: "선 색상을 통해 단기 추세를 직관적으로 파악합니다.",
                uptrend: "초록선: 단기 상승 추세",
                downtrend: "빨간선: 단기 하락 추세",
                sideways: "회색선: 방향성 부재 (횡보)"
            }
        }
    };
    fs.writeFileSync(file, JSON.stringify(data, null, 4));
    console.log('portfolioGuide added successfully');
} else {
    console.log('portfolioGuide already exists');
}
