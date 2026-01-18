import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import { IndicatorCard } from '@/components/IndicatorCard';

export default function CommandGuidePage() {
    return (
        <HowItWorksLayout
            title="COMMAND"
            subtitle="개별 종목의 감마 구조와 tactical range를 분석합니다"
        >
            {/* Grid of Indicator Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Gamma Flip Level */}
                <IndicatorCard
                    title="Gamma Flip Level"
                    badge="핵심 지표"
                    badgeColor="cyan"
                    meaning="딜러들의 감마 포지션이 롱에서 숏으로 (또는 반대로) 전환되는 가격 수준입니다. 이 레벨을 기준으로 시장의 변동성 특성이 달라집니다."
                    interpretation={
                        <div className="space-y-3">
                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <span className="text-emerald-400 font-bold">현재가 &lt; Flip Level</span>
                                <p className="text-sm text-slate-400 mt-1">롱감마 구간 - 가격 안정화 경향, 변동성 억제</p>
                            </div>
                            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                <span className="text-rose-400 font-bold">현재가 &gt; Flip Level</span>
                                <p className="text-sm text-slate-400 mt-1">숏감마 구간 - 변동성 확대, 추세 가속 가능</p>
                            </div>
                        </div>
                    }
                    signals={[
                        { label: 'READY', description: '감마 플립 레벨 계산 완료', color: 'bg-emerald-500' },
                        { label: 'SHORT', description: '전 구간 숏감마 (Flip 지점 없음)', color: 'bg-rose-500' },
                        { label: 'LONG', description: '전 구간 롱감마 (Flip 지점 없음)', color: 'bg-emerald-500' },
                        { label: 'N/A', description: '옵션 유동성 부족', color: 'bg-slate-500' },
                    ]}
                />

                {/* Net GEX Engine */}
                <IndicatorCard
                    title="Net GEX Engine"
                    badge="실시간"
                    badgeColor="amber"
                    meaning="현재 옵션 시장의 총 감마 노출도입니다. 양수면 딜러들이 롱감마, 음수면 숏감마 포지션을 보유 중입니다."
                    interpretation={
                        <div className="space-y-3">
                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <span className="text-emerald-400 font-bold">STABLE (양수 GEX)</span>
                                <p className="text-sm text-slate-400 mt-1">딜러 롱감마 → 변동성 억제, 가격 안정</p>
                            </div>
                            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                <span className="text-amber-400 font-bold">VOLATILE (음수 GEX)</span>
                                <p className="text-sm text-slate-400 mt-1">딜러 숏감마 → 변동성 확대, 방향 가속</p>
                            </div>
                        </div>
                    }
                />

                {/* Tactical Range */}
                <IndicatorCard
                    title="Tactical Range"
                    badge="전술 레벨"
                    badgeColor="emerald"
                    meaning="옵션 데이터 기반으로 산출한 단기 지지/저항 레벨과 Max Pain 가격입니다."
                    interpretation={
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <span className="w-20 text-rose-400 font-bold text-sm">RESIST</span>
                                <span className="text-slate-400 text-sm">콜 월(Call Wall) 기반 저항선</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-20 text-cyan-400 font-bold text-sm">MAX PAIN</span>
                                <span className="text-slate-400 text-sm">옵션 만기 시 수렴 예상 가격</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-20 text-emerald-400 font-bold text-sm">SUPPORT</span>
                                <span className="text-slate-400 text-sm">풋 플로어(Put Floor) 기반 지지선</span>
                            </div>
                        </div>
                    }
                />

                {/* 0DTE Impact & Squeeze Risk */}
                <IndicatorCard
                    title="0DTE Impact & Squeeze Risk"
                    badge="리스크"
                    badgeColor="rose"
                    meaning="당일 만기 옵션의 영향도와 숏스퀴즈 발생 위험을 측정합니다."
                    interpretation={
                        <div className="space-y-3">
                            <div>
                                <span className="text-amber-400 font-bold text-sm">0DTE Impact</span>
                                <p className="text-sm text-slate-400 mt-1">당일 만기 옵션이 전체 GEX에서 차지하는 비중. 30% 이상이면 장 종료 전 변동성 주의</p>
                            </div>
                            <div>
                                <span className="text-rose-400 font-bold text-sm">Squeeze Risk</span>
                                <p className="text-sm text-slate-400 mt-1">LOW/MED/HIGH - 숏스퀴즈 발생 가능성. 높을수록 급격한 상승 반전 가능</p>
                            </div>
                        </div>
                    }
                />
            </div>
        </HowItWorksLayout>
    );
}
