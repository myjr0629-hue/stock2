/** 순수 구성·검사·실제 프록시 디코더만 시험. 네트워크·모델·캐시 호출 없음. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildTacticalPrompt, cachedEvidence, datedHeadline, checkTacticalOutput } from '../src/lib/ai/tacticalPrompt';
import { textIntegrityReasons } from '../src/lib/ai/textIntegrity';
import { cleanInsight, gateInsight } from '../src/lib/ai/outputGate';
import { buildLineFacts, buildLineUserPrompt, checkLineOutput, WL_LINE_SYSTEM } from '../src/lib/ai/watchlistLine';
import { checkDepthLine } from '../src/lib/ai/watchlistDepth';

const now = new Date('2026-10-20T15:00:00Z');
const headline = datedHeadline({ title: 'Treasury auction draws weak demand', published_utc: '2026-10-20T14:00:00Z' }, 'Polygon', now)!;
const facts = {
    rlsiScore: 34, nasdaqChange: -0.3, vix: 18.4, us10y: 5.15, us10yChangeBp: 6,
    gexIndex: 7, triggerSupport: 640, triggerCurrent: 645, triggerResistance: 650,
    marketNewsHeadlines: [headline], asOf: now.toISOString(),
    scheduledEvents: ['[economic calendar; 2026-10-21 08:30 ET] Import prices (scheduled; not a released result)'],
};
let count = 0;
function test(name: string, fn: () => void) { fn(); count++; console.log(`ok - ${name}`); }

test('dated evidence: ET 오늘·발행시각·출처·FMP DST 변환, 누락/미래/손상 배제', () => {
    assert.match(headline, /Polygon; 2026-10-20T14:00:00.000Z/);
    assert.match(datedHeadline({ title: 'FMP news', publishedDate: '2026-10-20 10:00:00' }, 'FMP', now)!, /T14:00:00/);
    for (const published_utc of ['', 'bad', '2026-10-21T14:00:00Z', '2026-10-19T14:00:00Z']) assert.equal(datedHeadline({ title: 'x', published_utc }, 'Polygon', now), null);
    assert.equal(datedHeadline({ title: '깨진\uFFFD글', published_utc: now.toISOString() }, 'Polygon', now), null);
});

test('NEWS PULSE·경제·실적은 기존 캐시 모양에서만, 지난/오래된 일정 제외', () => {
    const e = cachedEvidence({ items: [{ headline: 'Stock news NVDA', publishedAt: now.toISOString() }] },
        { updatedAt: now.toISOString(), events: [{ date: '2026-10-21', time: '08:30', event: 'Import prices' }, { date: '2026-10-19', event: 'Past' }] },
        { generatedAt: now.toISOString(), rows: [{ date: '2026-10-20', hour: 'amc', ticker: 'ZZZ', dateStatus: 'est' }] }, now);
    assert.equal(e.news.length, 1);
    assert.ok(e.events.length >= 2);
    assert.ok(e.events.some(x => /ZZZ.*estimated schedule/.test(x)));
    assert.ok(!e.events.some(x => /Past/.test(x)));
    assert.ok(cachedEvidence(null, { updatedAt: now.toISOString(), events: [{ date: '2026-10-20', time: '08:30', event: 'Already released' }] }, null, now).events.length === 0);
    assert.equal(cachedEvidence(null, { updatedAt: '2026-10-19T00:00:00Z', events: [{ date: '2026-10-21', event: 'Stale' }] }, null, now).events.length, 0);
});

test('ko/en/ja: 뉴스→전이+고유자원→한 가지 확인, 공백 350자 계약', () => {
    for (const loc of ['ko', 'en', 'ja'] as const) {
        const p = buildTacticalPrompt(facts, loc);
        assert.match(p, /WHY[\s\S]*SO WHAT[\s\S]*NEXT/);
        assert.match(p, /at least one available proprietary resource/);
        assert.match(p, /exactly ONE supplied/);
        assert.match(p, /Maximum 350 characters/);
        assert.match(p, /auction draws weak demand/);
        assert.match(p, /2026-10-21 08:30 ET/);
    }
    const p = buildTacticalPrompt({ ...facts, divergenceCase: 'A' } as typeof facts, 'ko');
    assert.match(p, /Divergence.*never a replacement/);
});

test('3문장·뉴스 출처/시각·두 번째 문장 고유자원 출구 검사', () => {
    const p = buildTacticalPrompt(facts, 'ko');
    const good = 'Polygon 14:00 UTC 보도한 국채 입찰 수요 약화와 금리 압력이 연결돼 해석됩니다. 시장 참여 약화에 얇은 감마 방어가 겹쳐 충격 흡수력이 제한적입니다. 옵션 지지선 640 유지 여부가 다음 확인 기준입니다.';
    assert.deepEqual(checkTacticalOutput(good, 'ko', p), []);
    assert.ok(checkTacticalOutput(good.replace('Polygon 14:00 UTC ', ''), 'ko', p).includes('tactical:news-source-time-required'));
    assert.ok(checkTacticalOutput(good.replace('감마 방어', '수급'), 'ko', p).includes('tactical:positioning-required'));
    assert.ok(checkTacticalOutput(good.split('. ').slice(0, 2).join('. '), 'ko', p).includes('tactical:three-sentences'));
});

test('뉴스 없는 입력: 명시적 미확인, 옛 코어의 무시각 헤드라인 제외', () => {
    const p = buildTacticalPrompt({ ...facts, marketNewsHeadlines: ['Fed cuts rates'] }, 'ko');
    assert.match(p, /TODAY_NEWS: \[\]/);
    assert.match(p, /cause is unconfirmed/);
    assert.doesNotMatch(p.slice(p.indexOf('TODAY_NEWS:')), /Fed cuts/);
    assert.ok(checkTacticalOutput('연준의 금리 인하 발표가 오늘 시장을 움직였습니다.', 'ko', p).some(r => r.startsWith('event:unsupported:')));
    assert.ok(checkTacticalOutput('확인한 자료를 바탕으로 지금 매수하세요.', 'ko', p).includes('tactical:advice'));
    assert.ok(checkTacticalOutput('x'.repeat(351), 'en', p).includes('tactical:too-long'));
    assert.ok(checkTacticalOutput('Options support is 99999.', 'en', p).includes('tactical:number'));
    assert.ok(!checkTacticalOutput('Macro cause is unconfirmed. Dealer gamma buffers pressure. The next test going forward is options support.', 'en', p).some(r => r.startsWith('event:unsupported:')));
});

test('출력 검사: U+FFFD·제어문자·미완성 surrogate·다른 언어 거절, 정상 본문 보존', () => {
    const text = '국채 입찰 수요 약화와 금리 압력이 연결돼 해석되며 감마 방어는 약합니다.';
    assert.equal(textIntegrityReasons(text).length, 0);
    for (const bad of ['\uFFFD', '\u0000', '\u000B', '\uD800']) {
        assert.ok(textIntegrityReasons(text + bad).length);
        assert.equal(gateInsight(text + bad, 'ko', { now }).ok, false);
    }
    assert.ok(cleanInsight(text + '\uFFFD').includes('\uFFFD'));
    assert.ok(checkTacticalOutput(text + 'に', 'ko', buildTacticalPrompt(facts, 'ko')).includes('language:mixed-script'));
});

const row = { price: 145, maxPain: 155, callWall: 160, putFloor: 135, gammaFlipLevel: 140, levelsChainDate: '2026-10-20', levelsExpiration: '2026-10-23', levelsSource: 'structure', darkPoolPct: 40, darkPoolDate: '2026-10-20' };
const f = buildLineFacts('NVDA', row)!;
const chips = { ko: 'Put Floor $135 위 {PF} · Max Pain $155 아래 {MP}', en: '{PF} above Put Floor $135 · {MP} below Max Pain $155', ja: 'Put Floor $135の{PF}上 · Max Pain $155の{MP}下' };
const insight = { ko: '장외 비중은 방향 미확정, 감마 방어가 변수', en: 'Off-exchange share cannot confirm gamma support', ja: '場外比率だけでは方向不明、ガンマ防御の維持が焦点' };
test('기존 칩 유지 + 별도 3언어 인사이트, 자료 없을 때 null', () => {
    const c = checkLineOutput(JSON.stringify({ ...chips, insight }), f);
    assert.equal(c.ok, true, c.reasons.join(','));
    assert.deepEqual(c.insight, insight);
    assert.equal(checkLineOutput(JSON.stringify(chips), f).ok, true);
    assert.equal(checkLineOutput(JSON.stringify(chips), f, { requireInsight: true }).ok, false);
    assert.equal(checkLineOutput(JSON.stringify({ ...chips, insight: null }), { ...f, darkPool: null }).ok, true);
    assert.equal(checkLineOutput(JSON.stringify({ ...chips, insight }), { ...f, darkPool: null }).ok, false);
    assert.match(WL_LINE_SYSTEM, /Keep ko\/en\/ja options-map chips exactly/);
    assert.match(buildLineUserPrompt(f), /FINRA.*2026-10-20/);
});
test('카드: 인사이트의 첫 열은 기존 AI 너비 보존, 공유 버튼 고정 열과 분리', () => {
    const page = readFileSync('src/app/[locale]/app-view/watchlist/page.tsx', 'utf8');
    assert.match(page, /r\.aiInsight && <p className=\{p\.ai\}><span className=\{`\$\{p\.aiTag\} invisible`\} aria-hidden="true"/);
    const css = readFileSync('src/app/[locale]/app-view/watchlist/watchlist.module.css', 'utf8');
    assert.match(css, /\.aiShare \{ position: absolute; z-index: 2; left: -2px; top: 10px; \}/);
});

test('인사이트: 없는 사건·숫자·권유·제어문자·혼용·초과 길이 차단', () => {
    for (const bad of ['연준 금리 인하로 감마 방어가 강해졌습니다', '장외 비중 99%가 감마 방어를 지지합니다', '지금 매수하세요', insight.ko + '\uFFFD', insight.ko + 'に', '가'.repeat(29)]) {
        assert.ok(checkDepthLine(bad, 'ko', f.factsText).length, bad);
    }
    assert.equal(checkLineOutput(JSON.stringify({ ...chips, ko: chips.ko + '\u0000' }), f).ok, false);
});

async function main() {
    // 프록시 서버를 띄우거나 Redis에 연결하지 않고 실제 readBody 함수 본문을 로드한다.
    const proxy = readFileSync('scripts/ec2-redis-proxy.js', 'utf8');
    const decoderSource = proxy.slice(proxy.indexOf('async function readBody(req)'), proxy.indexOf('// ── HTTP Server'));
    const readBody = runInNewContext(`${decoderSource}; readBody`, { require, Buffer });
    const sample = JSON.stringify({ ko: '오늘 시장을 가르는 핵심 변수', ja: '市場の重要な変数', en: 'Macro → gamma 😀' });
    const bytes = Buffer.from(sample);
    for (let i = 1; i < bytes.length; i++) assert.equal(await readBody([bytes.subarray(0, i), bytes.subarray(i)]), sample);
    assert.equal(await readBody([...bytes].map(b => Buffer.from([b]))), sample);
    await assert.rejects(readBody([Buffer.from([0xea, 0xb0])]));
    await assert.rejects(readBody([Buffer.from([0xff])]));
    const split = Buffer.from('핵심');
    assert.ok((split.subarray(0, 1).toString('utf8') + split.subarray(1).toString('utf8')).includes('\uFFFD'));
    count++; console.log(`ok - 멀티바이트 모든 ${bytes.length - 1}개 경계·1바이트 청크·손상/잘린 UTF-8 거절`);
    if (process.argv.includes('--examples')) {
        mkdirSync('out/ai-depth-macro', { recursive: true });
        writeFileSync('out/ai-depth-macro/prompt-examples.md', `# 구성 예시 — 합성 고정 자료, 실제 모델 호출 없음\n\n## 전: 가디언 (기존 지시 발췌)\n\n첫 문장: 오늘 시장을 움직인 핵심 뉴스 이벤트와 시장 반응의 인과관계를 명확히 서술. 괴리 모드에서는 괴리 진단으로 시작하며 RLSI, Breadth, 거래량 수치를 반드시 포함.\n\n## 후: 가디언 실제 구성 프롬프트 (ko)\n\n\`\`\`text\n${buildTacticalPrompt(facts, 'ko')}\n\`\`\`\n\n## 전: 내 종목\n\nUse the 2–3 most useful facts, taking them in the order given. Separate parts with ·.\n\n## 후: 내 종목 실제 시스템 지시\n\n\`\`\`text\n${WL_LINE_SYSTEM}\n\`\`\`\n\n## 후: 내 종목 실제 사용자 입력\n\n\`\`\`text\n${buildLineUserPrompt(f)}\n\`\`\`\n\n## 인사이트 검사 통과 예시 (모델 결과 아님)\n\n${JSON.stringify(insight, null, 2)}\n`);
    }
    console.log(`${count} passed; model/network/cache calls: 0`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
