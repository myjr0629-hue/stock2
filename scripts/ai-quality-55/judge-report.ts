/** 판정 결과 집계 — raw/impl5-judge-<surface>.json → 전(OFF)·후(ON) 평균. 사용: judge-report.ts <Surface,...> */
import fs from 'node:fs';
import path from 'node:path';
import { OUTDIR } from './harness';
const FIELDS = ['facts', 'dated', 'meaning', 'cross', 'watch', 'filler', 'advice', 'unsupported'] as const;
const out: Record<string, any> = {};
for (const surface of (process.argv[2] || 'UC,Flow,Deep,Intel').split(',')) {
    // 파일 지정: OFF_FILE_<Surface>·ON_FILE_<Surface> 환경변수(없으면 impl5-judge-<Surface>.json 한 파일에 둘 다)
    const files = [process.env[`OFF_FILE_${surface}`], process.env[`ON_FILE_${surface}`]].filter(Boolean) as string[];
    const list = files.length ? files : [`impl5-judge-${surface}.json`];
    const j: Record<string, any> = {};
    let n = 0;
    for (const fn of list) { const f = path.join(OUTDIR, fn); if (!fs.existsSync(f)) continue; const part = JSON.parse(fs.readFileSync(f, 'utf8')); for (const [k, v] of Object.entries<any>(part)) j[`${fn}#${k}`] = v; n++; }
    if (!n) continue;
    const agg: Record<string, { n: number; sum: Record<string, number>; cost: number }> = {};
    for (const d of Object.values(j)) {
        if (!d.ok || !d.parsed) continue;
        const a = (agg[d.mode] ||= { n: 0, sum: {}, cost: 0 });
        a.cost += d.cost || 0;
        for (const loc of ['ko', 'en', 'ja']) {
            const p = d.parsed[loc]; if (!p) continue;
            a.n++;
            for (const k of FIELDS) a.sum[k] = (a.sum[k] || 0) + (Number(p[k]) || 0);
        }
    }
    out[surface] = Object.fromEntries(Object.entries(agg).map(([m, a]) => [m, { blocks: a.n, ...Object.fromEntries(FIELDS.map((k) => [k, a.n ? Math.round((a.sum[k] / a.n) * 100) / 100 : null])), judgeCostUsd: Math.round(a.cost * 1000) / 1000 }]));
    console.log(`\n### ${surface} 판정(블라인드 Sonnet 5.5) — 언어 블록 평균`);
    console.log('| 항목 | 전(OFF) | 후(ON) |\n|---|---|---|');
    const label: Record<string, string> = { facts: '구체적 사실 수(0-5)', dated: '날짜 동반(0-5)', meaning: '의미·기전(0-5)', cross: '교차 근거 종류(0-5)', watch: '지켜볼 지점 있음(0/1)', filler: '군말·상투(건)', advice: '권유·예측 표현(건)', unsupported: '근거 없는 주장(건)' };
    console.log(`| 판정 블록 수 | ${out[surface].off?.blocks ?? '—'} | ${out[surface].on?.blocks ?? '—'} |`);
    for (const k of FIELDS) console.log(`| ${label[k]} | ${out[surface].off?.[k] ?? '—'} | ${out[surface].on?.[k] ?? '—'} |`);
}
fs.writeFileSync(path.join(OUTDIR, 'impl5-judge-summary.json'), JSON.stringify(out));
