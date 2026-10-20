/** Offline replay of the user's public prototype cache; accepts a directory argument, never fetches. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { collectCompanies } from '../src/lib/guruLens/sources';
import { makeSnapshot } from '../src/lib/guruLens/pipeline';
import { publicationHolds } from '../src/lib/guruLens/guards';
import { LENS_IDS } from '../src/lib/guruLens/types';
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
        assert.ok(holds.length > 0, 'prototype raw anomalies must block publication');
        console.log(
            JSON.stringify({
                replay: 'public prototype cache',
                universe: result.companies.length,
                simulatedCalls: result.calls,
                realNetworkCalls: 0,
                productionWrites: 0,
                localMemoryWrites: localWrites,
                held: holds.length,
                holdCodes: holds.reduce<Record<string, number>>((out, h) => {
                    out[h.code] = (out[h.code] ?? 0) + 1;
                    return out;
                }, {}),
                passCounts: Object.fromEntries(LENS_IDS.map((id) => [id, snap.lenses[id].passCount])),
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
