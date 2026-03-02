"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { ArrowLeft, CreditCard, Shield } from "lucide-react";

// ── 가격표 ──
const PLANS: Record<string, Record<string, { amount: number; label: string; orderName: string }>> = {
    pro: {
        monthly: { amount: 69000, label: "PRO 월간", orderName: "SIGNUM HQ PRO 월간 구독" },
        annual: { amount: 588000, label: "PRO 연간 (₩49,000/월)", orderName: "SIGNUM HQ PRO 연간 구독" },
    },
    elite: {
        monthly: { amount: 99000, label: "ELITE 월간", orderName: "SIGNUM HQ ELITE 월간 구독" },
        annual: { amount: 948000, label: "ELITE 연간 (₩79,000/월)", orderName: "SIGNUM HQ ELITE 연간 구독" },
    },
};

const CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!;

export default function CheckoutPage() {
    const searchParams = useSearchParams();
    const locale = useLocale();
    const t = useTranslations("pricing");

    const plan = searchParams.get("plan") || "pro";
    const billing = searchParams.get("billing") || "monthly";
    const planInfo = PLANS[plan]?.[billing] || PLANS.pro.monthly;

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const tossRef = useRef<any>(null);

    useEffect(() => {
        loadTossPayments(CLIENT_KEY).then((tp) => {
            tossRef.current = tp;
        }).catch((e) => {
            console.error("Toss SDK load error:", e);
            setError("결제 모듈 로딩에 실패했습니다.");
        });
    }, []);

    const handlePayment = async () => {
        if (!tossRef.current) {
            setError("결제 모듈이 아직 로딩 중입니다.");
            return;
        }
        setLoading(true);
        setError(null);

        const orderId = `SHQ_${plan.toUpperCase()}_${billing.toUpperCase()}_${Date.now()}`;
        const origin = window.location.origin;

        try {
            const payment = tossRef.current.payment({ customerKey: `customer_${Date.now()}` });
            await payment.requestPayment({
                method: "CARD",
                amount: { currency: "KRW", value: planInfo.amount },
                orderId,
                orderName: planInfo.orderName,
                successUrl: `${origin}/${locale}/payments/success`,
                failUrl: `${origin}/${locale}/payments/fail`,
                card: {
                    useEscrow: false,
                    flowMode: "DEFAULT",
                    useCardPoint: false,
                    useAppCardOnly: false,
                },
            });
        } catch (e: any) {
            if (e.code === "USER_CANCEL") {
                setError("결제가 취소되었습니다.");
            } else {
                setError(e.message || "결제 요청 중 오류가 발생했습니다.");
            }
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0d1220] text-slate-200 flex items-center justify-center px-6 py-20">
            <div className="w-full max-w-md">
                {/* Back link */}
                <Link href="/pricing" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-8">
                    <ArrowLeft className="w-4 h-4" /> 가격 페이지로 돌아가기
                </Link>

                {/* Checkout Card */}
                <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-8 shadow-[0_0_40px_rgba(0,0,0,0.3)]">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-6">
                        <div className={`p-2.5 rounded-lg ${plan === 'elite' ? 'bg-cyan-500/10 border border-cyan-500/20' : 'bg-amber-500/10 border border-amber-500/20'}`}>
                            <CreditCard className={`w-5 h-5 ${plan === 'elite' ? 'text-cyan-400' : 'text-amber-400'}`} />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-white font-jakarta">결제하기</h1>
                            <p className="text-sm text-slate-400">{planInfo.label}</p>
                        </div>
                    </div>

                    {/* Order Summary */}
                    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 mb-6">
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-sm text-slate-400">상품</span>
                            <span className="text-sm text-white font-bold">{planInfo.orderName}</span>
                        </div>
                        <div className="border-t border-white/[0.06] pt-3">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-slate-400">결제 금액</span>
                                <span className="text-2xl font-black text-white font-jakarta">
                                    ₩{planInfo.amount.toLocaleString()}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 mb-5 text-sm text-rose-400">
                            {error}
                        </div>
                    )}

                    {/* Pay Button */}
                    <button
                        onClick={handlePayment}
                        disabled={loading}
                        className={`w-full py-4 rounded-lg text-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 font-jakarta ${plan === 'elite'
                            ? 'bg-gradient-to-r from-cyan-500 to-cyan-600 text-black shadow-[0_0_30px_rgba(34,211,238,0.2)] hover:brightness-110'
                            : 'bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-[0_0_20px_rgba(245,158,11,0.15)] hover:brightness-110'
                            } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {loading ? (
                            <span className="animate-pulse">결제 진행 중...</span>
                        ) : (
                            <>₩{planInfo.amount.toLocaleString()} 결제하기</>
                        )}
                    </button>

                    {/* Trust Badge */}
                    <div className="flex items-center justify-center gap-2 mt-5 text-xs text-slate-500">
                        <Shield className="w-3.5 h-3.5" />
                        <span>토스페이먼츠 보안 결제</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
