import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import { IndicatorCard } from '@/components/IndicatorCard';

export default function WatchlistGuidePage() {
    return (
        <HowItWorksLayout
            title="WATCHLIST"
            subtitle="관심 종목의 주요 지표를 한눈에 모니터링합니다"
        >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Alpha Column */}
                <IndicatorCard
                    title="Alpha 컬럼"
                    badge="점수"
                    badgeColor="cyan"
                    meaning="각 종목의 Alpha Score를 숫자로 표시합니다. 등급(A/B/C/D/F)과 함께 빠르게 강도를 파악할 수 있습니다."
                    interpretation={
                        <p className="text-slate-300">
                            숫자 옆의 색상으로 등급을 구분합니다.
                            <span className="text-emerald-400 font-bold"> 초록</span>은 강세,
                            <span className="text-rose-400 font-bold"> 빨강</span>은 약세입니다.
                        </p>
                    }
                />

                {/* Whale Index */}
                <IndicatorCard
                    title="Whale Index"
                    badge="고래 지수"
                    badgeColor="amber"
                    meaning="GEX와 Put/Call Ratio를 기반으로 기관(고래)의 매집/배포 상태를 추정합니다."
                    interpretation={
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <span className="w-16 text-emerald-400 font-bold text-sm">60+</span>
                                <span className="text-slate-400 text-sm">HIGH - 강한 매집 신호</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-16 text-amber-400 font-bold text-sm">40-59</span>
                                <span className="text-slate-400 text-sm">MED - 보통 관심도</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-16 text-rose-400 font-bold text-sm">0-39</span>
                                <span className="text-slate-400 text-sm">LOW - 낮은 관심 또는 배포</span>
                            </div>
                        </div>
                    }
                />

                {/* RSI */}
                <IndicatorCard
                    title="RSI (14)"
                    badge="모멘텀"
                    badgeColor="emerald"
                    meaning="14일 상대강도지수입니다. 과매수/과매도 상태를 판단하는 기술적 지표입니다."
                    interpretation={
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <span className="w-16 text-rose-400 font-bold text-sm">70+</span>
                                <span className="text-slate-400 text-sm">과매수 - 조정 가능성</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-16 text-white font-bold text-sm">30-70</span>
                                <span className="text-slate-400 text-sm">중립 구간</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-16 text-emerald-400 font-bold text-sm">30-</span>
                                <span className="text-slate-400 text-sm">과매도 - 반등 가능성</span>
                            </div>
                        </div>
                    }
                />

                {/* GammaFlip Column */}
                <IndicatorCard
                    title="GammaFlip 컬럼"
                    badge="감마"
                    badgeColor="rose"
                    meaning="종목의 Gamma Flip Level 또는 현재 감마 상태를 표시합니다."
                    interpretation={
                        <div className="space-y-3">
                            <div className="p-3 rounded-xl bg-slate-500/10 border border-slate-500/20">
                                <span className="text-white font-bold">$XXX</span>
                                <p className="text-sm text-slate-400 mt-1">Gamma Flip 가격 + 현재 감마 구간</p>
                            </div>
                            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                <span className="text-rose-400 font-bold">SHORT</span>
                                <p className="text-sm text-slate-400 mt-1">전 구간 숏감마 (Flip 없음)</p>
                            </div>
                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <span className="text-emerald-400 font-bold">LONG</span>
                                <p className="text-sm text-slate-400 mt-1">전 구간 롱감마 (Flip 없음)</p>
                            </div>
                        </div>
                    }
                />

                {/* MaxPain */}
                <IndicatorCard
                    title="MaxPain 컬럼"
                    badge="만기"
                    badgeColor="cyan"
                    meaning="옵션 만기일에 옵션 보유자들의 손실을 최대화하는 가격입니다. 만기일 접근 시 이 가격으로 수렴하는 경향이 있습니다."
                    interpretation={
                        <div className="space-y-2">
                            <p className="text-slate-300 text-sm">
                                현재가 대비 MaxPain까지의 거리(%)도 함께 표시됩니다:
                            </p>
                            <div className="flex items-center gap-3">
                                <span className="text-emerald-400 font-bold text-sm">↑ +2.5%</span>
                                <span className="text-slate-400 text-sm">상승 여력 있음</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-rose-400 font-bold text-sm">↓ -1.8%</span>
                                <span className="text-slate-400 text-sm">하락 압력 있음</span>
                            </div>
                        </div>
                    }
                />

                {/* GEX Column */}
                <IndicatorCard
                    title="GEX 컬럼"
                    badge="감마 노출"
                    badgeColor="amber"
                    meaning="종목의 Net GEX를 백만 달러 단위로 표시하고 롱/숏 상태를 배지로 나타냅니다."
                    interpretation={
                        <div className="space-y-3">
                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <span className="text-emerald-400 font-bold">LONG (+$X.XM)</span>
                                <p className="text-sm text-slate-400 mt-1">딜러 롱감마 → 변동성 억제</p>
                            </div>
                            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                <span className="text-rose-400 font-bold">SHORT (-$X.XM)</span>
                                <p className="text-sm text-slate-400 mt-1">딜러 숏감마 → 변동성 확대</p>
                            </div>
                        </div>
                    }
                />
            </div>
        </HowItWorksLayout>
    );
}
