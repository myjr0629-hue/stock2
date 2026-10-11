/**
 * «해석의 깊이» 시험 공통 도구 (2026-10-11) — 모델 호출(서버 관리자 비교 엔드포인트 경유) · 칸(slot) 추출 · 풀 · 파일 입출력.
 *
 * 크레딧 키는 로컬에 없다(Vercel 민감 변수). 모델 호출은 /api/admin/ai-ab 의 adhoc 으로 «같은 요청 본문»을 보낸다.
 * 인증은 임시 env 사본의 CRON_SECRET 하나(헤더) — 출력·기록하지 않는다.
 */
import fs from 'node:fs';
import path from 'node:path';

export const OUT = process.env.OUT || path.join(process.cwd(), 'depth-out');
export const BASE = (process.env.AB_BASE || 'https://www.signumhq.com').replace(/\/$/, '');
export const ensureDir = (d: string) => fs.mkdirSync(d, { recursive: true });
export const readJson = <T = any>(f: string): T => JSON.parse(fs.readFileSync(f, 'utf8'));
export const writeJson = (f: string, v: unknown) => { ensureDir(path.dirname(f)); fs.writeFileSync(f, JSON.stringify(v)); };
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Sample {
    id: string;
    purpose: string;
    /** 모델이 받는 완성된 system (날짜 앵커 + 금융 공통어 + 호출 지점 system) */
    system: string;
    userPrompt: string;
    maxTokens: number;
    locale: 'ko' | 'en' | 'ja' | 'multi';
    expectJson: boolean | 'array';
    meta: Record<string, any>;
}

export interface ModelCall { model: 'claude-haiku-5-5' | 'claude-sonnet-5-5'; effort: 'low' | 'medium' | 'high'; thinking?: 'disabled'; maxTokens: number; timeoutMs?: number }
export interface ModelOut {
    ok: boolean; text: string; ms: number; costUsd: number; stop: string | null; error?: string;
    usage?: { input: number; output: number; cacheWrite: number; cacheRead: number }; refusal?: string | null; model?: string;
}

/** 서버 adhoc 호출 — 일시 오류(5xx·시간 초과)는 두 번까지 다시 */
export async function callModel(system: string, user: string, c: ModelCall, expectJson: boolean | 'array' = true): Promise<ModelOut> {
    const secret = process.env.CRON_SECRET || '';
    if (!secret) return { ok: false, text: '', ms: 0, costUsd: 0, stop: null, error: 'no-secret' };
    let last: ModelOut = { ok: false, text: '', ms: 0, costUsd: 0, stop: null, error: 'unreached' };
    for (let attempt = 0; attempt < 3; attempt++) {
        const t0 = Date.now();
        try {
            const res = await fetch(`${BASE}/api/admin/ai-ab`, {
                method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
                body: JSON.stringify({ adhoc: { model: c.model, system, userPrompt: user, maxTokens: c.maxTokens, expectJson: expectJson === false ? false : true, timeoutMs: c.timeoutMs ?? 58_000 }, effort: c.effort, thinking: c.thinking }),
                signal: AbortSignal.timeout(75_000),
            });
            const raw = await res.text();
            if (!res.ok) { last = { ok: false, text: '', ms: Date.now() - t0, costUsd: 0, stop: null, error: `HTTP ${res.status} ${raw.slice(0, 120)}` }; if (res.status >= 500) { await sleep(2000 * (attempt + 1)); continue; } return last; }
            const j: any = JSON.parse(raw); const h = j.h55;
            if (!h?.ok) {
                last = { ok: false, text: '', ms: h?.ms ?? Date.now() - t0, costUsd: 0, stop: null, error: String(h?.error || 'fail').slice(0, 200) };
                if (/rate|server|timeout|network/i.test(last.error!)) { await sleep(3000 * (attempt + 1)); continue; }
                return last;
            }
            return { ok: true, text: h.text, ms: h.ms, costUsd: h.costUsd ?? 0, stop: h.stop ?? null, usage: h.usage, refusal: h.refusal ?? null, model: h.model };
        } catch (e: any) {
            last = { ok: false, text: '', ms: Date.now() - t0, costUsd: 0, stop: null, error: `${e?.name || 'Error'}: ${String(e?.message || e).slice(0, 160)}` };
            await sleep(2000 * (attempt + 1));
        }
    }
    return last;
}

/** 동시 실행 풀 */
export async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.max(1, n) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 칸(slot) — 화면 한 칸에 들어가는 글 한 조각
// ─────────────────────────────────────────────────────────────────────────────
export interface Slot { lang: 'ko' | 'en' | 'ja'; field: string; text: string }

const LANGS = ['ko', 'en', 'ja'] as const;
type L = typeof LANGS[number];

/** 출력 JSON 에서 언어별 칸을 뽑는다. ko/en/ja 키(문자열 또는 문자열 배열)가 붙은 잎을 모으고, 배열 인덱스는 []로 접는다. UC 는 단일 언어 카드. */
export function extractSlots(purpose: string, outText: string, locale: string): Slot[] {
    let o: any;
    try { o = JSON.parse(outText); } catch { return []; }
    const slots: Slot[] = [];
    const walk = (v: any, p: string) => {
        if (v == null) return;
        if (Array.isArray(v)) { v.forEach((x) => walk(x, p + '[]')); return; }
        if (typeof v !== 'object') return;
        const hasLang = LANGS.some((l) => typeof v[l] === 'string' || (Array.isArray(v[l]) && v[l].every((x: any) => typeof x === 'string')));
        if (hasLang) {
            for (const l of LANGS) {
                const x = v[l];
                if (typeof x === 'string') slots.push({ lang: l, field: p || '$', text: x });
                else if (Array.isArray(x)) x.forEach((s: string) => slots.push({ lang: l, field: (p || '$') + '[]', text: s }));
            }
            // 같은 객체의 다른 키도 계속 본다(예: factorHighlights 항목의 insight)
            for (const [k, x] of Object.entries(v)) if (!LANGS.includes(k as L)) walk(x, p ? `${p}.${k}` : k);
            return;
        }
        for (const [k, x] of Object.entries(v)) walk(x, p ? `${p}.${k}` : k);
    };
    if (purpose === 'UC') {
        const loc = (locale === 'en' || locale === 'ja') ? locale : 'ko';
        for (const c of Array.isArray(o?.cards) ? o.cards : []) for (const f of ['plainTitle', 'whyItMatters', 'moneyRead'] as const) if (typeof c?.[f] === 'string') slots.push({ lang: loc, field: `cards[].${f}`, text: c[f] });
        return slots;
    }
    if (purpose === 'Guardian') {
        // 세 언어 글은 줄 단위 칸(라벨 줄) — 줄마다 한 칸
        for (const l of LANGS) if (typeof o?.[l] === 'string') String(o[l]).split(/\n+/).filter(Boolean).forEach((ln: string, i: number) => slots.push({ lang: l, field: `line${i + 1}`, text: ln }));
        return slots;
    }
    walk(o, '');
    return slots;
}

export const sentenceCount = (s: string): number => (String(s).match(/[^.!?。！？]+[.!?。！？]*/g) || []).filter((x) => x.trim().length > 1).length;

export function pctl(xs: number[], p: number): number | null {
    if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
}
export const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
