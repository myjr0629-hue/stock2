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

type SessionString = 'PRE' | 'REG' | 'POST' | 'CLOSED' | string | undefined;

/**
 * Returns the real-time ET session based on client-side clock.
 * Mirrors rlsiEngine.ts getMarketSession() logic exactly.
 */
function getClientETSession(): 'PRE' | 'REG' | 'POST' | 'CLOSED' {
    const now = new Date();
    const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const et = new Date(etStr);
    const hour = et.getHours();
    const minute = et.getMinutes();
    const day = et.getDay();

    // Weekend → always CLOSED
    if (day === 0 || day === 6) return 'CLOSED';

    const time = hour * 100 + minute;
    if (time >= 400 && time < 930) return 'PRE';
    if (time >= 930 && time < 1600) return 'REG';
    if (time >= 1600 && time < 2000) return 'POST';
    return 'CLOSED';
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
