import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import Image from 'next/image';

export default function GuardianGuidePage() {
    return (
        <HowItWorksLayout
            title="GUARDIAN"
            subtitle="시장 전체의 GEX 포지셔닝과 거시적 상황을 분석합니다"
        >
            {/* Value Indicator Banner */}
            <div className="flex items-center gap-4 p-4 rounded-lg bg-gradient-to-r from-emerald-900/30 to-transparent border border-emerald-500/20">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Strategic Value</span>
                </div>
                <span className="text-sm text-slate-300">시장 전체의 방향성과 변동성 레짐을 파악하는 가장 높은 레벨의 분석 도구</span>
            </div>

            {/* Gravity Gauge Section */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Screenshot */}
                <div className="relative rounded-xl overflow-hidden border border-white/10 bg-slate-900/50">
                    <Image
                        src="/guide/guardian-gravity-gauge.png"
                        alt="Gravity Gauge"
                        width={400}
                        height={280}
                        className="w-full h-auto"
                    />
                </div>

                {/* Explanation */}
                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-bold text-white mb-1">GRAVITY GAUGE</h3>
                        <p className="text-xs text-cyan-400 font-medium uppercase tracking-wider">Relative Liquid Strength Index</p>
                    </div>

                    <p className="text-sm text-slate-300 leading-relaxed">
                        시장 전체의 유동성 강도를 0-100 스케일로 측정합니다.
                        가격 모멘텀과 자금 흐름을 종합하여 현재 시장이
                        <span className="text-rose-400 font-semibold"> 약세</span>,
                        <span className="text-slate-400 font-semibold"> 중립</span>,
                        <span className="text-emerald-400 font-semibold"> 강세</span> 중
                        어떤 상태인지 직관적으로 표시합니다.
                    </p>

                    {/* Interpretation Scale */}
                    <div className="p-4 rounded-lg bg-slate-800/50 border border-white/5">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">해석 기준</div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-sm bg-rose-500" />
                                    <span className="text-xs text-slate-300">0-40</span>
                                </div>
                                <span className="text-xs text-rose-400 font-medium">약세 - 방어적 포지션 권장</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-sm bg-slate-500" />
                                    <span className="text-xs text-slate-300">40-60</span>
                                </div>
                                <span className="text-xs text-slate-400 font-medium">중립 - 방향성 대기</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                                    <span className="text-xs text-slate-300">60-100</span>
                                </div>
                                <span className="text-xs text-emerald-400 font-medium">강세 - 공격적 포지션 가능</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Price & Flow Section */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-bold text-white mb-1">PRICE & FLOW DIVERGENCE</h3>
                        <p className="text-xs text-amber-400 font-medium uppercase tracking-wider">가격-자금흐름 괴리 분석</p>
                    </div>

                    <p className="text-sm text-slate-300 leading-relaxed">
                        가격 변동(EXT)과 실제 자금 흐름(INT)의 괴리를 측정합니다.
                        가격이 상승하는데 자금이 유출되면 <span className="text-amber-400 font-semibold">조정 임박</span> 신호,
                        반대로 가격이 하락하는데 자금이 유입되면 <span className="text-emerald-400 font-semibold">반등 준비</span> 신호입니다.
                    </p>

                    {/* RVOL Indicator */}
                    <div className="p-4 rounded-lg bg-slate-800/50 border border-white/5">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">지수별 RVOL</div>
                        <p className="text-xs text-slate-400">
                            NASDAQ/DOW의 상대 거래량(RVOL)을 표시합니다.
                            100% 이상은 평균 대비 활발한 거래,
                            200% 이상은 <span className="text-cyan-400">이례적 관심</span>을 의미합니다.
                        </p>
                    </div>
                </div>

                <div className="relative rounded-xl overflow-hidden border border-white/10 bg-slate-900/50">
                    <Image
                        src="/guide/guardian-price-flow.png"
                        alt="Price and Flow"
                        width={400}
                        height={200}
                        className="w-full h-auto"
                    />
                </div>
            </section>

            {/* Flow Topography Map */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-white mb-1">FLOW TOPOGRAPHY MAP</h3>
                        <p className="text-xs text-purple-400 font-medium uppercase tracking-wider">섹터별 자금 흐름 시각화</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/30">
                        <span className="text-xs font-bold text-purple-300">Premium Feature</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Screenshot - Larger */}
                    <div className="lg:col-span-2 relative rounded-xl overflow-hidden border border-white/10 bg-slate-900/50">
                        <Image
                            src="/guide/guardian-flow-map.png"
                            alt="Flow Topography Map"
                            width={600}
                            height={400}
                            className="w-full h-auto"
                        />
                    </div>

                    {/* Explanation */}
                    <div className="space-y-4">
                        <p className="text-sm text-slate-300 leading-relaxed">
                            11개 섹터의 실시간 자금 흐름을 네트워크 형태로 시각화합니다.
                            원의 크기는 시가총액, 위치는 섹터 간 상관관계를 나타냅니다.
                        </p>

                        {/* Legend */}
                        <div className="p-4 rounded-lg bg-slate-800/50 border border-white/5 space-y-3">
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">시각 요소 해석</div>
                            <div className="space-y-2 text-xs">
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded-full border-2 border-cyan-400" />
                                    <span className="text-slate-300">원 테두리 색상 = 수익률 방향</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-1 bg-gradient-to-r from-cyan-400 to-amber-400" />
                                    <span className="text-slate-300">연결선 = 자금 이동 경로</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-slate-300">펄스 = 실시간 유입</span>
                                </div>
                            </div>
                        </div>

                        <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-500/20">
                            <span className="text-xs text-amber-300">
                                AI INFRA, ENERGY 등 테마 섹터의 자금 흐름을 한눈에 파악할 수 있습니다.
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Tactical Verdict Section */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="relative rounded-xl overflow-hidden border border-white/10 bg-slate-900/50">
                    <Image
                        src="/guide/guardian-tactical.png"
                        alt="Tactical Verdict"
                        width={400}
                        height={200}
                        className="w-full h-auto"
                    />
                </div>

                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-bold text-white mb-1">TACTICAL VERDICT</h3>
                        <p className="text-xs text-emerald-400 font-medium uppercase tracking-wider">전술적 결론 및 액션 가이드</p>
                    </div>

                    <p className="text-sm text-slate-300 leading-relaxed">
                        모든 지표를 종합하여 현재 시장에 대한 <span className="text-white font-semibold">최종 판단</span>을 제시합니다.
                        MOMENTUM(3일 속도), TARGET LOCK(방향성), REGIME(시장 레짐)을 통해 즉각적인 의사결정을 지원합니다.
                    </p>

                    {/* Action Guide */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-emerald-900/20 border border-emerald-500/20">
                            <div className="text-xs font-bold text-emerald-400 mb-1">BULLISH REGIME</div>
                            <div className="text-[11px] text-slate-400">롱 포지션 유지 또는 추가</div>
                        </div>
                        <div className="p-3 rounded-lg bg-rose-900/20 border border-rose-500/20">
                            <div className="text-xs font-bold text-rose-400 mb-1">BEARISH REGIME</div>
                            <div className="text-[11px] text-slate-400">숏 포지션 또는 현금 보유</div>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-800/50 border border-white/5 col-span-2">
                            <div className="text-xs font-bold text-slate-400 mb-1">NEUTRAL REGIME</div>
                            <div className="text-[11px] text-slate-400">방향성 부재 - 관망 권장, 기존 포지션 유지</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* RLSI Section */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-bold text-white mb-1">MARKET ESSENCE (RLSI)</h3>
                        <p className="text-xs text-cyan-400 font-medium uppercase tracking-wider">시장의 본질 분석</p>
                    </div>

                    <p className="text-sm text-slate-300 leading-relaxed">
                        현재 시장 세션 상태와 분석 가능 여부를 실시간으로 표시합니다.
                        프리마켓, 정규장, 애프터마켓 각 세션별로 다른 분석 로직이 적용됩니다.
                    </p>

                    <div className="p-4 rounded-lg bg-slate-800/50 border border-white/5">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">ALIGNMENT 상태</div>
                        <div className="space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-emerald-400 font-bold">ALIGNMENT OK</span>
                                <span className="text-slate-400">모든 지표 정상 수신</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-amber-400 font-bold">PARTIAL</span>
                                <span className="text-slate-400">일부 지표 지연</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-rose-400 font-bold">OFFLINE</span>
                                <span className="text-slate-400">장외 시간 - 분석 중단</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="relative rounded-xl overflow-hidden border border-white/10 bg-slate-900/50">
                    <Image
                        src="/guide/guardian-rlsi.png"
                        alt="RLSI Market Essence"
                        width={400}
                        height={150}
                        className="w-full h-auto"
                    />
                </div>
            </section>
        </HowItWorksLayout>
    );
}
