/**
 * 용도별 «운영 출구 게이트» 모음 — score.ts(채점)와 rehearse-ladder.ts(사다리 리허설)가 같은 규칙을 쓴다.
 */
import type { Sample } from './lib';
import { restoreCommonTermsDeep } from '@/lib/ai/commonTerms';

// ── 자리표 값 복원(신뢰 경로 게이트용) — run-captured-ab 와 같은 방식 ──
export function tokensFromPrompt(u: string): Record<string, number> | null {
    const blk = u.match(/<number_tokens>([\s\S]*?)<\/number_tokens>/);
    if (!blk) return null;
    const out: Record<string, number> = {};
    for (const m of blk[1].matchAll(/^- \{([A-Z_]+)\} = ([^\s(]+)/gm)) {
        const raw = m[2]; const mult = /M$/.test(raw) ? 1e6 : /B$/.test(raw) ? 1e9 : /K$/.test(raw) ? 1e3 : 1;
        const n = Number(raw.replace(/[$,%+MBK]/g, ''));
        if (Number.isFinite(n)) out[m[1]] = (/^-/.test(raw) ? -1 : 1) * Math.abs(n) * mult;
    }
    return Object.keys(out).length ? out : null;
}
export function basisFromTokens(u: string, t: Record<string, number>): any {
    const extras = [...u.matchAll(/\$([\d][\d,]*(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, ''))).filter((n) => Number.isFinite(n) && n > 0);
    return { ticker: (u.match(/ticker="([A-Z.\-]+)"/) || [])[1] || 'X', price: t.PRICE, callWall: t.CALL_WALL ?? null, putFloor: t.PUT_FLOOR ?? null, maxPain: t.MAX_PAIN ?? null, gammaFlip: t.GAMMA_FLIP ?? null, extras };
}
export function mapJson(text: string, f: (key: string, v: string) => string): string {
    try { const o = JSON.parse(text); for (const k of Object.keys(o)) if (typeof o[k] === 'string') o[k] = f(k, o[k]); return JSON.stringify(o); } catch { return text; }
}

const WEEKDAYS = { en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], ko: ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'], ja: ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日', '日曜日'] };

export async function gateFor(s: Sample): Promise<(t: string) => any> {
    const { triLangGate, multiLangJsonGate } = await import('@/lib/ai/ladderGates');
    if (s.purpose === 'Guardian') {
        const { forecastHits } = await import('@/lib/ai/trustLayer');
        const gate = triLangGate();
        return (t: string) => {
            const g: any = gate(t); if (g !== true) return g;
            try { const o = JSON.parse(t); const bad: string[] = []; for (const l of ['ko', 'en', 'ja'] as const) { const h = forecastHits(String(o[l] || ''), l); if (h.length) bad.push(`${l}:forecast:${h[0].id}`); } return bad.length ? { ok: false, reasons: bad } : true; } catch { return 'json'; }
        };
    }
    if (s.purpose === 'FlowAI' || s.purpose === 'DeepAnalysis') {
        const tok = tokensFromPrompt(s.userPrompt);
        if (!tok || !tok.PRICE) return () => true;
        const basis = basisFromTokens(s.userPrompt, tok);
        const { gateFlowAnalysis } = await import('@/lib/ai/flowTrust');
        const { gateDeepAnalysis } = await import('@/lib/ai/deepTrust');
        const gate = s.purpose === 'FlowAI' ? gateFlowAnalysis : gateDeepAnalysis;
        return (t: string) => { try { const g = gate(restoreCommonTermsDeep(JSON.parse(t)), tok as any, basis, new Date('2026-10-10T03:00:00Z')); return g.ok ? true : { ok: false, reasons: g.reasons.slice(0, 3) }; } catch { return 'parse'; } };
    }
    if (s.purpose === 'CrossSector') return multiLangJsonGate('CrossSector', s.userPrompt, { keys: ['marketOverview', 'sectorRotation', 'outlook'], structured: true });
    if (s.purpose === 'MorningBriefing') {
        const gate = triLangGate();
        const day = (s.system.match(/TODAY IS: [\d-]+ — (\w+) \/ (\S+) \/ (\S+)/) || []);
        return (t: string) => {
            const g: any = gate(t); if (g !== true) return g;
            try {
                const o = JSON.parse(t); const bad: string[] = [];
                for (const l of ['en', 'ko', 'ja'] as const) {
                    const ok = day[l === 'en' ? 1 : l === 'ko' ? 2 : 3];
                    for (const w of WEEKDAYS[l]) if (w !== ok && String(o[l] || '').includes(w)) bad.push(`${l}:wrong-weekday:${w}`);
                }
                return bad.length ? { ok: false, reasons: bad } : true;
            } catch { return 'json'; }
        };
    }
    if (s.purpose === 'UC') {
        const { ucCardsGate } = await import('@/app/api/undercurrent/shared');
        return ucCardsGate(s.locale as any, s.meta.nStories || 5);
    }
    return () => true;
}

