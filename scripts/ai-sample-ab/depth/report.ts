/**
 * 판정 집계 — 변형별 깊이 종합점수(0~100)와 구성 항목, 현행(base) 대비 «같은 표본» 짝 비교(부트스트랩 95% 신뢰구간).
 *   사용: report.ts <Purpose> <base> <variant,variant,…> [--tag name] [--passes 1,2]
 *   종합점수 = 100 × [0.25·min(교차,3)/3 + 0.10·충돌 + 0.15·시나리오·(0.5+0.5·근거수준) + 0.10·반대신호 + 0.15·구체성/5 + 0.25·이유/5] − 15·권유표현 − 15·근거없는주장(0 미만은 0)
 */
import path from 'node:path';
import fs from 'node:fs';
import { OUT, readJson, mean } from './lib';

const args = process.argv.slice(2);
const [purpose, baseName, variantsArg] = args;
const flag = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const tag = flag('tag'); const passes = (flag('passes', '1') as string).split(',');

interface Item { cross: number; conflict: number; scenario: number; scenario_level_in_data: number; counter: number; specific: number; why: number; advice: number; unsupported: number; note?: string }
const n0 = (x: any) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const clean = (o: any): Item => ({ cross: n0(o?.cross), conflict: n0(o?.conflict), scenario: n0(o?.scenario), scenario_level_in_data: n0(o?.scenario_level_in_data), counter: n0(o?.counter), specific: n0(o?.specific), why: n0(o?.why), advice: n0(o?.advice), unsupported: n0(o?.unsupported), note: typeof o?.note === 'string' ? o.note : undefined });
export const composite = (i: Item): number => Math.max(0, 100 * (0.25 * Math.min(i.cross, 3) / 3 + 0.10 * Math.min(i.conflict, 1) + 0.15 * Math.min(i.scenario, 1) * (0.5 + 0.5 * Math.min(i.scenario_level_in_data, 1)) + 0.10 * Math.min(i.counter, 1) + 0.15 * i.specific / 5 + 0.25 * i.why / 5) - 15 * i.advice - 15 * i.unsupported);

type Entry = { vn: string; id: string; run: number; lang: string; item: Item };
function load(): Entry[] {
    const out: Entry[] = [];
    for (const p of passes) {
        const f = path.join(OUT, 'judged', `${tag ? tag + '.' : ''}${purpose}.pass${p}.json`);
        if (!fs.existsSync(f)) continue;
        const d = readJson<Record<string, any>>(f);
        for (const v of Object.values(d)) {
            if (!v.ok || !v.parsed) continue;
            if (Array.isArray(v.parsed.cards)) {
                // UC: 카드별 → 같은 호출 안 평균은 아래 sample 단위 평균에서
                const loc = String(v.id).split(':').pop() || 'ko';
                for (const c of v.parsed.cards) out.push({ vn: v.vn, id: v.id, run: v.run, lang: loc, item: clean(c) });
            } else for (const l of ['ko', 'en', 'ja']) if (v.parsed[l]) out.push({ vn: v.vn, id: v.id, run: v.run, lang: l, item: clean(v.parsed[l]) });
        }
    }
    return out;
}

const key = (e: Entry) => `${e.id}#${e.run}`;
function perSample(es: Entry[], f: (i: Item) => number): Map<string, number> {
    const g = new Map<string, number[]>();
    for (const e of es) (g.get(key(e)) || g.set(key(e), []).get(key(e))!).push(f(e.item));
    return new Map([...g].map(([k, xs]) => [k, mean(xs)!]));
}
function boot(diffs: number[], B = 2000): [number, number] {
    if (!diffs.length) return [NaN, NaN];
    const ms: number[] = [];
    for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < diffs.length; i++) s += diffs[Math.floor(Math.random() * diffs.length)]; ms.push(s / diffs.length); }
    ms.sort((a, b) => a - b);
    return [ms[Math.floor(0.025 * B)], ms[Math.floor(0.975 * B)]];
}

const all = load();
const variants = [baseName, ...variantsArg.split(',').filter((v) => v !== baseName)];
const fmt = (x: number | null | undefined, d = 1) => (x == null || Number.isNaN(x) ? '-' : x.toFixed(d));
const lines: string[] = [];
lines.push(`### ${purpose} — 판정 ${all.length ? '' : '(데이터 없음)'}`);
lines.push('| 변형 | 판정 수 | 깊이 종합 | 교차 | 충돌지적 | 시나리오 | (근거 수준) | 반대신호 | 구체성 | 이유 | 권유표현/건 | 근거없는 주장/건 | 짝 비교 vs 현행 (평균차 · 95% CI · 이긴 표본) |');
lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const baseSample = perSample(all.filter((e) => e.vn === baseName), composite);
const summaryJson: Record<string, any> = {};
for (const vn of variants) {
    const es = all.filter((e) => e.vn === vn);
    if (!es.length) continue;
    const m = (f: (i: Item) => number) => mean(es.map((e) => f(e.item)));
    const comp = perSample(es, composite);
    let pair = '-';
    let diffMean: number | null = null, ci: [number, number] | null = null, wins = 0, nPair = 0;
    if (vn !== baseName) {
        const diffs: number[] = [];
        for (const [k, v] of comp) { const b = baseSample.get(k); if (b != null) { diffs.push(v - b); if (v > b) wins++; } }
        nPair = diffs.length; diffMean = mean(diffs); ci = boot(diffs);
        pair = nPair ? `${diffMean! >= 0 ? '+' : ''}${fmt(diffMean)} · [${fmt(ci[0])}, ${fmt(ci[1])}] · ${wins}/${nPair}` : '-';
    }
    lines.push(`| ${vn} | ${es.length} | **${fmt(m(composite))}** | ${fmt(m((i) => i.cross), 2)} | ${fmt(100 * m((i) => i.conflict)!, 0)}% | ${fmt(100 * m((i) => i.scenario)!, 0)}% | ${fmt(100 * m((i) => i.scenario_level_in_data)!, 0)}% | ${fmt(100 * m((i) => i.counter)!, 0)}% | ${fmt(m((i) => i.specific), 2)} | ${fmt(m((i) => i.why), 2)} | ${fmt(m((i) => i.advice), 2)} | ${fmt(m((i) => i.unsupported), 2)} | ${pair} |`);
    const byLang: Record<string, number | null> = {};
    for (const l of ['ko', 'en', 'ja']) byLang[l] = mean(es.filter((e) => e.lang === l).map((e) => composite(e.item)));
    summaryJson[vn] = { n: es.length, composite: m(composite), byLang, cross: m((i) => i.cross), conflict: m((i) => i.conflict), scenario: m((i) => i.scenario), levelInData: m((i) => i.scenario_level_in_data), counter: m((i) => i.counter), specific: m((i) => i.specific), why: m((i) => i.why), advice: m((i) => i.advice), unsupported: m((i) => i.unsupported), pair: vn === baseName ? null : { diffMean, ci, wins, n: nPair } };
}
lines.push('');
lines.push('언어별 종합: ' + variants.filter((v) => summaryJson[v]).map((v) => `${v}[ko ${fmt(summaryJson[v].byLang.ko)} · en ${fmt(summaryJson[v].byLang.en)} · ja ${fmt(summaryJson[v].byLang.ja)}]`).join('  '));
console.log(lines.join('\n'));
fs.mkdirSync(path.join(OUT, 'report'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'report', `${tag ? tag + '.' : ''}${purpose}.json`), JSON.stringify(summaryJson));
