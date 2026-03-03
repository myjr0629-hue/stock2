"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/routing";
import { CheckCircle, XCircle, ArrowRight, Loader2 } from "lucide-react";

export default function PaymentSuccessPage() {
    const searchParams = useSearchParams();
    const paymentId = searchParams.get("paymentId");
    const amount = searchParams.get("amount");

    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [paymentData, setPaymentData] = useState<any>(null);
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        if (!paymentId) {
            setStatus("error");
            setErrorMessage("결제 정보가 올바르지 않습니다.");
            return;
        }

        // PortOne 결제 검증 (서버에서 조회)
        fetch("/api/payments/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                paymentId,
                expectedAmount: amount ? Number(amount) : undefined,
            }),
        })
            .then(async (res) => {
                const data = await res.json();
                if (res.ok) {
                    setPaymentData(data);
                    setStatus("success");
                } else {
                    setErrorMessage(data.message || "결제 승인에 실패했습니다.");
                    setStatus("error");
                }
            })
            .catch(() => {
                setErrorMessage("서버 통신 중 오류가 발생했습니다.");
                setStatus("error");
            });
    }, [paymentId, amount]);

    return (
        <div className="min-h-screen bg-[#0d1220] text-slate-200 flex items-center justify-center px-6 py-20">
            <div className="w-full max-w-md text-center">
                {status === "loading" && (
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-12 h-12 text-cyan-400 animate-spin" />
                        <p className="text-lg font-bold text-white">결제 확인 중...</p>
                        <p className="text-sm text-slate-400">잠시만 기다려주세요</p>
                    </div>
                )}

                {status === "success" && (
                    <div className="rounded-2xl bg-white/[0.04] border border-emerald-500/20 p-8 shadow-[0_0_40px_rgba(16,185,129,0.1)]">
                        <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto mb-5" />
                        <h1 className="text-2xl font-black text-white mb-2 font-jakarta">결제 완료!</h1>
                        <p className="text-sm text-slate-400 mb-6">구독이 성공적으로 활성화되었습니다.</p>

                        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 mb-6 text-left">
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">결제 ID</span>
                                    <span className="text-white font-mono text-xs">{paymentId}</span>
                                </div>
                                {paymentData?.amount && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">결제 금액</span>
                                        <span className="text-white font-bold">₩{Number(paymentData.amount).toLocaleString()}</span>
                                    </div>
                                )}
                                {paymentData?.method && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">결제 수단</span>
                                        <span className="text-white">{paymentData.method}</span>
                                    </div>
                                )}
                                {paymentData?.approvedAt && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">승인 시간</span>
                                        <span className="text-white text-xs">{new Date(paymentData.approvedAt).toLocaleString("ko-KR")}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <Link
                            href="/dashboard"
                            className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-lg text-sm font-bold uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-cyan-600 text-black hover:brightness-110 transition-all shadow-[0_0_20px_rgba(34,211,238,0.15)] font-jakarta"
                        >
                            대시보드로 이동 <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                )}

                {status === "error" && (
                    <div className="rounded-2xl bg-white/[0.04] border border-rose-500/20 p-8 shadow-[0_0_40px_rgba(244,63,94,0.1)]">
                        <XCircle className="w-16 h-16 text-rose-400 mx-auto mb-5" />
                        <h1 className="text-2xl font-black text-white mb-2 font-jakarta">결제 실패</h1>
                        <p className="text-sm text-rose-400 mb-6">{errorMessage}</p>

                        <Link
                            href="/pricing"
                            className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-lg text-sm font-bold uppercase tracking-wider border border-white/20 text-white hover:bg-white/5 transition-all font-jakarta"
                        >
                            가격 페이지로 돌아가기
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
