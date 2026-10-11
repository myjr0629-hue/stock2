/**
 * Sonnet 5.5 판정자 — 변형 이름을 모르는 채(블라인드) 출력 한 건씩 «교차 근거 수 · 반대 신호 · 조건부 시나리오 · 구체성 · 이유 · 권유 표현 · 근거 없는 주장»으로 채점하고 근거 문장을 남긴다.
 *   사용: judge.ts <ENVFILE> <Purpose> <variant,variant,…> [--tag name] [--pass 1] [--max N]
 *   읽기: <OUT>/scored/<tag.>Purpose.json   쓰기: <OUT>/judged/<tag.>Purpose.pass<k>.json
 */
import path from 'node:path';
import fs from 'node:fs';
import { loadEnvFile } from '../core';
import { OUT, callModel, pool, readJson, writeJson, ensureDir, type Sample } from './lib';

const args = process.argv.slice(2);
const [envFile, purpose, variantsArg] = args;
const flag = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
loadEnvFile(envFile);

export const JUDGE_SYSTEM = `You are a strict evaluator of financial-market commentary written for a market-analysis app. You judge INTERPRETATION DEPTH and honesty, not style or length.
You receive DATA (everything the writer had) and OUTPUT (what the writer produced). Score each language block (or each card) independently against the DATA. Ignore formatting.
Placeholders such as {PRICE}, {CALL_WALL}, {GAMMA_FLIP} stand for live numbers; they count as legitimate references to data.
Fields to return for each block:
- cross: integer 0-5 = number of distinct KINDS of evidence the text actually RELATES to each other (says they agree, conflict, or explains one by another), not merely lists. Kinds: options positioning/walls, dealer gamma/GEX, flow/whale/dark pool/new positions, price action, news/events, sector rotation/macro, earnings/calendar, volatility/sentiment.
- conflict: 1 if the text explicitly points out that two signals disagree or that something in the data is unusual; else 0.
- scenario: 1 if the text contains a conditional structure "if/when X crosses|breaks|holds LEVEL then Y changes/matters" (any wording, any language); else 0.
- scenario_level_in_data: 1 if scenario=1 and the level/threshold/event used appears in DATA (a placeholder for a level counts); else 0.
- counter: 1 if the text names a counter-signal, thin/stale/missing evidence or an explicit limit of its own reading; else 0.
- specific: 0-5. 0 = generic text that would fit any day or ticker; 5 = every claim is anchored to this DATA.
- why: 0-5. 0 = only restates numbers; 5 = explains the mechanism (who is doing what and why it matters for price or risk).
- advice: integer count of expressions that recommend, instruct the reader, predict, or use future/forecast wording (e.g. should, consider, expected to, will, likely to, ~해야, ~할 것이다, 확인이 필요, 注視, 見込み).
- unsupported: integer count of factual claims in OUTPUT that DATA does not support or contradicts (invented facts, wrong direction, wrong comparison).
- note: at most 35 words explaining the scores, quoting a few words of the OUTPUT.
Be harsh and consistent: do not reward length; do not give 5 unless it is exceptional.`;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '\n…[truncated]' : s);

function dataFor(s: Sample): string {
    const u = s.userPrompt;
    if (s.purpose === 'Guardian') {
        const i = u.indexOf('=== ENGLISH'); const j = u.indexOf('=== JAPANESE');
        return clip(i >= 0 ? u.slice(i, j > i ? j : undefined) : u, 9000);
    }
    if (s.purpose === 'MorningBriefing') {
        // 요일·날짜는 system 에 있다 — 판정자가 «근거 없는 주장»으로 오판하지 않게 같이 보여 준다
        const today = (s.system.match(/TODAY IS:[^\n]*/) || [''])[0];
        return clip(`${today}\n${u}`, 12000);
    }
    if (s.purpose === 'DeepAnalysis') return clip(u, 11000);
    if (s.purpose === 'CrossSector') return clip(u, 14000);
    return clip(u, 9000);
}

function blocksFor(s: Sample, slots: Array<{ lang: string; field: string; text: string }>): string {
    if (s.purpose === 'UC') {
        // 카드마다: 필드별 글
        const cards: Record<number, string[]> = {};
        const perCard = slots.length / Math.max(1, (s.meta.nStories || 5));
        void perCard;
        let idx = -1; let lastField = '';
        for (const sl of slots) {
            const f = sl.field.replace('cards[].', '');
            if (f === 'plainTitle' || (lastField && f === lastField)) idx++;
            if (idx < 0) idx = 0;
            (cards[idx] ||= []).push(`${f}: ${sl.text}`);
            lastField = f;
        }
        return Object.entries(cards).map(([k, v]) => `[card ${Number(k) + 1}]\n${v.join('\n')}`).join('\n\n');
    }
    const byLang: Record<string, string[]> = {};
    for (const sl of slots) (byLang[sl.lang] ||= []).push(`${sl.field}: ${sl.text}`);
    return (['ko', 'en', 'ja'] as const).filter((l) => byLang[l]).map((l) => `### ${l}\n${byLang[l].join('\n')}`).join('\n\n');
}

(async () => {
    const tag = flag('tag'); const pass = flag('pass', '1');
    const scored = readJson<any>(path.join(OUT, 'scored', `${tag ? tag + '.' : ''}${purpose}.json`));
    const samples = readJson<Sample[]>(path.join(OUT, 'samples', `${purpose}.json`));
    const byId = new Map(samples.map((s) => [s.id, s]));
    const maxN = Number(flag('max') || 0);
    const file = path.join(OUT, 'judged', `${tag ? tag + '.' : ''}${purpose}.pass${pass}.json`);
    ensureDir(path.dirname(file));
    const done: Record<string, any> = fs.existsSync(file) ? readJson(file) : {};
    const jobs: Array<{ key: string; s: Sample; row: any; vn: string }> = [];
    for (const vn of variantsArg.split(',')) {
        const rows = scored.variants[vn].rows.filter((r: any) => r.ok);
        for (const r of (maxN ? rows.slice(0, maxN) : rows)) { const key = `${vn}|${r.id}|${r.run}`; if (!done[key]?.ok) jobs.push({ key, s: byId.get(r.id)!, row: r, vn }); }
    }
    console.error(`## judge ${purpose}: ${jobs.length} calls`);
    let n = 0;
    await pool(jobs, 4, async (j) => {
        const isUC = j.s.purpose === 'UC';
        const user = `PURPOSE: ${j.s.purpose}\n\n<DATA>\n${dataFor(j.s)}\n</DATA>\n\n<OUTPUT>\n${blocksFor(j.s, j.row.slots)}\n</OUTPUT>\n\n` +
            (isUC ? 'Return ONLY JSON: {"cards":[{"cross":0,"conflict":0,"scenario":0,"scenario_level_in_data":0,"counter":0,"specific":0,"why":0,"advice":0,"unsupported":0,"note":""}, ...]} — one object per card in order.'
                : 'Return ONLY JSON: {"ko":{...},"en":{...},"ja":{...}} with the fields above, only for the languages present in OUTPUT.');
        const out = await callModel(JUDGE_SYSTEM, user, { model: 'claude-sonnet-5-5', effort: 'low', maxTokens: 2200 }, true);
        let parsed: any = null;
        if (out.ok) { try { parsed = JSON.parse(out.text); } catch { parsed = null; } }
        done[j.key] = { vn: j.vn, id: j.row.id, run: j.row.run, ok: !!parsed, parsed, cost: out.costUsd, ms: out.ms, error: out.ok ? (parsed ? undefined : 'unparsable') : out.error };
        n++; if (n % 6 === 0 || n === jobs.length) writeJson(file, done);
        console.error(`   judge ${j.vn} ${j.row.id}.${j.row.run} ${parsed ? 'ok' : 'ERR ' + (out.error || 'unparsable')} $${out.costUsd.toFixed(4)}`);
    });
    writeJson(file, done);
    console.error(`judge done: ${Object.values(done).filter((d: any) => d.ok).length}/${Object.keys(done).length} ok · $${Object.values(done).reduce((a: number, d: any) => a + (d.cost || 0), 0).toFixed(3)}`);
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
