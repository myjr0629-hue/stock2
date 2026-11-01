import { NextResponse, after } from 'next/server';
import { getMacroSnapshotSSOT } from '@/services/macroHubProvider';
import { getSelloffRecordStrict, mergeSelloffRecordAtomic } from '@/services/redisClient';
import { lastClosedSessionDate } from '@/lib/marketSession';
import { mergeSelloffRecord, sanitizeSelloff, SELLOFF_RECORD_KEY, type SelloffBrief } from '@/lib/selloffBriefing';

export const dynamic = 'force-dynamic';

// 급락 카드 표시 창(D 마감 ~ 다음 정규장 마감): 다음 장중엔 스냅샷이 그날 장중 값으로 바뀌므로
// D 마감 관측 기록을 캐시 한 키에 두고 응답에 덧붙인다(추가 필드 · 공급사·AI 호출 0).
// 어떤 실패도 기존 응답을 바꾸지 않는다.
let selloffMemo: { key: string; value: SelloffBrief | null; known: boolean; at: number } | null = null;
async function withSelloffRecord<T extends object>(snapshot: T): Promise<T | (T & { selloffRecord: SelloffBrief })> {
    try {
        const now = Date.now();
        const key = SELLOFF_RECORD_KEY + lastClosedSessionDate(now);
        if (!selloffMemo || selloffMemo.key !== key || now - selloffMemo.at > 60_000) {
            const read = await Promise.race([
                // 엄격 읽기: 장애·시간 초과(ok:false)를 «기록 없음»으로 오인해 일부 관측으로 덮어쓰지 않는다.
                getSelloffRecordStrict(key).then(r => ({ known: r.ok, value: r.ok ? sanitizeSelloff(r.value) : null })),
                new Promise<{ known: false; value: null }>(r => setTimeout(() => r({ known: false, value: null }), 800)),
            ]).catch(() => ({ known: false, value: null }));
            selloffMemo = { key, value: read.value, known: read.known, at: now };
        }
        const { record, own, write } = mergeSelloffRecord({ now, macro: snapshot as any, stored: selloffMemo.value, storedKnown: selloffMemo.known });
        if (write && own) {
            // 응답은 기다리지 않는다(after). 이 응답의 D 마감 관측(own)만 보내고, 칸별 «늦은 관측이 이긴다» 합치기는
            // 저장소 안 EVAL 한 번으로 한다 — 인스턴스 간 읽기·쓰기 경합으로 낡은 값이 새 값을 되돌릴 수 없다.
            selloffMemo = { key, value: record, known: true, at: selloffMemo.at };
            after(async () => { try {
                await mergeSelloffRecordAtomic(key, own, 7 * 86_400);
            } catch { /* 기록 실패는 응답·화면에 영향 없음 */ } });
        }
        return record ? { ...snapshot, selloffRecord: record } : snapshot;
    } catch {
        return snapshot;
    }
}

export async function GET() {
    try {
        const snapshot = await getMacroSnapshotSSOT();
        return NextResponse.json(await withSelloffRecord(snapshot));
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch macro snapshot' }, { status: 500 });
    }
}
