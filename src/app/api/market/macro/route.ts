import { NextResponse, after } from 'next/server';
import { getMacroSnapshotSSOT } from '@/services/macroHubProvider';
import { getAuthoritativeCache, setAuthoritativeCache } from '@/services/redisClient';
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
                getAuthoritativeCache<SelloffBrief>(key).then(r => ({ known: r.ok, value: r.ok ? sanitizeSelloff(r.value) : null })),
                new Promise<{ known: false; value: null }>(r => setTimeout(() => r({ known: false, value: null }), 800)),
            ]).catch(() => ({ known: false, value: null }));
            selloffMemo = { key, value: read.value, known: read.known, at: now };
        }
        const { record, write } = mergeSelloffRecord({ now, macro: snapshot as any, stored: selloffMemo.value, storedKnown: selloffMemo.known });
        if (write) {
            // 응답은 기다리지 않는다. 쓰기 직전엔 메모(최장 60초 낡음)가 아니라 저장본을 다시 엄격히 읽어
            // «관측 시각이 늦은 값이 이긴다» 규칙으로 합친다. 읽기·쓰기 사이 경합으로 낡은 값이 이겨도,
            // D 마감 관측이 응답에 남아 있는 동안(마감~다음 개장, signum-warm 크론이 5~20분마다 이 라우트를 부른다)
            // 다음 요청이 더 늦은 관측으로 다시 덮어 스스로 복구된다.
            const memoKey = key;
            // after(): 응답을 보낸 뒤에도 함수가 이 작업을 끝낼 때까지 살아 있게 한다(Vercel 동결 방지).
            after(async () => { try {
                const fresh = await Promise.race([
                    getAuthoritativeCache<SelloffBrief>(memoKey),
                    new Promise<{ ok: false; value: null }>(r => setTimeout(() => r({ ok: false, value: null }), 800)),
                ]).catch(() => ({ ok: false, value: null }));
                if (!fresh.ok) return;
                const next = mergeSelloffRecord({ now, macro: snapshot as any, stored: sanitizeSelloff(fresh.value), storedKnown: true });
                if (selloffMemo?.key === memoKey) selloffMemo = { key: memoKey, value: next.record ?? sanitizeSelloff(fresh.value), known: true, at: Date.now() };
                if (next.write && next.record) await setAuthoritativeCache(memoKey, next.record, 7 * 86_400).catch(() => false);
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
