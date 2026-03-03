import { NextRequest, NextResponse } from "next/server";

const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET!;

export async function POST(req: NextRequest) {
    try {
        const { paymentId, expectedAmount } = await req.json();

        if (!paymentId) {
            return NextResponse.json(
                { message: "paymentId는 필수입니다." },
                { status: 400 }
            );
        }

        // PortOne V2 결제 조회 API
        const response = await fetch(
            `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
            {
                headers: {
                    Authorization: `PortOne ${PORTONE_API_SECRET}`,
                },
            }
        );

        const payment = await response.json();

        if (!response.ok) {
            console.error("[PortOne] Payment query error:", payment);
            return NextResponse.json(
                { message: payment.message || "결제 조회에 실패했습니다.", code: payment.code },
                { status: response.status }
            );
        }

        // ── 결제 상태 확인 ──
        if (payment.status === "PAID") {
            // 금액 위변조 검증
            if (expectedAmount && payment.amount?.total !== expectedAmount) {
                console.error("[PortOne] Amount mismatch:", {
                    expected: expectedAmount,
                    actual: payment.amount?.total,
                });
                return NextResponse.json(
                    { message: "결제 금액이 일치하지 않습니다. 위변조가 의심됩니다." },
                    { status: 400 }
                );
            }

            // ── 결제 승인 성공 ──
            // TODO: 여기에 DB 저장 로직 추가 (사용자 구독 상태 업데이트)
            console.log("[PortOne] Payment confirmed:", {
                paymentId: payment.id,
                amount: payment.amount?.total,
                method: payment.method?.type,
                paidAt: payment.paidAt,
                status: payment.status,
                orderName: payment.orderName,
            });

            return NextResponse.json({
                paymentId: payment.id,
                amount: payment.amount?.total,
                method: payment.method?.type || "카드",
                approvedAt: payment.paidAt,
                status: payment.status,
                orderName: payment.orderName,
            });
        } else if (payment.status === "VIRTUAL_ACCOUNT_ISSUED") {
            // 가상계좌 발급 상태
            return NextResponse.json({
                paymentId: payment.id,
                status: payment.status,
                message: "가상계좌가 발급되었습니다. 입금을 완료해주세요.",
            });
        } else {
            return NextResponse.json(
                { message: `결제가 완료되지 않았습니다. 상태: ${payment.status}` },
                { status: 400 }
            );
        }
    } catch (error: any) {
        console.error("[PortOne] Confirm exception:", error);
        return NextResponse.json(
            { message: error.message || "서버 오류가 발생했습니다." },
            { status: 500 }
        );
    }
}
