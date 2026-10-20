/** Offline replay of the user's public prototype cache; accepts a directory argument, never fetches. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { collectCompanies } from '../src/lib/guruLens/sources';
import { makeSnapshot, publishSnapshot, readSnapshot } from '../src/lib/guruLens/pipeline';
import { publicationHolds } from '../src/lib/guruLens/guards';
import { LENS_IDS } from '../src/lib/guruLens/types';
import { evaluateLenses } from '../src/lib/guruLens/rules';
import { memoryPublication } from './helpers/guruPublication';
const directory = process.argv[2];
if (!directory) throw new Error('prototype directory required');
const cacheDirectory = path.join(directory, 'cache');
const read = async (name: string) => JSON.parse(await fs.readFile(path.join(cacheDirectory, name), 'utf8'));
const originalTimer = globalThis.setTimeout;
async function main() {
    const splits = await read('splits.json');
    const fetcher: typeof fetch = async (input) => {
        const url = new URL(String(input));
        if (url.hostname === 'www.sec.gov') return Response.json(await read('company_tickers.json'));
        if (url.hostname === 'data.sec.gov') {
            const [tax, concept, _unit, period] = url.pathname.split('/').slice(-4);
            try {
                return Response.json(await read(`frames/${tax}__${concept}__${period}`));
            } catch {
                return new Response(null, { status: 404 });
            }
        }
        assert.equal(url.hostname, 'query1.finance.yahoo.com', 'only prototype public routes');
        const ticker = decodeURIComponent(url.pathname.split('/').at(-1)!);
        try {
            const p = await read(`px/${ticker}.json`);
            const events = Object.fromEntries(
                (splits[ticker] ?? []).map(([date, ratio]: [string, number], i: number) => [
                    i,
                    { date: Date.parse(date) / 1000, numerator: ratio, denominator: 1 },
                ]),
            );
            return Response.json({
                chart: {
                    result: [
                        {
                            meta: p.meta,
                            timestamp: p.ts,
                            indicators: { quote: [{ close: p.c, high: p.h }] },
                            events: { splits: events },
                        },
                    ],
                },
            });
        } catch {
            return new Response(null, { status: 404 });
        }
    };
    const store = new Map<string, unknown>();
    let localWrites = 0;
    // Skip SEC pacing only for this offline file adapter. Production pacing remains unchanged.
    globalThis.setTimeout = ((fn: any, ms: number, ...args: any[]) =>
        originalTimer(fn, ms === 140 ? 0 : ms, ...args)) as typeof setTimeout;
    try {
        const result = await collectCompanies(
            {
                read: async <T>(k: string) => (store.get(k) as T) ?? null,
                write: async <T>(k: string, v: T) => {
                    localWrites++;
                    store.set(k, v);
                    return true;
                },
            },
            new Date('2026-10-19T12:00:00Z'),
            fetcher,
        );
        assert.equal(result.companies.length, 495);
        assert.equal(result.calls.paid, 0);
        assert.equal(result.calls.sec, 248);
        assert.equal(result.calls.prices, 496);
        const snap = makeSnapshot(result.companies, result.calls, new Date('2026-10-19T12:00:00Z'));
        LENS_IDS.forEach((id) => assert.equal(snap.lenses[id].rows.length, 495));
        const holds = publicationHolds(result.companies, snap, null);
        assert.equal(holds.length, 111, '10/19 anomaly records remain visible');
        assert.equal(new Set(holds.map((h) => h.ticker)).size, 35);
        const db = memoryPublication();
        const publication = await publishSnapshot(db, snap, result.companies, null, null);
        assert.equal(publication.published, true, '35 suspect tickers must no longer block the entire publication');
        assert.equal(publication.universeCount, 495);
        assert.equal(publication.includedCount, 460);
        assert.equal(publication.excluded.length, 35);
        assert.deepEqual(publication.holds, []);
        const excluded = new Set(publication.excluded.map((e) => e.ticker));
        const saved = (await readSnapshot(db))!;
        assert.ok(saved, 'partial generation must be readable after publication');
        assert.deepEqual(saved.lenses, evaluateLenses(result.companies.filter((c) => !excluded.has(c.ticker))));
        for (const id of LENS_IDS) {
            assert.equal(saved.lenses[id].rows.length, 460);
            assert.ok(saved.lenses[id].rows.every((r) => !excluded.has(r.ticker)));
        }
        if (process.argv[3]) {
            const output = path.resolve(process.argv[3]);
            await fs.mkdir(output, { recursive: true });
            const codes = [...new Set(holds.map((h) => h.code))].map((code) => ({
                code, count: holds.filter((h) => h.code === code).length,
                tickers: [...new Set(holds.filter((h) => h.code === code).map((h) => h.ticker!))].sort(),
            })).sort((a, b) => b.count - a.count);
            const escape = (s: string) => s.replaceAll('|', '\\|').replaceAll('\n', ' ');
            const corrections = publication.excluded.filter((e) => e.reasons.some((r) =>
                ['unit', 'net_income_digits', 'per_mismatch'].includes(r.code)));
            const sourceIssues = ['historical_split_basis_review', 'net_income_digits', 'share_unit'].map((issue) => {
                const records = holds.filter((h) => h.code === 'source_integrity' && h.detail.split(':')[0] === issue);
                return { issue, count: records.length, tickers: [...new Set(records.map((h) => h.ticker!))].sort() };
            });
            const report = [
                '# 대가 렌즈 10/19 원자료 부분 발행 재생', '',
                '실측: 로컬 공개 원자료 → 실제 수집·검사·집계·메모리 발행·재조회. 운영 발행 결과가 아니다.',
                '495종목 중 이상 111건/35종목 제외(7.07%), 460종목 발행·재조회 성공. 실제 네트워크/운영 쓰기 0회.', '',
                '## 제외 사유 상위 (한 종목·한 연도에 중복 검사 가능)', '',
                '| 검사 코드 | 검사 건수 | 해당 종목 수 | 티커 |', '|---|---:|---:|---|',
                ...codes.map((c) => `| ${c.code} | ${c.count} | ${c.tickers.length} | ${c.tickers.join(', ')} |`), '',
                'source_integrity 세부 (net_income_digits·unit 코드와 같은 원자료를 중복 검사하므로 합산 금지):', '',
                '| 원인 후보 | 검사 건수 | 종목 수 | 티커 |', '|---|---:|---:|---|',
                ...sourceIssues.map((s) => `| ${s.issue} | ${s.count} | ${s.tickers.length} | ${s.tickers.join(', ')} |`), '',
                '## 제외 종목과 전체 사유', '',
                '| 티커 | 사유 (관측값) |', '|---|---|',
                ...publication.excluded.map((e) => `| ${e.ticker} | ${e.reasons.map((r) => escape(`${r.code}: ${r.detail}`)).join('<br>')} |`), '',
                '## 원천 정정·정합화 확인 대상 (확정 오류와 구분)', '',
                '아래는 검사 이상을 관측한 후보이며 공급사 오기재 확정이 아니다. SEC 원공시의 단위·부호·태그·기간과 Yahoo 분할/분사 이력을 대조해야 한다. 이 작업에서 원자료를 수정하지 않았다.',
                '- historical_split_basis_review: 연도 간 EPS·주식수 분할 기준 정합화 필요. 분할 미반영 확정은 추가 대조 필요.',
                '- net_income_digits / share_unit / unit: NI·EPS·희석주식수의 단위·자릿수·부호·태그 원공시 대조 후 파서 또는 원천 정정.',
                '- per_mismatch: 현재 주식수와 연간 이익/EPS의 분할 기준·종류주/자사주 차이 확인.',
                '- spinoff: 비정수 기업행위 의미와 분할 계수 적용 여부 확인. 원천 오류로 단정하지 않음.', '',
                '| 원천 대조 우선 티커 | 관측된 불일치 |', '|---|---|',
                ...corrections.map((e) => `| ${e.ticker} | ${e.reasons.filter((r) => ['unit', 'net_income_digits', 'per_mismatch'].includes(r.code)).map((r) => escape(`${r.code}: ${r.detail}`)).join('<br>')} |`), '',
                '## 제외 후 렌즈별 집계', '',
                '집계 표시는 기존 API determinedCount/495 의미를 유지한다. includedCount=460은 검사 제외 후 재평가한 종목 수이며, 렌즈별 원입력 완전성을 뜻하지 않는다.', '',
                '| 렌즈 | 통과 | 판정 가능한 종목 | 포함/전체 |', '|---|---:|---:|---|',
                ...LENS_IDS.map((id) => `| ${id} | ${saved.lenses[id].passCount} | ${saved.lenses[id].rows.filter((r) => r.passed || r.inputsComplete === true).length} | 460/495 |`), '',
            ].join('\n');
            await fs.writeFile(path.join(output, 'guru-lens-exclusions-2026-10-19.md'), report);
            await fs.writeFile(path.join(output, 'guru-lens-replay-2026-10-19.json'), JSON.stringify({
                universeCount: 495, includedCount: 460, excluded: publication.excluded,
                diagnostics: holds, passCounts: publication.passCounts,
                simulatedCalls: result.calls, realNetworkCalls: 0, productionWrites: 0,
            }, null, 2) + '\n');
        }
        console.log(
            JSON.stringify({
                replay: 'public prototype cache',
                universe: result.companies.length,
                simulatedCalls: result.calls,
                realNetworkCalls: 0,
                productionWrites: 0,
                localMemoryWrites: localWrites,
                anomalyRecords: holds.length,
                published: publication.published,
                excludedCount: publication.excluded.length,
                includedCount: publication.includedCount,
                holdCodes: holds.reduce<Record<string, number>>((out, h) => {
                    out[h.code] = (out[h.code] ?? 0) + 1;
                    return out;
                }, {}),
                passCounts: publication.passCounts,
            }),
        );
    } finally {
        globalThis.setTimeout = originalTimer;
    }
}
main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
