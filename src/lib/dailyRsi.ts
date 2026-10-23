import { etLastClosedSessionDate } from '@/lib/marketCalendar';

// 같은 요청 창·같은 종가·같은 seed를 사용한다. 250봉의 초기 seed 가중치는 약 3e-8이다.
export function dailyRsiWindow(nowMs: number = Date.now()): { from: string; to: string } {
    const to = etLastClosedSessionDate(nowMs);
    const start = new Date(`${to}T12:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 550);
    return { from: start.toISOString().slice(0, 10), to };
}

/** 일봉 정규장 종가(원래 가격 계열), Wilder 14. 시간외/진행 중 일봉은 제외한다. */
export function dailyRsi14(rows: readonly { t: number; c: number | null }[], sessionDate: string): number | null {
    if (rows.some(row => typeof row.t !== 'number' || !Number.isFinite(new Date(row.t).getTime()))) return null;
    const dated = rows.map(row => ({ row, date: new Date(row.t).toISOString().slice(0, 10) }))
        .filter(({ date }) => date && date <= sessionDate)
        .sort((a, b) => a.date.localeCompare(b.date));
    const recent = dated.slice(-250);
    if (recent.length < 15 || recent.at(-1)?.date !== sessionDate) return null;
    // 결측 봉을 지워서 서로 다른 날짜를 이어 붙이거나 0으로 채우지 않는다.
    if (recent.some(({ row }, i) => typeof row.c !== 'number' || !Number.isFinite(row.c) || row.c <= 0
        || (i > 0 && recent[i - 1].date === recent[i].date))) return null;
    let gain = 0, loss = 0;
    for (let i = 1; i < recent.length; i++) {
        const delta = recent[i].row.c! - recent[i - 1].row.c!;
        if (i <= 14) {
            gain += Math.max(delta, 0) / 14;
            loss += Math.max(-delta, 0) / 14;
        } else {
            gain = (gain * 13 + Math.max(delta, 0)) / 14;
            loss = (loss * 13 + Math.max(-delta, 0)) / 14;
        }
    }
    if (gain === 0 && loss === 0) return 50;
    return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}
