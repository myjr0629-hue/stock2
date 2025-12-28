"use client";

import { BrainCircuit, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HeroSection() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Left Card: Insight */}
            <div className="relative overflow-hidden rounded-2xl p-5 shadow-sm group hover:shadow-lg transition-all duration-300 h-[180px] flex flex-col justify-center">
                {/* Background Image */}
                <div className="absolute inset-0 z-0">
                    <img src="/insight_bg_v2.png" alt="Insight Background" className="w-full h-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-indigo-900/60 to-slate-900/80" />
                </div>

                <div className="relative z-10 text-white">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20">
                            <BrainCircuit className="w-4 h-4 text-blue-200" />
                        </div>
                        <h3 className="text-lg font-bold tracking-tight text-white">Insight <span className="text-blue-200 opacity-80 font-normal ml-1.5 text-xs">3-Day Deep Precision</span></h3>
                    </div>

                    <p className="text-blue-50/90 leading-snug font-medium text-sm text-pretty pl-1">
                        추론을 배제한 AI 심층 분석으로 향후 72시간 내 발생할 최적의 핵심(Core) 통찰을 도출합니다.
                    </p>
                    <div className="mt-3 pl-1">
                        <div className="h-0.5 w-12 bg-blue-400 rounded-full" />
                    </div>
                </div>
            </div>

            {/* Right Card: Velocity */}
            <div className="relative overflow-hidden rounded-2xl p-5 shadow-sm group hover:shadow-lg transition-all duration-300 h-[180px] flex flex-col justify-center">
                {/* Background Image */}
                <div className="absolute inset-0 z-0">
                    <img src="/velocity_bg_v2.png" alt="Velocity Background" className="w-full h-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-orange-900/60 to-slate-900/80" />
                </div>

                <div className="relative z-10 text-white">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20">
                            <Zap className="w-4 h-4 text-orange-200" />
                        </div>
                        <h3 className="text-lg font-bold tracking-tight text-white">Velocity <span className="text-orange-200 opacity-80 font-normal ml-1.5 text-xs">Alpha Velocity 0.1</span></h3>
                    </div>

                    <p className="text-orange-50/90 leading-snug font-medium text-sm text-pretty pl-1">
                        S1 등급의 데이터 정밀도와 기계적 속도로, 지금 당장 오르는 상위 0.1%의 알파만을 사냥합니다.
                    </p>
                    <div className="mt-3 pl-1">
                        <div className="h-0.5 w-12 bg-orange-400 rounded-full" />
                    </div>
                </div>
            </div>
        </div>
    );
}
