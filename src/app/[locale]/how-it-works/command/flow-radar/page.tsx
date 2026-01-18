import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import { IndicatorCard } from '@/components/IndicatorCard';

export default function FlowRadarGuidePage() {
    return (
        <HowItWorksLayout
            title="Flow Radar"
            subtitle="실시간 대형 옵션 거래를 추적하고 기관 매매 동향을 파악합니다"
        >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Flow Sniper */}
                <IndicatorCard
                    title="Flow Sniper"
                    badge="실시간"
                    badgeColor="cyan"
                    meaning="대형 옵션 거래(Premium $50K+)를 실시간으로 감지하여 기관 투자자의 매매 방향을 추적합니다."
                    interpretation={
                        <div className="space-y-3">
                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <span className="text-emerald-400 font-bold">BULLISH Flow</span>
                                <p className="text-sm text-slate-400 mt-1">콜옵션 매수 또는 풋옵션 매도 우세 - 상승 베팅</p>
                            </div>
                            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                <span className="text-rose-400 font-bold">BEARISH Flow</span>
                                <p className="text-sm text-slate-400 mt-1">풋옵션 매수 또는 콜옵션 매도 우세 - 하락 베팅</p>
                            </div>
                        </div>
                    }
                    signals={[
                        { label: 'BULLISH', description: '강세 흐름 감지', color: 'bg-emerald-500' },
                        { label: 'BEARISH', description: '약세 흐름 감지', color: 'bg-rose-500' },
                        { label: 'NEUTRAL', description: '방향성 미확정', color: 'bg-slate-500' },
                    ]}
                />

                {/* Net Premium Flow */}
                <IndicatorCard
                    title="Net Premium Flow"
                    badge="프리미엄"
                    badgeColor="amber"
                    meaning="콜 프리미엄과 풋 프리미엄의 순 차이를 금액으로 표시합니다. 양수면 콜이 우세, 음수면 풋이 우세합니다."
                    interpretation={
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <span className="text-emerald-400 font-bold text-lg">+$2.5M</span>
                                <span className="text-sm text-slate-400">콜 프리미엄 $2.5M 우세 → 강세</span>
                            </div>
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                <span className="text-rose-400 font-bold text-lg">-$1.8M</span>
                                <span className="text-sm text-slate-400">풋 프리미엄 $1.8M 우세 → 약세</span>
                            </div>
                        </div>
                    }
                />

                {/* Volume Strength */}
                <IndicatorCard
                    title="Volume Strength"
                    badge="거래량"
                    badgeColor="emerald"
                    meaning="현재 옵션 거래량이 평균 대비 얼마나 활발한지 나타냅니다."
                    interpretation={
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <span className="w-24 text-emerald-400 font-bold text-sm">ACTIVE</span>
                                <span className="text-slate-400 text-sm">평균 이상 거래량 → 기관 참여 활발</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-24 text-slate-400 font-bold text-sm">NORMAL</span>
                                <span className="text-slate-400 text-sm">평균 수준 거래량</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-24 text-rose-400 font-bold text-sm">LOW</span>
                                <span className="text-slate-400 text-sm">평균 이하 → 관심도 낮음</span>
                            </div>
                        </div>
                    }
                />
            </div>
        </HowItWorksLayout>
    );
}
