/** 전·후 표 — raw/impl5-<surface>.json 들을 읽어 지표를 모아 markdown 으로. 사용: report.ts <surface:file,...> [out.json]  (비밀·환경변수 없음) */
import fs from 'node:fs';
import path from 'node:path';
import { slotsOfRun, measureOutput, pctl, mean } from './metrics';
import { OUTDIR } from './harness';

const arg = process.argv[2] || 'UC:impl5-uc.json,Flow:impl5-flow.json,Deep:impl5-deep.json,Intel:impl5-intel.json';
const outJson = process.argv[3];
const pc = (x: number | null | undefined, d = 1) => (x == null ? '—' : x.toFixed(d));
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(0)}%` : '—');

interface Agg { n: number; ok: number; walls: number[]; wallsClean: number[]; mainClean: number[]; ladderMs: number[]; costs: number[]; firstTry: number; provider: Record<string, number>; calls: number[]; outs: number; numbers: number; grounded: number; ungrounded: number; fact: number; dated: number; anyAsOf: number; topicNum: number; topicAsOf: number; newDom: number[]; dom: number[]; chars: number[]; aiqCut: number; aiqAsOfMiss: number; filler: number; domCount: Record<string, number>; callsMain?: number; netArtifact?: number }
const blank = (): Agg => ({ n: 0, ok: 0, walls: [], wallsClean: [], mainClean: [], ladderMs: [], costs: [], firstTry: 0, provider: {}, calls: [], outs: 0, numbers: 0, grounded: 0, ungrounded: 0, fact: 0, dated: 0, anyAsOf: 0, topicNum: 0, topicAsOf: 0, newDom: [], dom: [], chars: [], aiqCut: 0, aiqAsOfMiss: 0, filler: 0, domCount: {} });

const summary: Record<string, any> = {};
for (const part of arg.split(',')) {
    const [surface, file] = part.split(':');
    const fp = path.join(OUTDIR, file);
    if (!fs.existsSync(fp)) { console.error(`(없음) ${fp}`); continue; }
    const runs: any[] = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const agg: Record<string, Agg> = { off: blank(), on: blank() };
    for (const r of runs) {
        const a = agg[r.mode as 'off' | 'on']; a.n++;
        const good = r.status === 200 && !r.body?.error;
        if (good) a.ok++;
        a.walls.push(r.wallMs);
        const artifact = (r.ladder || []).some((l: any) => /(^|,)a55s?:(network|breaker)/.test(l.tr || ''));
        if (!artifact) { a.wallsClean.push(r.wallMs); for (const l of (r.ladder || [])) if ((({ UC: ['UC'], Flow: ['FlowAI'], Deep: ['DeepAnalysis'], Intel: ['IntelAnalysis', 'IntelAnalysisLegacy'] } as Record<string, string[]>)[surface] || []).includes(l.p)) a.mainClean.push(l.ms || 0); }
        const MAIN: Record<string, string[]> = { UC: ['UC'], Flow: ['FlowAI'], Deep: ['DeepAnalysis'], Intel: ['IntelAnalysis', 'IntelAnalysisLegacy', 'IntelAI'] };
        const mains = r.ladder.filter((l: any) => (MAIN[surface] || []).includes(l.p));
        for (const fin of mains) {
            a.ladderMs.push(fin.ms || 0);
            a.provider[fin.v] = (a.provider[fin.v] || 0) + 1;
            a.callsMain = (a.callsMain || 0) + 1;
            if (/^a55s?:ok/.test(fin.tr || '')) a.firstTry++;
            if (/^a55s?:(network|breaker)/.test(fin.tr || '')) a.netArtifact = (a.netArtifact || 0) + 1;   // 로컬 하네스 → 서버 raw 통과 구간의 네트워크 오류(운영에는 없는 경로)
        }
        a.costs.push(r.ladder.reduce((s: number, l: any) => s + (l.c || 0), 0));
        if (r.body?.calls) a.calls.push(r.body.calls);
        for (const w of r.warns || []) { const m = /근거 불일치 문장 (\d+)개|제거: |문장 (\d+)개 제거/.exec(w); if (m) a.aiqCut += Number(m[1] || m[2] || 1); if (/기준 시각 없는 칸 (\d+)/.test(w)) a.aiqAsOfMiss += Number(/기준 시각 없는 칸 (\d+)/.exec(w)![1]); }
        if (!good) continue;
        const ground = [...(r.entry || []), ...(r.requests || [])].map((q: any) => q.user).join('\n');   // 근거 입력 = 데이터(user). system 의 예시·문턱 숫자는 근거가 아니다
        const slots = slotsOfRun(surface, r.locale, r.body);
        for (const loc of ['ko', 'en', 'ja'] as const) {
            const m = measureOutput(slots, loc, ground, surface === 'Flow' || surface === 'Deep' ? ['offex', 'implied', 'holders13f', 'ranking', 'earnings'] : ['offex', 'implied', 'holders13f', 'ranking']);
            if (!m) continue;
            a.outs++; a.numbers += m.numbers; a.grounded += m.grounded; a.ungrounded += m.ungrounded;
            a.fact += m.factSentences; a.dated += m.datedFacts; if (m.anyAsOf) a.anyAsOf++;
            a.topicNum += m.topicWithNumber; a.topicAsOf += m.topicWithAsOf;
            a.filler += m.filler; a.newDom.push(m.newDomains.length); a.dom.push(m.domains.length); a.chars.push(m.chars);
            for (const d of m.domains) a.domCount[d] = (a.domCount[d] || 0) + 1;
        }
    }
    summary[surface] = agg;
    const row = (label: string, f: (a: Agg) => string) => `| ${label} | ${f(agg.off)} | ${f(agg.on)} |`;
    console.log(`\n### ${surface}  (실행 ${agg.off.n} → ${agg.on.n}, 출력(언어) ${agg.off.outs} → ${agg.on.outs})`);
    console.log('| 지표 | 전(OFF) | 후(ON) |\n|---|---|---|');
    console.log(row('성공(200·오류 없음)', (a) => `${a.ok}/${a.n}`));
    console.log(row('① 첫 시도 통과(크레딧 5.5 가 첫 호출에 답함)', (a) => pct(a.firstTry, a.callsMain || 0)));
    console.log(row('① 첫 시도 통과 — 하네스 네트워크 오류 제외', (a) => pct(a.firstTry, (a.callsMain || 0) - (a.netArtifact || 0))));
    console.log(row('응답 단', (a) => Object.entries(a.provider).map(([k, v]) => `${k}:${v}`).join(' ') || '—'));
    console.log(row('걸린 시간 p50 / p95 (라우트 전체, 초)', (a) => `${pc((pctl(a.walls, 0.5) ?? 0) / 1000)} / ${pc((pctl(a.walls, 0.95) ?? 0) / 1000)}`));
    console.log(row('주 AI 호출 시간 p50 / p95 (초)', (a) => `${pc((pctl(a.ladderMs, 0.5) ?? 0) / 1000)} / ${pc((pctl(a.ladderMs, 0.95) ?? 0) / 1000)}`));
    console.log(row('  └ 하네스 네트워크 오류 실행 제외: 라우트 p50 / p95, 주 AI 호출 p50 / p95 (초)', (a) => `${pc((pctl(a.wallsClean, 0.5) ?? 0) / 1000)} / ${pc((pctl(a.wallsClean, 0.95) ?? 0) / 1000)}, ${pc((pctl(a.mainClean, 0.5) ?? 0) / 1000)} / ${pc((pctl(a.mainClean, 0.95) ?? 0) / 1000)}`));
    console.log(row('호출당 비용 평균 (USD)', (a) => (mean(a.costs) ?? 0).toFixed(5)));
    console.log(row('출력당 숫자 개수', (a) => pc(a.outs ? a.numbers / a.outs : null)));
    console.log(row('출력당 근거 일치 숫자', (a) => pc(a.outs ? a.grounded / a.outs : null)));
    console.log(row('원천 일치율 (일치 / 숫자)', (a) => pct(a.grounded, a.numbers)));
    console.log(row('입력에 없는 숫자(지어낸 숫자)', (a) => `${a.ungrounded}건 (출력당 ${pc(a.outs ? a.ungrounded / a.outs : null, 2)})`));
    console.log(row('숫자 문장 중 기준 시각 동반', (a) => `${pct(a.dated, a.fact)} (${a.dated}/${a.fact})`));
    console.log(row('기준 시각이 하나라도 있는 출력', (a) => pct(a.anyAsOf, a.outs)));
    console.log(row('새 사실 문장(숫자 있음) 중 기준 시각 동반', (a) => `${pct(a.topicAsOf, a.topicNum)} (${a.topicAsOf}/${a.topicNum})`));
    console.log(row('출력당 근거 영역 수 / 그중 새 자원', (a) => `${pc(mean(a.dom))} / ${pc(mean(a.newDom))}`));
    console.log(row('«데이터가 제공되지 않아…» 군말 문장', (a) => `${a.filler}건`));
    console.log(row('출력당 글자 수', (a) => pc(mean(a.chars), 0)));
    console.log(row('가드가 뺀 문장(경고 집계)', (a) => String(a.aiqCut)));
    console.log(row('교정 재생성 평균 호출 수(calls)', (a) => pc(mean(a.calls), 2)));
    console.log(`영역별 출력 수 — 전: ${JSON.stringify(agg.off.domCount)}  후: ${JSON.stringify(agg.on.domCount)}`);
}
if (outJson) fs.writeFileSync(path.join(OUTDIR, outJson), JSON.stringify(summary));
