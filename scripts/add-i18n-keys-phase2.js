const fs = require('fs');
const path = require('path');
const basePath = path.join(__dirname, '..', 'src', 'messages');

const keys = {
    intel: {
        // === STEALTH TAGS (24) - 종목 분석 태그 ===
        // 🇰🇷 간결한 주식 용어, 🇺🇸 institutional/finance terminology, 🇯🇵 경어 불필요(라벨)
        stealthGammaSqueeze: { ko: '감마 스퀴즈 (폭등 전조)', en: 'Gamma Squeeze (Explosive Upside)', ja: 'ガンマスクイーズ（急騰の前兆）' },
        stealthWhaleAccumulation: { ko: '기관 매집 (바닥 다지기)', en: 'Whale Accumulation (Bottoming)', ja: '機関買い集め（底固め）' },
        stealthAIMomentum: { ko: 'AI 모멘텀 (주도주 강세)', en: 'AI Momentum (Leader Strength)', ja: 'AIモメンタム（主導株堅調）' },
        stealthSectorLeader: { ko: '섹터 대장주 (수급 쏠림)', en: 'Sector Leader (Flow Concentration)', ja: 'セクター主導株（需給集中）' },
        stealthSafeHaven: { ko: '안전 자산 (방어적 매수)', en: 'Safe Haven (Defensive Bid)', ja: '安全資産（ディフェンシブ買い）' },
        stealthTechRotation: { ko: '기술주 순환매 (자금 이동)', en: 'Tech Rotation (Capital Shift)', ja: 'テック循環買い（資金移動）' },
        stealthSemiSemi: { ko: '반도체 동조화 (동반 상승)', en: 'Semiconductor Synchronization', ja: '半導体連動（同時上昇）' },
        stealthCatchUp: { ko: '기맞추기 반등 (후발 주자)', en: 'Catch-Up Rally (Laggard)', ja: 'キャッチアップ反発（出遅れ株）' },
        stealthConsolidation: { ko: '기간 조정 (매물 소화)', en: 'Consolidation (Absorption)', ja: '持ち合い（売り物消化）' },
        stealthCloudGrowth: { ko: '클라우드 성장성 (실적 기대)', en: 'Cloud Growth (Earnings Play)', ja: 'クラウド成長性（業績期待）' },
        stealthValueTech: { ko: '가치주 성격 부각 (저평가)', en: 'Value-Tech (Undervalued)', ja: 'バリューテック（割安評価）' },
        stealthAdRev: { ko: '광고 매출 회복 (펀더멘털)', en: 'Ad Revenue Recovery (Fundamentals)', ja: '広告収益回復（ファンダメンタルズ）' },
        stealthEfficiency: { ko: '효율화 달성 (비용 절감)', en: 'Efficiency Gains (Cost Cutting)', ja: '効率化達成（コスト削減）' },
        stealthSocial: { ko: '소셜 미디어 지배력', en: 'Social Media Dominance', ja: 'ソーシャルメディア支配力' },
        stealthPrime: { ko: 'Prime 구독 락인 효과', en: 'Prime Subscription Lock-in', ja: 'Primeサブスク固定効果' },
        stealthAWS: { ko: '클라우드 점유율 1위', en: '#1 Cloud Market Share', ja: 'クラウドシェア1位' },
        stealthStreaming: { ko: '스트리밍 지배력', en: 'Streaming Dominance', ja: 'ストリーミング支配力' },
        stealthContent: { ko: '컨텐츠 경쟁력', en: 'Content Competitiveness', ja: 'コンテンツ競争力' },
        stealthGovTech: { ko: '정부 수주 독점력', en: 'Gov Contract Monopoly', ja: '政府受注独占力' },
        stealthAIDefense: { ko: '국방 AI 수혜', en: 'Defense AI Beneficiary', ja: '国防AI恩恵' },
        stealthCryptoVol: { ko: '코인 변동성 연동', en: 'Crypto Volatility Correlated', ja: '仮想通貨ボラティリティ連動' },
        stealthExchange: { ko: '거래소 수수료 수익', en: 'Exchange Fee Revenue', ja: '取引所手数料収益' },
        stealthBitcoinLev: { ko: '비트코인 레버리지', en: 'Bitcoin Leverage Play', ja: 'ビットコインレバレッジ' },
        stealthHighBeta: { ko: '고베타 (높은 변동성)', en: 'High Beta (High Volatility)', ja: 'ハイベータ（高ボラティリティ）' },

        // === STRUCTURE MAP (12) - 차트 구조 상태 ===
        structBreakout: { ko: '강력한 상승 돌파 (매수 기회)', en: 'Strong Breakout (Buy Signal)', ja: '強力な上方突破（買いチャンス）' },
        structBullFlag: { ko: '상승 깃발형 (추세 지속)', en: 'Bull Flag (Trend Continuation)', ja: '上昇フラッグ（トレンド継続）' },
        structConsolidation: { ko: '기간 조정 (에너지 응축)', en: 'Consolidation (Energy Build-up)', ja: '持ち合い（エネルギー蓄積）' },
        structRebound: { ko: '기술적 반등 (단기)', en: 'Technical Rebound (Short-term)', ja: 'テクニカル反発（短期）' },
        structBottoming: { ko: '바닥 다지기 (저점 확인)', en: 'Bottoming (Floor Confirmed)', ja: '底固め（安値確認）' },
        structBoxRange: { ko: '박스권 횡보 (방향 탐색)', en: 'Range-bound (Searching Direction)', ja: 'ボックス圏横ばい（方向感なし）' },
        structTrendUp: { ko: '상승 추세 (우상향)', en: 'Uptrend (Higher Highs)', ja: '上昇トレンド（右肩上がり）' },
        structSlowGrind: { ko: '완만한 상승 (매물 소화)', en: 'Slow Grind Up (Absorption)', ja: '緩やかな上昇（売り物消化）' },
        structWeakness: { ko: '추세 약화 (주의)', en: 'Weakening Trend (Caution)', ja: 'トレンド弱体化（注意）' },
        structVolExpansion: { ko: '변동성 확대 (방향성 결정)', en: 'Volatility Expansion (Breakout Imminent)', ja: 'ボラティリティ拡大（方向性決定）' },
        structCorrection: { ko: '건전한 조정 (눌림목)', en: 'Healthy Pullback (Dip Buy)', ja: '健全な調整（押し目）' },
        structDeepPullback: { ko: '과도한 하락 (저가 매수)', en: 'Deep Pullback (Bargain Buy)', ja: '過度な下落（割安買い）' },

        // === TRIGGER DEFINITIONS (10) - UI 트리거 설명 ===
        // 🇯🇵 desc는 경어체(です/ます) 使用
        trigGexSqzLabel: { ko: '감마스퀴즈', en: 'Gamma Squeeze', ja: 'ガンマスクイーズ' },
        trigGexSqzDesc: { ko: '옵션 시장의 쏠림(Short Gamma)으로 인해 주가 변동성이 폭발적으로 확대되는 현상', en: 'Explosive volatility expansion from options market imbalance (Short Gamma)', ja: 'オプション市場の偏り（ショートガンマ）により株価変動性が爆発的に拡大する現象です' },
        trigWhaleInLabel: { ko: '고래유입', en: 'Whale Inflow', ja: 'ホエール流入' },
        trigWhaleInDesc: { ko: '500만 달러 이상의 대규모 매수 자금이 포착됨 (스마트머니 진입)', en: '$5M+ large-scale buy flow detected (smart money entry)', ja: '500万ドル以上の大規模買い資金が検出されました（スマートマネー参入）' },
        trigWallBreakLabel: { ko: '저항돌파', en: 'Wall Break', ja: '抵抗突破' },
        trigWallBreakDesc: { ko: '콜 옵션 매도벽(Call Wall)을 강한 거래량으로 뚫어내는 강력한 상승 신호', en: 'Breaking through Call Wall with strong volume — powerful bullish signal', ja: 'コールオプション売り壁（Call Wall）を強い出来高で突破する強力な上昇シグナルです' },
        trigSellDomLabel: { ko: '매도우위', en: 'Sell Dominant', ja: '売り優勢' },
        trigSellDomDesc: { ko: '500만 달러 이상의 대규모 매도세가 우세함', en: '$5M+ large-scale sell pressure dominant', ja: '500万ドル以上の大規模売り圧力が優勢です' },
        trigAccelDropLabel: { ko: '가속하락', en: 'Accel Drop', ja: '加速下落' },
        trigAccelDropDesc: { ko: '풋 옵션 매수 급증과 숏 감마가 결합되어 하락 속도가 빨라짐', en: 'Put buying surge combined with short gamma accelerating decline', ja: 'プットオプション買い急増とショートガンマの結合で下落速度が加速しています' },
        trigSuppressedLabel: { ko: '상방억제', en: 'Suppressed', ja: '上方抑制' },
        trigSuppressedDesc: { ko: '상승 하려는 힘은 있으나 과도한 콜 옵션 매도로 인해 상승폭이 제한됨', en: 'Upward force present but capped by excessive call selling', ja: '上昇力はあるものの、過度なコールオプション売りにより上昇幅が制限されています' },
        trigGexSafeLabel: { ko: '안전지대', en: 'Safe Zone', ja: '安全圏' },
        trigGexSafeDesc: { ko: '롱 감마(Long Gamma) 구간으로 진입하여 주가 변동성이 줄어들고 지지력이 강해짐', en: 'Entered Long Gamma zone — volatility dampened, support strengthened', ja: 'ロングガンマ圏に突入し、株価変動性が縮小し支持力が強化されています' },
        trigCorrectionLabel: { ko: '건전조정', en: 'Healthy Correction', ja: '健全調整' },
        trigCorrectionDesc: { ko: '상승 추세 중 일시적인 매물 소화 과정 (지지력 확인 시 재매수 기회)', en: 'Temporary absorption during uptrend (re-entry opportunity on support hold)', ja: '上昇トレンド中の一時的な売り物消化過程です（支持確認で再買いの機会）' },
        trigWhaleDriverLabel: { ko: '고래주도', en: 'Whale-Driven', ja: 'ホエール主導' },
        trigWhaleDriverDesc: { ko: '고래 평단가가 진입 구간을 지지하며, 목표가(손익분기)까지 상승 여력이 확보된 상태 (정밀 타격)', en: 'Whale avg cost supporting entry zone, upside room to target (precision strike)', ja: 'ホエール平均単価がエントリー圏を支持し、目標価格まで上昇余力が確保された状態です' },
        trigWallTestLabel: { ko: '저항테스트', en: 'Wall Test', ja: '抵抗テスト' },
        trigWallTestDesc: { ko: '현재 주가가 주요 저항벽(Call Wall) 근처에 도달하여 돌파 시도 중', en: 'Price approaching key resistance wall (Call Wall), breakout attempt in progress', ja: '現在の株価が主要抵抗壁（Call Wall）付近に到達し、突破を試みています' },

        // === UI Labels (3) ===
        labelMeaning: { ko: '의미', en: 'Meaning', ja: '意味' },
        labelInterpretation: { ko: '해석', en: 'Interpretation', ja: '解釈' },
        labelAction: { ko: '행동', en: 'Action', ja: 'アクション' },

        // === Data Status Labels (4) ===
        snapshotTimeData: { ko: '보고서 생성 시점 데이터', en: 'Report snapshot data', ja: 'レポート生成時点のデータ' },
        offExFlowDesc: { ko: '기관 비공개 거래소 물량', en: 'Off-exchange institutional volume', ja: '機関OTC取引量' },
        marketClosedNoFlow: { ko: '장 마감 - 기관 매수/매도 없음', en: 'Market closed — no institutional orders', ja: '場引け — 機関売買なし' },
        netBuyPressure: { ko: '실질적 매수 압력 강도', en: 'Net buy pressure intensity', ja: '実質的な買い圧力の強度' },
        marketClosed: { ko: '장 마감', en: 'Market Closed', ja: '場引け' },
    }
};

let totalAdded = 0;
['ko', 'en', 'ja'].forEach(lang => {
    const file = path.join(basePath, `${lang}.json`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));

    for (const [section, sectionKeys] of Object.entries(keys)) {
        if (!data[section]) data[section] = {};
        for (const [k, v] of Object.entries(sectionKeys)) {
            data[section][k] = v[lang];
            totalAdded++;
        }
    }

    fs.writeFileSync(file, JSON.stringify(data, null, 4) + '\n', 'utf8');
    console.log(`${lang}: Updated`);
});

console.log(`Total keys added: ${totalAdded / 3} keys × 3 languages = ${totalAdded}`);
console.log('Done!');
