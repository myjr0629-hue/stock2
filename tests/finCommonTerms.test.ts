/**
 * 금융 공통어는 번역하지 않는다 — 화면 문자열의 GEX 번역 표기(감마 노출·감마 익스포저 / ガンマエクスポージャー·ガンマ露出) → «GEX»
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/finCommonTerms.test.ts
 *
 * 지시(대표 10/8 0시): «금융지표언어라면 공통으로 사용하라는 것이 원칙이다 … 금융 공통어라면 일반적으로 사용하는 언어라면 유지하도록 해».
 * 범위: 화면 문자열. 주석·변수명·영어 문자열·SEO 메타·마케팅 생성기는 그대로. 페이월 문구(gate.*)·약관(legal.*)은 금지선이라 안 바꾼다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const ko = JSON.parse(read('src/messages/ko.json'));
const ja = JSON.parse(read('src/messages/ja.json'));
const get = (o: any, p: string) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const flat = (o: any, p: string[] = [], out: Record<string, string> = {}): Record<string, string> => {
    if (typeof o === 'string') out[p.join('.')] = o; else if (o && typeof o === 'object') for (const k of Object.keys(o)) flat(o[k], [...p, k], out);
    return out;
};

const FORBIDDEN = /감마 ?노출|감마 ?익스포[저져]|ガンマ[・ ]?エクスポージャー|ガンマ露出/;
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

// 이 시험이 «바뀌었다고 못 박는» 값 — 키 → 새 값에 반드시 들어 있어야 하는 문구
const KO_EXPECT: Record<string, string> = {
    'home.gammaExposure': 'GEX 분석', 'portfolio.gexTooltip': 'GEX', 'options.gammaExposure': 'Gamma Exposure (GEX)',
    'dashboardGuide.netGex.desc': '<cyan>GEX의 순합계</cyan>', 'commandGuide.volRegime.desc': 'GEX, 내재변동성(IV)',
    'commandGuide.conviction.desc': 'P/C Ratio, GEX, 옵션 플로우', 'commandGuide.gexTimelineSection.gexDesc': '<emerald>GEX 추이</emerald>',
    'commandGuide.gexTimelineSection.gexDeepDive.subtitle': '종목별 30일 GEX 히스토리',
    'commandGuide.gexTimelineSection.gexDeepDive.percentileGauge.extremeLow': '하단 수준의 GEX',
    'commandGuide.gexTimelineSection.gexDeepDive.percentileGauge.depressed': '딜러 GEX 약세',
    'commandGuide.gexTimelineSection.gexDeepDive.percentileGauge.elevated': '딜러 GEX 강세',
    'commandGuide.gexTimelineSection.gexDeepDive.percentileGauge.extremeHigh': '상단 수준의 GEX',
    'commandGuide.gammaFlipDesc': '딜러의 GEX가', 'intelGuide.indicators.gexTitle': 'GEX', 'intelGuide.indicators.gexDesc': '딜러의 GEX 순합계',
    'watchlistGuide.cards.gex.badge': 'GEX', 'guardianGuide.gammaShield.gex.desc': '옵션 GEX를 합산',
    'guardianGuide.gammaShield.historicalContext.gexPercentile.low': '딜러 GEX가 역사적 하단',
    'guardianGuide.gammaShield.historicalContext.gexPercentile.high': '딜러 GEX가 역사적 상단',
    'flowGuide.gexRegime.desc': '<gold>GEX</gold>를', 'dashboard.tipNetGex': '순 GEX —', 'dashboard.tipOpi': '풋/콜 비율과 GEX를 결합',
};
const JA_EXPECT: Record<string, string> = {
    'dashboardGuide.cards.gammaFlip.meaning': 'マーケットメイカーのGEXが', 'dashboardGuide.cards.gex.title': 'GEX', 'dashboardGuide.cards.gex.meaning': 'ネットGEX（ドル建て）',
    'dashboardGuide.netGex.desc': '<cyan>GEXの純合計</cyan>', 'commandGuide.volRegime.desc': 'GEX、IV、', 'commandGuide.gexTimelineSection.gexDesc': '<emerald>GEX推移</emerald>',
    'commandGuide.gexTimelineSection.gexDeepDive.subtitle': '銘柄別30日GEX・ヒストリカル',
    'commandGuide.gexTimelineSection.gexDeepDive.percentileGauge.extremeLow': '歴史的底辺水準のGEX',
    'commandGuide.gexTimelineSection.gexDeepDive.percentileGauge.depressed': 'ディーラーGEXが弱い環境',
    'commandGuide.gexTimelineSection.gexDeepDive.percentileGauge.elevated': 'ディーラーGEXが強い環境',
    'commandGuide.gexTimelineSection.gexDeepDive.percentileGauge.extremeHigh': '歴史的ピーク水準のGEX',
    'commandGuide.gammaFlipDesc': 'ディーラーのGEXが', 'intelGuide.indicators.gexTitle': 'GEX', 'intelGuide.indicators.gexDesc': 'ネットGEX。',
    'watchlistGuide.cards.gex.badge': 'GEX', 'guardianGuide.gammaShield.gex.desc': 'オプションGEXを合算',
    'guardianGuide.gammaShield.historicalContext.gexPercentile.low': 'ディーラーGEXが歴史的低水準',
    'guardianGuide.gammaShield.historicalContext.gexPercentile.high': 'ディーラーGEXが歴史的高水準',
    'flowGuide.gexRegime.desc': '<gold>GEX</gold>を', 'dashboard.tipNetGex': 'ネットGEX —',
};

// 범위 밖으로 남긴 키 — 페이월 문구(gate.*)·약관(legal.*). 이 목록이 늘어나면 의도를 다시 확인해야 한다.
const KO_LEFT = ['gate.descGexTimeline', 'gate.descNetGamma', 'gate.descSqueeze', 'gate.fomoGexRegime', 'gate.taglineNetGamma'];
const JA_LEFT = ['gate.descGexTimeline', 'gate.descNetGamma', 'gate.descSqueeze', 'gate.fomoGexRegime', 'gate.taglineNetGamma', 'legal.terms.investmentContent'];

t('메시지 ko: 바뀐 22개 값에 GEX 가 들어 있고 번역 표기는 없다', () => {
    assert.equal(Object.keys(KO_EXPECT).length, 22);
    for (const [k, frag] of Object.entries(KO_EXPECT)) {
        const v = get(ko, k); assert.equal(typeof v, 'string', k);
        assert.ok(v.includes(frag), `${k}: «${frag}» 없음 → ${v}`);
        assert.ok(!FORBIDDEN.test(v), `${k}: 번역 표기가 남았다 → ${v}`);
    }
});

t('메시지 ja: 바뀐 20개 값에 GEX 가 들어 있고 번역 표기는 없다', () => {
    assert.equal(Object.keys(JA_EXPECT).length, 20);
    for (const [k, frag] of Object.entries(JA_EXPECT)) {
        const v = get(ja, k); assert.equal(typeof v, 'string', k);
        assert.ok(v.includes(frag), `${k}: «${frag}» 없음 → ${v}`);
        assert.ok(!FORBIDDEN.test(v), `${k}: 번역 표기가 남았다 → ${v}`);
    }
});

t('남은 번역 표기는 «금지선에 둔 키»뿐이다 — 페이월 gate.* 와 약관 legal.* (이 목록 밖에 하나라도 있으면 실패)', () => {
    assert.deepEqual(Object.entries(flat(ko)).filter(([, v]) => FORBIDDEN.test(v)).map(([k]) => k).sort(), KO_LEFT);
    assert.deepEqual(Object.entries(flat(ja)).filter(([, v]) => FORBIDDEN.test(v)).map(([k]) => k).sort(), JA_LEFT);
});

t('한국어 조사: GEX 뒤는 받침 없는 소리(지이엑스)라 «가·를·는·와·로» — «GEX이·GEX을·GEX은·GEX과·GEX으로» 가 바뀐 문장에 없다', () => {
    for (const k of Object.keys(KO_EXPECT)) assert.doesNotMatch(get(ko, k), /GEX(?:이|을|은|과|으로)(?![A-Za-z가-힣]*[a-z])/, k);
    assert.ok(get(ko, 'commandGuide.gammaFlipDesc').includes('GEX가 <cyan>'));
});

t('현지 표준 용어는 그대로 — 미결제약정(ko)·建玉(ja)·공매도·空売り·롱감마·ショートガンマ', () => {
    const kv = Object.values(flat(ko)).join('\n'), jv = Object.values(flat(ja)).join('\n');
    assert.ok(kv.includes('미결제약정') && kv.includes('공매도') && kv.includes('롱감마'));
    assert.ok(jv.includes('建玉') && jv.includes('空売り') && jv.includes('ショートガンマ'));
});

t('코드 속 화면 문자열: 7개 파일에 번역 표기가 없다(주석 포함)', () => {
    for (const f of [
        'src/components/ui/CardTooltip.tsx', 'src/components/guardian/GuardianTooltip.tsx', 'src/app/[locale]/app-view/flow/page.tsx',
        'src/components/history/GexTimeline.tsx', 'src/components/app/metricGlossary.ts', 'src/lib/rankings/registry.ts', 'src/lib/explanationLibrary.ts',
    ]) assert.doesNotMatch(read(f), FORBIDDEN, f);
});

t('코드 속 새 값: 글로서리 제목·툴팁·레짐 설명·랭킹 출처가 GEX 로', () => {
    assert.match(read('src/components/app/metricGlossary.ts'), /title: \{ ko: 'GEX', en: 'GEX \(Gamma Exposure\)', ja: 'GEX' \}/);
    const card = read('src/components/ui/CardTooltip.tsx');
    for (const frag of ["ko: 'GEX 시각화'", "ja: 'GEX可視化'", "ko: 'GEX 레짐 — 양(+)이면", "ja: 'GEXレジーム — 正値は", "ko: 'GEX — LONG:"]) assert.ok(card.includes(frag), frag);
    const flow = read('src/app/[locale]/app-view/flow/page.tsx');
    assert.ok(flow.includes("regimeInfo: 'GEX 기반의 변동성 레짐입니다.") && flow.includes("regimeInfo: 'GEXに基づく変動性レジームです。"));
    assert.ok(read('src/components/guardian/GuardianTooltip.tsx').includes('GEX 방패') && read('src/components/guardian/GuardianTooltip.tsx').includes('GEXシールド'));
    assert.ok(read('src/lib/explanationLibrary.ts').includes("label: 'GEX',"));
    const reg = read('src/lib/rankings/registry.ts');
    assert.ok(reg.includes('옵션 체인 GEX —') && reg.includes('オプションチェーンのGEX —'));
});

t('영어 문자열은 그대로(번역이 아니라 원어) — Gamma Exposure·GEX history 등', () => {
    const card = read('src/components/ui/CardTooltip.tsx');
    assert.ok(card.includes("en: 'Gamma exposure visual'") && card.includes("en: 'GEX history"));
});

console.log(`\n${n} passed`);
