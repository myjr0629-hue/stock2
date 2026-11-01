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
async function withSelloffRecord<T extends object>(base: T, readStartedAt: number): Promise<T | (T & { selloffReadAt: string; selloffRecord?: SelloffBrief })> {
    try {
        const now = Date.now();
        // 현물 indexBasis 세대 = 그 읽기를 «시작한» 시각(스냅샷과 병렬로 읽으므로 끝난 시각이 아니다)을 분 단위로 내림.
        // 먼저 시작한 요청이 늦게 끝나도 더 이른(또는 같은) 세대로 남는다. 같은 분 안의 엇갈림은 동률 → 기존 값 유지,
        // 다음 분 읽기가 새 세대로 바로잡는다. 기기·서버 모두 이 값으로 같은 칸의 정정 순서를 가른다.
        const snapshot = { ...base, selloffReadAt: new Date(Math.floor(readStartedAt / 60_000) * 60_000).toISOString() };
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
            // 세대(rx)는 분 단위라 쓰기는 인스턴스당 분당 최대 1회 — D 마감 관측이 응답에 있는 동안(마감~다음 개장)만. 건너뛰는 창 없음.
            selloffMemo = { key, value: record, known: true, at: selloffMemo.at };
            after(async () => { try {
                await mergeSelloffRecordAtomic(key, own, 7 * 86_400);
            } catch { /* 기록 실패는 응답·화면에 영향 없음 */ } });
        }
        return record ? { ...snapshot, selloffRecord: record } : snapshot;
    } catch {
        return base;
    }
}

export async function GET() {
    try {
        const readStartedAt = Date.now();
        const snapshot = await getMacroSnapshotSSOT();
        return NextResponse.json(await withSelloffRecord(snapshot, readStartedAt));
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch macro snapshot' }, { status: 500 });
    }
}
