'use client';

// ============================================================================
// MobileGuardianReality — Tab 2: Reality Check + Economic Calendar
// Components: RealityCheck (6 Gauges + Macro Alerts + News Pulse) + Calendar
// Data: Identical props as desktop page.tsx L426-441
// ============================================================================

import React, { useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { ProGate } from '@/components/gate/FeatureGate';
import { RealityCheck } from '@/components/guardian/RealityCheck';
import { EconomicCalendarWidget } from '@/components/guardian/EconomicCalendarWidget';

interface Props {
    data: any;
    verdict: {
        title: string;
        desc: string;
        color: string;
        sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
        realityInsight?: string;
    };
}

export default function MobileGuardianReality({ data, verdict }: Props) {
    const gt = useTranslations('gate');
    const locale = useLocale();

    // ?focus=econ → 경제 캘린더 위치로 부드럽게 내려간다(위젯이 늦게 그려질 수 있어 잠깐 기다린다)
    useEffect(() => {
        if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('focus') !== 'econ') return;
        // 위쪽 카드(뉴스 펄스 등)가 늦게 그려지며 캘린더가 아래로 밀린다 → 캘린더 위치가 3번 연속 그대로일 때(배치 안정) 내려간다(10/18 운영 실측)
        let tries = 0, lastTop = -1, stable = 0;
        const t = window.setInterval(() => {
            const el = document.getElementById('econ-calendar');
            const top = el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : -1;
            stable = el && top === lastTop ? stable + 1 : 0; lastTop = top;
            if ((el && stable >= 3) || ++tries > 40) {
                window.clearInterval(t);
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                // 한 번만: focus 를 주소에서 지워 탭을 다시 열 때 또 내려가지 않게(관문 10/18)
                const u = new URL(window.location.href); u.searchParams.delete('focus');
                window.history.replaceState(window.history.state, '', u.pathname + (u.search || '') + u.hash);
            }
        }, 150);
        return () => window.clearInterval(t);
    }, []);

    return (
        <div className="space-y-3">
            {/* ── REALITY CHECK (full component with all internal tabs) ── */}
            <div className="backdrop-blur-md border border-slate-800 rounded-lg p-3 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.10) 0%, rgba(6,182,212,0.03) 40%, transparent 70%), rgba(10,14,20,0.85)' }}>
                {/* Infographic: Dot Matrix Grid */}
                <div className="absolute inset-0 pointer-events-none"
                    style={{
                        backgroundImage: 'radial-gradient(circle, rgba(6,182,212,0.22) 1.2px, transparent 1.2px)',
                        backgroundSize: '20px 20px',
                        backgroundPosition: '10px 10px',
                    }}
                />
                <ProGate title="Reality Check" fomoMessage={gt('fomoRealityCheck')} description={gt('descRealityCheck')} mode="peek" compact blurPx={6}>
                    <RealityCheck
                        nasdaqChange={data?.market?.nqChangePercent || 0}
                        guardianScore={data?.rlsi?.score || 0}
                        divergenceCase={data?.divergence?.caseId as "N" | "A" | "B" | "C" | "D" | undefined}
                        // ⚠️ `|| 1.0` 금지 — 엔진이 «측정 안 함»으로 null 을 주는데
                        //    1.0 으로 되돌리면 화면이 «100% · 저조»라고 단언한다
                        //    (2026-08-29 실측: 앱 「시장 현황」 탭에 상시 노출)
                        rvolNdx={data?.rvol?.ndx?.rvol ?? null}
                        ma20Ndx={data?.ma20Breadth?.ndx ?? null}
                        ma20Dow={data?.ma20Breadth?.dow ?? null}
                        rvolDow={data?.rvol?.dow?.rvol ?? null}
                        verdict={{
                            title: "MARKET ESSENCE",
                            desc: verdict.realityInsight || "Gathering Pulse...",
                            sentiment: verdict.sentiment
                        }}
                        vixTermStructure={data?.rlsi?.components?.vixTermStructure}
                        bondFlow={data?.rlsi?.components?.bondFlow}
                        goldFlow={data?.rlsi?.components?.goldFlow}
                    />
                </ProGate>
            </div>

            {/* ── ECONOMIC CALENDAR ── (오늘 요약 «경제 캘린더 ›» 에서 ?tab=reality&focus=econ 으로 들어온다 — 10/18 대표) */}
            <div id="econ-calendar" style={{ scrollMarginTop: 96 }}>
                <EconomicCalendarWidget locale={locale} localizeLabels />
            </div>
        </div>
    );
}
