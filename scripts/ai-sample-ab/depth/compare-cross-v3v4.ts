/**
 * 크로스섹터 v3(Lambda·Sonnet 4.6) 대 v4(Vercel·Haiku 5.5) 전·후 채점 (2026-10-11) — collect-cross-v3v4.ts 가 남긴 같은 날(금요일) 실행분을 «같은 잣대»로 잰다.
 *   · 가드 통과: 서빙 가드의 생성 때 판정(lib/ai/crossBriefServe.buildGenerationGuard — 구조·언어·거절·연도·금액·숫자 근거·keyLevels 근거)을 v3 에도 똑같이 건다(제공자 항목 제외)
 *   · 서빙 가드: 저장본만으로 다시 확인되는 검사(evaluateServedV4 의 구조·문자 체계·keyLevels) — v4 는 실제 guard 기록을 달고 통과해야 한다
 *   · keyLevels 칸 수 / 입력에 없는 칸 / 범위 바(앞 두 칸이 같은 ETF Put Floor→Call Wall) 성립
 *   · 칸 길이: 현행(v3) 칸·언어별 최대 × 1.15 를 상한으로 보고 넘는 칸 수, 문장 수 초과, 평균 길이비 / 칸 개수 상한(프롬프트 지시)
 *   사용: compare-cross-v3v4.ts   (OUT 기본 ./depth-out, 입력 $OUT/cross-v3v4/v3.json · v4.json, TAG 있으면 v4.<TAG>.json)
 */
import path from 'node:path';
import fs from 'node:fs';
import { OUT, readJson, extractSlots, sentenceCount, mean } from './lib';
import { collectLocaleStrings } from '@/lib/ai/ladderGates';
import { buildGenerationGuard, evaluateServedV4, shapeProblems, languageProblems, ungroundedKeyLevels } from '@/lib/ai/crossBriefServe';

interface Run { round: number; status: number; ms: number; brief: any; prompt: string; model?: string; error?: string }
const load = (f: string): Run[] => (fs.existsSync(f) ? readJson<{ runs: Run[] }>(f).runs : []);
const dir = path.join(OUT, 'cross-v3v4');
const v3 = load(path.join(dir, 'v3.json')).filter((r) => r.status === 200 && r.brief?.structured);
const v4 = load(path.join(dir, `v4${process.env.TAG ? '.' + process.env.TAG : ''}.json`)).filter((r) => r.status === 200 && r.brief?.structured);

const LIMITS: Array<[string, (s: any) => number, number]> = [
    ['keyDrivers', (s) => Math.max(...['ko', 'en', 'ja'].map((l) => (s.marketOverview?.keyDrivers?.[l] || []).length)), 3],
    ['winners', (s) => (s.sectorRotation?.winners || []).length, 3],
    ['losers', (s) => (s.sectorRotation?.losers || []).length, 3],
    ['newsItems', (s) => (s.newsImpact?.items || []).length, 5],
    ['catalysts', (s) => Math.max(...['ko', 'en', 'ja'].map((l) => (s.outlook?.catalysts?.[l] || []).length)), 3],
    ['risks', (s) => Math.max(...['ko', 'en', 'ja'].map((l) => (s.outlook?.risks?.[l] || []).length)), 3],
    ['opportunities', (s) => Math.max(...['ko', 'en', 'ja'].map((l) => (s.outlook?.opportunities?.[l] || []).length)), 3],
    ['keyLevels', (s) => (s.outlook?.keyLevels || []).length, 4],
    ['edgeAlerts', (s) => (s.edgeAlerts || []).length, 3],
];

/** 지역 환율 쌍이 다른 언어 칸에 섞인 개수(en 에 USD/KRW·USD/JPY · ja 에 USD/KRW · ko 에 USD/JPY) — 화면이 로케일로 한 번 더 거르지만 원문 품질 지표로 센다 */
function fxLeaks(s: any): number {
    let n = 0;
    for (const it of collectLocaleStrings(s, null)) {
        if (it.loc === 'en' && /USD\s*\/\s*(KRW|JPY)|원\s*\/\s*달러|円\s*\/\s*ドル/.test(it.text)) n++;
        if (it.loc === 'ja' && /USD\s*\/\s*KRW|원\s*\/\s*달러/.test(it.text)) n++;
        if (it.loc === 'ko' && /USD\s*\/\s*JPY|円\s*\/\s*ドル/.test(it.text)) n++;
    }
    return n;
}

function rangeBarOk(kl: Array<{ label: string; value: string }>): boolean {
    if (kl.length < 2) return false;
    const m0 = String(kl[0].label).match(/^\s*([A-Za-z]{2,5})\s+put\s*floor/i), m1 = String(kl[1].label).match(/^\s*([A-Za-z]{2,5})\s+call\s*wall/i);
    return !!(m0 && m1 && m0[1].toUpperCase() === m1[1].toUpperCase());
}

// 현행(v3) 칸·언어별 길이 최대 → 상한
const caps = new Map<string, { max: number; maxSent: number }>();
const slotsOf = (r: Run) => extractSlots('CrossSector', JSON.stringify(r.brief.structured), 'multi');
for (const r of v3) for (const sl of slotsOf(r)) { const k = `${sl.lang}|${sl.field}`; const c = caps.get(k) || { max: 0, maxSent: 0 }; c.max = Math.max(c.max, sl.text.length); c.maxSent = Math.max(c.maxSent, sentenceCount(sl.text)); caps.set(k, c); }

function score(name: string, runs: Run[], providerLabel: string) {
    const rows = runs.map((r) => {
        const b = r.brief;
        const guard = buildGenerationGuard({ brief: b, source: r.prompt, provider: 'a55', model: r.model || providerLabel });
        const reasons = guard.reasons.filter((x) => !x.startsWith('provider:'));
        const served = b.guard ? evaluateServedV4(b, b.date) : null;
        const kl: Array<{ label: string; value: string }> = b.structured?.outlook?.keyLevels || [];
        const slots = slotsOf(r);
        let over = 0, overSent = 0, n = 0; const overFields: Array<{ key: string; len: number; cap: number }> = [];
        for (const sl of slots) { const c = caps.get(`${sl.lang}|${sl.field}`); if (!c) continue; n++; if (sl.text.length > c.max * 1.15) { over++; overFields.push({ key: `${sl.lang}|${sl.field}`, len: sl.text.length, cap: Math.round(c.max * 1.15) }); } if (sentenceCount(sl.text) > c.maxSent) overSent++; }
        const limitsOver = LIMITS.filter(([, f, lim]) => f(b.structured) > lim).map(([k, f]) => `${k}=${f(b.structured)}`);
        return {
            round: r.round, ms: r.ms, pass: reasons.length === 0, passNoNumbers: reasons.filter((x) => !x.startsWith('numbers:')).length === 0, reasons, servedOk: served ? served.ok : null, servedReasons: served?.reasons,
            shape: shapeProblems(b.structured).length, fx: fxLeaks(b.structured), lang: languageProblems(b.structured).length, nums: guard.numbers, klN: kl.length, klUngrounded: ungroundedKeyLevels(b), rangeBar: rangeBarOk(kl),
            klList: kl.map((k) => `${k.label}=${k.value}`), slots: slots.length, over, overSent, n, overFields, limitsOver, meanLen: mean(slots.map((s) => s.text.length)) ?? 0,
        };
    });
    return { name, rows };
}

const S3 = score('v3 (Lambda · Sonnet 4.6)', v3, 'sonnet-4.6');
const S4 = score('v4 (Vercel · Haiku 5.5)', v4, 'haiku-5.5');
const base = mean(S3.rows.map((r) => r.meanLen)) ?? 1;

const lines: string[] = [];
const P = (s = '') => { lines.push(s); console.log(s); };
P(`## 크로스섹터 v3 대 v4 — 금요일(2026-10-09 마감) 실데이터, 같은 가드`);
P();
P(`| 항목 | ${S3.name} | ${S4.name} |`);
P(`|---|---|---|`);
const sum = (S: typeof S3) => {
    const r = S.rows; const n = r.length; const c = (f: (x: any) => boolean) => r.filter(f).length;
    return {
        n, pass: c((x) => x.pass), passNoNum: c((x) => x.passNoNumbers), served: S.name.startsWith('v4') ? c((x) => x.servedOk === true) : null,
        numBad: r.reduce((a, x) => a + x.nums.ungrounded, 0), numDistinct: r.reduce((a, x) => a + x.nums.distinct, 0), fx: r.reduce((a, x) => a + x.fx, 0), numTotal: r.reduce((a, x) => a + x.nums.total, 0), numRuns: c((x) => x.nums.ungrounded > 0),
        klMean: (mean(r.map((x) => x.klN)) ?? 0).toFixed(1), kl2: c((x) => x.klN >= 2), klBad: r.reduce((a, x) => a + x.klUngrounded, 0), bar: c((x) => x.rangeBar),
        over: r.reduce((a, x) => a + x.over, 0), overN: r.reduce((a, x) => a + x.n, 0), overSent: r.reduce((a, x) => a + x.overSent, 0),
        len: ((mean(r.map((x) => x.meanLen)) ?? 0) / base).toFixed(2), limits: c((x) => x.limitsOver.length > 0),
        ms: Math.round(mean(r.map((x) => x.ms)) ?? 0), shape: c((x) => x.shape > 0), lang: c((x) => x.lang > 0),
    };
};
const a = sum(S3), b = sum(S4);
P(`| 실행 수 | ${a.n} | ${b.n} |`);
P(`| 가드 통과(구조·언어·거절·연도·금액·숫자·keyLevels) | ${a.pass}/${a.n} | ${b.pass}/${b.n} |`);
P(`| 〃 숫자 규칙을 빼면(참고) | ${a.passNoNum}/${a.n} | ${b.passNoNum}/${b.n} |`);
P(`| 서빙 가드 통과(저장본 guard 기록 + 재검사) | (기록 없음) | ${b.served}/${b.n} |`);
P(`| 구조 결함 런 / 문자 체계 혼입 런 | ${a.shape} / ${a.lang} | ${b.shape} / ${b.lang} |`);
P(`| 입력에 없는 숫자(전체 숫자 중) / 서로 다른 값 / 해당 런 | ${a.numBad}/${a.numTotal} / ${a.numDistinct} / ${a.numRuns} | ${b.numBad}/${b.numTotal} / ${b.numDistinct} / ${b.numRuns} |`);
P(`| 다른 언어 칸에 섞인 지역 환율 쌍(USD/KRW↔en·ja, USD/JPY↔en·ko) | ${a.fx} | ${b.fx} |`);
P(`| keyLevels 평균 칸 수 / 2칸 이상 런 / 입력에 없는 칸 | ${a.klMean} / ${a.kl2}/${a.n} / ${a.klBad} | ${b.klMean} / ${b.kl2}/${b.n} / ${b.klBad} |`);
P(`| 웹 범위 바 성립(앞 두 칸 = 같은 ETF Put Floor→Call Wall) | ${a.bar}/${a.n} | ${b.bar}/${b.n} |`);
P(`| 칸 길이 상한 초과(현행 칸별 최대 ×1.15) / 문장 수 초과 | ${a.over}/${a.overN} / ${a.overSent} | ${b.over}/${b.overN} / ${b.overSent} |`);
P(`| 평균 칸 길이(v3 = 1.00) | 1.00 | ${b.len} |`);
P(`| 칸 개수 상한 초과 런(keyDrivers·winners·news·keyLevels … 프롬프트 지시) | ${a.limits} | ${b.limits} |`);
P(`| 생성 시간(평균, ms — 수집 환경 기준) | ${a.ms} | ${b.ms} |`);
{
    const agg = new Map<string, { n: number; maxLen: number; cap: number }>();
    for (const r of S4.rows) for (const o of r.overFields) { const a = agg.get(o.key) || { n: 0, maxLen: 0, cap: o.cap }; a.n++; a.maxLen = Math.max(a.maxLen, o.len); agg.set(o.key, a); }
    const top = [...agg.entries()].sort((x, y) => y[1].n - x[1].n).slice(0, 6);
    if (top.length) P(`v4 칸 길이 초과 상위(칸: 횟수, 최대 길이/상한): ` + top.map(([k, a]) => `${k} ${a.n}회 ${a.maxLen}/${a.cap}자`).join(' · '));
}
P();
for (const S of [S3, S4]) {
    P(`### ${S.name} — 런별`);
    for (const r of S.rows) P(`- #${r.round} 통과=${r.pass}${r.reasons.length ? ' 사유=' + r.reasons.slice(0, 4).join(' ; ') : ''} · 숫자 불일치 ${r.nums.ungrounded}/${r.nums.total}(서로 다른 값 ${r.nums.distinct})${r.nums.list.length ? ' [' + r.nums.list.slice(0, 5).join(', ') + ']' : ''} · keyLevels ${r.klN}칸 ${r.klList.join(' | ')}${r.servedOk === false ? ' · 서빙가드 탈락=' + r.servedReasons?.join(',') : ''}${r.limitsOver.length ? ' · 개수초과 ' + r.limitsOver.join(',') : ''}`);
    P();
}
// ko·ja 샘플 — 각 쪽 «통과한 첫 런»
const sample = (name: string, runs: Run[], rows: typeof S3.rows) => {
    const i = rows.findIndex((x) => x.pass); if (i < 0) return;
    const s = runs[i].brief.structured;
    P(`### ${name} — 샘플(런 #${rows[i].round}, 가드 통과)`);
    for (const l of ['ko', 'ja'] as const) {
        P(`**${l}**`);
        P(`- summary: ${s.marketOverview?.summary?.[l]}`);
        P(`- keyDrivers[0]: ${s.marketOverview?.keyDrivers?.[l]?.[0]}`);
        P(`- rotationInsight: ${s.sectorRotation?.rotationInsight?.[l]}`);
        P(`- gamma insight: ${s.gammaOptions?.insight?.[l]}`);
        P(`- catalysts[0]: ${s.outlook?.catalysts?.[l]?.[0]}`);
        P(`- risks[0]: ${s.outlook?.risks?.[l]?.[0]}`);
    }
    P(`- keyLevels: ${(s.outlook?.keyLevels || []).map((k: any) => `${k.label} ${k.value}`).join(' · ')}`);
    P();
};
sample(S3.name, v3, S3.rows);
sample(S4.name, v4, S4.rows);
fs.writeFileSync(path.join(dir, `compare${process.env.TAG ? '.' + process.env.TAG : ''}.md`), lines.join('\n'));
process.exit(0);
