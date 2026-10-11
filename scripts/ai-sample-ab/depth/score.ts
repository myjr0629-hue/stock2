/**
 * 채점 — 가드(운영 진짜 출구 게이트 + 공통 가드) · 숫자 정확성(입력에 없는 숫자) · 칸 길이(현행 최대 대비) · 지연·비용.
 *   사용: score.ts <ENVFILE> <Purpose> <variant,variant,…> [--tag name]
 *   결과: <OUT>/scored/<Purpose>.json   { variants: { name: { rows:[…], summary:{…} } } }
 * 첫 변형(보통 base)이 «현행» — 칸 길이 상한은 현행 출력의 칸·언어별 최대 × 1.15 로 잡는다(화면 칸을 넘으면 그 변형은 탈락).
 */
import path from 'node:path';
import { loadEnvFile } from '../core';
import { OUT, readJson, writeJson, ensureDir, extractSlots, sentenceCount, pctl, mean, type Sample, type ModelOut } from './lib';
import { score as guardScore } from '../ab-lib';
import { checkOutputNumbers } from '@/lib/ai/depthNumbers';
import { gateFor, mapJson } from './gates';
import { restoreCommonTermNames, restoreCommonTermsDeep } from '@/lib/ai/commonTerms';
import { restoreKoSectorNames, restoreJaSectorNames } from '@/lib/ai/sectorLabels';

const args = process.argv.slice(2);
const [envFile, purpose, variantsArg] = args;
const flag = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
loadEnvFile(envFile);

type Run = { id: string; run: number; out: ModelOut; user?: string };

/** 운영이 출구에서 하는 복원(음차·섹터 이름)을 같은 글에 적용한 뒤 채점한다 — 양쪽 변형에 똑같이 */
function postProcess(p: string, text: string): string {
    if (p === 'Guardian') return mapJson(text, (k, v) => (k === 'ko' ? restoreCommonTermNames(restoreKoSectorNames(v).text).text : k === 'ja' ? restoreCommonTermNames(restoreJaSectorNames(v).text).text : v));
    try { return JSON.stringify(restoreCommonTermsDeep(JSON.parse(text))); } catch { return text; }
}

/** UC 카드 숫자 문제(배수·가격대) — 운영 enforceLean 이 찾는 것과 같은 검사 */
async function ucCardProblems(s: Sample, text: string): Promise<string[]> {
    const { ucNumberProblems } = await import('@/lib/ai/ucNumbers');
    let o: any; try { o = JSON.parse(text); } catch { return []; }
    const cards: any[] = Array.isArray(o?.cards) ? o.cards : [];
    const bad: string[] = [];
    cards.forEach((c, i) => {
        const raw = s.meta.kind === 'feed' ? s.meta.rawMoney?.[i] : s.meta.moneys?.[0];
        if (!raw) return;
        const vp = typeof raw.volumePutCallRatio === 'number' && raw.volumePutCallRatio > 0 ? 1 / raw.volumePutCallRatio : null;
        const money = { price: raw.price, maxPain: raw.maxPain, callWall: raw.callWall, putFloor: raw.putFloor, oiPcr: raw.oiPcr, volumePcr: vp };
        for (const f of ['whyItMatters', 'moneyRead']) for (const p of ucNumberProblems(s.locale as any, c?.[f], money)) bad.push(`card${i + 1}.${f}:${p}`);
    });
    return bad;
}

(async () => {
    const samples = readJson<Sample[]>(path.join(OUT, 'samples', `${purpose}.json`));
    const byId = new Map(samples.map((s) => [s.id, s]));
    const variants = variantsArg.split(',');
    const tag = flag('tag');
    const result: Record<string, any> = { purpose, variants: {} };
    // 현행(첫 변형)의 칸·언어별 길이 최대 → 상한
    const caps = new Map<string, { max: number; maxSent: number }>();
    const rowsByVariant: Record<string, any[]> = {};
    for (const vn of variants) {
        const runs = readJson<Run[]>(path.join(OUT, 'runs', purpose, `${tag ? tag + '.' : ''}${vn}.json`));
        const rows: any[] = [];
        for (const r of runs) {
            const s0 = byId.get(r.id); if (!s0) continue;
            const s: Sample = r.user ? { ...s0, userPrompt: r.user } : s0;
            if (!r.out.ok) { rows.push({ id: r.id, run: r.run, ok: false, error: r.out.error, ms: r.out.ms }); continue; }
            const text = postProcess(purpose, r.out.text);
            const validate = await gateFor(s);
            const cap: any = { purpose: s.purpose, userPrompt: s.userPrompt, jsonPrefill: true, expectJson: s.expectJson, locale: s.locale, validate };
            const sc = await guardScore(cap, text, r.out.stop, !!r.out.refusal, 'h55');
            const reasons: string[] = [...(sc.eval?.reasons || [])];
            let ucBad: string[] = [];
            if (purpose === 'UC') ucBad = await ucCardProblems(s, sc.text || text);
            const nums = checkOutputNumbers(sc.text || text, s.system + '\n' + s.userPrompt);
            const slots = extractSlots(purpose, sc.text || text, s.locale);
            rows.push({
                id: r.id, run: r.run, ok: true, ms: r.out.ms, cost: r.out.costUsd, outTok: r.out.usage?.output ?? 0, inTok: (r.out.usage?.input ?? 0) + (r.out.usage?.cacheRead ?? 0),
                stop: r.out.stop, pass: !!sc.pass && ucBad.length === 0, reasons, ucBad,
                nums: { total: nums.total, grounded: nums.grounded, exempt: nums.exempt, ungrounded: nums.ungrounded.slice(0, 12) },
                slots: slots.map((x) => ({ lang: x.lang, field: x.field, len: x.text.length, sent: sentenceCount(x.text), text: x.text })),
                text: sc.text || text,
            });
        }
        rowsByVariant[vn] = rows;
        if (vn === variants[0]) {
            for (const r of rows.filter((x) => x.ok)) for (const sl of r.slots) {
                const k = `${sl.lang}|${sl.field}`; const c = caps.get(k) || { max: 0, maxSent: 0 };
                c.max = Math.max(c.max, sl.len); c.maxSent = Math.max(c.maxSent, sl.sent); caps.set(k, c);
            }
        }
    }
    for (const vn of variants) {
        const rows = rowsByVariant[vn]; const ok = rows.filter((r) => r.ok);
        let over = 0, overSent = 0, nSlots = 0; const ratios: number[] = [];
        const overs: string[] = [];
        for (const r of ok) for (const sl of r.slots) {
            const c = caps.get(`${sl.lang}|${sl.field}`); if (!c) continue;
            nSlots++;
            if (sl.len > c.max * 1.15) { over++; overs.push(`${r.id}:${sl.lang}:${sl.field}:${sl.len}>${Math.round(c.max * 1.15)}`); r.overCap = (r.overCap || 0) + 1; }
            if (sl.sent > c.maxSent) overSent++;
            ratios.push(sl.len / Math.max(1, c.max));
        }
        const lenMean = (rs: any[]) => mean(rs.flatMap((r) => r.slots.map((s: any) => s.len)));
        const baseLen = mean(rowsByVariant[variants[0]].filter((r) => r.ok).flatMap((r) => r.slots.map((s: any) => s.len)));
        const numTotal = ok.reduce((a, r) => a + r.nums.total - r.nums.exempt, 0);
        const numBad = ok.reduce((a, r) => a + r.nums.ungrounded.length, 0);
        result.variants[vn] = {
            rows,
            summary: {
                n: rows.length, okCalls: ok.length, guardPass: ok.filter((r) => r.pass).length,
                guardFail: Object.entries(ok.filter((r) => !r.pass).flatMap((r) => [...r.reasons, ...r.ucBad]).reduce((m: Record<string, number>, x: string) => { const k = x.replace(/[:=].*$/, ''); m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a: any, b: any) => b[1] - a[1]).slice(0, 8),
                numbersChecked: numTotal, numbersUngrounded: numBad, runsWithUngrounded: ok.filter((r) => r.nums.ungrounded.length > 0).length,
                slotsChecked: nSlots, slotsOverCap: over, slotsOverSentences: overSent, lenMeanChars: lenMean(ok), lenRatioVsBase: baseLen ? (lenMean(ok) ?? 0) / baseLen : null, overList: overs.slice(0, 10),
                msP50: pctl(ok.map((r) => r.ms), 0.5), msP95: pctl(ok.map((r) => r.ms), 0.95), costMean: mean(ok.map((r) => r.cost)), outTokMean: mean(ok.map((r) => r.outTok)), inTokMean: mean(ok.map((r) => r.inTok)),
                cut: ok.filter((r) => r.stop === 'max_tokens').length,
            },
        };
    }
    ensureDir(path.join(OUT, 'scored'));
    writeJson(path.join(OUT, 'scored', `${tag ? tag + '.' : ''}${purpose}.json`), result);
    for (const vn of variants) {
        const s = result.variants[vn].summary;
        console.log(`${purpose} / ${vn}: 호출 ${s.okCalls}/${s.n} · 가드 통과 ${s.guardPass}/${s.okCalls} · 숫자 ${s.numbersUngrounded}/${s.numbersChecked} 불일치(${s.runsWithUngrounded}건) · 칸 초과 ${s.slotsOverCap}/${s.slotsChecked} (문장 초과 ${s.slotsOverSentences}) · 길이비 ${s.lenRatioVsBase?.toFixed(2)} · p50 ${(s.msP50 / 1000).toFixed(1)}s p95 ${(s.msP95 / 1000).toFixed(1)}s · $${s.costMean?.toFixed(4)} · 출력 ${s.outTokMean?.toFixed(0)}tok · 잘림 ${s.cut}`);
        if (s.guardFail.length) console.log('    가드 실패:', JSON.stringify(s.guardFail));
        if (s.overList.length) console.log('    칸 초과 예:', s.overList.slice(0, 4).join(' | '));
    }
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
