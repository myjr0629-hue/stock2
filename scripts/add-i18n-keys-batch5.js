const fs = require('fs');
const path = require('path');
const basePath = path.join(__dirname, '..', 'src', 'messages');

const keys = {
    putFloorSupport: { ko: 'Put Floor($${putFloor}) 지지 테스트.', en: 'Put Floor($${putFloor}) support test.', ja: 'Put Floor($${putFloor})サポートテスト。' },
    callWallNearResist: { ko: 'Call Wall($${callWall}) 근접 저항.', en: 'Call Wall($${callWall}) nearby resistance.', ja: 'Call Wall($${callWall})近接抵抗。' },
    nearMaxPain: { ko: 'Max Pain($${mp}) 근처, 변동성 축소 예상.', en: 'Near Max Pain($${mp}), volatility compression expected.', ja: 'Max Pain($${mp})付近、ボラティリティ縮小予想。' },
    aboveMaxPain: { ko: 'Max Pain($${mp}) 대비 +${diff}% 괴리, 하방 압력 존재.', en: 'Above Max Pain($${mp}) by +${diff}%, downside pressure.', ja: 'Max Pain($${mp})対比+${diff}%乖離、下方圧力。' },
    slightAboveMaxPain: { ko: 'Max Pain($${mp}) 소폭 상회, 안정적 흐름.', en: 'Slightly above Max Pain($${mp}), stable flow.', ja: 'Max Pain($${mp})やや上回り、安定的。' },
    belowMaxPain: { ko: 'Max Pain($${mp}) 대비 ${diff}% 하회, 반등 가능성.', en: 'Below Max Pain($${mp}) by ${diff}%, rebound possible.', ja: 'Max Pain($${mp})対比${diff}%下回り、反発の可能性。' },
    slightBelowMaxPain: { ko: 'Max Pain($${mp}) 소폭 하회, 관망세.', en: 'Slightly below Max Pain($${mp}), wait-and-see.', ja: 'Max Pain($${mp})やや下回り、様子見。' },
    callWallNearBreak: { ko: 'Call Wall($${cw}) 근접 → 강한 저항, 돌파 시 급등.', en: 'Near Call Wall($${cw}) → strong resistance, breakout = surge.', ja: 'Call Wall($${cw})接近→強い抵抗、突破で急騰。' },
    putFloorNearBreak: { ko: 'Put Floor($${pf}) 근접 → 강한 지지, 이탈 시 급락.', en: 'Near Put Floor($${pf}) → strong support, break = plunge.', ja: 'Put Floor($${pf})接近→強い支持、割れで急落。' },
};

['ko', 'en', 'ja'].forEach(lang => {
    const file = path.join(basePath, `${lang}.json`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [k, v] of Object.entries(keys)) {
        data.sectorSession[k] = v[lang];
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 4) + '\n', 'utf8');
    console.log(`${lang}: Added ${Object.keys(keys).length} extra sectorSession keys`);
});
console.log('Done!');
