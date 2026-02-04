'use client';

import { Zap, TrendingUp, TrendingDown, AlertTriangle, Shield, Activity } from 'lucide-react';

interface CommandInsightProps {
    ticker: string;
    displayPrice: number;
    structure: any;
    liveQuote: any;
    newsScore: { score: number; label: string } | null;
    macdData: { signal: string; label: string; histogram: number } | null;
    session: string;
}

type Verdict = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTION';

interface InsightResult {
    verdict: Verdict;
    briefing: string;
    factors: { label: string; status: 'positive' | 'negative' | 'neutral' }[];
}

export function CommandInsight({
    ticker,
    displayPrice,
    structure,
    liveQuote,
    newsScore,
    macdData,
    session
}: CommandInsightProps) {

    // === Data Extraction ===
    const netGex = structure?.netGex || 0;
    const maxPain = structure?.maxPain || 0;
    const callWall = structure?.levels?.callWall || 0;
    const putFloor = structure?.levels?.putFloor || 0;
    const gammaFlip = structure?.gammaFlipLevel || 0;
    const netPremium = liveQuote?.flow?.netPremium || 0;
    const zeroDteRatio = structure?.gexZeroDteRatio || 0;
    const optionsStatus = structure?.options_status;

    // === Scoring System ===
    let bullScore = 0;
    let bearScore = 0;
    const factors: InsightResult['factors'] = [];

    // 1. Price Position vs Max Pain
    if (maxPain > 0) {
        const mpDist = ((displayPrice - maxPain) / maxPain) * 100;
        if (mpDist > 2) {
            bullScore += 15;
            factors.push({ label: 'Max Pain 위', status: 'positive' });
        } else if (mpDist < -2) {
            bearScore += 15;
            factors.push({ label: 'Max Pain 아래', status: 'negative' });
        } else {
            factors.push({ label: 'Max Pain 근접', status: 'neutral' });
        }
    }

    // 2. Gamma Zone
    if (netGex > 0) {
        bullScore += 10; // Long gamma = stable, slightly bullish
        factors.push({ label: '롱감마', status: 'positive' });
    } else if (netGex < 0) {
        // Short gamma = volatile, can go either way
        factors.push({ label: '숏감마', status: 'neutral' });
    }

    // 3. Price vs Support/Resistance
    if (callWall > 0 && putFloor > 0) {
        if (displayPrice >= putFloor && displayPrice <= callWall) {
            bullScore += 10;
            factors.push({ label: '범위 내', status: 'positive' });
        } else if (displayPrice > callWall) {
            bearScore += 10; // Extended above resistance
            factors.push({ label: '저항 돌파', status: 'neutral' });
        } else if (displayPrice < putFloor) {
            bearScore += 15;
            factors.push({ label: '지지 이탈', status: 'negative' });
        }
    }

    // 4. MACD Signal
    if (macdData) {
        if (macdData.signal === 'BUY') {
            bullScore += 20;
            factors.push({ label: 'MACD 매수', status: 'positive' });
        } else if (macdData.signal === 'SELL') {
            bearScore += 20;
            factors.push({ label: 'MACD 매도', status: 'negative' });
        }
    }

    // 5. News Sentiment
    if (newsScore) {
        if (newsScore.score >= 70) {
            bullScore += 15;
            factors.push({ label: '뉴스 긍정', status: 'positive' });
        } else if (newsScore.score < 40) {
            bearScore += 15;
            factors.push({ label: '뉴스 부정', status: 'negative' });
        }
    }

    // 6. Flow Direction
    if (netPremium > 100000) {
        bullScore += 10;
        factors.push({ label: '콜 우위', status: 'positive' });
    } else if (netPremium < -100000) {
        bearScore += 10;
        factors.push({ label: '풋 우위', status: 'negative' });
    }

    // 7. 0DTE Risk
    if (zeroDteRatio > 0.3) {
        // High 0DTE = more volatility
        factors.push({ label: '0DTE 높음', status: 'neutral' });
    }

    // === Determine Verdict ===
    let verdict: Verdict = 'NEUTRAL';
    const diff = bullScore - bearScore;

    if (optionsStatus !== 'OK') {
        verdict = 'CAUTION';
    } else if (diff >= 25) {
        verdict = 'BULLISH';
    } else if (diff <= -25) {
        verdict = 'BEARISH';
    } else if (session === 'CLOSED') {
        verdict = 'NEUTRAL';
    } else {
        verdict = 'NEUTRAL';
    }

    // === Generate Briefing ===
    let briefing = '';

    if (optionsStatus !== 'OK') {
        briefing = `${ticker} 옵션 데이터 검증 중입니다. 데이터 안정화 후 분석이 가능합니다.`;
    } else if (verdict === 'BULLISH') {
        if (macdData?.signal === 'BUY' && netGex > 0) {
            briefing = `${ticker}은 MACD 매수신호와 롱감마 환경에서 안정적 상승 흐름입니다. 저항선($${callWall || '---'}) 테스트 가능성이 있습니다.`;
        } else if (displayPrice > maxPain && netPremium > 0) {
            briefing = `${ticker}은 Max Pain($${maxPain}) 위에서 콜 플로우 우위로 상승 모멘텀이 유지되고 있습니다.`;
        } else {
            briefing = `${ticker}은 복합 지표상 상승 편향입니다. 지지선($${putFloor || '---'})이 하방 방어 역할을 합니다.`;
        }
    } else if (verdict === 'BEARISH') {
        if (macdData?.signal === 'SELL' && displayPrice < putFloor) {
            briefing = `${ticker}은 MACD 매도신호와 함께 지지선($${putFloor}) 하단에서 거래 중입니다. 추가 하락 압력이 있습니다.`;
        } else if (netGex < 0 && zeroDteRatio > 0.3) {
            briefing = `${ticker}은 숏감마 + 0DTE 고비중으로 변동성 확대 구간입니다. 급격한 움직임에 주의하세요.`;
        } else {
            briefing = `${ticker}은 복합 지표상 하락 편향입니다. Max Pain($${maxPain || '---'}) 수렴 가능성을 고려하세요.`;
        }
    } else {
        if (session === 'CLOSED') {
            briefing = `시장이 마감되었습니다. ${ticker}은 내일 개장 시 방향성을 다시 확인하세요.`;
        } else if (Math.abs(displayPrice - maxPain) / maxPain < 0.01) {
            briefing = `${ticker}은 Max Pain($${maxPain}) 근처에서 균형 상태입니다. 방향성 결정 대기 중입니다.`;
        } else {
            briefing = `${ticker}은 현재 혼조세입니다. 주요 레벨 돌파 또는 이탈 시 포지션을 결정하세요.`;
        }
    }

    // === Styling ===
    const verdictConfig = {
        BULLISH: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', icon: TrendingUp },
        BEARISH: { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/30', icon: TrendingDown },
        NEUTRAL: { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/30', icon: Activity },
        CAUTION: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', icon: AlertTriangle },
    };

    const config = verdictConfig[verdict];
    const VerdictIcon = config.icon;

    return (
        <div className={`rounded-xl border ${config.border} ${config.bg} backdrop-blur-md p-4 relative overflow-hidden`}>
            {/* Background glow */}
            <div className={`absolute inset-0 bg-gradient-to-r ${verdict === 'BULLISH' ? 'from-emerald-500/5' : verdict === 'BEARISH' ? 'from-rose-500/5' : 'from-slate-500/5'} to-transparent pointer-events-none`} />

            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-black text-white uppercase tracking-widest">Command Insight</span>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${config.bg} ${config.text} border ${config.border}`}>
                        <VerdictIcon className="w-4 h-4" />
                        <span className="text-sm font-black">{verdict}</span>
                    </div>
                </div>

                {/* Briefing */}
                <p className="text-sm text-white/90 leading-relaxed mb-3">
                    {briefing}
                </p>

                {/* Factor Pills */}
                <div className="flex flex-wrap gap-1.5">
                    {factors.slice(0, 6).map((f, i) => (
                        <span
                            key={i}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${f.status === 'positive' ? 'bg-emerald-500/20 text-emerald-400' :
                                    f.status === 'negative' ? 'bg-rose-500/20 text-rose-400' :
                                        'bg-slate-600/30 text-slate-400'
                                }`}
                        >
                            {f.label}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
