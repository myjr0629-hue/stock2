"use client";

// ============================================================================
// /pricing — 지금의 PRO 한 장 (2026-09-30 교체)
// ----------------------------------------------------------------------------
// 예전 판(2026-05, «FOUNDING MEMBER · PRO $49 · ELITE $79 · 유료 전용 지표 표 · Stripe 결제»)은
// 9/8 법적 전제(유료 = 광고 제거 + 용량, 잠기는 지표 없음)와 반대였고 앱 가격($9.99)과도 달랐다.
// 이제: 무료 = 모든 데이터·지표 · PRO = 광고 없음 + 내 종목 100개 · 결제는 앱에서만(스마트링크 → 스토어, PC 는 QR).
// Stripe 서버 코드(결제·웹훅·포털·해지)는 지우지 않았다 — 화면에서 결제 버튼만 뺐다.
// 이미 웹 요금제를 쓰는 사람(tier pro·elite)은 여기서 해지할 수 있어야 한다 → 기존 해지 창을 그대로 연다.
// 문구·가격 정본: src/lib/marketing/proOffer.ts
// ============================================================================

import { useState } from "react";
import { useLocale } from "next-intl";
import { useTier } from "@/contexts/TierContext";
import DowngradeToFreeModal from "@/components/DowngradeToFreeModal";
import { Check, Minus, ArrowRight } from "lucide-react";
import { FREE_PRICE, PRO_COPY, PRO_MONTHLY_PRICE, offerLocale, proAppHref } from "@/lib/marketing/proOffer";

function Row({ on, label }: { on: boolean; label: string }) {
    return (
        <li className="flex items-center gap-2.5 py-2 text-sm">
            {on
                ? <Check className="w-4 h-4 shrink-0 text-emerald-400" aria-hidden="true" />
                : <Minus className="w-4 h-4 shrink-0 text-slate-500" aria-hidden="true" />}
            <span className={on ? "text-slate-200" : "text-slate-400"}>{label}</span>
        </li>
    );
}

export default function PricingPage() {
    const loc = offerLocale(useLocale());
    const c = PRO_COPY[loc];
    const { tier } = useTier();
    const onWebPlan = tier === "pro" || tier === "elite";
    const [cancelOpen, setCancelOpen] = useState(false);

    return (
        <>
            <div className="min-h-screen bg-[#0d1220] text-slate-200" data-pricing>
                <section className="relative px-6 pt-20 pb-24">
                    <div className="max-w-3xl mx-auto text-center">
                        <p className="text-xs font-bold text-cyan-400 uppercase tracking-[0.18em] font-jakarta mb-4">SIGNUM PRO</p>
                        <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-[1.15] font-jakarta mb-12">
                            {c.title}
                        </h1>

                        {onWebPlan && (
                            <div className="mx-auto mb-8 max-w-md flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
                                <span className="text-slate-300">{c.webPlan}</span>
                                <button
                                    type="button"
                                    onClick={() => setCancelOpen(true)}
                                    className="text-xs font-bold text-slate-400 hover:text-white underline underline-offset-2"
                                >
                                    {c.cancel}
                                </button>
                            </div>
                        )}

                        <div className="grid gap-4 md:grid-cols-2 text-left">
                            {/* 무료 */}
                            <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-6 flex flex-col">
                                <p className="text-sm font-bold text-slate-300 font-jakarta">{c.free}</p>
                                <p className="mt-3 mb-4 text-4xl font-black text-white font-jakarta">{FREE_PRICE[loc]}</p>
                                <ul className="border-t border-white/5 pt-2">
                                    <Row on label={c.allData} />
                                    <Row on label={c.wlFree} />
                                    <Row on={false} label={c.withAds} />
                                </ul>
                            </div>

                            {/* PRO */}
                            <div className="rounded-2xl border border-amber-500/40 bg-[#131b2f] p-6 flex flex-col shadow-[0_0_40px_rgba(245,158,11,0.08)]">
                                <p className="text-sm font-bold text-amber-400 font-jakarta">PRO</p>
                                <p className="mt-3 mb-4 font-jakarta">
                                    <span className="text-4xl font-black text-white">{PRO_MONTHLY_PRICE[loc]}</span>
                                    <span className="ml-1.5 text-sm text-slate-400">{c.per}</span>
                                </p>
                                <ul className="border-t border-white/5 pt-2 mb-6">
                                    <Row on label={c.allData} />
                                    <Row on label={c.wlPro} />
                                    <Row on label={c.noAds} />
                                </ul>
                                {/* 스마트링크는 locale 라우팅 밖 경로 — Link 가 아니라 a */}
                                <a
                                    href={proAppHref("pricing", loc)}
                                    className="mt-auto inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-lg text-sm font-bold bg-gradient-to-r from-amber-500 to-amber-600 text-black hover:brightness-110 transition-all font-jakarta"
                                >
                                    {c.cta} <ArrowRight className="w-4 h-4" aria-hidden="true" />
                                </a>
                            </div>
                        </div>

                        <p className="mt-6 text-xs text-slate-500">{c.fine}</p>
                    </div>
                </section>
            </div>

            {/* 기존 웹 요금제 해지 — 예전 페이지의 해지 창 그대로 */}
            <DowngradeToFreeModal isOpen={cancelOpen} onClose={() => setCancelOpen(false)} tier={tier} />
        </>
    );
}
