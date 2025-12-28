// [S-52.2.3] Centralized ET Timezone Utility
// Provides reliable timezone handling that works consistently on both local and Vercel environments.
// Uses Intl.DateTimeFormat.formatToParts() which is the only reliable method on Node.js servers.

export interface ETDateTime {
    year: number;
    month: number;       // 1-12
    day: number;         // 1-31
    hour: number;        // 0-23
    minute: number;      // 0-59
    weekday: string;     // 'Mon', 'Tue', etc.
    isWeekend: boolean;
    dateString: string;  // YYYY-MM-DD format for API calls
    displayString: string; // MM/DD/YYYY, HH:MM format for display
}

/**
 * Get current time in ET (America/New_York) timezone.
 * This is the ONLY safe way to get ET time on Vercel servers.
 * 
 * DO NOT USE: new Date(toLocaleString()) - this is unreliable on Vercel!
 */
export function getETNow(): ETDateTime {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        hour12: false,
        weekday: 'short'
    });

    const parts = formatter.formatToParts(now);
    const getPart = (type: string): string => parts.find(p => p.type === type)?.value || '';

    const year = parseInt(getPart('year'));
    const month = parseInt(getPart('month'));
    const day = parseInt(getPart('day'));
    const hour = parseInt(getPart('hour')) || 0;
    const minute = parseInt(getPart('minute')) || 0;
    const weekday = getPart('weekday');

    const isWeekend = weekday === 'Sat' || weekday === 'Sun';

    const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const displayString = `${month}/${day}/${year}, ${hour}:${String(minute).padStart(2, '0')}`;

    return {
        year,
        month,
        day,
        hour,
        minute,
        weekday,
        isWeekend,
        dateString,
        displayString
    };
}

/**
 * Get ET hour for any Date object.
 * Useful for checking trading hours.
 */
export function getETHour(date: Date): number {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        hour12: false
    });
    const parts = formatter.formatToParts(date);
    const hourPart = parts.find(p => p.type === 'hour');
    return hourPart ? parseInt(hourPart.value, 10) : 0;
}

/**
 * Get a date string (YYYY-MM-DD) for N days ago in ET.
 */
export function getETDateNDaysAgo(n: number): string {
    const et = getETNow();
    // Use UTC for safe date math
    const baseDate = new Date(Date.UTC(et.year, et.month - 1, et.day, 12, 0, 0));
    baseDate.setUTCDate(baseDate.getUTCDate() - n);

    return `${baseDate.getUTCFullYear()}-${String(baseDate.getUTCMonth() + 1).padStart(2, '0')}-${String(baseDate.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Determine trading session based on ET time.
 */
export type SessionType = 'PRE' | 'REG' | 'POST' | 'CLOSED';

export function getSessionType(etHour: number, etMin: number, isWeekend: boolean): SessionType {
    if (isWeekend) return 'CLOSED';
    const etTime = etHour + etMin / 60;
    if (etTime >= 4.0 && etTime < 9.5) return 'PRE';
    else if (etTime >= 9.5 && etTime < 16.0) return 'REG';
    else if (etTime >= 16.0 && etTime < 20.0) return 'POST';
    else return 'CLOSED';
}

/**
 * Check if current ET time is within extended trading hours (PRE or POST).
 */
export function isExtendedHours(): boolean {
    const et = getETNow();
    const session = getSessionType(et.hour, et.minute, et.isWeekend);
    return session === 'PRE' || session === 'POST';
}

/**
 * Check if market is currently open (REG session).
 */
export function isMarketOpen(): boolean {
    const et = getETNow();
    return getSessionType(et.hour, et.minute, et.isWeekend) === 'REG';
}
