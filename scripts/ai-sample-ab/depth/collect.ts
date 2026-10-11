/**
 * 표본 모으기 — 금요일(10/9 미국장) 실데이터로 «운영이 모델에 보낸 요청»을 용도별로 10건 안팎.
 *   사용: collect.ts <ENVFILE> <OUTDIR>
 *   · Guardian · FlowAI · DeepAnalysis · UC : 운영 캡처(Redis llm:cap:*, 읽기 전용)를 dump-captured 로 받아 둔 cap-*.json
 *   · CrossSector · MorningBriefing        : 라우트를 그대로 실행하고 모델 호출 직전에 가로챈다(금요일 시계; 쓰기는 하네스가 막는다)
 * 입력을 지어내지 않는다. UC 는 캡처가 종목 페이지(이야기 5건 + MONEY 블록)라서 ko/en/ja 로 다시 조립하고(코드의 localize 함수 그대로),
 * 피드형(12종목 1건씩)은 같은 MONEY 블록으로 storyPayload 와 같은 모양을 만든다.
 */
import path from 'node:path';
import { bootHarness, setClock, state, resetCaptured, runRoute, allowPostHosts } from '../core';
import { OUT, readJson, writeJson, type Sample } from './lib';

const [envFile, outArg] = process.argv.slice(2);
const OUTD = outArg || OUT;
bootHarness({ envFile });
const BASE = 'https://www.signumhq.com';
const FRI_CLOSE = '2026-10-09T21:30:00Z';
const FRI_PRE = '2026-10-09T12:30:00Z';

const tickerOf = (u: string) => (u.match(/ticker="([A-Z.\-]+)"/) || [])[1] || '?';

// 가디언: 입력의 한국어 섹터명을 영어로(운영 입력과 같게 — unifiedDataStream 이 이미 이렇게 보낸다)
async function guardianSamples(): Promise<Sample[]> {
    const { SECTOR_NAME_EN } = await import('@/lib/ai/sectorLabels');
    const KO = Object.keys(SECTOR_NAME_EN).sort((a, b) => b.length - a.length);
    const DATA_LINE = /(->|\([+-]\d|IFS)/;
    const en = (u: string) => u.split('\n').map((ln) => { if (!DATA_LINE.test(ln)) return ln; let o = ln; for (const n of KO) o = o.split(n).join(SECTOR_NAME_EN[n]); return o; }).join('\n');
    const caps = readJson<any[]>(path.join(OUTD, 'samples', 'cap-Guardian.json'));
    return caps.slice(0, 10).map((c, i) => {
        const kind = /gamma|GAMMA SHIELD ANALYSIS|감마 쉴드|\[평소와 다른 점\]/.test(c.userPrompt) ? 'gamma' : /RLSI|진단|reality|Reality/i.test(c.userPrompt.slice(0, 2500)) ? 'reality' : 'rotation';
        return { id: `Guardian#${i + 1}`, purpose: 'Guardian', system: c.system, userPrompt: en(c.userPrompt), maxTokens: c.maxTokens, locale: 'multi' as const, expectJson: true, meta: { capturedAt: c.meta?.capturedAt, kind } };
    });
}

function distinctByTicker(caps: any[], need: number, requireTokens = true): any[] {
    const seen = new Set<string>(); const out: any[] = [];
    for (const c of caps) {
        const t = tickerOf(c.userPrompt);
        if (seen.has(t)) continue;
        if (requireTokens && !c.userPrompt.includes('<number_tokens>')) continue;
        seen.add(t); out.push(c);
        if (out.length >= need) break;
    }
    return out;
}

// UC ── 종목 페이지(캡처) → ko/en/ja 로 다시 조립, 피드형 조립
async function ucSamples(): Promise<Sample[]> {
    const shared = await import('@/app/api/undercurrent/shared');
    const { weekdayName } = await import('@/lib/marketSession');
    const caps = readJson<any[]>(path.join(OUTD, 'samples', 'cap-UC.json'));
    const seen = new Set<string>(); const pages: any[] = [];
    for (const c of caps) {
        const m = c.userPrompt.match(/MONEY \(current, for ([A-Z.]+)\): (\{.*?\})\n\nSTORIES:\n([\s\S]*)$/);
        if (!m || seen.has(m[1])) continue;
        seen.add(m[1]);
        try { pages.push({ cap: c, ticker: m[1], money: JSON.parse(m[2]), stories: JSON.parse(m[3]), head: c.userPrompt.slice(0, c.userPrompt.indexOf('MONEY (current')) }); } catch { /* skip */ }
    }
    const sysPrefixOf = (s: string) => s.slice(0, s.indexOf('You write for "Undercurrent"'));
    const prefix = sysPrefixOf(pages[0].cap.system);
    const localize = (money: any, loc: 'ko' | 'en' | 'ja') => {
        const vp = typeof money.volumePutCallRatio === 'number' ? money.volumePutCallRatio : null;
        return { ...money, positionLeanText: shared.leanText(loc, shared.leanOf(money.oiPcr)), flowLeanText: shared.leanText(loc, shared.leanOf(vp)), newOiNotionalText: shared.fmtNotional(money.newOiNotional, loc) };
    };
    const out: Sample[] = [];
    // (1) 종목 페이지형 — 10 종목 × 3 언어
    const chosen = pages.filter((p) => p.stories.length >= 3).slice(0, 10);
    for (const p of chosen) {
        for (const loc of ['ko', 'en', 'ja'] as const) {
            const money = localize(p.money, loc);
            const stories = p.stories.map((s: any) => ({ ...s, money: { ...s.money, ...(() => { const lm = localize({ ...p.money, ...s.money, oiPcr: s.money.oiPcr ?? p.money.oiPcr, volumePutCallRatio: s.money.volumePutCallRatio ?? p.money.volumePutCallRatio }, loc); return { positionLeanText: lm.positionLeanText, flowLeanText: lm.flowLeanText, newOiNotionalText: lm.newOiNotionalText }; })() } }));
            const user = `${p.head}MONEY (current, for ${p.ticker}): ${JSON.stringify(money)}\n\nSTORIES:\n${JSON.stringify(stories)}`;
            out.push({ id: `UC-ticker:${p.ticker}:${loc}`, purpose: 'UC', system: prefix + shared.buildSystem(loc), userPrompt: user, maxTokens: 4096, locale: loc, expectJson: true, meta: { kind: 'ticker', ticker: p.ticker, nStories: stories.length, moneys: [money] } });
        }
    }
    // (2) 피드형 — 서로 다른 12종목의 첫 이야기 1건씩, storyPayload 와 같은 모양 · 2피드 × 3언어
    const FEED_HEAD = `Return {"cards":[...]} — one card per story IN ORDER:\n{\n "plainTitle": "<short accessible rewrite of the headline>",\n "whyItMatters": "<one plain sentence why an ordinary person should care>",\n "moneyRead": "<one plain sentence on what the money signals show>",\n "moneyMood": "bullish|cautious|neutral",\n "divergence": true|false,\n "tag": "<1-2 word theme>"\n}\n\nSTORIES:\n`;
    for (let f = 0; f < 2; f++) {
        const group = pages.slice(f * 12, f * 12 + 12);
        if (group.length < 8) continue;
        for (const loc of ['ko', 'en', 'ja'] as const) {
            const stories = group.map((p, i) => {
                const lm = localize(p.money, loc); const s0 = p.stories[0];
                return {
                    n: i + 1, ticker: p.ticker, headline: s0.headline, summary: String(s0.summary || '').slice(0, 220), newsSentiment: s0.newsSentiment || 'unknown',
                    money: {
                        newOiContracts: p.money.newOiContracts ?? null, newOiNotional: p.money.newOiNotional ?? null, newOiNotionalText: lm.newOiNotionalText, newOiSide: p.money.newOiSide ?? null,
                        oiPcr: p.money.oiPcr ?? null, volumePutCallRatio: p.money.volumePutCallRatio ?? null, positionLeanText: lm.positionLeanText, flowLeanText: lm.flowLeanText,
                        squeezeScore: p.money.squeezeScore ?? null, price: p.money.price ?? null, maxPain: p.money.maxPain ?? null, callWall: p.money.callWall ?? null, putFloor: p.money.putFloor ?? null,
                        session: p.money.optionsDate ? `${weekdayName(p.money.optionsDate, 'en')} ${p.money.optionsDate}` : null,
                    },
                    _raw: p.money,
                };
            });
            const payload = JSON.stringify(stories.map(({ _raw, ...rest }) => rest));
            out.push({ id: `UC-feed${f + 1}:${loc}`, purpose: 'UC', system: prefix + shared.buildSystem(loc), userPrompt: FEED_HEAD + payload, maxTokens: 4096, locale: loc, expectJson: true, meta: { kind: 'feed', feed: f + 1, nStories: stories.length, rawMoney: stories.map((s: any) => s._raw), tickers: stories.map((s: any) => s.ticker) } });
        }
    }
    return out;
}

async function routeSample(purpose: 'CrossSector' | 'MorningBriefing'): Promise<Sample[]> {
    resetCaptured();
    if (purpose === 'CrossSector') {
        setClock(FRI_CLOSE);
        const { POST } = await import('@/app/api/intel/cross-sector-brief/route');
        await runRoute(POST, `${BASE}/api/intel/cross-sector-brief`, { method: 'POST' });
    } else {
        setClock(FRI_PRE);
        const { POST } = await import('@/app/api/guardian/briefing/generate/route');
        await runRoute(POST, `${BASE}/api/guardian/briefing/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
    }
    setClock(null);
    const c = state.captured[0];
    state.blocked = [];
    if (!c) return [];
    return [{ id: `${purpose}#1`, purpose, system: c.system, userPrompt: c.userPrompt, maxTokens: c.maxTokens, locale: 'multi', expectJson: c.expectJson ?? true, meta: { clock: purpose === 'CrossSector' ? FRI_CLOSE : FRI_PRE } }];
}

(async () => {
    allowPostHosts.push(/(^|\.)signumhq\.com$/);
    const dir = path.join(OUTD, 'samples');
    const put = (p: string, a: Sample[]) => { writeJson(path.join(dir, `${p}.json`), a); console.error(`${p}: ${a.length} samples`); };
    put('Guardian', await guardianSamples());
    put('FlowAI', distinctByTicker(readJson<any[]>(path.join(dir, 'cap-FlowAI.json')), 10).map((c, i) => ({ id: `FlowAI:${tickerOf(c.userPrompt)}`, purpose: 'FlowAI', system: c.system, userPrompt: c.userPrompt, maxTokens: c.maxTokens, locale: 'multi' as const, expectJson: true, meta: { ticker: tickerOf(c.userPrompt), capturedAt: c.meta?.capturedAt, idx: i } })));
    put('DeepAnalysis', distinctByTicker(readJson<any[]>(path.join(dir, 'cap-DeepAnalysis.json')), 10).map((c, i) => ({ id: `Deep:${tickerOf(c.userPrompt)}`, purpose: 'DeepAnalysis', system: c.system, userPrompt: c.userPrompt, maxTokens: c.maxTokens, locale: 'multi' as const, expectJson: true, meta: { ticker: tickerOf(c.userPrompt), capturedAt: c.meta?.capturedAt, idx: i } })));
    put('UC', await ucSamples());
    put('CrossSector', await routeSample('CrossSector'));
    put('MorningBriefing', await routeSample('MorningBriefing'));
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
