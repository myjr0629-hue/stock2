/**
 * 블라인드 판정(Sonnet 5.5) — 전·후 출력을 «어느 쪽인지 모르는 채» 한 건씩 채점한다. 사실 → 의미 → 지켜볼 지점 구조와 근거·기준 시각·권유 표현을 본다.
 *   사용: judge.ts <ENV> <surface:file,...> [--max N]   읽기: raw/impl5-<surface>.json   쓰기: raw/impl5-judge-<surface>.json
 *   판정 호출은 서버 관리자 adhoc(크레딧) 경유 — 월 원장에 센다. 한 실행(세 언어 한 벌 또는 UC 한 언어)마다 1회.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from '../ai-sample-ab/core';
import { callModel, pool } from '../ai-sample-ab/depth/lib';
import { slotsOfRun } from './metrics';
import { OUTDIR } from './harness';

const args = process.argv.slice(2);
const [envFile, spec] = args;
const flag = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
loadEnvFile(envFile);

export const JUDGE_SYSTEM = `You are a strict evaluator of financial-market commentary written for a retail market-analysis app. You judge whether the text is a trustworthy, useful read — not style or length.
You receive DATA (everything the writer had, including dated source facts) and OUTPUT (what the writer produced). Score each language block independently against the DATA.
Fields to return per block:
- facts: integer 0-5. How many distinct, concrete, checkable facts (a number plus what it measures) the text uses. 0 = vague words only.
- dated: integer 0-5. 0 = no number carries a date/as-of; 5 = every number states what date or session it refers to.
- meaning: integer 0-5. 0 = only restates numbers; 5 = explains the mechanism (who positions how and why it matters for risk or liquidity).
- watch: 1 if the text gives an observable level, date or release the reader can check later, stated as a condition (not a prediction); else 0.
- cross: integer 0-5 = number of distinct KINDS of evidence the text actually RELATES to each other (agree, conflict, or one explains another), not merely lists.
- filler: integer count of filler or meta statements (e.g. "data is not provided", generic boilerplate that fits any ticker, restating what the screen already shows without insight).
- advice: integer count of expressions that recommend, instruct, predict, give targets or use future/forecast wording (should, consider, expected to, will, likely to, ~해야, ~할 것이다, 見込み).
- unsupported: integer count of factual claims in OUTPUT that DATA does not support or contradicts (invented facts, wrong direction, wrong comparison, wrong number).
- note: at most 30 words explaining, quoting a few words of OUTPUT.
Be harsh and consistent; do not reward length. Placeholders such as {PRICE} stand for live numbers and count as legitimate references.`;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '\n…[truncated]' : s);
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

(async () => {
    const maxN = Number(flag('max') || 0);
    for (const part of spec.split(',')) {
        const [surface, file] = part.split(':');
        const runs: any[] = JSON.parse(fs.readFileSync(path.join(OUTDIR, file), 'utf8'));
        const outFile = path.join(OUTDIR, `impl5-judge-${surface}${process.env.JUDGE_TAG ? '-' + process.env.JUDGE_TAG : ''}.json`);
        const done: Record<string, any> = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
        const jobs = runs.map((r, i) => ({ r, key: `${i}|${r.mode}|${r.ticker}|${r.locale}` })).filter((j) => j.r.status === 200 && !j.r.body?.error && !done[j.key]?.ok);
        const take = maxN ? jobs.slice(0, maxN) : jobs;
        console.error(`## judge ${surface}: ${take.length} calls`);
        let n = 0;
        await pool(take, 4, async ({ r, key }) => {
            const slots = slotsOfRun(surface, r.locale, r.body);
            if (!slots.length) { done[key] = { ok: false, mode: r.mode, error: 'no-slots' }; return; }
            const ground = clip(((r.requests && r.requests.length) ? r.requests : (r.entry || [])).map((q: any) => q.user).join('\n---\n'), 30000);
            const byLang: Record<string, string[]> = {};
            for (const s of slots) (byLang[s.loc] ||= []).push(`${s.field}: ${s.text}`);
            const block = (['ko', 'en', 'ja'] as const).filter((l) => byLang[l]).map((l) => `### ${l}\n${byLang[l].join('\n')}`).join('\n\n');
            const user = `SURFACE: ${surface}\n\n<DATA>\n${ground}\n</DATA>\n\n<OUTPUT>\n${block}\n</OUTPUT>\n\nReturn ONLY JSON: {"ko":{...},"en":{...},"ja":{...}} with the fields above, only for the languages present in OUTPUT.`;
            const o = await callModel(JUDGE_SYSTEM, user, { model: 'claude-sonnet-5-5', effort: 'low', thinking: 'disabled', maxTokens: 1800 }, true);
            let parsed: any = null;
            if (o.ok) { try { parsed = JSON.parse(o.text); } catch { parsed = null; } }
            done[key] = { ok: !!parsed, mode: r.mode, ticker: r.ticker, locale: r.locale, parsed, cost: o.costUsd, ms: o.ms, error: o.ok ? (parsed ? undefined : 'unparsable') : o.error, order: hash(key) };
            n++; if (n % 5 === 0) fs.writeFileSync(outFile, JSON.stringify(done));
            console.error(`   judge ${r.mode} ${r.ticker} ${r.locale} ${parsed ? 'ok' : 'ERR ' + (o.error || '')} $${o.costUsd.toFixed(4)}`);
        });
        fs.writeFileSync(outFile, JSON.stringify(done));
        console.error(`judge ${surface} done: ${Object.values(done).filter((d: any) => d.ok).length}/${Object.keys(done).length} · $${Object.values(done).reduce((a: number, d: any) => a + (d.cost || 0), 0).toFixed(3)}`);
    }
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
