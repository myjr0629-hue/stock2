'use client';

// ============================================================================
// MobileGuardianShield — Tab 3: Gamma Shield + Tactical Verdict
// Components: GammaShield (import), Tactical Verdict (inline from page.tsx L780-931)
// Data: Identical props — ZERO new logic
// ============================================================================

import React from 'react';
import dynamic from 'next/dynamic';
import { useTranslations, useLocale } from 'next-intl';
import { ProGate } from '@/components/gate/FeatureGate';
import { ValueWall } from '@/components/app/ValueWall';
import { renderColoredText } from '@/components/guardian/TypewriterText';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import { getIsMarketActive, getEffectiveSession } from '@/services/guardian/marketSessionUtils';

const GammaShield = dynamic(() => import('@/components/guardian/mobile/MobileGammaShield'), { ssr: false });
 
interface Props {
    data: any;
    loading: boolean;
    verdict: {
        title: string;
        desc: string;
        color: string;
        sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
        realityInsight?: string;
        gammaInsight?: string;
    };
    session?: string;
    useAppValueWall?: boolean;
}

type LocaleKey = 'ko' | 'en' | 'ja';

const APP_GATE_COPY: Record<LocaleKey, {
    title: string;
    previewChip: string;
    cta: string;
    adFree: string;
    social: string;
    teaserLabel: string;
    explain: string;
    features: string[];
}> = {
    ko: {
        title: '감마 방어 엔진 잠금해제',
        previewChip: '무료 미리보기',
        cta: '광고 보고 1시간 해제',
        adFree: '또는 $9.99/월 광고 제거',
        social: '오늘 14.2K 잠금해제',
        teaserLabel: '무료 미리보기 · 합성 감마 실드',
        explain: 'SPY+QQQ 옵션 구조를 합성해 변동성 방어, 스퀴즈 압축, 전환 가격대를 한 번에 읽습니다.',
        features: ['SPY+QQQ 감마 합성', '스퀴즈 압축 위험', '감마 플립 거리', '30일 레짐 검증'],
    },
    en: {
        title: 'Unlock Gamma Defense Engine',
        previewChip: 'Free Preview',
        cta: 'Watch & Unlock · 1HR',
        adFree: 'or $9.99/mo ad-free',
        social: '14.2K unlocked today',
        teaserLabel: 'FREE PREVIEW · COMPOSITE GAMMA SHIELD',
        explain: 'Combines SPY+QQQ options structure into volatility defense, squeeze compression, and trigger-zone context.',
        features: ['SPY+QQQ gamma blend', 'Squeeze compression risk', 'Gamma flip distance', '30D regime validation'],
    },
    ja: {
        title: 'ガンマ防御エンジンを解除',
        previewChip: '無料プレビュー',
        cta: '広告を見て1時間解除',
        adFree: 'または月額$9.99で広告なし',
        social: '本日14.2K件解除',
        teaserLabel: '無料プレビュー · 合成ガンマシールド',
        explain: 'SPY+QQQのオプション構造を統合し、変動性防御、スクイーズ圧縮、転換ゾーンを読み取ります。',
        features: ['SPY+QQQガンマ統合', 'スクイーズ圧縮リスク', 'ガンマフリップ距離', '30日レジーム検証'],
    },
};

function asLocaleKey(locale: string): LocaleKey {
    return locale === 'ja' || locale === 'en' ? locale : 'ko';
}

function getGammaGateValue(gammaShield: any, locale: LocaleKey): string {
    const level = gammaShield?.gexLevel;
    const gexIndex = typeof gammaShield?.gexIndex === 'number'
        ? `GEX ${gammaShield.gexIndex > 0 ? '+' : ''}${gammaShield.gexIndex}`
        : null;
    const label = level === 'LONG_GAMMA'
        ? (locale === 'ko' ? 'LONG GAMMA · 흡수' : locale === 'ja' ? 'LONG GAMMA · 吸収' : 'LONG GAMMA · Absorb')
        : level === 'SHORT_GAMMA'
            ? (locale === 'ko' ? 'SHORT GAMMA · 확대' : locale === 'ja' ? 'SHORT GAMMA · 拡大' : 'SHORT GAMMA · Expand')
            : (locale === 'ko' ? 'NEUTRAL · 범위감시' : locale === 'ja' ? 'NEUTRAL · 範囲監視' : 'NEUTRAL · Range');
    return [label, gexIndex].filter(Boolean).join(' · ');
}

function GammaGateSubtitle({ locale }: { locale: LocaleKey }) {
    const copy = APP_GATE_COPY[locale];
    return (
        <div style={{ display: 'grid', gap: 8, textAlign: 'left', width: '100%' }}>
            <div style={{ color: 'rgba(226,232,240,0.92)', lineHeight: 1.45, textAlign: 'center' }}>
                {copy.explain}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                {copy.features.map((feature) => (
                    <div
                        key={feature}
                        style={{
                            minWidth: 0,
                            padding: '7px 8px',
                            borderRadius: 9,
                            color: 'rgba(224,242,254,0.95)',
                            background: 'linear-gradient(145deg, rgba(8,145,178,0.13), rgba(15,23,42,0.48))',
                            border: '1px solid rgba(34,211,238,0.16)',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.045)',
                            fontWeight: 800,
                            fontSize: 10,
                            lineHeight: 1.25,
                            overflowWrap: 'anywhere',
                        }}
                    >
                        {feature}
                    </div>
                ))}
            </div>
        </div>
    );
}

const GAMMA_AI_COPY: Record<LocaleKey, {
    engine: string;
    status: string;
    thesis: string;
    evidence: string;
    trigger: string;
    aiBrief: string;
    compliance: string;
    noData: string;
    confidence: string;
    gex: string;
    squeeze: string;
    triggerBand: string;
    flipDistance: string;
    supportDistance: string;
    resistanceDistance: string;
    longGammaTitle: string;
    longGammaBody: string;
    shortGammaTitle: string;
    shortGammaBody: string;
    neutralTitle: string;
    neutralBody: string;
    lowSqueeze: string;
    mediumSqueeze: string;
    highSqueeze: string;
    extremeSqueeze: string;
    supportWatch: string;
    resistanceWatch: string;
    rangeWatch: string;
    current: string;
    support: string;
    flip: string;
    resistance: string;
    showDetails: string;
    hideDetails: string;
}> = {
    ko: {
        engine: '감마 방어 엔진',
        status: '상태',
        thesis: '핵심 결론',
        evidence: '근거',
        trigger: '가격 조건',
        aiBrief: 'AI 해석',
        compliance: '정보 제공용 분석이며 매수·매도 지시가 아닙니다. 실제 판단은 가격 반응과 리스크 관리 기준으로 확인하세요.',
        noData: '옵션 유동성 데이터 분석 대기 중...',
        confidence: '신뢰도',
        gex: '감마 레짐',
        squeeze: '스퀴즈',
        triggerBand: '트리거 밴드',
        flipDistance: '플립 거리',
        supportDistance: '지지 거리',
        resistanceDistance: '저항 거리',
        longGammaTitle: '변동성 흡수 우위',
        longGammaBody: '딜러 감마가 완충 역할을 하는 구간입니다. 급격한 방향 추격보다 레인지와 벽 반응 확인이 더 중요합니다.',
        shortGammaTitle: '변동성 확대 주의',
        shortGammaBody: '딜러 헤지가 가격 움직임을 키울 수 있는 구간입니다. 플립과 벽 돌파 여부를 우선 확인해야 합니다.',
        neutralTitle: '중립 레인지 관찰',
        neutralBody: '방향성보다 지지·저항 사이의 균형이 핵심입니다. 플립 전후 반응이 다음 레짐을 결정합니다.',
        lowSqueeze: '압축 낮음',
        mediumSqueeze: '압축 형성',
        highSqueeze: '압축 높음',
        extremeSqueeze: '압축 극단',
        supportWatch: '지지 벽 이탈 시 방어 구조가 약해질 수 있습니다.',
        resistanceWatch: '저항 벽 돌파 시 상방 재가격 가능성을 확인합니다.',
        rangeWatch: '현재가는 방어 밴드 내부입니다. 플립과 양쪽 벽 반응을 함께 보세요.',
        current: '현재',
        support: '지지',
        flip: '플립',
        resistance: '저항',
        showDetails: '상세 해석 보기',
        hideDetails: '상세 접기',
    },
    en: {
        engine: 'Gamma Defense Engine',
        status: 'Status',
        thesis: 'Core Read',
        evidence: 'Evidence',
        trigger: 'Price Condition',
        aiBrief: 'AI Brief',
        compliance: 'For informational use only. This is not a buy or sell instruction; confirm with price action and your own risk rules.',
        noData: 'Waiting for option liquidity analysis...',
        confidence: 'Confidence',
        gex: 'Gamma Regime',
        squeeze: 'Squeeze',
        triggerBand: 'Trigger Band',
        flipDistance: 'Flip Distance',
        supportDistance: 'Support Distance',
        resistanceDistance: 'Resistance Distance',
        longGammaTitle: 'Volatility Absorption',
        longGammaBody: 'Dealer gamma is acting as a cushion. Range behavior and wall reactions matter more than chasing direction.',
        shortGammaTitle: 'Volatility Expansion Risk',
        shortGammaBody: 'Dealer hedging can amplify price movement. Watch the flip level and wall breaks first.',
        neutralTitle: 'Neutral Range Watch',
        neutralBody: 'The structure is balanced. Reactions around the flip and both walls will define the next regime.',
        lowSqueeze: 'Low compression',
        mediumSqueeze: 'Compression building',
        highSqueeze: 'High compression',
        extremeSqueeze: 'Extreme compression',
        supportWatch: 'A break below support can weaken the defense structure.',
        resistanceWatch: 'A break above resistance can confirm upside repricing pressure.',
        rangeWatch: 'Price remains inside the defense band. Watch both walls and the flip level together.',
        current: 'Current',
        support: 'Support',
        flip: 'Flip',
        resistance: 'Resistance',
        showDetails: 'Show Full Brief',
        hideDetails: 'Hide Details',
    },
    ja: {
        engine: 'ガンマ防御エンジン',
        status: '状態',
        thesis: '核心判断',
        evidence: '根拠',
        trigger: '価格条件',
        aiBrief: 'AI解釈',
        compliance: '情報提供目的の分析であり、売買指示ではありません。実際の判断は価格反応とリスク管理基準で確認してください。',
        noData: 'オプション流動性データ分析待機中...',
        confidence: '信頼度',
        gex: 'ガンマ体制',
        squeeze: 'スクイーズ',
        triggerBand: 'トリガーバンド',
        flipDistance: 'フリップ距離',
        supportDistance: '支持距離',
        resistanceDistance: '抵抗距離',
        longGammaTitle: 'ボラティリティ吸収優位',
        longGammaBody: 'ディーラー・ガンマがクッションとして働く領域です。方向追随よりレンジと壁の反応確認が重要です。',
        shortGammaTitle: 'ボラティリティ拡大に注意',
        shortGammaBody: 'ディーラーのヘッジが値動きを増幅しやすい領域です。フリップ水準と壁の突破を優先して確認します。',
        neutralTitle: '中立レンジ監視',
        neutralBody: '構造は均衡しています。フリップ前後と両側の壁の反応が次の体制を決めます。',
        lowSqueeze: '圧縮低め',
        mediumSqueeze: '圧縮形成',
        highSqueeze: '圧縮高め',
        extremeSqueeze: '圧縮極端',
        supportWatch: '支持壁を下回ると防御構造が弱まる可能性があります。',
        resistanceWatch: '抵抗壁を上回ると上方向の再評価圧力を確認します。',
        rangeWatch: '現在値は防御バンド内です。両側の壁とフリップ水準を一緒に確認してください。',
        current: '現在',
        support: '支持',
        flip: 'フリップ',
        resistance: '抵抗',
        showDetails: '詳細解釈を見る',
        hideDetails: '詳細を閉じる',
    },
};

function formatSigned(value: number | null | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return `${value > 0 ? '+' : ''}${value}`;
}

function distancePct(from: number | null | undefined, to: number | null | undefined): number | null {
    if (typeof from !== 'number' || typeof to !== 'number' || !Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
    return ((to - from) / from) * 100;
}

function formatDistance(value: number | null): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function getInsightPreview(text: string, max = 110): string {
    const compact = text.replace(/\s+/g, ' ').trim();
    return compact.length > max ? `${compact.slice(0, max).trim()}...` : compact;
}

function getSqueezeLabel(level: string | undefined, copy: typeof GAMMA_AI_COPY[LocaleKey]): string {
    if (level === 'EXTREME') return copy.extremeSqueeze;
    if (level === 'HIGH') return copy.highSqueeze;
    if (level === 'MEDIUM') return copy.mediumSqueeze;
    return copy.lowSqueeze;
}

function getGammaThesis(gammaShield: any, copy: typeof GAMMA_AI_COPY[LocaleKey]) {
    const level = gammaShield?.gexLevel;
    if (level === 'LONG_GAMMA') {
        return { title: copy.longGammaTitle, body: copy.longGammaBody, tone: 'emerald' };
    }
    if (level === 'SHORT_GAMMA') {
        return { title: copy.shortGammaTitle, body: copy.shortGammaBody, tone: 'rose' };
    }
    return { title: copy.neutralTitle, body: copy.neutralBody, tone: 'amber' };
}

function getPriceCondition(gammaShield: any, copy: typeof GAMMA_AI_COPY[LocaleKey]): string {
    const current = gammaShield?.currentPrice;
    const support = gammaShield?.supportWall;
    const resistance = gammaShield?.resistanceWall;
    if (typeof current === 'number' && typeof support === 'number' && current < support) return copy.supportWatch;
    if (typeof current === 'number' && typeof resistance === 'number' && current > resistance) return copy.resistanceWatch;
    return copy.rangeWatch;
}

function getAiLogicPoints(gammaShield: any, localeKey: LocaleKey, copy: typeof GAMMA_AI_COPY[LocaleKey]) {
    const gexText = [formatSigned(gammaShield?.gexIndex), gammaShield?.gexLabel || gammaShield?.gexLevel].filter(Boolean).join(' · ');
    const squeezeText = typeof gammaShield?.squeezeRisk === 'number'
        ? `${Math.round(gammaShield.squeezeRisk)}% · ${getSqueezeLabel(gammaShield?.squeezeLevel, copy)}`
        : getSqueezeLabel(gammaShield?.squeezeLevel, copy);
    const supportDistance = distancePct(gammaShield?.currentPrice, gammaShield?.supportWall);
    const flipDistance = distancePct(gammaShield?.currentPrice, gammaShield?.gammaFlipPoint);
    const resistanceDistance = distancePct(gammaShield?.currentPrice, gammaShield?.resistanceWall);
    const priceText = localeKey === 'ja'
        ? `支持 ${formatDistance(supportDistance)} · フリップ ${formatDistance(flipDistance)} · 抵抗 ${formatDistance(resistanceDistance)}`
        : localeKey === 'en'
            ? `Support ${formatDistance(supportDistance)} · Flip ${formatDistance(flipDistance)} · Resistance ${formatDistance(resistanceDistance)}`
            : `지지 ${formatDistance(supportDistance)} · 플립 ${formatDistance(flipDistance)} · 저항 ${formatDistance(resistanceDistance)}`;

    if (localeKey === 'ja') {
        return [
            { label: '構造解釈', value: gexText || '—', body: 'ガンマ水準と圧縮度を合わせて、変動性が吸収されるのか拡大しやすいのかを判断します。' },
            { label: '圧縮状態', value: squeezeText, body: '低い圧縮はレンジ継続、高い圧縮はブレイク時の速度変化に注意します。' },
            { label: '確認条件', value: priceText, body: getPriceCondition(gammaShield, copy) },
        ];
    }

    if (localeKey === 'en') {
        return [
            { label: 'Structure Read', value: gexText || '—', body: 'Combines gamma regime and compression to judge whether volatility is being absorbed or can expand.' },
            { label: 'Compression State', value: squeezeText, body: 'Low compression favors range behavior; high compression makes break reactions more important.' },
            { label: 'Confirmation Path', value: priceText, body: getPriceCondition(gammaShield, copy) },
        ];
    }

    return [
        { label: '구조 해석', value: gexText || '—', body: '감마 레짐과 압축도를 함께 읽어 변동성이 흡수되는지, 확대될 수 있는지 판단합니다.' },
        { label: '압축 상태', value: squeezeText, body: '압축이 낮으면 레인지 유지, 높아지면 돌파 시 속도 변화 가능성을 우선 확인합니다.' },
        { label: '확인 조건', value: priceText, body: getPriceCondition(gammaShield, copy) },
    ];
}

function GammaShieldAiCard({
    gammaShield,
    gammaInsight,
    effectiveSession,
    localeKey,
}: {
    gammaShield: any;
    gammaInsight?: string;
    effectiveSession: string;
    localeKey: LocaleKey;
}) {
    const [showDetails, setShowDetails] = React.useState(false);
    const copy = GAMMA_AI_COPY[localeKey];
    const thesis = getGammaThesis(gammaShield, copy);
    const logicPoints = getAiLogicPoints(gammaShield, localeKey, copy);
    const toneClass = thesis.tone === 'rose'
        ? 'text-rose-300 border-rose-400/20 bg-rose-500/10'
        : thesis.tone === 'emerald'
            ? 'text-emerald-300 border-emerald-400/20 bg-emerald-500/10'
            : 'text-amber-300 border-amber-400/20 bg-amber-500/10';

    return (
        <div
            className="relative overflow-hidden rounded-xl border border-cyan-400/20 p-3 shadow-2xl"
            style={{
                background: 'radial-gradient(circle at 16% 0%, rgba(20,184,166,0.18), transparent 34%), linear-gradient(145deg, rgba(15,23,42,0.96), rgba(2,6,23,0.98))',
                boxShadow: '0 18px 48px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.045)',
            }}
        >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/45 to-transparent" />
            <div className="absolute -right-14 -top-14 h-32 w-32 rounded-full bg-cyan-400/10 blur-2xl" />

            <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                        <img
                            src="/signum-sg-vectorized.svg"
                            alt="AI"
                            width={15}
                            height={15}
                            style={{ objectFit: 'contain', filter: 'drop-shadow(0 0 4px rgba(34,211,238,0.45))' }}
                        />
                        <h3 className="text-[12px] font-black uppercase tracking-[0.18em] text-cyan-300 font-jakarta">
                            GAMMA SHIELD AI
                        </h3>
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                        {copy.engine} · {effectiveSession === 'REG' ? 'Live' : 'Standby'}
                    </div>
                </div>
                <span className="shrink-0 rounded-md border border-cyan-400/20 bg-cyan-950/70 px-2 py-1 text-[9px] font-black text-cyan-300">
                    CLAUDE
                </span>
            </div>

            <div className={`relative mt-3 rounded-xl border p-2.5 ${toneClass}`}>
                <div className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] opacity-80">
                    {copy.thesis}
                </div>
                <div className="text-[16px] font-black leading-tight text-white">
                    {thesis.title}
                </div>
                <p className="mt-1.5 text-[12px] font-semibold leading-[1.55] text-slate-200/90">
                    {thesis.body}
                </p>
            </div>

            <div className="relative mt-3 rounded-xl border border-cyan-400/15 bg-slate-950/35 p-2.5">
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-300">{copy.evidence}</span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{copy.trigger}</span>
                </div>
                <div className="space-y-2">
                    {logicPoints.map((point) => (
                        <div key={point.label} className="rounded-lg border border-white/7 bg-black/20 p-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[9px] font-black uppercase tracking-[0.09em] text-slate-500">{point.label}</span>
                                <span className="max-w-[58%] truncate text-right text-[10px] font-black text-cyan-200">{point.value}</span>
                            </div>
                            <p className="mt-1 text-[11px] font-semibold leading-[1.45] text-slate-200/88">{point.body}</p>
                        </div>
                    ))}
                </div>
            </div>

            {gammaInsight ? (
                <div className="relative mt-3 rounded-xl border border-white/8 bg-black/20 p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{copy.aiBrief}</div>
                        <button
                            type="button"
                            onClick={() => setShowDetails((value) => !value)}
                            className="shrink-0 rounded-md border border-cyan-400/20 bg-cyan-950/40 px-2 py-1 text-[9px] font-black text-cyan-300"
                        >
                            {showDetails ? copy.hideDetails : copy.showDetails}
                        </button>
                    </div>
                    <div className="text-[12px] text-white/92 leading-[1.65] whitespace-pre-wrap" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                        {renderColoredText(showDetails ? gammaInsight : getInsightPreview(gammaInsight))}
                    </div>
                </div>
            ) : (
                <div className="relative mt-3 flex items-center gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                    <div className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-[12px] text-slate-300 font-medium">{copy.noData}</span>
                </div>
            )}

            <div className="relative mt-3 rounded-lg border border-amber-400/15 bg-amber-500/8 px-2.5 py-2 text-[10px] font-semibold leading-[1.45] text-amber-100/80">
                {copy.compliance}
            </div>
        </div>
    );
}
 
export default function MobileGuardianShield({ data, verdict, session, useAppValueWall = false }: Props) {
    const gt = useTranslations('gate');
    const locale = useLocale();
    const localeKey = asLocaleKey(locale);
    const appGateCopy = APP_GATE_COPY[localeKey];
    const { status: marketStatusInfo } = useMarketStatus();
    const isMarketActive = getIsMarketActive(session, marketStatusInfo.isHoliday);
    const effectiveSession = getEffectiveSession(session);
    const gammaShield = data?.gammaShield;
    const gammaShieldCard = <GammaShield data={gammaShield} isMarketActive={isMarketActive} />;
 
    return (
        <div className="space-y-3">
            {/* ── GAMMA SHIELD ── */}
            {useAppValueWall ? (
                <ValueWall
                    compact
                    title={appGateCopy.title}
                    subtitle={<GammaGateSubtitle locale={localeKey} />}
                    teaser={{
                        label: appGateCopy.teaserLabel,
                        value: getGammaGateValue(gammaShield, localeKey),
                    }}
                    ctaLabel={appGateCopy.cta}
                    adFreeLabel={appGateCopy.adFree}
                    previewChipLabel={appGateCopy.previewChip}
                    socialProof={appGateCopy.social}
                    lockedPreview={gammaShieldCard}
                >
                    {gammaShieldCard}
                </ValueWall>
            ) : (
                <ProGate title="Gamma Shield" fomoMessage={gt('fomoGammaShield')} description={gt('descGammaShield')} mode="blur" compact>
                    {gammaShieldCard}
                </ProGate>
            )}
 
            {/* ── GAMMA SHIELD AI ANALYSIS ── */}
            <ProGate title="Gamma Shield AI" fomoMessage={gt('fomoGammaShield')} description={gt('descGammaShield')} mode="blur">
                <GammaShieldAiCard
                    gammaShield={gammaShield}
                    gammaInsight={verdict.gammaInsight}
                    effectiveSession={effectiveSession}
                    localeKey={localeKey}
                />
            </ProGate>
        </div>
    );
}
