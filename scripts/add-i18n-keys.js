const fs = require('fs');
const path = require('path');

const basePath = path.join(__dirname, '..', 'src', 'messages');

const keys = {
    dashboard: {
        insight: {
            maxPainAbove: { ko: 'Max Pain 상단', en: 'Above Max Pain', ja: 'Max Pain 上方' },
            maxPainBelow: { ko: 'Max Pain 하단', en: 'Below Max Pain', ja: 'Max Pain 下方' },
            maxPainNear: { ko: 'Max Pain 근접', en: 'Near Max Pain', ja: 'Max Pain 付近' },
            longGammaStable: { ko: 'Long Gamma (안정)', en: 'Long Gamma (Stable)', ja: 'Long Gamma (安定)' },
            shortGammaVolatile: { ko: 'Short Gamma (변동성↑)', en: 'Short Gamma (Volatility↑)', ja: 'Short Gamma (ボラ↑)' },
            callFlowDominant: { ko: 'Call Flow 우세', en: 'Call Flow Dominant', ja: 'Call Flow 優勢' },
            putFlowDominant: { ko: 'Put Flow 우세', en: 'Put Flow Dominant', ja: 'Put Flow 優勢' },
            newsPositive: { ko: '뉴스 긍정적', en: 'News Positive', ja: 'ニュース好材料' },
            newsNegative: { ko: '뉴스 부정적', en: 'News Negative', ja: 'ニュース悪材料' },
            rumorDetected: { ko: '⚠️ 루머 감지', en: '⚠️ Rumor Detected', ja: '⚠️ Rumor 検知' },
            vwapAbove: { ko: 'VWAP 상회 +{pct}%', en: 'Above VWAP +{pct}%', ja: 'VWAP 上回り +{pct}%' },
            vwapBelow: { ko: 'VWAP 하회 {pct}%', en: 'Below VWAP {pct}%', ja: 'VWAP 下回り {pct}%' },
            analystBuy: { ko: 'Analyst {pct}% Buy', en: 'Analyst {pct}% Buy', ja: 'Analyst {pct}% Buy' },
            fundamentalGrade: { ko: 'Fundamental {grade}', en: 'Fundamental {grade}', ja: 'Fundamental {grade}' },
            darkPoolBuy: { ko: 'Dark Pool Buy {pct}%', en: 'Dark Pool Buy {pct}%', ja: 'Dark Pool Buy {pct}%' },
            darkPoolSell: { ko: 'Dark Pool Sell {pct}%', en: 'Dark Pool Sell {pct}%', ja: 'Dark Pool Sell {pct}%' },
            zeroDteHigh: { ko: '0DTE 고비중', en: '0DTE High Weight', ja: '0DTE 高比率' },
            overbought: { ko: '과매수', en: 'Overbought', ja: '買われ過ぎ' },
            oversold: { ko: '과매도', en: 'Oversold', ja: '売られ過ぎ' },
            rsiNeutral: { ko: '중립', en: 'Neutral', ja: '中立' },
        },
        verdict: {
            bullish: { ko: '상승', en: 'Bullish', ja: '強気' },
            bearish: { ko: '하락', en: 'Bearish', ja: '弱気' },
            neutral: { ko: '중립', en: 'Neutral', ja: '中立' },
            watch: { ko: '관망', en: 'Watch', ja: '様子見' },
            caution: { ko: '대기', en: 'Standby', ja: '待機' },
            bullishBias: { ko: '상승 편향', en: 'Bullish Bias', ja: '上昇バイアス' },
            bearishBias: { ko: '하락 편향', en: 'Bearish Bias', ja: '下落バイアス' },
        },
        session: {
            preMarket: { ko: '프리마켓', en: 'Pre-Market', ja: 'プレマーケット' },
            afterMarket: { ko: '애프터마켓', en: 'After-Hours', ja: 'アフターマーケット' },
            closed: { ko: '마감', en: 'Closed', ja: 'クローズ' },
        },
        briefing: {
            dataValidating: { ko: '옵션 데이터 검증 중입니다.', en: 'Validating options data.', ja: 'オプションデータ検証中です。' },
            dataStabilizing: { ko: '데이터 안정화 후 분석이 진행됩니다.', en: 'Analysis will proceed after data stabilization.', ja: 'データ安定化後に分析が開始されます。' },
            sessionAnalysis: {
                ko: '{session} 세션 — SMA·뉴스 기반 분석 (옵션 분석은 본장에만 제공)',
                en: '{session} Session — SMA & News-based analysis (Options analysis available during regular hours only)',
                ja: '{session} セッション — SMA·ニュース分析 (オプション分析はレギュラーセッションのみ)'
            },
            detectedSignals: { ko: '감지된 시그널: {signals}', en: 'Detected signals: {signals}', ja: '検知シグナル: {signals}' },
            waitForRegular: {
                ko: '{ticker}의 실시간 옵션 구조 분석은 정규장(9:30~16:00 ET) 개장 시 자동으로 시작됩니다.',
                en: 'Real-time options structure analysis for {ticker} will begin automatically at regular session open (9:30-16:00 ET).',
                ja: '{ticker}のリアルタイムオプション構造分析はレギュラーセッション開始時(9:30~16:00 ET)に自動で開始されます。'
            },
            bullishGoldenCross: {
                ko: '{ticker}은 Long Gamma 환경에서 Golden Cross가 확인되었습니다.',
                en: '{ticker} confirmed Golden Cross in Long Gamma environment.',
                ja: '{ticker}はLong Gamma環境でGolden Crossが確認されました。'
            },
            bullishGoldenCrossSub: {
                ko: '딜러들의 Gamma Hedging으로 변동성이 억제되어 안정적인 상승 흐름이 예상됩니다. Call Wall({cw})까지 상승 여력이 있으며, Put Floor({pf})이 하방을 방어합니다.',
                en: 'Dealer gamma hedging suppresses volatility, supporting stable uptrend. Upside potential to Call Wall({cw}), with Put Floor({pf}) defending downside.',
                ja: 'ディーラーのGamma Hedgingによりボラティリティが抑制され、安定的な上昇が期待されます。Call Wall({cw})まで上昇余地があり、Put Floor({pf})が下方を防御しています。'
            },
            bullishCallFlow: {
                ko: '{ticker}에 Call 매수세가 우위를 보이고 있습니다.',
                en: 'Call buying dominates for {ticker}.',
                ja: '{ticker}でCall買い優勢が確認されています。'
            },
            bullishCallFlowSub: {
                ko: '기관 Flow가 상승 방향으로 정렬되어 있으며, Max Pain({mp}) 위에서 거래 중입니다. Call Wall({cw}) 테스트 가능성이 높습니다.',
                en: 'Institutional flow aligned bullish, trading above Max Pain({mp}). Call Wall({cw}) test likely.',
                ja: '機関フローが上昇方向に整列しており、Max Pain({mp})の上方で取引中です。Call Wall({cw})テストの可能性が高いです。'
            },
            bullishComposite: {
                ko: '{ticker}은 복합 지표상 상승 우위입니다.',
                en: '{ticker} shows bullish advantage across composite indicators.',
                ja: '{ticker}は複合指標上、上昇優位です。'
            },
            bullishCompositeSub: {
                ko: 'SMA, 옵션 구조, Flow 데이터가 전반적으로 상승 편향을 보이고 있습니다. Put Floor({pf})이 견고하며 추가 상승 여력이 있습니다.',
                en: 'SMA, options structure, and flow data show overall bullish bias. Put Floor({pf}) is solid with further upside potential.',
                ja: 'SMA、オプション構造、フローが全般的に上昇バイアスです。Put Floor({pf})が堅固で、追加上昇余地があります。'
            },
            bearishDeadCross: {
                ko: '{ticker}은 Short Gamma 환경에서 Dead Cross가 확인되었습니다.',
                en: '{ticker} confirmed Dead Cross in Short Gamma environment.',
                ja: '{ticker}はShort Gamma環境でDead Crossが確認されました。'
            },
            bearishDeadCrossSub: {
                ko: '딜러들의 역방향 Hedging으로 가격 변동이 증폭될 수 있습니다. Max Pain({mp})으로의 수렴 압력이 있으며, Put Floor({pf}) 이탈 시 하락 가속 가능성이 있습니다.',
                en: 'Dealer reverse hedging may amplify price movement. Convergence pressure toward Max Pain({mp}), with acceleration risk if Put Floor({pf}) breaks.',
                ja: 'ディーラーの逆方向ヘッジにより価格変動が増幅される可能性があります。Max Pain({mp})への収束圧力があり、Put Floor({pf})を割り込むと下落加速の可能性があります。'
            },
            bearishPutFlow: {
                ko: '{ticker}에 Put 매수세가 우위를 보이고 있습니다.',
                en: 'Put buying dominates for {ticker}.',
                ja: '{ticker}でPut買い優勢が確認されています。'
            },
            bearishPutFlowSub: {
                ko: '기관 Flow가 하락 방향으로 정렬되어 있습니다. Put Floor({pf}) 하단 이탈 시 추가 하락이 예상되며, Max Pain({mp}) 수렴을 주시하세요.',
                en: 'Institutional flow aligned bearish. Further downside expected if Put Floor({pf}) breaks, watch Max Pain({mp}) convergence.',
                ja: '機関フローが下落方向に整列しています。Put Floor({pf})を下回ると追加下落が予想されます。Max Pain({mp})収束にご注目ください。'
            },
            bearishComposite: {
                ko: '{ticker}은 복합 지표상 하락 우위입니다.',
                en: '{ticker} shows bearish advantage across composite indicators.',
                ja: '{ticker}は複合指標上、下落優位です。'
            },
            bearishCompositeSub: {
                ko: 'MACD, 옵션 구조, Flow 데이터가 전반적으로 하락 편향을 보이고 있습니다. Put Floor({pf}) 테스트 가능성이 있으며 신중한 접근이 필요합니다.',
                en: 'MACD, options structure, and flow data show overall bearish bias. Put Floor({pf}) test possible, cautious approach recommended.',
                ja: 'MACD、オプション構造、フローが全般的に下落バイアスです。Put Floor({pf})テストの可能性があり、慎重な対応が必要です。'
            },
            neutralDirection: {
                ko: '{ticker}은 현재 방향성이 불명확합니다.',
                en: '{ticker} direction is currently unclear.',
                ja: '{ticker}は現在、方向性が不明確です。'
            },
            neutralNearMaxPain: {
                ko: '현재가가 Max Pain({mp}) 근처에서 거래 중이며 균형 상태입니다. Call Wall({cw}) 또는 Put Floor({pf}) 돌파 확인 후 방향 결정을 권장합니다.',
                en: 'Price trading near Max Pain({mp}) in equilibrium. Recommended to confirm direction after Call Wall({cw}) or Put Floor({pf}) breakout.',
                ja: '現在価格がMax Pain({mp})付近で取引中で均衡状態です。Call Wall({cw})またはPut Floor({pf})ブレイクアウト確認後に方向を決定することを推奨します。'
            },
            neutralMixed: {
                ko: '상승과 하락 요인이 혼재되어 있습니다. 주요 레벨(Call Wall: {cw}, Put Floor: {pf}) 돌파 시 추세 방향이 결정될 것으로 예상됩니다.',
                en: 'Mixed bullish and bearish factors. Trend direction expected to resolve upon key level breakout (Call Wall: {cw}, Put Floor: {pf}).',
                ja: '上昇と下落要因が混在しています。主要レベル(Call Wall: {cw}, Put Floor: {pf})ブレイク時にトレンド方向が決定される見込みです。'
            },
        }
    }
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

['ko', 'en', 'ja'].forEach(lang => {
    const file = path.join(basePath, `${lang}.json`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));

    // Add dashboard section
    data.dashboard = extractLang(keys.dashboard, lang);

    fs.writeFileSync(file, JSON.stringify(data, null, 4) + '\n', 'utf8');

    // Count keys
    function count(obj) {
        let c = 0;
        for (const v of Object.values(obj)) {
            if (typeof v === 'object' && v !== null) c += count(v);
            else c++;
        }
        return c;
    }
    console.log(`${lang}: dashboard section added (${count(data.dashboard)} keys)`);
});

console.log('Done!');
