import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import { IndicatorCard } from '@/components/IndicatorCard';

export default function PortfolioGuidePage() {
    return (
        <HowItWorksLayout
            title="PORTFOLIO"
            subtitle="보유 종목의 Alpha Score와 Signal Badge로 포트폴리오를 관리합니다"
        >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Alpha Score */}
                <IndicatorCard
                    title="Alpha Score"
                    badge="0-100"
                    badgeColor="cyan"
                    meaning="가격 모멘텀, 옵션 플로우, GEX 등을 종합한 종목의 강도 점수입니다. 높을수록 상승 잠재력이 높습니다."
                    interpretation={
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <span className="w-12 px-2 py-1 bg-emerald-500/20 text-emerald-400 font-bold text-xs rounded text-center">A</span>
                                <span className="text-slate-400 text-sm">80-100점 - 매우 강세, 추가 매수 적합</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-12 px-2 py-1 bg-cyan-500/20 text-cyan-400 font-bold text-xs rounded text-center">B</span>
                                <span className="text-slate-400 text-sm">65-79점 - 강세, 유지 권장</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-12 px-2 py-1 bg-amber-500/20 text-amber-400 font-bold text-xs rounded text-center">C</span>
                                <span className="text-slate-400 text-sm">50-64점 - 중립, 관망</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-12 px-2 py-1 bg-orange-500/20 text-orange-400 font-bold text-xs rounded text-center">D</span>
                                <span className="text-slate-400 text-sm">35-49점 - 약세, 비중 축소 고려</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-12 px-2 py-1 bg-rose-500/20 text-rose-400 font-bold text-xs rounded text-center">F</span>
                                <span className="text-slate-400 text-sm">0-34점 - 매우 약세, 비중 축소 권장</span>
                            </div>
                        </div>
                    }
                />

                {/* Signal Badge */}
                <IndicatorCard
                    title="Signal Badge"
                    badge="액션"
                    badgeColor="amber"
                    meaning="Alpha Score와 시장 상황을 기반으로 한 투자 액션 제안입니다."
                    interpretation={
                        <div className="space-y-3">
                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <span className="text-emerald-400 font-bold">ADD</span>
                                <p className="text-sm text-slate-400 mt-1">추가 매수 적합 - Alpha 75+ & 상승 모멘텀</p>
                            </div>
                            <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                                <span className="text-cyan-400 font-bold">HOLD</span>
                                <p className="text-sm text-slate-400 mt-1">현 포지션 유지 - 안정적인 상태</p>
                            </div>
                            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                <span className="text-amber-400 font-bold">WATCH</span>
                                <p className="text-sm text-slate-400 mt-1">관망 권장 - 방향성 불확실</p>
                            </div>
                            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                <span className="text-rose-400 font-bold">TRIM</span>
                                <p className="text-sm text-slate-400 mt-1">비중 축소 권장 - Alpha 35 미만 또는 급락</p>
                            </div>
                        </div>
                    }
                />

                {/* Confidence */}
                <IndicatorCard
                    title="Confidence %"
                    badge="신뢰도"
                    badgeColor="emerald"
                    meaning="Signal Badge의 신뢰도를 백분율로 표시합니다. 높을수록 확신도가 높습니다."
                    interpretation={
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <span className="w-16 text-emerald-400 font-bold text-sm">80-100%</span>
                                <span className="text-slate-400 text-sm">높은 확신 - 강한 시그널</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-16 text-amber-400 font-bold text-sm">60-79%</span>
                                <span className="text-slate-400 text-sm">중간 확신 - 주의 깊게 모니터링</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-16 text-rose-400 font-bold text-sm">50-59%</span>
                                <span className="text-slate-400 text-sm">낮은 확신 - 추가 확인 필요</span>
                            </div>
                        </div>
                    }
                />

                {/* Sparkline */}
                <IndicatorCard
                    title="Sparkline Chart"
                    badge="시각화"
                    badgeColor="cyan"
                    meaning="최근 20개 가격 데이터를 미니 차트로 표시합니다. 한눈에 추세를 파악할 수 있습니다."
                    interpretation={
                        <div className="space-y-2">
                            <p className="text-slate-300 text-sm">
                                스파크라인은 종목명 옆에 표시되며:
                            </p>
                            <ul className="space-y-1 text-sm text-slate-400">
                                <li>• 상승 추세 → 우상향 곡선</li>
                                <li>• 하락 추세 → 우하향 곡선</li>
                                <li>• 횡보 → 평평한 곡선</li>
                            </ul>
                        </div>
                    }
                />
            </div>
        </HowItWorksLayout>
    );
}
