const fs = require('fs');
const path = require('path');
const base = path.join(__dirname, '..', 'src', 'messages');

const newKeys = {
    dashboard: {
        // Conviction Matrix descriptions (line 1033)
        convDescStrongBuy: { ko: '강한 매수 시그널', en: 'Strong Buy Signal', ja: '強い買いシグナル' },
        convDescBuy: { ko: '매수 우위', en: 'Buy Bias', ja: '買い優位' },
        convDescSell: { ko: '매도 시그널', en: 'Sell Signal', ja: '売りシグナル' },
        convDescBearish: { ko: '약세 우위', en: 'Bearish Bias', ja: '弱気優位' },
        convDescSearching: { ko: '방향성 탐색 중', en: 'Searching Direction', ja: '方向感模索中' },
        convDescCalc: { ko: '계산중...', en: 'Calculating...', ja: '計算中...' },
        convComposite: { ko: 'SMA + VWAP + PCR + GEX + Flow 종합', en: 'SMA + VWAP + PCR + GEX + Flow Composite', ja: 'SMA + VWAP + PCR + GEX + Flow 総合' },

        // VWAP descriptions (line 1063, 1081, 1083)
        vwapAbove: { ko: 'VWAP 상회 → 매수세 우위', en: 'Above VWAP → Buy Pressure', ja: 'VWAP上回り → 買い圧力優位' },
        vwapBelow: { ko: 'VWAP 하회 → 매도세 우위', en: 'Below VWAP → Sell Pressure', ja: 'VWAP下回り → 売り圧力優位' },
        vwapNear: { ko: 'VWAP 근접 → 중립 구간', en: 'Near VWAP → Neutral Zone', ja: 'VWAP付近 → 中立圏' },
        vwapDeviation: { ko: '현재가 대비', en: 'Price vs', ja: '現在値対比' },
        vwapDeviationSuffix: { ko: '% 괴리', en: '% deviation', ja: '%乖離' },
        vwapFullDesc: { ko: '장중 거래량 가중 평균', en: 'Volume-Weighted Average Price', ja: '出来高加重平均価格' },

        // Squeeze Detection (line 1095)
        sqCritical: { ko: '숏커버 폭발 위험', en: 'Short Squeeze Risk Critical', ja: 'ショートスクイーズ危険' },
        sqHigh: { ko: '숏커버 가능성 높음', en: 'Short Squeeze Risk High', ja: 'ショートスクイーズ可能性高い' },
        sqMedium: { ko: '공매도 보통', en: 'Short Interest Normal', ja: '空売り通常水準' },
        sqLow: { ko: '공매도 위험 낮음', en: 'Short Interest Low Risk', ja: '空売りリスク低い' },
        sqDaysToCover: { ko: '상환', en: 'Cover', ja: '返済' },
        sqDays: { ko: '일', en: 'd', ja: '日' },
        sqShortRatio: { ko: '공매도비', en: 'Short %', ja: '空売り比率' },

        // Analyst Consensus (line 1134)
        analystStrongBuy: { ko: '적극 매수', en: 'Strong Buy', ja: '強い買い' },
        analystBuy: { ko: '매수', en: 'Buy', ja: '買い' },
        analystHold: { ko: '보유', en: 'Hold', ja: '保有' },
        analystSell: { ko: '매도', en: 'Sell', ja: '売り' },
        analystStrongSell: { ko: '적극 매도', en: 'Strong Sell', ja: '強い売り' },
        analystBuyReco: { ko: '매수 추천', en: 'Buy Rating', ja: '買い推奨' },
        analystOfTotal: { ko: '명 중', en: 'of', ja: '名中' },

        // Institutional Radar (line 1194)
        instAccum: { ko: '기관 매집 시그널', en: 'Institutional Accumulation', ja: '機関買い集めシグナル' },
        instDist: { ko: '기관 이탈 시그널', en: 'Institutional Distribution', ja: '機関売り抜けシグナル' },
        instNormal: { ko: '기관 거래 정상 범위', en: 'Institutional Flow Normal', ja: '機関取引正常範囲' },
        instDarkPool: { ko: '다크풀', en: 'Dark Pool', ja: 'ダークプール' },
        instBlock: { ko: '블록', en: 'Block', ja: 'ブロック' },
        instTrades: { ko: '건', en: 'trades', ja: '件' },

        // SMA Phase (line 1226)
        smaGolden: { ko: '강세 전환', en: 'Golden Cross', ja: '強気転換' },
        smaDead: { ko: '약세 전환', en: 'Dead Cross', ja: '弱気転換' },
        smaAbove: { ko: '상승 추세', en: 'Uptrend', ja: '上昇トレンド' },
        smaBelow: { ko: '하락 추세', en: 'Downtrend', ja: '下落トレンド' },
        smaDeviation: { ko: 'SMA 괴리', en: 'SMA Gap', ja: 'SMA乖離' },
        smaCrossImminent: { ko: '교차 임박', en: 'Cross Imminent', ja: 'クロス間近' },

        // Fundamental (line 1266)
        fundCollecting: { ko: '데이터 수집 중', en: 'Collecting Data', ja: 'データ収集中' },
        fundExcellent: { ko: '재무 우수', en: 'Excellent Financials', ja: '財務優秀' },
        fundGood: { ko: '재무 양호', en: 'Good Financials', ja: '財務良好' },
        fundAvg: { ko: '재무 보통', en: 'Average Financials', ja: '財務普通' },
        fundCaution: { ko: '주의 필요', en: 'Needs Caution', ja: '注意必要' },
        fundGradeCollecting: { ko: '수집중', en: 'Loading', ja: '収集中' },
        fundRevenue: { ko: '매출', en: 'Revenue', ja: '売上' },
        fundMargin: { ko: '마진', en: 'Margin', ja: 'マージン' },
        fundApiWaiting: { ko: 'Financial API 연결 대기', en: 'Financial API Pending', ja: 'Financial API接続待ち' },

        // Earnings (line 1314)
        earnToday: { ko: '오늘 실적 발표!', en: 'Earnings Today!', ja: '本日決算発表！' },
        earnImminent: { ko: '실적 발표 임박', en: 'Earnings Imminent', ja: '決算発表間近' },
        earnDaysLater: { ko: '일 후 실적', en: 'd until earnings', ja: '日後決算' },
        earnDaysAfter: { ko: '일 후', en: 'd away', ja: '日後' },
    }
};

['ko', 'en', 'ja'].forEach(lang => {
    const filePath = path.join(base, lang + '.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let added = 0;
    Object.entries(newKeys).forEach(([ns, keys]) => {
        if (!data[ns]) data[ns] = {};
        Object.entries(keys).forEach(([key, vals]) => {
            if (!data[ns][key]) {
                data[ns][key] = vals[lang];
                added++;
            }
        });
    });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4) + '\n', 'utf8');
    console.log(lang + ': added ' + added + ' keys');
});
console.log('Done!');
