/**
 * 인텔 종목 분석 — 배치 분할·토큰 예산·잘린 응답 처리 (src/lib/ai/intelBatch.ts) + 라우트 배선
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/intelBatch.test.ts
 *
 * 고정하는 것: 종목당 상한(예전 800 은 평균 700~760토큰에 10% 여유뿐이라 운영 9건 중 8건 잘림) · 4개씩 균등 분할(10종목 = 4+3+3, 상한만 올리면 55초 한도에 걸린다)
 *   · 잘린 응답에서 «닫힌 항목만» 건지고 잘린 문장은 내보내지 않는다 · 요청하지 않은 티커/언어가 빈 항목은 버린다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { restoreCommonTermNames } from '@/lib/ai/commonTerms';
import { INTEL_BATCH_MAX, INTEL_TOKENS_PER_STOCK, intelMaxTokens, parseIntelAnalyses, salvageClosedItems, splitIntelBatches } from '@/lib/ai/intelBatch';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const item = (tk: string, over: Record<string, string> = {}) => ({ ticker: tk, ko: `${tk} 한국어 분석입니다. "따옴표"와 {중괄호}, [대괄호]가 있어도 된다.`, en: `${tk} English analysis.`, ja: `${tk} の日本語分析です。`, ...over });
const full = (tks: string[]) => JSON.stringify({ analyses: tks.map((x) => item(x)) });

t('종목당 상한은 800 이 아니라 1,400 — 실측 평균(4.5: ~740, 5.5: ~1,000)보다 크다', () => {
    assert.equal(INTEL_TOKENS_PER_STOCK, 1400);
    assert.ok(INTEL_TOKENS_PER_STOCK > 800 * 1.5);
    assert.equal(intelMaxTokens(1), 300 + 1400);
    assert.equal(intelMaxTokens(4), 300 + 5600);
    assert.equal(intelMaxTokens(0), intelMaxTokens(1));
});
t('분할: 4개씩 균등 — 1~4 는 한 호출, 7 = 4+3, 10 = 4+3+3, 5 = 3+2 (1종목만 외롭게 남기지 않는다)', () => {
    const sizes = (k: number) => splitIntelBatches(Array.from({ length: k }, (_, i) => i)).map((b) => b.length);
    assert.deepEqual(sizes(0), []);
    for (const k of [1, 2, 3, 4]) assert.deepEqual(sizes(k), [k]);
    assert.deepEqual(sizes(5), [3, 2]);
    assert.deepEqual(sizes(7), [4, 3]);
    assert.deepEqual(sizes(10), [4, 3, 3]);
    assert.deepEqual(sizes(13), [4, 3, 3, 3]);
    for (let k = 1; k <= 30; k++) { const s = sizes(k); assert.equal(s.reduce((a, b) => a + b, 0), k); assert.ok(Math.max(...s) <= INTEL_BATCH_MAX); assert.ok(Math.max(...s) - Math.min(...s) <= 1); }
});
t('분할 후 최악의 호출은 상한 안: 4종목 호출의 토큰 상한 5,900 ÷ 4.5 속도(≈135토큰/초) ≈ 44초 미만이 아니라, 실제 출력(~3,000토큰)은 약 23초', () => {
    const worstRealTokens = INTEL_BATCH_MAX * 760;
    assert.ok(worstRealTokens / 135 < 30, `${worstRealTokens / 135}s`);
});
t('온전한 JSON: 요청한 종목만, 3개 언어가 다 찬 것만', () => {
    const r = parseIntelAnalyses(full(['PLTR', 'ISRG']), ['PLTR', 'ISRG', 'SYM']);
    assert.equal(r.complete, true); assert.equal(r.salvaged, false);
    assert.deepEqual(r.analyses.map((a) => a.ticker), ['PLTR', 'ISRG']);
});
t('요청하지 않은 티커(지어낸 것)·중복·빈 언어 칸은 버린다 · 티커 대소문자는 맞춰 준다', () => {
    const txt = JSON.stringify({ analyses: [item('pltr'), item('FAKE'), item('PLTR'), item('ISRG', { ja: '' }), item('SYM', { en: '   ' })] });
    const r = parseIntelAnalyses(txt, ['PLTR', 'ISRG', 'SYM']);
    assert.deepEqual(r.analyses.map((a) => a.ticker), ['PLTR']);
});
t('잘린 응답: 닫힌 항목은 건지고, 문장 중간에서 끊긴 항목은 내보내지 않는다 (운영 «max_tokens 에서 끊김» 모양)', () => {
    const complete = full(['A', 'B', 'C']);
    const cutAt = complete.lastIndexOf('"ja"') + 12;          // 세 번째 항목의 ja 문장 중간
    const cut = complete.slice(0, cutAt);
    assert.throws(() => JSON.parse(cut));
    const r = parseIntelAnalyses(cut, ['A', 'B', 'C']);
    assert.equal(r.complete, false); assert.equal(r.salvaged, true);
    assert.deepEqual(r.analyses.map((a) => a.ticker), ['A', 'B']);
    for (const a of r.analyses) for (const k of ['ko', 'en', 'ja'] as const) assert.ok(a[k].length > 5 && !a[k].endsWith('…'));
});
t('잘린 응답: 첫 항목 도중에 끊기면 아무것도 내보내지 않는다 (예전처럼 «전부 없음» — 잘린 글은 나가지 않는다)', () => {
    const cut = full(['A', 'B']).slice(0, 60);
    const r = parseIntelAnalyses(cut, ['A', 'B']);
    assert.deepEqual(r.analyses, []); assert.equal(r.salvaged, true);
});
t('문자열 안의 따옴표·중괄호·대괄호·이스케이프에 속지 않는다', () => {
    const tricky = { analyses: [item('A', { en: 'He said "}" and \\ then ] ok {', ko: '중괄호 } 와 "인용" 포함' }), item('B')] };
    const txt = JSON.stringify(tricky);
    assert.equal(salvageClosedItems(txt.slice(0, txt.length - 10)).length, 1);
    assert.deepEqual(parseIntelAnalyses(txt, ['A', 'B']).analyses.map((a) => a.ticker), ['A', 'B']);
});
t('빈 문자열·JSON 아님·analyses 없음 → 빈 목록(예외 없음)', () => {
    for (const bad of ['', 'not json', '{"foo":1}', '[1,2]', '{']) assert.deepEqual(parseIntelAnalyses(bad, ['A']).analyses, [], bad);
});
t('라우트 배선: 종목당 상한(intelMaxTokens)·분할(splitIntelBatches)·잘림 표지(truncated)·옛 800 상수 없음', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src/app/api/intel/perplexity-analysis/route.ts'), 'utf8');
    assert.ok(/maxTokens: intelMaxTokens\(batch\.length\)/.test(src));
    assert.ok(/splitIntelBatches\(needsFetch\)/.test(src));
    assert.ok(/bedrockResult\.truncated/.test(src));
    assert.ok(!/\* 800/.test(src), '종목수 × 800 상한이 남아 있다');
    assert.ok(/Promise\.allSettled\(batches\.map\(runBatch\)\)/.test(src), '묶음 하나가 실패해도 나머지는 산다');
    const bc = fs.readFileSync(path.join(__dirname, '..', 'src/services/bedrockClient.ts'), 'utf8');
    assert.ok(/stop_reason === 'max_tokens'/.test(bc), '현행 경로도 잘림을 본다');
});

t('금융 공통어 음차 복원: 콜월·풋플로어·맥스페인·감마플립(한)·コールウォール·プットフロア·マックスペイン·ガンマフリップ(일) → 영어 이름 · 조사는 그대로', () => {
    const r = restoreCommonTermNames('$88 콜월과 $84 맥스 페인 사이, $80 풋플로어, 감마 플립 위. 콜 월을 넘었다');
    assert.equal(r.text, '$88 Call Wall과 $84 Max Pain 사이, $80 Put Floor, Gamma Flip 위. Call Wall을 넘었다');
    assert.equal(r.replaced, 5);
    const j = restoreCommonTermNames('$88コールウォールと$84マックスペイン、$80プットフロア、ガンマフリップ、プットウォール');
    assert.equal(j.text, '$88Call Wallと$84Max Pain、$80Put Floor、Gamma Flip、Put Wall');
    assert.equal(j.replaced, 5);
});
t('복원은 일반 단어를 건드리지 않는다(콜 월요일·이미 영어인 이름·빈 값)', () => {
    for (const same of ['콜 월요일 마감', '$88 Call Wall 과 Max Pain', 'GEX 와 PCR', '']) assert.deepEqual(restoreCommonTermNames(same), { text: same, replaced: 0 });
    assert.equal(restoreCommonTermNames(undefined as any).text, '');
});
t('라우트 배선: 분석 ko·ja 에 복원을 적용한다(en 은 대상 아님)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src/app/api/intel/perplexity-analysis/route.ts'), 'utf8');
    assert.ok(/restoreCommonTermNames\(a\.ko\)/.test(src) && /restoreCommonTermNames\(a\.ja\)/.test(src) && !/restoreCommonTermNames\(a\.en\)/.test(src));
    assert.ok(/restoreCommonTermNames\(entry\.ko\)\.text/.test(src) && /restoreCommonTermNames\(entry\.ja\)\.text/.test(src), '캐시 적중분도 복원');
});

console.log(`\n${n} passed`);
