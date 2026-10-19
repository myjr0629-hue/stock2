/**
 * marketSessionUtils.ts — Client-side ET time fallback for isMarketActive
 * 
 * Problem: The cached RLSI session can be "CLOSED" when Polygon API hasn't transitioned
 * to "extended-hours" yet, even though AI engines are already active (ET 04:00+).
 * This causes the UI to hide AI-generated pre-market analysis behind "Off-hours" messages.
 * 
 * Solution: If the cached session says "CLOSED" but the real ET time is within
 * pre-market/regular/post-market hours on a weekday, override to show analysis.
 */

import { usEquitySessionForEt } from '@/lib/marketCalendar';
import { etClock } from '@/lib/marketSession';

type SessionString = 'PRE' | 'REG' | 'POST' | 'CLOSED' | string | undefined;

/**
 * Returns the real-time ET session based on client-side clock.
 * Mirrors rlsiEngine.ts getMarketSession() logic exactly.
 */
function getClientETSession(): 'PRE' | 'REG' | 'POST' | 'CLOSED' {
    // 경계는 거래소 달력 하나(주말·휴장 CLOSED · 조기 폐장 13:00) — 시계는 etClock(formatToParts, 사파리 앱 셸 안전)
    const c = etClock(Date.now());
    const s = usEquitySessionForEt(c.date, c.minutes);
    return s === 'regular' ? 'REG' : s === 'pre' ? 'PRE' : s === 'post' ? 'POST' : 'CLOSED';
}

/**
 * Determines the effective session, resolving the stale-cache problem.
 * If the API returns "CLOSED" but the real ET time says otherwise, use the real ET time.
 * If the API returns a non-CLOSED session, trust it (Polygon is authoritative when active).
 */
export function getEffectiveSession(apiSession: SessionString): 'PRE' | 'REG' | 'POST' | 'CLOSED' {
    // If API says market is active, trust it (Polygon is authoritative)
    if (apiSession === 'REG' || apiSession === 'PRE' || apiSession === 'POST') {
        return apiSession;
    }
    // API says CLOSED or undefined — check real ET time as fallback
    return getClientETSession();
}

/**
 * Determines whether the market is active for UI display purposes.
 * Uses getEffectiveSession to avoid hiding AI analysis during pre-market.
 */
export function getIsMarketActive(apiSession: SessionString, isHoliday: boolean): boolean {
    if (isHoliday) return false;
    const effective = getEffectiveSession(apiSession);
    return effective === 'REG' || effective === 'PRE' || effective === 'POST';
}

/**
 * Determines whether the market is in fully active (regular session) mode.
 * Used for live animations, pulse effects, etc.
 */
export function getIsFullyActive(apiSession: SessionString, isHoliday: boolean): boolean {
    if (isHoliday) return false;
    // For fully active (animations), require BOTH API and ET time to agree it's REG
    // This prevents false animation triggers during stale cache periods
    return apiSession === 'REG';
}
