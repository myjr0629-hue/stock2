import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import { IndicatorCard } from '@/components/IndicatorCard';

export default function IntelGuidePage() {
    return (
        <HowItWorksLayout
            title="INTEL"
            subtitle="AI 기반 시장 루머와 뉴스 인텔리전스를 제공합니다"
        >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* AI Rumor */}
                <IndicatorCard
                    title="AI Rumor"
                    badge="AI 분석"
                    badgeColor="purple"
                    meaning="AI가 소셜 미디어, 뉴스, 포럼에서 감지한 시장 루머와 그 신뢰도를 분석합니다."
                    interpretation={
                        <div className="space-y-3">
                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <span className="text-emerald-400 font-bold">✓ Clean</span>
                                <p className="text-sm text-slate-400 mt-1">검증된 정보 / 신뢰할 수 있는 출처</p>
                            </div>
                            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                <span className="text-amber-400 font-bold">⚠ Unverified</span>
                                <p className="text-sm text-slate-400 mt-1">미검증 루머 / 추가 확인 필요</p>
                            </div>
                            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                <span className="text-rose-400 font-bold">✗ False</span>
                                <p className="text-sm text-slate-400 mt-1">허위 정보로 판명 / 무시 권장</p>
                            </div>
                        </div>
                    }
                />

                {/* Intel Feed */}
                <IndicatorCard
                    title="Intel Feed"
                    badge="실시간"
                    badgeColor="cyan"
                    meaning="주요 금융 미디어에서 실시간으로 수집한 뉴스를 AI가 분석하여 핵심 정보를 요약합니다."
                    interpretation={
                        <div className="space-y-2">
                            <p className="text-slate-300 text-sm">
                                각 뉴스 항목에는 다음 정보가 포함됩니다:
                            </p>
                            <ul className="space-y-2 text-sm text-slate-400">
                                <li className="flex items-start gap-2">
                                    <span className="text-cyan-400">•</span>
                                    <span><strong className="text-white">출처</strong> - Benzinga, Investing.com 등</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-cyan-400">•</span>
                                    <span><strong className="text-white">요약</strong> - AI가 생성한 핵심 내용 요약</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-cyan-400">•</span>
                                    <span><strong className="text-white">관련 종목</strong> - 언급된 티커 태그</span>
                                </li>
                            </ul>
                        </div>
                    }
                />
            </div>
        </HowItWorksLayout>
    );
}
