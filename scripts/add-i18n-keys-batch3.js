const fs = require('fs');
const path = require('path');

const basePath = path.join(__dirname, '..', 'src', 'messages');

const newKeys = {
    // UOA labels
    uoaNormal: { ko: '정상', en: 'Normal', ja: '正常' },
    uoaExtreme: { ko: '극심', en: 'Extreme', ja: '極端' },
    uoaAbnormal: { ko: '이상', en: 'Abnormal', ja: '異常' },
    uoaActive: { ko: '활발', en: 'Active', ja: '活発' },
    uoaVolOi: { ko: '거래량 {vol}K / OI {oi}K', en: 'Volume {vol}K / OI {oi}K', ja: '出来高 {vol}K / OI {oi}K' },

    // P/C Ratio labels - same pattern used for both volume and OI
    pcBalance: { ko: '균형', en: 'Balanced', ja: '均衡' },

    // GEX Regime labels
    gexStablePinning: { ko: '안정 핀닝', en: 'Stable Pinning', ja: '安定ピンニング' },
    gexTransitionImminent: { ko: '전환 임박', en: 'Transition Imminent', ja: '転換間近' },
    gexFlipZone: { ko: '플립 구간', en: 'Flip Zone', ja: 'フリップゾーン' },
    gexExplosiveStandby: { ko: '폭발 대기', en: 'Explosive Standby', ja: '爆発待機' },
    gexExpiryToday: { ko: '오늘 만기', en: 'Expires Today', ja: '本日満期' },
    gexExpiryDate: { ko: '{date} 만기', en: 'Expires {date}', ja: '{date} 満期' },
    gexWeeklyToday: { ko: '오늘', en: 'Today', ja: '本日' },
    gexWeeklyDate: { ko: '{date}(주간)', en: '{date}(Weekly)', ja: '{date}(週間)' },

    // Implied Move labels
    impliedHighVol: { ko: '고변동', en: 'High Vol', ja: '高変動' },
    impliedCaution: { ko: '주의', en: 'Caution', ja: '注意' },
    impliedModerate: { ko: '보통', en: 'Moderate', ja: '普通' },
    impliedStable: { ko: '안정', en: 'Stable', ja: '安定' },

    // Smart Money rationale
    smartMoneyRationale: { ko: '$50K+ {large}건 / $100K+ {veryLarge}건', en: '$50K+ {large} trades / $100K+ {veryLarge} trades', ja: '$50K+ {large}件 / $100K+ {veryLarge}件' },
    whaleAtmBets: { ko: '$100K+ ATM {count}건', en: '$100K+ ATM {count} trades', ja: '$100K+ ATM {count}件' },
    atmConcentration: { ko: 'ATM 집중 {pct}%', en: 'ATM Concentration {pct}%', ja: 'ATM集中 {pct}%' },
};

function extractLang(obj, lang) {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'object' && v !== null && v.ko) {
            result[k] = v[lang];
        }
    }
    return result;
}

['ko', 'en', 'ja'].forEach(lang => {
    const file = path.join(basePath, `${lang}.json`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));

    // Merge into flowRadarMetrics
    const keys = extractLang(newKeys, lang);
    Object.assign(data.flowRadarMetrics, keys);

    fs.writeFileSync(file, JSON.stringify(data, null, 4) + '\n', 'utf8');
    console.log(`${lang}: Added ${Object.keys(keys).length} flowRadarMetrics keys`);
});

console.log('Done!');
