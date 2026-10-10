/**
 * 운영이 실제로 보낸 요청(캡처, 금요일 장 데이터)으로 현행/5.5 비교 — 사용: run-captured-ab.ts <ENVFILE> <OUTDIR> <Purpose[,…]> [max]
 *   Guardian(3종 × ko·en·ja 한 호출) · FlowAI · DeepAnalysis · IntelAnalysis
 */
import path from 'node:path';
import { bootHarness } from './core';
import { loadCaptured } from './captured';
import { runAB, summarize, printSummary, dumpRows, type Variant } from './ab-lib';
import { SECTOR_NAME_EN, restoreKoSectorNames, restoreJaSectorNames } from '@/lib/ai/sectorLabels';
import { restoreCommonTermNames } from '@/lib/ai/commonTerms';

const [envFile, outDir, purposesArg, maxArg] = process.argv.slice(2);
bootHarness({ envFile });

const OFF: Variant = { name: 'low-off', effort: 'low', thinking: 'disabled' };
const AD: Variant = { name: 'low-ad', effort: 'low' };

// 가디언: 입력 줄(자금 흐름·5일 유입/유출·STEALTH)의 한국어 섹터명을 영어로 — 코드 쪽 정식 적용(unifiedDataStream·intelligenceNode)과 같은 줄·같은 이름표
const KO_NAMES = Object.keys(SECTOR_NAME_EN).sort((a, b) => b.length - a.length);
const DATA_LINE = /(->|\([+-]\d|IFS)/;
export function englishSectorInput(u: string): string {
    return u.split('\n').map((ln) => {
        if (!DATA_LINE.test(ln)) return ln;
        let o = ln;
        for (const n of KO_NAMES) o = o.split(n).join(SECTOR_NAME_EN[n]);
        return o;
    }).join('\n');
}
function mapJson(text: string, f: (key: string, v: string) => string): string {
    try {
        const o = JSON.parse(text);
        for (const k of Object.keys(o)) if (typeof o[k] === 'string') o[k] = f(k, o[k]);
        return JSON.stringify(o);
    } catch { return text; }
}
const restoreSectors = (t: string) => mapJson(t, (k, v) => (k === 'ko' ? restoreKoSectorNames(v).text : k === 'ja' ? restoreJaSectorNames(v).text : v));
function deepMap(v: any, f: (s: string) => string): any {
    if (typeof v === 'string') return f(v);
    if (Array.isArray(v)) return v.map((x) => deepMap(x, f));
    if (v && typeof v === 'object') { const o: any = {}; for (const [k, x] of Object.entries(v)) o[k] = deepMap(x, f); return o; }
    return v;
}
const restoreTermsDeep = (t: string) => { try { return JSON.stringify(deepMap(JSON.parse(t), (s) => restoreCommonTermNames(s).text)); } catch { return t; } };

const DEEP_RULE = `FINANCE TERM NAMES (hard rule): the metric names Call Wall, Put Floor, Max Pain, Gamma Flip, GEX, P/C, OI stay in English inside Korean and Japanese text exactly as written. Never transliterate them by sound (콜월, 풋플로어, 맥스페인, 감마플립, コールウォール, プットフロア, マックスペイン, ガンマフリップ are wrong). Keep local standard words for open interest (미결제약정, 建玉).`;


/** 신뢰 경로(자리표) 요청 — 프롬프트의 «NUMBER TOKENS» 블록에서 자리표 값을 되살려 «진짜 출구 게이트»(gateFlowAnalysis/gateDeepAnalysis)로 채점한다. */
function tokensFromPrompt(u: string): Record<string, number> | null {
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
function basisFromTokens(u: string, t: Record<string, number>): any {
    // 프롬프트에 나온 모든 $ 수준을 extras 로(운영 basis 보다 넉넉한 상한 — 양쪽 모델에 똑같이 적용되므로 상대 비교는 그대로)
    const extras = [...u.matchAll(/\$([\d][\d,]*(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, ''))).filter((n) => Number.isFinite(n) && n > 0);
    return { ticker: (u.match(/ticker="([A-Z.\-]+)"/) || [])[1] || 'X', price: t.PRICE, callWall: t.CALL_WALL ?? null, putFloor: t.PUT_FLOOR ?? null, maxPain: t.MAX_PAIN ?? null, gammaFlip: t.GAMMA_FLIP ?? null, extras };
}

(async () => {
    const { triLangGate } = await import('@/lib/ai/ladderGates');
    const { forecastHits } = await import('@/lib/ai/trustLayer');
    for (const purpose of purposesArg.split(',')) {
        const items = await loadCaptured(purpose);
        const use = items.slice(0, Number(maxArg) || 12);
        console.error(`\n### ${purpose}: 캡처 ${items.length}건 중 ${use.length}건`);
        let variants: Variant[] = [OFF, AD];
        let opts: any = {};
        if (purpose === 'Guardian') {
            // 운영 가드(triLangGate) + 3개 언어 각 칸의 예측어(생성 경로의 strict 검사와 같은 사전)
            const gate = triLangGate();
            for (const c of use) c.validate = (t: string) => {
                const g: any = gate(t); if (g !== true) return g;
                try { const o = JSON.parse(t); const bad: string[] = []; for (const l of ['ko', 'en', 'ja'] as const) { const h = forecastHits(String(o[l] || ''), l); if (h.length) bad.push(`${l}:forecast:${h[0].id}`); } return bad.length ? { ok: false, reasons: bad } : true; } catch { return 'json'; }
            };
            variants = [
                OFF, AD,
                { ...OFF, name: 'low-off+enlabel', userTransform: englishSectorInput, outputTransform: restoreSectors },
                { ...AD, name: 'low-ad+enlabel', userTransform: englishSectorInput, outputTransform: restoreSectors },
            ];
            opts = { legacyVariants: [{ name: 'legacy+enlabel', userTransform: englishSectorInput, outputTransform: restoreSectors }], post: (t: string) => mapJson(t, (_k, v) => restoreCommonTermNames(v).text) };
        } else if (purpose === 'FlowAI' || purpose === 'DeepAnalysis') {
            const { gateFlowAnalysis } = await import('@/lib/ai/flowTrust');
            const { gateDeepAnalysis } = await import('@/lib/ai/deepTrust');
            const { restoreCommonTermsDeep } = await import('@/lib/ai/commonTerms');
            const gate = purpose === 'FlowAI' ? gateFlowAnalysis : gateDeepAnalysis;
            let nTrust = 0;
            for (const c of use) {
                const tok = tokensFromPrompt(c.userPrompt);
                if (!tok || !tok.PRICE) continue;
                nTrust++;
                const basis = basisFromTokens(c.userPrompt, tok);
                c.validate = (t: string) => { try { const g = gate(restoreCommonTermsDeep(JSON.parse(t)), tok as any, basis, new Date('2026-10-10T03:00:00Z')); return g.ok ? true : { ok: false, reasons: g.reasons.slice(0, 3) }; } catch { return 'parse'; } };
            }
            console.error(`   신뢰 경로(자리표) 요청 ${nTrust}/${use.length}건은 진짜 출구 게이트로 채점한다`);
            if (purpose === 'FlowAI') { variants = [OFF, AD]; opts = { post: restoreTermsDeep }; }
            else {
                variants = [
                    { ...OFF, name: 'low-off+rule', systemSuffix: DEEP_RULE },
                    { ...AD, name: 'low-ad+rule', systemSuffix: DEEP_RULE },
                ];
                opts = { post: restoreTermsDeep };
            }
        } else if (purpose === 'DeepAnalysisOLD') {
            variants = [
                OFF, AD,
                { ...AD, name: 'low-ad+rule', systemSuffix: DEEP_RULE },
                { effort: 'medium', thinking: 'adaptive', name: 'med-ad+rule', systemSuffix: DEEP_RULE },
            ];
            opts = { post: restoreTermsDeep };
        } else if (purpose === 'IntelAnalysis') {
            variants = [OFF];
            opts = { post: restoreTermsDeep };
        }
        const rows = await runAB(use, { rounds: 1, variants, concurrency: 3, ...opts });
        dumpRows(path.join(outDir, `ab-${purpose}.json`), rows);
        const names = rows[0] ? Object.keys(rows[0].variants) : [];
        for (const n of names) console.log(printSummary(summarize(rows, n)));
        for (const lk of Object.keys(rows[0]?.legacyV || {}).filter((k) => !k.endsWith('+post'))) for (const n of names.filter((x) => !x.endsWith('+post'))) console.log(printSummary(summarize(rows, n, lk)));
    }
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
