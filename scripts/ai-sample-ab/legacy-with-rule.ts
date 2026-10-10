/** 딥 분석 프롬프트의 «FINANCE TERM NAMES» 규칙 문장이 현행(Bedrock Haiku 4.5)에 해가 없는지 — 같은 14입력을 규칙 문장 있는/없는 system 으로 현행에 보내 진짜 출구 게이트로 채점한다.
 *   legacy-with-rule.ts <ENV> */
import { bootHarness, state } from './core';
import { loadCaptured, legacyCall } from './captured';
import { score } from './ab-lib';
bootHarness({ envFile: process.argv[2] });
const RULE = `- FINANCE TERM NAMES (hard rule): the metric names Call Wall, Put Floor, Max Pain, Gamma Flip, GEX, P/C, OI stay in English inside the Korean and Japanese text exactly as written (the data tags call_wall / put_floor / max_pain / gamma_flip_level are these names). Never write them by sound (콜월, 풋플로어, 맥스페인, 감마플립, コールウォール, プットフロア, マックスペイン, ガンマフリップ are wrong). Open interest keeps its local standard word (미결제약정, 建玉).`;
function tokens(u: string) { const blk = u.match(/<number_tokens>([\s\S]*?)<\/number_tokens>/); if (!blk) return null; const out: Record<string, number> = {}; for (const m of blk[1].matchAll(/^- \{([A-Z_]+)\} = ([^\s(]+)/gm)) { const raw = m[2]; const mult = /M$/.test(raw) ? 1e6 : /B$/.test(raw) ? 1e9 : /K$/.test(raw) ? 1e3 : 1; const n = Number(raw.replace(/[$,%+MBK]/g, '')); if (Number.isFinite(n)) out[m[1]] = (/^-/.test(raw) ? -1 : 1) * Math.abs(n) * mult; } return Object.keys(out).length ? out : null; }
(async () => {
    const { gateDeepAnalysis } = await import('@/lib/ai/deepTrust');
    const { restoreCommonTermsDeep } = await import('@/lib/ai/commonTerms');
    const items = await loadCaptured('DeepAnalysis');
    let base = 0, withRule = 0, n = 0, tb = 0, tr = 0, ms: number[] = [];
    for (const c of items.slice(0, 14)) {
        const tok = tokens(c.userPrompt); if (!tok || !tok.PRICE) continue;
        const extras = [...c.userPrompt.matchAll(/\$([\d][\d,]*(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, ''))).filter((x) => x > 0);
        const basis: any = { ticker: 'X', price: tok.PRICE, callWall: tok.CALL_WALL ?? null, putFloor: tok.PUT_FLOOR ?? null, maxPain: tok.MAX_PAIN ?? null, gammaFlip: tok.GAMMA_FLIP ?? null, extras };
        c.validate = (t: string) => { try { const g = gateDeepAnalysis(restoreCommonTermsDeep(JSON.parse(t)), tok as any, basis, new Date('2026-10-10T03:00:00Z')); return g.ok ? true : { ok: false, reasons: g.reasons.slice(0, 3) }; } catch { return 'parse'; } };
        n++;
        for (const withR of [false, true]) {
            const t0 = Date.now();
            const r: any = await legacyCall({ system: withR ? c.system.replace('</critical_rules>', RULE + '\n</critical_rules>') : c.system, userPrompt: c.userPrompt, maxTokens: c.maxTokens, temperature: c.temperature ?? 0.4, jsonPrefill: false });
            const sc = await score(c, r.text, r.truncated ? 'max_tokens' : null, false, 'legacy');
            const reasons = (sc.eval?.reasons || []).filter((x) => !/transliterated/.test(x));
            const trCount = (sc.eval?.reasons || []).filter((x) => /transliterated/.test(x)).length;
            const pass = reasons.length === 0;
            if (withR) { withRule += pass ? 1 : 0; tr += trCount; ms.push(Date.now() - t0); } else { base += pass ? 1 : 0; tb += trCount; }
            await new Promise((r2) => setTimeout(r2, 7000));
        }
        console.error(`  #${n} 누적 규칙 없음 ${base}/${n} (음차 ${tb}) · 규칙 있음 ${withRule}/${n} (음차 ${tr})`);
    }
    console.log(`현행 4.5 딥 분석 신뢰 경로 ${n}건: 규칙 문장 없음 ${base}/${n}(음차 사유 ${tb}) · 있음 ${withRule}/${n}(음차 사유 ${tr})  [음차 복원 적용 후 통과 기준]`);
    process.exit(0);
})();
