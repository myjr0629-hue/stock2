const fs = require('fs');
const path = require('path');
const basePath = path.join(__dirname, '..', 'src', 'messages');

// === FIXES for translation quality ===
const fixes = {
    guardian: {
        // Fix 1: ブレッドス typo → Breadth (use English term as standard)
        breadthAnalysisPending: {
            ko: '본장에서 Breadth 분석이 진행됩니다',      // 브레드스 → Breadth
            en: 'Breadth analysis available during regular session',
            ja: 'レギュラーセッション中にBreadth分析が行われます'  // 本場 → レギュラーセッション
        },
        // Fix 2: 本場 → レギュラーセッション
        insightPending: {
            ko: '본장에서 실시간 분석이 진행됩니다',
            en: 'Real-time analysis available during regular session',
            ja: 'レギュラーセッション中にリアルタイム分析が行われます'  // 本場 → レギュラーセッション
        },
        // Fix 3: 混合シグナル → まちまち (more natural in Japanese finance)
        mixedSignal: {
            ko: '혼조세',
            en: 'Mixed',
            ja: 'まちまち'      // 混合シグナル → まちまち
        },
        // Fix 4: Japanese polite form (ます体) for long interpretation texts
        interpBullStrong: {
            ko: '상승 {adv}% vs 하락 {dec}% — 시장 전반이 동반 상승 중. 광범위한 매수세가 확인되어 상승 신뢰도가 높습니다.',
            en: 'Advancing {adv}% vs Declining {dec}% — Broad market rally with wide buying pressure, confirming high bullish confidence.',
            ja: '上昇 {adv}% vs 下落 {dec}% — 市場全体が上昇中です。広範な買い勢いが確認され、上昇の信頼度が高い状況です。'
        },
        interpHealthy: {
            ko: '상승 {adv}% vs 하락 {dec}% — 과반 이상 종목이 상승하고 있어 전반적으로 건강한 시장입니다.',
            en: 'Advancing {adv}% vs Declining {dec}% — Majority of stocks advancing, indicating a healthy market overall.',
            ja: '上昇 {adv}% vs 下落 {dec}% — 過半数の銘柄が上昇しており、全体的に健全な市場です。'
        },
        interpMixed: {
            ko: '상승 {adv}% vs 하락 {dec}% — 상승·하락이 혼재. 특정 섹터 쏠림 가능성이 있어 주의가 필요합니다.',
            en: 'Advancing {adv}% vs Declining {dec}% — Mixed signals with possible sector concentration. Caution advised.',
            ja: '上昇 {adv}% vs 下落 {dec}% — 上昇・下落が混在しています。特定セクターへの偏りの可能性があり、注意が必要です。'
        },
        interpWeak: {
            ko: '상승 {adv}% vs 하락 {dec}% — 하락 종목이 우세. 지수 상승이 소수 대형주에 의존할 수 있습니다.',
            en: 'Advancing {adv}% vs Declining {dec}% — Declining stocks dominant. Index gains may rely on a few large-caps.',
            ja: '上昇 {adv}% vs 下落 {dec}% — 下落銘柄が優勢です。指数上昇が少数の大型株に依存している可能性があります。'
        },
        interpBearStrong: {
            ko: '상승 {adv}% vs 하락 {dec}% — 광범위한 매도세. 시장 전반의 약세 신호로 리스크 관리가 필요합니다.',
            en: 'Advancing {adv}% vs Declining {dec}% — Broad selling pressure signals market weakness. Risk management essential.',
            ja: '上昇 {adv}% vs 下落 {dec}% — 広範な売り圧力です。市場全体の弱気シグナルであり、リスク管理が必要です。'
        },
        // Fix 5: Divergence warning - Japanese polite form
        divergenceWarning: {
            ko: '⚠ 지수는 상승하나 대부분 종목이 하락 — 소수 종목이 지수를 끌어올리고 있어 상승 지속력에 의문이 있습니다.',
            en: '⚠ Index rising but most stocks declining — a few names are lifting the index, raising questions about rally sustainability.',
            ja: '⚠ 指数は上昇していますが大部分の銘柄が下落しています。少数の銘柄が指数を押し上げており、上昇の持続力に疑問があります。'
        },
    },
    sectorSession: {
        // Fix 6: English "Searching direction" → more natural phrasing
        searchingDirection: {
            ko: '방향 탐색 중',
            en: 'Direction unclear',        // more natural
            ja: '方向感なし'                 // 方向模索中 → 方向感なし (more standard in JP finance)
        },
        // Fix 7: Japanese polite form for analysis sentences
        dataWaiting: {
            ko: '데이터 대기 중...',
            en: 'Awaiting data...',
            ja: 'データ待機中...'
        },
        collectingData: {
            ko: '분석 데이터 수집 중...',
            en: 'Collecting analysis data...',
            ja: '分析データ収集中...'
        },
    },
    tacticalReport: {
        // Fix 8: Japanese no snapshot message - polite
        snapshotNotReady: {
            ko: '아직 스냅샷이 생성되지 않았습니다. 장마감 후 자동 생성됩니다.',
            en: 'Snapshot not yet generated. Auto-created after market close.',
            ja: 'スナップショットはまだ生成されていません。場引け後に自動で生成されます。'
        },
        // Fix 9: noSnapshotData - polite
        noSnapshotData: {
            ko: '스냅샷 데이터가 없습니다.',
            en: 'No snapshot data available.',
            ja: 'スナップショットデータがありません。'
        },
    }
};

let totalFixed = 0;
['ko', 'en', 'ja'].forEach(lang => {
    const file = path.join(basePath, `${lang}.json`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));

    for (const [section, keys] of Object.entries(fixes)) {
        for (const [key, values] of Object.entries(keys)) {
            if (data[section] && data[section][key] !== undefined) {
                const oldVal = data[section][key];
                const newVal = values[lang];
                if (oldVal !== newVal) {
                    data[section][key] = newVal;
                    totalFixed++;
                }
            }
        }
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 4) + '\n', 'utf8');
    console.log(`${lang}: Applied fixes`);
});

console.log(`\nTotal fixes applied: ${totalFixed}`);
console.log('Done!');
