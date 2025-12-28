// [S-50.0] PolicyHub Provider - Policy/Executive Order Tracking
// Source: Static JSON (MVP)

import path from 'path';
import fs from 'fs';

export interface PolicyEvent {
    id: string;
    category: "P0" | "P1" | "P2";  // P0=Market, P1=Sector, P2=Stock
    title: string;
    titleKR: string;
    description: string;  // Korean
    effectiveDate: string;  // YYYY-MM-DD
    sourceGrade: "A" | "B" | "C";  // A=Official, B=Major Media, C=Estimate
    affectedSectors?: string[];
    affectedTickers?: string[];
    impact: "POSITIVE" | "NEGATIVE" | "MIXED" | "UNKNOWN";
}

interface PolicyHubSnapshot {
    asOfET: string;
    policies72h: PolicyEvent[];   // Within 72 hours
    policies7d: PolicyEvent[];    // 72h - 7 days
    policyGateSummary: string[];  // "Policy Gate EXTREME" auto-summary
}

const STATIC_DATA_PATH = path.join(process.cwd(), 'src', 'data', 'policy.static.json');

function loadStaticPolicies(): PolicyEvent[] {
    try {
        if (fs.existsSync(STATIC_DATA_PATH)) {
            const raw = fs.readFileSync(STATIC_DATA_PATH, 'utf-8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('[PolicyHub] Failed to load static policies:', e);
    }
    return [];
}

function getETNow(): Date {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

function parseDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
}

export function getPolicyWindow(nextDays: number = 7): { within72h: PolicyEvent[], within7d: PolicyEvent[] } {
    const policies = loadStaticPolicies();
    const now = getETNow();
    const in72h = new Date(now);
    in72h.setHours(in72h.getHours() + 72);
    const in7d = new Date(now);
    in7d.setDate(in7d.getDate() + nextDays);

    const within72h: PolicyEvent[] = [];
    const within7d: PolicyEvent[] = [];

    policies.forEach(p => {
        const pDate = parseDate(p.effectiveDate);
        if (pDate >= now && pDate <= in72h) {
            within72h.push(p);
        } else if (pDate > in72h && pDate <= in7d) {
            within7d.push(p);
        }
    });

    // Sort by category priority (P0 > P1 > P2) then by date
    const sortFn = (a: PolicyEvent, b: PolicyEvent) => {
        const catOrder = { P0: 0, P1: 1, P2: 2 };
        const catCompare = catOrder[a.category] - catOrder[b.category];
        if (catCompare !== 0) return catCompare;
        return a.effectiveDate.localeCompare(b.effectiveDate);
    };

    return {
        within72h: within72h.sort(sortFn),
        within7d: within7d.sort(sortFn)
    };
}

export function getPolicyGateSummary(limit: number = 3): string[] {
    const { within72h, within7d } = getPolicyWindow();

    // Priority: P0 events first, then by proximity
    const critical = [...within72h, ...within7d]
        .filter(p => p.category === 'P0' && p.sourceGrade !== 'C')
        .slice(0, limit);

    if (critical.length === 0) {
        return ["현재 72시간 내 P0급 정책 이벤트 없음."];
    }

    return critical.map(p =>
        `[${p.category}] ${p.titleKR} (${p.effectiveDate}) - ${p.description.substring(0, 50)}...`
    );
}

export function getPolicyHubSnapshot(): PolicyHubSnapshot {
    const now = new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        dateStyle: 'short',
        timeStyle: 'short'
    });

    const { within72h, within7d } = getPolicyWindow();

    return {
        asOfET: now,
        policies72h: within72h,
        policies7d: within7d,
        policyGateSummary: getPolicyGateSummary(3)
    };
}
