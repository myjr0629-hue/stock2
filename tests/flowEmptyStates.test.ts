/**
 * 앱 Flow 화면 «끝나는 상태» 시험 — src/lib/app/flowEmptyStates.ts
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/flowEmptyStates.test.ts
 *
 * 2026-10-04 실측이 출발점이다: GLD «옵션 플로우» 화면을 찍는 도구가 39분을 기다렸고(스켈레톤),
 *   지금 운영 화면은 ETF 9개 중 4개(GLD·IWM·XLF·ARKK)가 GEX 레짐 칸 «GAMMA FLIP —», 6개(GLD·SLV·TLT·XLF·SMH·ARKK)가 «IV RANK —».
 *   원인: ① 첫 응답에 시간 상한 없음 ② 감마 전환 없음(ALL_LONG)을 위 칸만 «범위 밖», 아래 칸은 맨 «—»
 *   ③ IV 이력 수집 목록(GEX_TICKERS 100) 밖 → iv-percentile 이 «dynamodb-insufficient»(이력 0건).
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
    notProvidedText, ivHistoryUnavailable, gammaPlaceholder, fetchWithTtfbLimit, FLOW_TICKER_TTFB_MS,
} from '../src/lib/app/flowEmptyStates';
import { levelCellState, levelOutOfRangeText } from '../src/lib/optionLevelGate';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };

(async () => {
    await t('미제공 글자 ko·en·ja (모르는 로케일은 en)', () => {
        assert.equal(notProvidedText('ko'), '미제공');
        assert.equal(notProvidedText('ja'), '未提供');
        assert.equal(notProvidedText('en'), 'N/A');
        assert.equal(notProvidedText('zh'), 'N/A');
        assert.equal(notProvidedText(null), 'N/A');
    });

    await t('IV 이력 없음 = 운영 GLD 응답(10/4 실측) — 참', () => {
        assert.equal(ivHistoryUnavailable({ ticker: 'GLD', percentile: null, currentIv: null, sampleSize: 0, _source: 'dynamodb-insufficient' }), true);
        assert.equal(ivHistoryUnavailable({ ticker: 'X', percentile: null, sampleSize: 3, _source: 'dynamodb-insufficient-iv' }), true);
    });

    await t('IV 값이 있거나(0% 포함)·실패·오류·응답 없음 — 거짓(«미제공»이 아니다)', () => {
        assert.equal(ivHistoryUnavailable({ ticker: 'SPY', percentile: 0, sampleSize: 80, _source: 'dynamodb-true-percentile' }), false);
        assert.equal(ivHistoryUnavailable({ ticker: 'AAPL', percentile: 13, _source: 'dynamodb-true-percentile' }), false);
        assert.equal(ivHistoryUnavailable({ error: 'DynamoDB timeout (5s)', percentile: null }), false);
        assert.equal(ivHistoryUnavailable({ percentile: null, _source: 'error' }), false);
        assert.equal(ivHistoryUnavailable(null), false);
        assert.equal(ivHistoryUnavailable(undefined), false);
        assert.equal(ivHistoryUnavailable('dynamodb-insufficient'), false);
    });

    await t('감마 «범위 밖» 글자 = 위 칸(LevelValue·optionLevelGate)과 같은 글자', () => {
        for (const loc of ['ko', 'en', 'ja', 'xx']) {
            assert.equal(gammaPlaceholder('outOfRange', loc, '—'), levelOutOfRangeText(loc));
        }
    });

    await t('GLD 모양(구조 판본 있음·플립 null) → 범위 밖 / 판본 없음 → 화면의 빈칸 글자 그대로', () => {
        const gldMeta = { levelsSource: 'structure', levelsChainDate: '2026-10-02', levelsExpiration: '2026-10-09' } as any;
        const st = levelCellState(null, gldMeta, 'gammaFlipLevel');
        assert.equal(st, 'outOfRange');
        assert.equal(gammaPlaceholder(st, 'ja', '—'), '範囲外');
        assert.equal(gammaPlaceholder(st, 'ko', '--'), '범위 밖');
        const none = levelCellState(null, null, 'gammaFlipLevel');
        assert.equal(none, 'none');
        assert.equal(gammaPlaceholder(none, 'ja', '—'), '—');
        assert.equal(gammaPlaceholder(none, 'en', '--'), '--');
        // 값이 있으면 이 함수는 부르지 않지만, 불러도 빈칸 글자(값 글자는 부르는 쪽이 만든다)
        assert.equal(levelCellState(337.5, gldMeta, 'gammaFlipLevel'), 'value');
    });

    await t('상한은 계산 경로 실측(1~6초)보다 넉넉하고 30초 주기보다 짧다', () => {
        assert.ok(FLOW_TICKER_TTFB_MS >= 10_000 && FLOW_TICKER_TTFB_MS < 30_000);
    });

    // ── 실제 HTTP 서버로: «헤더가 안 오는» 응답은 끊고, «받는 중»인 큰 본문은 끊지 않는다 ──
    const server = http.createServer((req, res) => {
        if (req.url === '/slow-headers') { setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"late":true}'); }, 1500); return; }
        if (req.url === '/slow-body') {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.write('{"chunks":[');
            let i = 0;
            const tick = setInterval(() => { res.write(`${i ? ',' : ''}${i}`); if (++i === 8) { clearInterval(tick); res.end(']}'); } }, 120);   // 본문 약 1초
            return;
        }
        res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
        await t('헤더가 상한 안에 안 오면 끊는다(AbortError) — 스켈레톤이 끝없이 돌지 않는다', async () => {
            const t0 = Date.now();
            await assert.rejects(fetchWithTtfbLimit(`${base}/slow-headers`, 300), (e: any) => e?.name === 'AbortError');
            const ms = Date.now() - t0;
            assert.ok(ms < 1200, `끊긴 시각 ${ms}ms — 상한 300ms 근처여야`);
        });
        await t('헤더가 오면 타이머를 푼다 — 상한보다 오래 걸리는 본문(느린 망·큰 응답)도 끝까지 받는다', async () => {
            const t0 = Date.now();
            const res = await fetchWithTtfbLimit(`${base}/slow-body`, 300);
            const body = await res.json();
            assert.deepEqual(body, { chunks: [0, 1, 2, 3, 4, 5, 6, 7] });
            assert.ok(Date.now() - t0 > 300, '본문이 상한보다 오래 걸린 경우를 시험해야 한다');
        });
        await t('빠른 응답은 그대로', async () => {
            const res = await fetchWithTtfbLimit(`${base}/fast`, 300, { cache: 'no-store' });
            assert.deepEqual(await res.json(), { ok: true });
        });
    } finally {
        server.close();
    }

    console.log(`\nflowEmptyStates: ${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
