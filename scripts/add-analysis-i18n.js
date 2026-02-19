const fs = require('fs');
const path = require('path');

const analysisKeys = {
    ko: {
        regimeLong: "Long Gamma(변동성 억제)",
        regimeShort: "Short Gamma(변동성 확대)",
        regimeNeutral: "중립",
        pcrBullish: "강세 포지셔닝",
        pcrBearish: "약세 포지셔닝",
        pcrBalanced: "균형 포지셔닝",
        rsiOversold: "과매도",
        rsiOverbought: "과매수",
        rvolSurge: "거래량 급증",
        rvolWeak: "거래량 부진",
        maxPainAbove: "상단",
        maxPainBelow: "하단",
        callWallNear: "Call Wall ${wall} 근접(${dist}%), 돌파 시 감마스퀴즈 가능.",
        putFloorNear: "Put Floor ${floor} 근접(${dist}%), 하방 지지 예상.",
        verdictBuyDip: "조정 시 매수 기회",
        verdictHold: "보유 유지",
        verdictHedge: "헷지 권고",
        verdictTrim: "일부 차익실현 고려",
        closedVsMaxPain: "Max Pain $${mp} 대비 ${dir} ${dist}% 마감."
    },
    en: {
        regimeLong: "Long Gamma (vol suppressed)",
        regimeShort: "Short Gamma (vol expanding)",
        regimeNeutral: "Neutral",
        pcrBullish: "Bullish positioning",
        pcrBearish: "Bearish positioning",
        pcrBalanced: "Balanced positioning",
        rsiOversold: "Oversold",
        rsiOverbought: "Overbought",
        rvolSurge: "Volume surge",
        rvolWeak: "Low volume",
        maxPainAbove: "above",
        maxPainBelow: "below",
        callWallNear: "Call Wall $${wall} nearby (${dist}%), gamma squeeze possible on break.",
        putFloorNear: "Put Floor $${floor} nearby (${dist}%), downside support expected.",
        verdictBuyDip: "Buy the dip opportunity",
        verdictHold: "Hold position",
        verdictHedge: "Hedge recommended",
        verdictTrim: "Consider partial profit-taking",
        closedVsMaxPain: "Closed ${dist}% ${dir} Max Pain $${mp}."
    },
    ja: {
        regimeLong: "Long Gamma（ボラ抑制）",
        regimeShort: "Short Gamma（ボラ拡大）",
        regimeNeutral: "中立",
        pcrBullish: "強気ポジション",
        pcrBearish: "弱気ポジション",
        pcrBalanced: "均衡ポジション",
        rsiOversold: "売られ過ぎ",
        rsiOverbought: "買われ過ぎ",
        rvolSurge: "出来高急増",
        rvolWeak: "出来高低迷",
        maxPainAbove: "上方",
        maxPainBelow: "下方",
        callWallNear: "Call Wall $${wall}接近(${dist}%)、突破でガンマスクイーズの可能性。",
        putFloorNear: "Put Floor $${floor}接近(${dist}%)、下方支持予想。",
        verdictBuyDip: "押し目買い機会",
        verdictHold: "保有維持",
        verdictHedge: "ヘッジ推奨",
        verdictTrim: "一部利益確定検討",
        closedVsMaxPain: "Max Pain $${mp}対比${dir}${dist}%引け。"
    }
};

['ko', 'en', 'ja'].forEach(lang => {
    const filePath = path.join(__dirname, '..', 'src', 'messages', lang + '.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    data.tacticalReport.analysis = analysisKeys[lang];
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4) + '\n', 'utf8');
    console.log(lang + ': OK - added tacticalReport.analysis keys');
});
