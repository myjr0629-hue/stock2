const fs = require('fs');
const path = require('path');

const basePath = path.join(__dirname, '..', 'src', 'messages');

// Comprehensive i18n keys for all remaining components
const allNewKeys = {
    // CommandInsight.tsx factor labels
    commandInsight: {
        longGamma: { ko: 'Long Gamma', en: 'Long Gamma', ja: 'Long Gamma' },
        shortGamma: { ko: 'Short Gamma', en: 'Short Gamma', ja: 'Short Gamma' },
        inRange: { ko: '범위 내', en: 'In Range', ja: 'レンジ内' },
        aboveResistance: { ko: '저항 돌파', en: 'Above Resistance', ja: '抵抗突破' },
        belowSupport: { ko: '지지 이탈', en: 'Below Support', ja: 'サポート割れ' },
        newsPositive: { ko: '뉴스 긍정', en: 'News Positive', ja: 'ニュース好材料' },
        newsNegative: { ko: '뉴스 부정', en: 'News Negative', ja: 'ニュース悪材料' },
        callDominant: { ko: 'Call 우위', en: 'Call Dominant', ja: 'Call優勢' },
        putDominant: { ko: 'Put 우위', en: 'Put Dominant', ja: 'Put優勢' },
        marketClosedBriefing: { ko: '시장이 마감되었습니다. {ticker}은 내일 개장 시 방향성을 다시 확인하세요.', en: 'Market is closed. Check {ticker} direction at tomorrow\'s open.', ja: '市場がクローズしました。明日の寄り付きで{ticker}の方向性を再確認してください。' },
    },

    // FlowRadar.tsx labels
    flowRadarMetrics: {
        analyzing: { ko: '분석 중', en: 'Analyzing', ja: '分析中' },
        neutral: { ko: '중립', en: 'Neutral', ja: '中立' },
        strongCallDominant: { ko: '강한 Call 우위', en: 'Strong Call Dominant', ja: '強いCall優勢' },
        callDominant: { ko: 'Call 우위', en: 'Call Dominant', ja: 'Call優勢' },
        strongPutDominant: { ko: '강한 Put 우위', en: 'Strong Put Dominant', ja: '強いPut優勢' },
        putDominant: { ko: 'Put 우위', en: 'Put Dominant', ja: 'Put優勢' },
        noData: { ko: '데이터 없음', en: 'No Data', ja: 'データなし' },
        veryHigh: { ko: '매우 높음', en: 'Very High', ja: '非常に高い' },
        high: { ko: '높음', en: 'High', ja: '高い' },
        moderate: { ko: '보통', en: 'Moderate', ja: '普通' },
        low: { ko: '낮음', en: 'Low', ja: '低い' },
        veryLow: { ko: '매우 낮음', en: 'Very Low', ja: '非常に低い' },
        veryActive: { ko: '매우 활발', en: 'Very Active', ja: '非常に活発' },
        active: { ko: '활발', en: 'Active', ja: '活発' },
        weak: { ko: '약함', en: 'Weak', ja: '弱い' },
        veryWeak: { ko: '매우 약함', en: 'Very Weak', ja: '非常に弱い' },
        weeklyNoData: { ko: '주간 데이터 없음', en: 'No Weekly Data', ja: '週間データなし' },
        shortGammaFactor: { ko: 'Short Gamma {val}M', en: 'Short Gamma {val}M', ja: 'Short Gamma {val}M' },
        longGammaSuppress: { ko: 'Long Gamma (억제)', en: 'Long Gamma (Suppressed)', ja: 'Long Gamma (抑制)' },
        fear: { ko: '공포', en: 'Fear', ja: '恐怖' },
        caution: { ko: '경계', en: 'Caution', ja: '警戒' },
        optimism: { ko: '낙관', en: 'Optimism', ja: '楽観' },
        greed: { ko: '탐욕', en: 'Greed', ja: '貪欲' },
        putIvCallIv: { ko: 'Put IV {putIv}% / Call IV {callIv}%', en: 'Put IV {putIv}% / Call IV {callIv}%', ja: 'Put IV {putIv}% / Call IV {callIv}%' },
        strongResistance: { ko: '강한 저항', en: 'Strong Resistance', ja: '強い抵抗' },
        resistancePressure: { ko: '저항 압력', en: 'Resistance Pressure', ja: '抵抗圧力' },
        strongSupport: { ko: '강한 지지', en: 'Strong Support', ja: '強いサポート' },
        supportForming: { ko: '지지 형성', en: 'Support Forming', ja: 'サポート形成' },
    },

    // GammaVoid, IndicatorCard, StockChart generic labels
    common: {
        loading: { ko: '로딩 중...', en: 'Loading...', ja: '読み込み中...' },
        noDataAvailable: { ko: '데이터 없음', en: 'No Data', ja: 'データなし' },
        error: { ko: '오류', en: 'Error', ja: 'エラー' },
        retry: { ko: '다시 시도', en: 'Retry', ja: '再試行' },
        upPressure: { ko: '상승압력', en: 'Upward Pressure', ja: '上昇圧力' },
        downPressure: { ko: '하락압력', en: 'Downward Pressure', ja: '下落圧力' },
    },
};

function extractLang(obj, lang) {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'object' && v !== null && !v.ko) {
            result[k] = extractLang(v, lang);
        } else if (typeof v === 'object' && v.ko) {
            result[k] = v[lang];
        } else {
            result[k] = v;
        }
    }
    return result;
}

function countKeys(obj) {
    let c = 0;
    for (const v of Object.values(obj)) {
        if (typeof v === 'object' && v !== null) c += countKeys(v);
        else c++;
    }
    return c;
}

['ko', 'en', 'ja'].forEach(lang => {
    const file = path.join(basePath, `${lang}.json`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));

    // Add new sections
    data.commandInsight = extractLang(allNewKeys.commandInsight, lang);
    data.flowRadarMetrics = extractLang(allNewKeys.flowRadarMetrics, lang);

    // Merge into existing common section if it exists
    const commonKeys = extractLang(allNewKeys.common, lang);
    if (!data.common) data.common = {};
    Object.assign(data.common, commonKeys);

    fs.writeFileSync(file, JSON.stringify(data, null, 4) + '\n', 'utf8');
    console.log(`${lang}: Added ${countKeys(data.commandInsight)} commandInsight + ${countKeys(data.flowRadarMetrics)} flowRadarMetrics + ${countKeys(commonKeys)} common keys`);
});

console.log('Done!');
