/**
 * 변형 실행 — 같은 표본을 «현행(Haiku 5.5 사고 끔 · 운영 프롬프트 그대로)»과 «깊이 변형들»로 나란히 돌린다.
 *   사용: run.ts <ENVFILE> <Purpose> <variant,variant,…> [--runs N] [--max N] [--conc N] [--kind ticker|feed] [--tag name]
 *   결과: <OUT>/runs/<Purpose>/<variant>.json  (이어하기 지원 — 이미 있는 (표본, 회차)는 건너뛴다)
 *
 * 변형
 *   base         Haiku 5.5 · effort low · 사고 끔 · 운영 프롬프트 그대로 (= 지금 운영)
 *   depth        base + 깊이 지시문(system 끝에 덧붙임, lib/ai/depthDirective)
 *   depth-ad     depth + 적응형 사고(effort low)                              — (c) 사고 낮음
 *   depth-med    depth + 적응형 사고(effort medium)                           — (c) 사고 중간
 *   sonnet-base  Sonnet 5.5 · effort low · 사고 끔(between_tools) · 운영 프롬프트 그대로
 *   sonnet-depth Sonnet 5.5 · effort low · 사고 끔 · 깊이 지시문                   — (d)
 *   sonnet-depth-ad Sonnet 5.5 · effort low · 적응형 사고 · 깊이 지시문            — (d)
 *   ctx          depth + UC 피드의 돈 신호 확장(다크풀 이상치)                      — (a) 입력 맥락 확장
 *   fix          정확성 수리 후 프롬프트(2026-10-11, fix/ai-keylevels-fieldleak) — 같은 입력·같은 모델(Haiku 5.5 사고 끔)
 *                · CrossSector: keyLevels «입력에 있는 수준만» 스키마·요구문 교체(lib/ai/keyLevels) — 운영과 같은 문구, 출구 필터는 score.ts 가 같은 함수로
 *                · UC: 새 buildSystem(내부 필드명 금지 규칙) + 깊이 지시문(운영 UC 는 깊이 켬이라 비교 기준 = depth)
 */
import path from 'node:path';
import fs from 'node:fs';
import { loadEnvFile } from '../core';
import { OUT, callModel, pool, readJson, writeJson, ensureDir, type Sample, type ModelCall, type ModelOut } from './lib';
import { depthDirectiveFor } from '@/lib/ai/depthDirective';
import { KEYLEVELS_SCHEMA_EXAMPLE, KEYLEVELS_REQUIREMENT } from '@/lib/ai/keyLevels';
import { buildSystem as ucBuildSystem } from '@/app/api/undercurrent/shared';

const args = process.argv.slice(2);
const [envFile, purpose, variantsArg] = args;
const flag = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
loadEnvFile(envFile);

interface Variant { call: Omit<ModelCall, 'maxTokens'>; sys?: (s: Sample) => string; user?: (s: Sample) => string; only?: (s: Sample) => boolean }
const HAIKU = { model: 'claude-haiku-5-5' as const, effort: 'low' as const, thinking: 'disabled' as const };
const SONNET = { model: 'claude-sonnet-5-5' as const, effort: 'low' as const, thinking: 'disabled' as const };
const withDepth = (s: Sample) => s.system + depthDirectiveFor(s.purpose);

/** UC 피드 입력 확장 — 이야기마다 다크풀 «이상치»만 돈 신호에 붙인다(평소 수준이면 붙이지 않는다: 모델이 보통을 이상으로 읽지 않게) */
function ucCtxUser(s: Sample): string {
    const i = s.userPrompt.indexOf('STORIES:\n');
    if (i < 0) return s.userPrompt;
    const stories = JSON.parse(s.userPrompt.slice(i + 9));
    const raws: any[] = s.meta.rawMoney || [];
    stories.forEach((st: any, k: number) => {
        const r = raws[k]; if (!r) return;
        const ratio = r.darkPoolVolRatio, dev = r.darkPoolShortDev;
        const anomalous = (typeof ratio === 'number' && (ratio >= 1.3 || ratio <= 0.6)) || (typeof dev === 'number' && Math.abs(dev) >= 10) || (r.darkPoolRegime && r.darkPoolRegime !== 'NEUTRAL');
        if (anomalous) {
            for (const f of ['darkPoolVolRatio', 'darkPoolShortPct', 'darkPoolShortAvg', 'darkPoolShortDev', 'darkPoolRegime', 'darkPoolMarketAvg', 'darkPoolDate']) if (r[f] != null) st.money[f] = r[f];
        }
        if (typeof r.changePct === 'number') st.money.dayChangePct = r.changePct;
    });
    return s.userPrompt.slice(0, i + 9) + JSON.stringify(stories);
}

/** CrossSector — 저장된 현행 프롬프트의 keyLevels 예시·요구문만 새 문구로(나머지 입력은 한 글자도 그대로) */
function crossSectorFixUser(s: Sample): string {
    const a = s.userPrompt.replace(/"keyLevels": \[[\s\S]*?\],\n/, () => KEYLEVELS_SCHEMA_EXAMPLE + '\n');
    const b = a.replace(/- Provide 3-4 key levels \(include VIX threshold if elevated\)\n/, () => KEYLEVELS_REQUIREMENT + '\n');
    if (a === s.userPrompt || b === a) throw new Error('crossSectorFixUser: 교체 지점을 못 찾음');
    return b;
}
/** UC — 같은 날짜 앵커·금융 공통어 앞머리 + 새 buildSystem + 깊이 지시문 */
function ucFixSystem(s: Sample): string {
    const i = s.system.indexOf('You write for "Undercurrent"');
    if (i < 0) throw new Error('ucFixSystem: system 앞머리를 못 찾음');
    return s.system.slice(0, i) + ucBuildSystem(s.locale as 'ko' | 'en' | 'ja') + depthDirectiveFor(s.purpose);
}

const VARIANTS: Record<string, Variant> = {
    base: { call: HAIKU },
    depth: { call: HAIKU, sys: withDepth },
    'depth-ad': { call: { model: 'claude-haiku-5-5', effort: 'low' }, sys: withDepth },
    'depth-med': { call: { model: 'claude-haiku-5-5', effort: 'medium' }, sys: withDepth },
    'sonnet-base': { call: SONNET },
    'sonnet-depth': { call: SONNET, sys: withDepth },
    'sonnet-depth-ad': { call: { model: 'claude-sonnet-5-5', effort: 'low' }, sys: withDepth },
    ctx: { call: HAIKU, sys: withDepth, user: ucCtxUser, only: (s) => s.meta.kind === 'feed' },
    fix: { call: HAIKU },   // 용도별로 아래에서 채운다
};
VARIANTS.fix = purpose === 'UC' ? { call: HAIKU, sys: ucFixSystem } : purpose === 'CrossSector' ? { call: HAIKU, user: crossSectorFixUser } : { call: HAIKU };

(async () => {
    const samplesAll = readJson<Sample[]>(path.join(OUT, 'samples', `${purpose}.json`));
    const kind = flag('kind');
    const maxN = Number(flag('max') || 0);
    const runs = Number(flag('runs') || 1);
    const conc = Number(flag('conc') || 4);
    let samples = samplesAll.filter((s) => !kind || s.meta.kind === kind);
    if (maxN) samples = samples.slice(0, maxN);
    const dir = path.join(OUT, 'runs', purpose); ensureDir(dir);
    for (const vn of variantsArg.split(',')) {
        const v = VARIANTS[vn]; if (!v) { console.error('unknown variant', vn); continue; }
        const file = path.join(dir, `${flag('tag') ? flag('tag') + '.' : ''}${vn}.json`);
        const done: Array<{ id: string; run: number; out: ModelOut; user?: string }> = fs.existsSync(file) ? readJson(file) : [];
        const have = new Set(done.map((d) => `${d.id}#${d.run}`));
        const jobs: Array<{ s: Sample; run: number }> = [];
        for (const s of samples) { if (v.only && !v.only(s)) continue; for (let r = 0; r < runs; r++) if (!have.has(`${s.id}#${r}`)) jobs.push({ s, run: r }); }
        console.error(`## ${purpose} / ${vn}: ${jobs.length} calls (기존 ${done.length})`);
        let n = 0;
        await pool(jobs, conc, async ({ s, run }) => {
            const userUsed = v.user ? v.user(s) : s.userPrompt;
            const out = await callModel(v.sys ? v.sys(s) : s.system, userUsed, { ...v.call, maxTokens: s.maxTokens }, s.expectJson);
            done.push({ id: s.id, run, out, ...(v.user ? { user: userUsed } : {}) });
            n++;
            if (n % 5 === 0 || n === jobs.length) writeJson(file, done);
            console.error(`   ${vn} ${s.id}.${run} ${out.ok ? `${(out.ms / 1000).toFixed(1)}s $${out.costUsd.toFixed(4)} ${out.stop}` : 'ERR ' + out.error}`);
        });
        writeJson(file, done);
        const ok = done.filter((d) => d.out.ok);
        console.error(`   → ${vn}: ${ok.length}/${done.length} ok · 비용 합 $${ok.reduce((a, d) => a + d.out.costUsd, 0).toFixed(4)}`);
    }
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
