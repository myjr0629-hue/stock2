"use client";

import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/routing";
import { XCircle, ArrowLeft } from "lucide-react";

export default function PaymentFailPage() {
    const searchParams = useSearchParams();
    const code = searchParams.get("code") || "UNKNOWN_ERROR";
    const message = searchParams.get("message") || "결제 처리 중 오류가 발생했습니다.";

    return (
        <div className="min-h-screen bg-[#0d1220] text-slate-200 flex items-center justify-center px-6 py-20">
            <div className="w-full max-w-md text-center">
                <div className="rounded-2xl bg-white/[0.04] border border-rose-500/20 p-8 shadow-[0_0_40px_rgba(244,63,94,0.1)]">
                    <XCircle className="w-16 h-16 text-rose-400 mx-auto mb-5" />
                    <h1 className="text-2xl font-black text-white mb-2 font-jakarta">결제 실패</h1>
                    <p className="text-sm text-slate-400 mb-4">결제가 정상적으로 처리되지 않았습니다.</p>

                    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 mb-6 text-left">
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-400">에러 코드</span>
                                <span className="text-rose-400 font-mono text-xs">{code}</span>
                            </div>
                            <div>
                                <span className="text-slate-400 block mb-1">에러 메시지</span>
                                <span className="text-white text-xs">{decodeURIComponent(message)}</span>
                            </div>
                        </div>
                    </div>

                    <Link
                        href="/pricing"
                        className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-lg text-sm font-bold uppercase tracking-wider border border-white/20 text-white hover:bg-white/5 transition-all font-jakarta"
                    >
                        <ArrowLeft className="w-4 h-4" /> 가격 페이지로 돌아가기
                    </Link>
                </div>
            </div>
        </div>
    );
}
