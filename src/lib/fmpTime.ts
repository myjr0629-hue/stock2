/**
 * FMP 뉴스 `publishedDate` 는 «미 동부 벽시계»(America/New_York) 문자열이다 — UTC 가 아니다.
 *
 * ★2026-09-24 실측(기사 원문 페이지의 타임존 명시 시각과 대조):
 *   대조 가능한 14건 중 12건 전부 +240분(EDT) — 11건은 초 단위까지 일치, 1건(MarketBeat)은 페이지가 초를 :00 으로 적어 2초 차.
 *     FMP "2026-09-23 11:00:09" (247wallst) = 페이지 article:published_time 2026-09-23T15:00:09+00:00
 *     FMP "2026-09-23 09:47:00" (fool.com)  = 페이지 2026-09-23T13:47:00Z
 *   나머지 2건(Proactive Investors)은 페이지 시각이 작성 시점이라 어느 쪽과도 맞지 않았다(Δ −52·−72분).
 *   그동안 코드는 뒤에 "Z" 를 붙여 모든 FMP 기사를 4시간(겨울엔 5시간) «늙게» 읽었다
 *   → 앱의 «4h 전» 표시, 가디언 뉴스 신선도 규칙, UC 2시간 속보 띠, 비교 측정까지 전부 그만큼 틀렸다.
 *
 * 규칙: 타임존이 «명시된» 문자열(Z·+09:00 등)은 그대로 믿고, 벽시계 문자열만 뉴욕 시각으로 해석한다.
 */

/** 그 순간 뉴욕의 UTC 대비 오프셋(ms). EDT = −4h, EST = −5h. */
function nyOffsetMs(utcMs: number): number {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York", hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(utcMs));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return asUtc - utcMs;
}

/** FMP 시각 문자열 → epoch ms. 해석 불가면 null. */
export function fmpEtToMs(d?: string | null): number | null {
    if (!d) return null;
    const s = String(d).trim();
    if (/(Z|[+-]\d\d:?\d\d)$/i.test(s)) {
        const t = Date.parse(s);
        return Number.isFinite(t) ? t : null;
    }
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) {
        const t = Date.parse(s);
        return Number.isFinite(t) ? t : null;
    }
    const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    // 벽시계를 UTC 로 가정한 값에서 그 순간의 뉴욕 오프셋만큼 되돌린다. 두 번 돌려 서머타임 경계에서도 맞춘다.
    let utc = wall - nyOffsetMs(wall);
    utc = wall - nyOffsetMs(utc);
    return utc;
}

/** FMP 시각 문자열 → ISO(UTC). 해석 불가면 null. */
export function fmpEtToIso(d?: string | null): string | null {
    const t = fmpEtToMs(d);
    return t === null ? null : new Date(t).toISOString();
}
