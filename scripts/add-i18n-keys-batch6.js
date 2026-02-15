const fs = require('fs');
const path = require('path');
const basePath = path.join(__dirname, '..', 'src', 'messages');

const keys = {
    // MarketBreadthPanel — signal labels
    signalStrong: { ko: '강세', en: 'Strong', ja: '強気' },
    signalHealthy: { ko: '건강', en: 'Healthy', ja: '健全' },
    signalNeutral: { ko: '중립', en: 'Neutral', ja: '中立' },
    signalWeak: { ko: '약세', en: 'Weak', ja: '弱気' },
    signalCritical: { ko: '위험', en: 'Critical', ja: '危険' },
    // A/D Ratio labels
    adOverwhelm: { ko: '압도적 매수', en: 'Overwhelming Buy', ja: '圧倒的買い' },
    adBuyDom: { ko: '매수 우위', en: 'Buy Dominant', ja: '買い優勢' },
    adBalanced: { ko: '균형', en: 'Balanced', ja: '均衡' },
    adSellDom: { ko: '매도 우위', en: 'Sell Dominant', ja: '売り優勢' },
    adOverwhelmSell: { ko: '압도적 매도', en: 'Overwhelming Sell', ja: '圧倒的売り' },
    // Volume Breadth labels
    volStrongBuy: { ko: '강한 매수세', en: 'Strong Buy Flow', ja: '強い買い勢い' },
    volBuyDom: { ko: '매수세 우위', en: 'Buy Flow Dominant', ja: '買い勢い優勢' },
    volBalanced: { ko: '균형', en: 'Balanced', ja: '均衡' },
    volSellDom: { ko: '매도세 우위', en: 'Sell Flow Dominant', ja: '売り勢い優勢' },
    volStrongSell: { ko: '강한 매도세', en: 'Strong Sell Flow', ja: '強い売り勢い' },
    // Interpretation texts
    interpBullStrong: { ko: '상승 {adv}% vs 하락 {dec}% — 시장 전반이 동반 상승 중. 광범위한 매수세가 확인되어 상승 신뢰도가 높습니다.', en: 'Advancing {adv}% vs Declining {dec}% — Broad market rally. Wide buying pressure confirms high bullish confidence.', ja: '上昇 {adv}% vs 下落 {dec}% — 市場全体が上昇中。広範な買い勢いが確認され、上昇の信頼度が高い。' },
    interpHealthy: { ko: '상승 {adv}% vs 하락 {dec}% — 과반 이상 종목이 상승하고 있어 전반적으로 건강한 시장입니다.', en: 'Advancing {adv}% vs Declining {dec}% — Majority of stocks advancing. Overall healthy market.', ja: '上昇 {adv}% vs 下落 {dec}% — 過半数の銘柄が上昇、全体的に健全な市場。' },
    interpMixed: { ko: '상승 {adv}% vs 하락 {dec}% — 상승·하락이 혼재. 특정 섹터 쏠림 가능성이 있어 주의가 필요합니다.', en: 'Advancing {adv}% vs Declining {dec}% — Mixed signals. Possible sector concentration, caution advised.', ja: '上昇 {adv}% vs 下落 {dec}% — 上昇・下落が混在。特定セクター偏りの可能性、注意が必要。' },
    interpWeak: { ko: '상승 {adv}% vs 하락 {dec}% — 하락 종목이 우세. 지수 상승이 소수 대형주에 의존할 수 있습니다.', en: 'Advancing {adv}% vs Declining {dec}% — Declining stocks dominant. Index may rely on few large-caps.', ja: '上昇 {adv}% vs 下落 {dec}% — 下落銘柄が優勢。指数上昇が少数大型株に依存する可能性。' },
    interpBearStrong: { ko: '상승 {adv}% vs 하락 {dec}% — 광범위한 매도세. 시장 전반의 약세 신호로 리스크 관리가 필요합니다.', en: 'Advancing {adv}% vs Declining {dec}% — Broad selling pressure. Market-wide bearish signal, risk management needed.', ja: '上昇 {adv}% vs 下落 {dec}% — 広範な売り勢い。市場全体の弱気シグナル、リスク管理が必要。' },
    // Divergence
    divergenceWarning: { ko: '⚠ 지수는 상승하나 대부분 종목이 하락 — 소수 종목이 지수를 끌어올리고 있어 상승 지속력에 의문이 있습니다.', en: '⚠ Index rising but most stocks declining — few names lifting the index, sustainability of rally is questionable.', ja: '⚠ 指数は上昇しているが大部分の銘柄が下落 — 少数の銘柄が指数を押し上げており、上昇の持続力に疑問。' },
    // UI labels
    advancingRatio: { ko: '상승 종목 비율', en: 'Advancing Ratio', ja: '上昇銘柄比率' },
    advancing: { ko: '▲ 상승', en: '▲ ADV', ja: '▲ 上昇' },
    declining: { ko: '▼ 하락', en: '▼ DEC', ja: '▼ 下落' },
    adRatioLabel: { ko: 'A/D 비율', en: 'A/D Ratio', ja: 'A/D 比率' },
    adRatioDesc: { ko: '상승 ÷ 하락', en: 'Adv ÷ Dec', ja: '上昇÷下落' },
    volAnalysis: { ko: '거래량 분석', en: 'Volume Analysis', ja: '出来高分析' },
    volBuyRatio: { ko: '매수량 비율', en: 'Buy Volume Ratio', ja: '買い量比率' },
    breadthAnalysisPending: { ko: '본장에서 브레드스 분석이 진행됩니다', en: 'Breadth analysis available during regular session', ja: '本場でブレッドス分析が行われます' },
    insightPending: { ko: '본장에서 실시간 분석이 진행됩니다', en: 'Real-time analysis available during regular session', ja: '本場でリアルタイム分析が行われます' },
    // RealityCheck sublabels
    rvolActive: { ko: '활발', en: 'Active', ja: '活発' },
    rvolNormal: { ko: '보통', en: 'Normal', ja: '普通' },
    rvolLow: { ko: '저조', en: 'Low', ja: '低調' },
    yieldUp: { ko: '상승', en: 'Rising', ja: '上昇' },
    yieldDown: { ko: '하락', en: 'Falling', ja: '下落' },
    yieldFlat: { ko: '보합', en: 'Flat', ja: '横ばい' },
    yieldInverted: { ko: '금리역전', en: 'Inverted', ja: '金利逆転' },
    yieldFlattening: { ko: '금리둔화', en: 'Flattening', ja: '金利鈍化' },
    yieldNormal: { ko: '금리정상', en: 'Normal', ja: '金利正常' },
    stanceTight: { ko: '긴축', en: 'Tight', ja: '引き締め' },
    stanceLoose: { ko: '완화', en: 'Loose', ja: '緩和' },
    stanceNeutral: { ko: '중립', en: 'Neutral', ja: '中立' },
    // DualGauge sentiment
    bullMomentum: { ko: '상승 모멘텀', en: 'Bullish Momentum', ja: '上昇モメンタム' },
    bearPressure: { ko: '하락 압력', en: 'Bearish Pressure', ja: '下落圧力' },
    mixedSignal: { ko: '혼조세', en: 'Mixed Signal', ja: '混合シグナル' },
};

['ko', 'en', 'ja'].forEach(lang => {
    const file = path.join(basePath, `${lang}.json`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [k, v] of Object.entries(keys)) {
        data.guardian[k] = v[lang];
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 4) + '\n', 'utf8');
    console.log(`${lang}: Added ${Object.keys(keys).length} guardian keys`);
});
console.log('Done!');
