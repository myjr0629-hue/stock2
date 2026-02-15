const fs = require('fs');
const path = require('path');
const base = path.join(__dirname, '..', 'src', 'messages');

const newKeys = {
    dashboard: {
        keyMetrics: { ko: '핵심 지표', en: 'Key Metrics', ja: '主要指標' },
        sentimentNeutral: { ko: '중립', en: 'Neutral', ja: 'ニュートラル' },
        sentimentPositive: { ko: '양호', en: 'Positive', ja: '良好' },
        sentimentCaution: { ko: '주의', en: 'Caution', ja: '注意' },
        noData: { ko: '데이터없음', en: 'No Data', ja: 'データなし' },
        convStrong: { ko: '강한 확신', en: 'Strong Conviction', ja: '強い確信' },
        convBullish: { ko: '상승 우위', en: 'Bullish Bias', ja: '上昇優位' },
        convSlightUp: { ko: '약간 상승', en: 'Slight Upside', ja: 'やや上昇' },
        convNeutral: { ko: '관망', en: 'Wait & See', ja: '様子見' },
        convSlightDown: { ko: '약간 하락', en: 'Slight Downside', ja: 'やや下落' },
        convBearish: { ko: '하락 우위', en: 'Bearish Bias', ja: '下落優位' },
        convStrongDown: { ko: '강한 하락', en: 'Strong Decline', ja: '強い下落' },
        volErupting: { ko: '극단적 변동성 주의', en: 'Extreme Volatility Warning', ja: '極端なボラティリティ注意' },
        volLoaded: { ko: '변동성 축적, 폭발 대기', en: 'Volatility Loaded, Breakout Pending', ja: 'ボラティリティ蓄積、爆発待ち' },
        volCoiling: { ko: '에너지 응축 중', en: 'Energy Coiling', ja: 'エネルギー凝縮中' },
        volStable: { ko: '시장 안정', en: 'Market Stable', ja: '市場安定' },
        overbought: { ko: '과매수', en: 'Overbought', ja: '買われすぎ' },
        oversold: { ko: '과매도', en: 'Oversold', ja: '売られすぎ' },
        rsiNeutral: { ko: '중립', en: 'Neutral', ja: '中立' },
        todayPicks: { ko: '오늘의 진입 종목 12선', en: "Today's Top 12 Picks", ja: '本日の注目12銘柄' },
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
