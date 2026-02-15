const fs = require('fs');
const path = require('path');
const base = path.join(__dirname, '..', 'src', 'messages');

const newKeys = {
    dashboard: {
        loading: { ko: '로딩중...', en: 'Loading...', ja: '読み込み中...' },
        volShrink: { ko: '→ 변동성 축소, 레인지 예상', en: '→ Vol Shrink, Range Expected', ja: '→ ボラ縮小、レンジ予想' },
        volExpand: { ko: '→ 변동성 확대, 추세 가속 주의', en: '→ Vol Expand, Trend Acceleration', ja: '→ ボラ拡大、トレンド加速注意' },
        gammaConc: { ko: '감마 집중도', en: 'Gamma Concentration', ja: 'ガンマ集中度' },
        gammaSticky: { ko: '가격 움직임 억제', en: 'Price Movement Suppressed', ja: '価格変動抑制' },
        gammaLoose: { ko: '자유로운 움직임', en: 'Free Movement', ja: '自由な値動き' },
        gammaBalanced: { ko: '균형 상태', en: 'Balanced', ja: '均衡状態' },
        maxPainLabel: { ko: '최대고통', en: 'Max Pain', ja: '最大痛点' },
        netGexLabel: { ko: '순 감마 에너지 (Net GEX)', en: 'Net Gamma Energy (Net GEX)', ja: '純ガンマエネルギー (Net GEX)' },
        gexTooltip: { ko: '시장 조성자(MM)들의 포지션에 따른 변동성 성향입니다.\\n(+) 양수: 주가 변동 억제 (안정/지루함)\\n(-) 음수: 주가 변동 증폭 (급등락/스퀴즈 위험)', en: 'Market maker positioning drives volatility behavior.\\n(+) Positive: Price suppression (stability/range)\\n(-) Negative: Price amplification (spikes/squeeze risk)', ja: 'マーケットメーカーのポジションによるボラティリティ特性です。\\n(+) 正数: 価格変動抑制 (安定/膠着)\\n(-) 負数: 価格変動増幅 (急騰落/スクイーズリスク)' },
        gexBullish: { ko: '지지력 강화 (변동성 축소)', en: 'Support Strengthened (Vol Down)', ja: '支持力強化 (ボラ縮小)' },
        gexBearish: { ko: '변동성 확대 (가속 구간)', en: 'Volatility Expanding (Acceleration)', ja: 'ボラ拡大 (加速区間)' },
        gexNeutral: { ko: '중립 (방향성 부재)', en: 'Neutral (No Direction)', ja: '中立 (方向感なし)' },
        gexSafeZone: { ko: '(+) 안전지대', en: '(+) Safe Zone', ja: '(+) 安全圏' },
        gexAccelZone: { ko: '(-) 가속구간', en: '(-) Accel Zone', ja: '(-) 加速区間' },
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
