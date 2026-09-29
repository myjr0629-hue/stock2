/**
 * 조용한 시간 — 기기 현지 시각(tz)으로 [start, end) 안이면 «소리 없이» 보낸다(기획 §6-2·§7).
 * 한국에서 미 정규장은 밤 22:30~새벽 5시라 «밤에 보내지 않기»는 핵심 알림을 없앤다 → 막지 않고 무음(passive)으로 전달.
 *
 * ⚠️ Node 20 의 Intl `hour12:false` 는 자정을 «24시»로 준다(메모리: intl-hour12-false-gives-24-at-midnight).
 *    hourCycle:'h23' 을 쓰고, 그래도 24 가 오면 0 으로 접는다.
 */
import type { QuietHours } from './types';

const toMin = (hhmm: string): number => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

/** tz 의 «지금» 분(00:00 = 0). tz 가 잘못됐으면 null. */
export function localMinutes(tz: string, nowMs: number): number | null {
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(new Date(nowMs));
        let h = Number(parts.find((p) => p.type === 'hour')?.value);
        const m = Number(parts.find((p) => p.type === 'minute')?.value);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
        if (h === 24) h = 0;
        return h * 60 + m;
    } catch {
        return null;
    }
}

export function inQuietHours(q: QuietHours | null | undefined, nowMs: number): boolean {
    if (!q) return false;
    const now = localMinutes(q.tz, nowMs);
    if (now == null) return false;
    const s = toMin(q.start), e = toMin(q.end);
    if (s === e) return false;
    return s < e ? now >= s && now < e : now >= s || now < e;
}
