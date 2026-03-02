import { NextRequest, NextResponse } from "next/server";

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY!;

export async function POST(req: NextRequest) {
    try {
        const { paymentKey, orderId, amount } = await req.json();

        if (!paymentKey || !orderId || !amount) {
            return NextResponse.json(
                { message: "paymentKey, orderId, amount는 필수입니다." },
                { status: 400 }
            );
        }

        // Toss Payments 결제 승인 API
        const encryptedSecretKey = Buffer.from(`${TOSS_SECRET_KEY}:`).toString("base64");

        const response = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
            method: "POST",
            headers: {
                Authorization: `Basic ${encryptedSecretKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ paymentKey, orderId, amount }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("[Toss] Confirm error:", data);
            return NextResponse.json(
                { message: data.message || "결제 승인에 실패했습니다.", code: data.code },
                { status: response.status }
            );
        }

        // ── 결제 승인 성공 ──
        // TODO: 여기에 DB 저장 로직 추가 (사용자 구독 상태 업데이트)
        console.log("[Toss] Payment confirmed:", {
            orderId: data.orderId,
            amount: data.totalAmount,
            method: data.method,
            approvedAt: data.approvedAt,
            status: data.status,
        });

        return NextResponse.json({
            orderId: data.orderId,
            amount: data.totalAmount,
            method: data.method,
            approvedAt: data.approvedAt,
            status: data.status,
            orderName: data.orderName,
        });
    } catch (error: any) {
        console.error("[Toss] Confirm exception:", error);
        return NextResponse.json(
            { message: error.message || "서버 오류가 발생했습니다." },
            { status: 500 }
        );
    }
}
