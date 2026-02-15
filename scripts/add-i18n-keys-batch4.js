const fs = require('fs');
const path = require('path');

const basePath = path.join(__dirname, '..', 'src', 'messages');

const newSections = {
    // TacticalReportDeck keys
    tacticalReport: {
        // Verdict group labels
        attackLabel: { ko: '공격', en: 'Attack', ja: '攻撃' },
        attackEmpty: { ko: '공격 진입 종목 없음', en: 'No attack entries', ja: '攻撃エントリーなし' },
        defendLabel: { ko: '수비', en: 'Defend', ja: '防御' },
        defendEmpty: { ko: '보유 종목 없음', en: 'No holdings', ja: '保有銘柄なし' },
        retreatLabel: { ko: '후퇴', en: 'Retreat', ja: '撤退' },
        retreatEmpty: { ko: '청산/헷지 대상 없음', en: 'No liquidation/hedge targets', ja: '清算/ヘッジ対象なし' },

        // Error messages
        snapshotNotReady: { ko: '아직 스냅샷이 생성되지 않았습니다. 장마감 후 자동 생성됩니다.', en: 'Snapshot not yet generated. Will be auto-created after market close.', ja: 'スナップショットはまだ生成されていません。場引け後に自動生成されます。' },
        snapshotLoadFail: { ko: '스냅샷 로드 실패', en: 'Snapshot load failed', ja: 'スナップショット読み込み失敗' },
        emptyResponse: { ko: '빈 응답', en: 'Empty response', ja: '空のレスポンス' },
        jsonParseError: { ko: 'JSON 파싱 오류', en: 'JSON parse error', ja: 'JSON解析エラー' },
        noSnapshotData: { ko: '스냅샷 데이터가 없습니다.', en: 'No snapshot data available.', ja: 'スナップショットデータがありません。' },
        networkError: { ko: '네트워크 오류', en: 'Network error', ja: 'ネットワークエラー' },
        snapshotAutoGenNote: { ko: '장마감 후 POST /api/intel/snapshot 호출 시 자동 생성됩니다.', en: 'Auto-generated after market close via POST /api/intel/snapshot.', ja: '場引け後にPOST /api/intel/snapshotで自動生成されます。' },
        snapshotLabel: { ko: '스냅샷', en: 'Snapshot', ja: 'スナップショット' },
        tickerCount: { ko: '{count}종목', en: '{count} stocks', ja: '{count}銘柄' },

        // Briefing - outlook
        bullishBias: { ko: '강세 편향', en: 'Bullish Bias', ja: '強気偏向' },
        bearishBias: { ko: '약세 편향', en: 'Bearish Bias', ja: '弱気偏向' },

        // Briefing - headlines
        allUpHeadline: { ko: '전 종목 상승 마감 — {ticker} +{pct}% 선도', en: 'All stocks up — {ticker} +{pct}% leads', ja: '全銘柄上昇 — {ticker} +{pct}% 牽引' },
        allDownHeadline: { ko: '전 종목 하락 마감 — {ticker} {pct}% 최대 낙폭', en: 'All stocks down — {ticker} {pct}% worst drop', ja: '全銘柄下落 — {ticker} {pct}% 最大下落' },
        mixedUpHeadline: { ko: '{gainers}종 상승 vs {losers}종 하락 — {ticker} 주도 혼조세', en: '{gainers} up vs {losers} down — {ticker} leads mixed', ja: '{gainers}銘柄上昇 vs {losers}銘柄下落 — {ticker}主導のまちまち' },
        mixedDownHeadline: { ko: '{losers}종 하락 우위 — {ticker} 주도 하방, 방어 모드', en: '{losers} down dominant — {ticker} leads decline, defensive mode', ja: '{losers}銘柄下落優勢 — {ticker}主導の下落、防御モード' },

        // Briefing - bullets
        leadingStock: { ko: '📈 주도주: <mark>{ticker} {pct}%</mark> — ${price} 마감{extra}', en: '📈 Leader: <mark>{ticker} {pct}%</mark> — ${price} close{extra}', ja: '📈 牽引銘柄: <mark>{ticker} {pct}%</mark> — ${price} 引け{extra}' },
        leadingStockExtra: { ko: ', 외 {count}종 동반 상승', en: ', +{count} others also up', ja: ', 他{count}銘柄も上昇' },
        weakStock: { ko: '📉 약세주: <mark>{ticker} {pct}%</mark> — ${price} 마감{extra}', en: '📉 Laggard: <mark>{ticker} {pct}%</mark> — ${price} close{extra}', ja: '📉 弱気銘柄: <mark>{ticker} {pct}%</mark> — ${price} 引け{extra}' },
        weakStockExtra: { ko: ', 외 {count}종 동반 하락', en: ', +{count} others also down', ja: ', 他{count}銘柄も下落' },
        gammaAllLong: { ko: '🛡️ 감마 환경: 전 종목 <mark>Long Gamma</mark> — 변동성 억제 구간, 큰 움직임 제한적', en: '🛡️ Gamma: All <mark>Long Gamma</mark> — volatility suppressed, limited large moves', ja: '🛡️ ガンマ環境: 全銘柄<mark>ロングガンマ</mark> — ボラティリティ抑制区間' },
        gammaAllShort: { ko: '⚡ 감마 환경: 전 종목 <mark>Short Gamma</mark> — 변동성 확대 구간, 급등/급락 주의', en: '⚡ Gamma: All <mark>Short Gamma</mark> — volatility expansion, watch for sharp moves', ja: '⚡ ガンマ環境: 全銘柄<mark>ショートガンマ</mark> — ボラティリティ拡大区間' },
        gammaMixed: { ko: '⚡ 감마 환경: <mark>{short}/{total}종 Short Gamma</mark> — 변동성 확대 가능, {long}종은 Long Gamma로 안정적', en: '⚡ Gamma: <mark>{short}/{total} Short Gamma</mark> — volatility expansion possible, {long} in Long Gamma', ja: '⚡ ガンマ環境: <mark>{short}/{total}銘柄ショートガンマ</mark> — ボラ拡大可能、{long}銘柄はロングガンマで安定' },
        pcrCallStrong: { ko: '콜 매수 강세, 상방 기대감 형성', en: 'Strong call buying, upside expectations forming', ja: 'コール買い強勢、上方期待形成' },
        pcrCallSlight: { ko: '콜 약간 우위, 완만한 상승 기대', en: 'Slight call bias, moderate upside expected', ja: 'コールやや優勢、緩やかな上昇期待' },
        pcrPutPanic: { ko: '풋 매수 과열, 패닉 또는 헷지 수요 급증', en: 'Put buying overheated, panic or hedge demand surge', ja: 'プット買い過熱、パニックまたはヘッジ需要急増' },
        pcrPutDominant: { ko: '풋 우위, 하방 압력 감지', en: 'Put dominant, downside pressure detected', ja: 'プット優勢、下方圧力検知' },
        pcrBalanced: { ko: '콜/풋 균형, 방향성 탐색 중', en: 'Call/Put balanced, searching direction', ja: 'コール/プット均衡、方向性模索中' },
        alphaAvg: { ko: '📊 섹터 평균 Alpha <mark>{score}</mark>', en: '📊 Sector avg Alpha <mark>{score}</mark>', ja: '📊 セクター平均Alpha <mark>{score}</mark>' },
        alphaHigh: { ko: ' — {tickers} 고점수(60+)', en: ' — {tickers} high score(60+)', ja: ' — {tickers} 高得点(60+)' },
        alphaLow: { ko: ', {tickers} 저점수(40-)', en: ', {tickers} low score(40-)', ja: ', {tickers} 低得点(40-)' },
        callWallNear: { ko: '🎯 {ticker} Call Wall ${wall} 근접 ({dist}%), 돌파 시 감마 스퀴즈 가능', en: '🎯 {ticker} Call Wall ${wall} nearby ({dist}%), gamma squeeze possible on break', ja: '🎯 {ticker} Call Wall ${wall}接近 ({dist}%)、突破でガンマスクイーズの可能性' },
        putFloorNear: { ko: '🛡️ {ticker} Put Floor ${floor} 근접 ({dist}%), 하방 지지 예상', en: '🛡️ {ticker} Put Floor ${floor} nearby ({dist}%), downside support expected', ja: '🛡️ {ticker} Put Floor ${floor}接近 ({dist}%)、下方支持予想' },
        noKeyLevels: { ko: '📊 주요 옵션 레벨 근접 종목 없음 — 레인지 내 등락 예상', en: '📊 No stocks near key option levels — range-bound moves expected', ja: '📊 主要オプションレベル接近銘柄なし — レンジ内変動予想' },
    },

    // SectorSessionGrid keys
    sectorSession: {
        callInflow: { ko: '콜 유입', en: 'Call Inflow', ja: 'コール流入' },
        putDominant: { ko: '풋 우세', en: 'Put Dominant', ja: 'プット優勢' },
        dataWaiting: { ko: '데이터 대기 중...', en: 'Awaiting data...', ja: 'データ待機中...' },
        resistanceNearerThanSupport: { ko: '저항(${cw})이 지지(${pf})보다 가까움, 상단 제한적.', en: 'Resistance (${cw}) nearer than support (${pf}), upside limited.', ja: '抵抗(${cw})が支持(${pf})より近い、上値制限的。' },
        midRange: { ko: '지지(${pf})~저항(${cw}) 중간 구간, 방향 탐색.', en: 'Between support (${pf}) and resistance (${cw}), exploring direction.', ja: '支持(${pf})〜抵抗(${cw})中間区間、方向模索。' },
        shortGammaPutRisk: { ko: '숏감마+풋 과다 → 급변동 리스크.', en: 'Short gamma + excess puts → sharp move risk.', ja: 'ショートガンマ+プット過多→急変動リスク。' },
        shortGammaCallSqueeze: { ko: '숏감마+콜 과다 → 상방 스퀴즈 가능.', en: 'Short gamma + excess calls → upside squeeze possible.', ja: 'ショートガンマ+コール過多→上方スクイーズ可能。' },
        longGammaCallStable: { ko: '롱감마+콜 우세 → 안정적 상승 흐름.', en: 'Long gamma + call dominant → stable uptrend.', ja: 'ロングガンマ+コール優勢→安定的上昇。' },
        longGammaPutHedge: { ko: '롱감마+풋 헤지 → 하락 제한, 횡보.', en: 'Long gamma + put hedge → limited downside, sideways.', ja: 'ロングガンマ+プットヘッジ→下落制限、横ばい。' },
        extremeCallBias: { ko: '극단적 콜 편향 → 과열 경계.', en: 'Extreme call bias → overheating alert.', ja: '極端なコール偏向→過熱警戒。' },
        extremePutBias: { ko: '극단적 풋 편향 → 공포 심리.', en: 'Extreme put bias → fear sentiment.', ja: '極端なプット偏向→恐怖心理。' },
        collectingData: { ko: '분석 데이터 수집 중...', en: 'Collecting analysis data...', ja: '分析データ収集中...' },
        dealerLongGamma: { ko: '딜러 롱감마 → 안정', en: 'Dealer long gamma → stable', ja: 'ディーラーロングガンマ→安定' },
        dealerShortGamma: { ko: '딜러 숏감마 → 변동성↑', en: 'Dealer short gamma → volatility↑', ja: 'ディーラーショートガンマ→ボラ↑' },
        callDomBullish: { ko: '콜 우세 (강세)', en: 'Call dominant (bullish)', ja: 'コール優勢（強気）' },
        putDomBearish: { ko: '풋 우세 (약세)', en: 'Put dominant (bearish)', ja: 'プット優勢（弱気）' },
        searchingDirection: { ko: '방향 탐색 중', en: 'Searching direction', ja: '方向模索中' },
        stableFlow: { ko: '안정적 흐름', en: 'Stable flow', ja: '安定的な流れ' },
        volExpansion: { ko: '변동성 확대', en: 'Volatility expansion', ja: 'ボラティリティ拡大' },
        shortGammaDomMoveRisk: { ko: '숏감마 우세 → 급변동', en: 'Short gamma dominant → sharp moves', ja: 'ショートガンマ優勢→急変動' },
        longGammaDomStable: { ko: '롱감마 우세 → 안정', en: 'Long gamma dominant → stable', ja: 'ロングガンマ優勢→安定' },
        callInflowDom: { ko: '콜 자금 유입 우세', en: 'Call inflow dominant', ja: 'コール資金流入優勢' },
        putHedgeDom: { ko: '풋 헷지 우세', en: 'Put hedge dominant', ja: 'プットヘッジ優勢' },
    },

    // SectorRankingRow keys
    sectorRanking: {
        moneyFlowSub: { ko: '자금력 랭킹', en: 'Money Flow Ranking', ja: '資金力ランキング' },
        squeezeSub: { ko: '폭발 임박 랭킹', en: 'Squeeze Proximity Ranking', ja: '爆発間近ランキング' },
        painSub: { ko: '과열/침체 랭킹', en: 'Overheat/Undershoot Ranking', ja: '過熱/低迷ランキング' },
        flowBalanced: { ko: '전 종목 자금 흐름 균형 상태. 뚜렷한 방향성 부재.', en: 'All stocks in balanced money flow. No clear direction.', ja: '全銘柄資金フロー均衡状態。明確な方向性なし。' },
        squeezeSafe: { ko: '전 종목 핵심 레벨과 충분한 거리 유지. 급변동 리스크 낮음.', en: 'All stocks maintain safe distance from key levels. Low volatility risk.', ja: '全銘柄主要レベルから十分な距離。急変動リスク低い。' },
        painNormal: { ko: '전 종목 Max Pain 적정 범위 내. 만기 수렴 압력 제한적.', en: 'All stocks within normal Max Pain range. Limited expiry convergence.', ja: '全銘柄Max Pain適正範囲内。満期収束圧力制限的。' },
        noData: { ko: '데이터 수집 중...', en: 'Collecting data...', ja: 'データ収集中...' },
        correction: { ko: '하방 조정', en: 'Downside correction', ja: '下方調整' },
        rebound: { ko: '상방 반등', en: 'Upside rebound', ja: '上方反発' },
    },

    // Guardian component keys
    guardian: {
        // RealityCheck
        rvolActive: { ko: '활발', en: 'Active', ja: '活発' },
        rvolNormal: { ko: '보통', en: 'Normal', ja: '普通' },
        rvolLow: { ko: '저조', en: 'Low', ja: '低調' },
        yieldUp: { ko: '상승', en: 'Rising', ja: '上昇' },
        yieldDown: { ko: '하락', en: 'Falling', ja: '下落' },
        yieldFlat: { ko: '보합', en: 'Flat', ja: '横ばい' },
        curveInverted: { ko: '금리역전', en: 'Inverted', ja: '金利逆転' },
        curveFlat: { ko: '금리둔화', en: 'Flattening', ja: '金利鈍化' },
        curveNormal: { ko: '금리정상', en: 'Normal', ja: '金利正常' },
        stanceTight: { ko: '긴축', en: 'Tightening', ja: '引き締め' },
        stanceLoose: { ko: '완화', en: 'Easing', ja: '緩和' },

        // MiniGauge
        upMomentum: { ko: '상승 모멘텀', en: 'Upward momentum', ja: '上昇モメンタム' },
        downPressure: { ko: '하락 압력', en: 'Downward pressure', ja: '下落圧力' },
        mixed: { ko: '혼조세', en: 'Mixed', ja: 'まちまち' },

        // MarketBreadthPanel
        strong: { ko: '강세', en: 'Strong', ja: '強気' },
        healthy: { ko: '건강', en: 'Healthy', ja: '健全' },
        weak: { ko: '약세', en: 'Weak', ja: '弱気' },
        critical: { ko: '위험', en: 'Critical', ja: '危険' },
        overwhelmingBuy: { ko: '압도적 매수', en: 'Overwhelming buy', ja: '圧倒的買い' },
        buyDominant: { ko: '매수 우위', en: 'Buy dominant', ja: '買い優勢' },
        balanced: { ko: '균형', en: 'Balanced', ja: '均衡' },
        sellDominant: { ko: '매도 우위', en: 'Sell dominant', ja: '売り優勢' },
        overwhelmingSell: { ko: '압도적 매도', en: 'Overwhelming sell', ja: '圧倒的売り' },
        strongBuyVolume: { ko: '강한 매수세', en: 'Strong buying', ja: '強い買い勢い' },
        buyVolumeUp: { ko: '매수세 우위', en: 'Buying dominant', ja: '買い勢い優勢' },
        strongSellVolume: { ko: '강한 매도세', en: 'Strong selling', ja: '強い売り勢い' },
        sellVolumeUp: { ko: '매도세 우위', en: 'Selling dominant', ja: '売り勢い優勢' },
        breadthStrong: { ko: '상승 {adv}% vs 하락 {dec}% — 시장 전반이 동반 상승 중. 광범위한 매수세가 확인되어 상승 신뢰도가 높습니다.', en: 'Advancing {adv}% vs declining {dec}% — broad market rally. Wide buying confirms high upside conviction.', ja: '上昇{adv}% vs 下落{dec}% — 市場全般が上昇中。広範な買い勢いで上昇信頼度が高い。' },
        breadthHealthy: { ko: '상승 {adv}% vs 하락 {dec}% — 과반 이상 종목이 상승하고 있어 전반적으로 건강한 시장입니다.', en: 'Advancing {adv}% vs declining {dec}% — majority stocks rising, overall healthy market.', ja: '上昇{adv}% vs 下落{dec}% — 過半数の銘柄が上昇中、全般的に健全な市場。' },
        breadthNeutral: { ko: '상승 {adv}% vs 하락 {dec}% — 상승·하락이 혼재. 특정 섹터 쏠림 가능성이 있어 주의가 필요합니다.', en: 'Advancing {adv}% vs declining {dec}% — mixed signals. Possible sector rotation, caution needed.', ja: '上昇{adv}% vs 下落{dec}% — 上昇・下落が混在。セクター偏りの可能性あり注意が必要。' },
        breadthWeak: { ko: '상승 {adv}% vs 하락 {dec}% — 하락 종목이 우세. 지수 상승이 소수 대형주에 의존할 수 있습니다.', en: 'Advancing {adv}% vs declining {dec}% — decliners dominant. Index may rely on few large caps.', ja: '上昇{adv}% vs 下落{dec}% — 下落銘柄が優勢。指数上昇は少数大型株に依存する可能性。' },
        breadthCritical: { ko: '상승 {adv}% vs 하락 {dec}% — 광범위한 매도세. 시장 전반의 약세 신호로 리스크 관리가 필요합니다.', en: 'Advancing {adv}% vs declining {dec}% — broad selling pressure. Market-wide weakness, risk management needed.', ja: '上昇{adv}% vs 下落{dec}% — 広範な売り圧力。市場全般の弱気シグナルでリスク管理が必要。' },
    },
};

function addSection(data, sectionName, keys, lang) {
    if (!data[sectionName]) data[sectionName] = {};
    for (const [k, v] of Object.entries(keys)) {
        data[sectionName][k] = v[lang];
    }
}

['ko', 'en', 'ja'].forEach(lang => {
    const file = path.join(basePath, `${lang}.json`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));

    let totalKeys = 0;
    for (const [section, keys] of Object.entries(newSections)) {
        addSection(data, section, keys, lang);
        totalKeys += Object.keys(keys).length;
    }

    fs.writeFileSync(file, JSON.stringify(data, null, 4) + '\n', 'utf8');
    console.log(`${lang}: Added ${totalKeys} keys across ${Object.keys(newSections).length} sections`);
});

console.log('Done!');
